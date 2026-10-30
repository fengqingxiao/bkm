import Phaser from 'phaser';
import { store } from '../data/loader';
import type { LoadedMap, LoadedTileset } from '../data/loader';
import type { EventPage } from '../data/types';
import { loadMapImages } from '../engine/assets';
import type { MapImages } from '../engine/assets';
import { AudioManager } from '../engine/audio';
import { CharsetStore } from '../engine/charset';
import type { Charset } from '../engine/charset';
import { Interpreter } from '../engine/interpreter';
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, TILE, eventPassable, playerPassable } from '../engine/movement';
import type { TerrainTag } from '../engine/movement';
import { MapView } from '../engine/mapRenderer';
import { Character } from '../engine/player';
import { regularTileRect } from '../engine/autotile';
import { GameState } from '../engine/state';
import { MessageBox } from '../ui/messageBox';
import { createTouchControls, type TouchInput } from '../ui/touch';

const DEFAULT_MAP = 56;
const PLAYER_CHARSET = 'trainer_POKEMONTRAINER_Red';
const STEP_ANIME_MS = 125;

type ActionKind = 'ok' | 'cancel' | 'up' | 'down';

interface EventSpriteEntry {
  sprite: Phaser.GameObjects.Sprite;
  page: EventPage;
  charset: Charset | null;
  character?: Character;
  timer: number;
  dir: number | null;
  directionOverride?: number;
}

export class MapScene extends Phaser.Scene {
  private mapId = Number(new URLSearchParams(location.search).get('map')) || DEFAULT_MAP;
  private map!: LoadedMap;
  private tileset!: LoadedTileset;
  private images!: MapImages;
  private mapView!: MapView;
  private player!: Character;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerCharset!: Charset;
  private charsets!: CharsetStore;
  private hud!: Phaser.GameObjects.Text;
  private hudPrefix = '';
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch!: TouchInput;
  private messageBox!: MessageBox;
  private audio = new AudioManager();
  private state = new GameState();
  private tags: TerrainTag[] = [];
  private interpreter!: Interpreter;
  private eventSprites = new Map<number, EventSpriteEntry>();
  private blockers = new Set<string>();
  private erased = new Set<number>();
  private actionResolver?: (kind: ActionKind) => void;
  private ready = false;
  private unsupported = 0;
  private lastTouchDir: number | null = null;

  constructor() {
    super('map');
  }

  create(): void {
    this.boot().catch((err) => {
      console.error(err);
      this.add.text(8, 8, `加载失败: ${String(err)}`, { fontSize: '12px', color: '#ff6666' });
    });
  }

  private async boot(): Promise<void> {
    this.charsets = new CharsetStore(this);
    this.messageBox = new MessageBox(this);
    await this.audio.init();
    this.tags = await store.getTerrainTags();
    const commonEvents = await store.getCommonEvents();

    this.interpreter = new Interpreter(this.state, {
      message: (lines) => this.messageBox.show(lines, () => this.waitForAction()),
      choices: (options, cancelType) => this.messageBox.choose(options, cancelType, () => this.waitForAction()),
      transfer: (mapId, x, y, dir) => this.transferTo(mapId, x, y, dir),
      playSe: (name, volume, pitch) => this.audio.playSe(name, volume, pitch),
      playBgm: (name, volume, pitch) => this.audio.playBgm(name, volume, pitch),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      movePlayer: (dir) => this.player.moveStep(dir, (x, y, d) => this.canStepPlayer(x, y, d)),
      eraseEvent: (id) => {
        this.erased.add(id);
        this.refreshEventSprites();
      },
      unsupported: (code, params) => {
        this.unsupported++;
        console.warn('unsupported command', code, JSON.stringify(params).slice(0, 120));
      },
    }, commonEvents);

    await this.loadMap(this.mapId);
    const spawn = await this.resolveSpawn();

    this.player = new Character(3);
    this.player.placeAt(spawn.x, spawn.y);
    this.player.direction = [2, 4, 6, 8].includes(spawn.dir) ? spawn.dir : DIR_DOWN;
    this.playerSprite = this.add.sprite(0, 0, this.playerCharset.key, 0);
    this.applyPlayerSprite();

    this.touch = createTouchControls();
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,Z,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

    const cam = this.cameras.main;
    cam.startFollow(this.playerSprite, true, 0.2, 0.2);
    cam.roundPixels = true;

    this.hud = this.add
      .text(8, 8, '', { fontSize: '12px', color: '#ffffff', backgroundColor: '#00000099' })
      .setScrollFactor(0)
      .setDepth(1_000_000);
    this.updateHud();

    this.audio.playBgm(this.map.bgm?.name ?? '', this.map.bgm?.volume ?? 100, this.map.bgm?.pitch ?? 100);
    this.ready = true;
  }

  /** RGSS anchors character sprites at the bottom centre of their tile. */
  private applyPlayerSprite(): void {
    const c = this.playerCharset;
    if (!this.playerSprite) return;
    this.playerSprite.setOrigin(0.5, 1);
    this.playerSprite.setPosition(
      Math.round(this.player.px) + TILE / 2,
      Math.round(this.player.py) + TILE - c.anchorShift,
    );
    this.playerSprite.setDepth(this.characterDepth(this.player.py, c.frameHeight));
    this.playerSprite.setFrame(CharsetStore.frameOf(c, this.player.direction, this.player.pattern));
  }

  private characterDepth(py: number, frameHeight: number): number {
    // screen_z: ground y, plus 31 for sprites taller than one tile
    return py + TILE + (frameHeight > TILE ? TILE - 1 : 0);
  }

  private async loadMap(id: number): Promise<void> {
    this.mapView?.dispose();
    for (const entry of this.eventSprites.values()) entry.sprite.destroy();
    this.eventSprites.clear();

    this.mapId = id;
    this.state.mapId = id;
    this.map = await store.getMap(id);
    this.tileset = (await store.getTilesets())[this.map.tilesetId];
    this.images = await loadMapImages(this.tileset);
    this.mapView = new MapView(this, this.map, this.tileset, this.images);

    const playerCharset = await this.charsets.get(PLAYER_CHARSET);
    if (!playerCharset) throw new Error(`missing charset ${PLAYER_CHARSET}`);
    this.playerCharset = playerCharset;

    this.buildBlockers();
    this.buildEventSprites();
    if (this.cameras.main) {
      this.cameras.main.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    }
    const infos = await store.getMapInfos();
    this.hudPrefix = `#${this.map.id} ${infos[String(this.map.id)]?.name ?? this.map.displayName}`;
  }

  private buildBlockers(): void {
    this.blockers.clear();
    for (const ev of this.map.events) {
      if (this.erased.has(ev.id)) continue;
      const page = this.activePage(ev);
      if (!page) continue;
      const visible = page.graphic.tileId > 0 || page.graphic.characterName !== '';
      if (!visible || page.through) continue;
      this.blockers.add(`${ev.x},${ev.y}`);
    }
  }

  private activePage(ev: { id: number; pages: EventPage[] }): EventPage | null {
    for (let i = ev.pages.length - 1; i >= 0; i--) {
      const page = ev.pages[i];
      const c = page.condition;
      if (c.switch1Valid && c.switch1 && !this.state.switch(c.switch1)) continue;
      if (c.switch2Valid && c.switch2 && !this.state.switch(c.switch2)) continue;
      if (c.variableValid && c.variable && this.state.variable(c.variable) < c.variableValue) continue;
      if (c.selfSwitch && !this.state.selfSwitch(ev.id, c.selfSwitch)) continue;
      return page;
    }
    return null;
  }

  /** Events may use a tile from the tileset as their graphic (tile_id >= 384). */
  private tileTexture(tileId: number): string {
    const key = `tile:${this.map.tilesetId}:${tileId}`;
    if (!this.textures.exists(key)) {
      const { srcX, srcY } = regularTileRect(tileId);
      const canvas = document.createElement('canvas');
      canvas.width = TILE;
      canvas.height = TILE;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.images.tileset, srcX, srcY, TILE, TILE, 0, 0, TILE, TILE);
      this.textures.addCanvas(key, canvas);
    }
    return key;
  }

  private buildEventSprites(): void {
    for (const ev of this.map.events) {
      if (this.erased.has(ev.id)) continue;
      const page = this.activePage(ev);
      if (!page) continue;
      const graphic = page.graphic;

      if (graphic.tileId >= 384) {
        const sprite = this.add.sprite(ev.x * TILE + TILE / 2, ev.y * TILE + TILE, this.tileTexture(graphic.tileId), 0);
        sprite.setOrigin(0.5, 1);
        const priority = this.tileset.priorities[graphic.tileId] ?? 0;
        sprite.setDepth(ev.y * TILE + TILE + priority * TILE);
        this.eventSprites.set(ev.id, { sprite, page, charset: null, timer: 0, dir: null });
        continue;
      }

      const name = graphic.characterName;
      if (!name) continue;
      void this.charsets.get(name).then((charset) => {
        if (!charset || this.erased.has(ev.id)) return;
        const sprite = this.add.sprite(0, 0, charset.key, 0).setOrigin(0.5, 1);
        sprite.setDepth(this.characterDepth(ev.y * TILE, charset.frameHeight));
        const roaming = page.moveType === 1;
        const character = roaming
          ? new Character(page.moveSpeed || 3, page.walkAnime, page.stepAnime, page.directionFix)
          : undefined;
        if (character) {
          character.placeAt(ev.x, ev.y);
          character.direction = graphic.direction;
        }
        sprite.setPosition(ev.x * TILE + TILE / 2, ev.y * TILE + TILE - charset.anchorShift);
        sprite.setFrame(CharsetStore.frameOf(charset, graphic.direction, graphic.pattern));
        const previous = this.eventSprites.get(ev.id);
        previous?.sprite.destroy();
        this.eventSprites.set(ev.id, { sprite, page, charset, character, timer: 0, dir: null });
      });
    }
  }

  private refreshEventSprites(): void {
    for (const entry of this.eventSprites.values()) entry.sprite.destroy();
    this.eventSprites.clear();
    this.buildBlockers();
    this.buildEventSprites();
  }

  private canStepPlayer(x: number, y: number, dir: number): boolean {
    return playerPassable(this.tileset, this.tags, this.map, x, y, dir) && !this.blocked(x, y);
  }

  private canStepEvent(self: EventSpriteEntry, x: number, y: number, dir: number): boolean {
    return eventPassable(this.tileset, this.tags, this.map, x, y, dir) && !this.blockedForEvent(self, x, y);
  }

  private blocked(x: number, y: number): boolean {
    if (this.blockers.has(`${x},${y}`)) return true;
    if (this.player && this.player.tileX === x && this.player.tileY === y) return true;
    for (const entry of this.eventSprites.values()) {
      const ch = entry.character;
      if (ch && ch.tileX === x && ch.tileY === y) return true;
    }
    return false;
  }

  private async resolveSpawn(): Promise<{ x: number; y: number; dir: number }> {
    const params = new URLSearchParams(location.search);
    if (params.has('x') && params.has('y')) {
      const px = Number(params.get('x'));
      const py = Number(params.get('y'));
      if (Number.isInteger(px) && Number.isInteger(py) && this.isFree(px, py)) return { x: px, y: py, dir: DIR_DOWN };
    }
    const entrances = await store.getEntrances();
    for (const entry of entrances[String(this.map.id)] ?? []) {
      if (this.isFree(entry.x, entry.y)) return entry;
    }
    const fallback = this.findSpawn();
    return { ...fallback, dir: DIR_DOWN };
  }

  private isFree(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    return [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT].every(
      (d) => playerPassable(this.tileset, this.tags, this.map, x, y, d) && !this.blockers.has(`${x},${y}`),
    );
  }

  private findSpawn(): { x: number; y: number } {
    const centerX = Math.floor(this.map.width / 2);
    const centerY = Math.floor(this.map.height / 2);
    const maxRadius = Math.max(this.map.width, this.map.height);
    for (let radius = 0; radius < maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          if (this.isFree(centerX + dx, centerY + dy)) return { x: centerX + dx, y: centerY + dy };
        }
      }
    }
    return { x: centerX, y: centerY };
  }

  private async transferTo(mapId: number, x: number, y: number, dir: number): Promise<void> {
    if (!mapId) return;
    const cam = this.cameras.main;
    cam.fadeOut(180, 0, 0, 0);
    await new Promise<void>((resolve) => setTimeout(resolve, 190));
    await this.loadMap(mapId);
    this.player.placeAt(x, y);
    if ([2, 4, 6, 8].includes(dir)) this.player.direction = dir;
    this.applyPlayerSprite();
    cam.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    cam.fadeIn(180, 0, 0, 0);
    this.audio.playBgm(this.map.bgm?.name ?? '', this.map.bgm?.volume ?? 100, this.map.bgm?.pitch ?? 100);
    this.updateHud();
  }

  private waitForAction(): Promise<ActionKind> {
    return new Promise((resolve) => {
      this.actionResolver = resolve;
    });
  }

  private updateHud(): void {
    if (!this.hud) return;
    this.hud.setText(`${this.hudPrefix}  x=${this.player.tileX} y=${this.player.tileY}  u=${this.unsupported}`);
  }

  private async interact(): Promise<void> {
    const dx = this.player.direction === DIR_LEFT ? -1 : this.player.direction === DIR_RIGHT ? 1 : 0;
    const dy = this.player.direction === DIR_DOWN ? 1 : this.player.direction === DIR_UP ? -1 : 0;
    const tx = this.player.tileX + dx;
    const ty = this.player.tileY + dy;
    const ev = this.map.events.find((e) => e.x === tx && e.y === ty && !this.erased.has(e.id));
    if (!ev) return;
    const page = this.activePage(ev);
    if (!page || page.trigger !== 0) return;
    const entry = this.eventSprites.get(ev.id);
    if (entry && !page.directionFix) {
      entry.directionOverride = { 2: 8, 4: 6, 6: 4, 8: 2 }[this.player.direction] ?? page.graphic.direction;
    }
    await this.interpreter.run(page.list, ev.id);
    this.refreshEventSprites();
    this.updateHud();
  }

  update(time: number, delta: number): void {
    if (!this.ready) return;

    const actionPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.Z) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
      this.touch.consumeAction();

    const touchDir = this.touch.dir;
    const touchNewDir = touchDir !== this.lastTouchDir ? touchDir : null;
    this.lastTouchDir = touchDir;

    if (this.actionResolver) {
      const resolve = this.actionResolver;
      const cursors = this.input.keyboard!.createCursorKeys();
      if (Phaser.Input.Keyboard.JustDown(cursors.up) || touchNewDir === DIR_UP) {
        this.actionResolver = undefined;
        resolve('up');
      } else if (Phaser.Input.Keyboard.JustDown(cursors.down) || touchNewDir === DIR_DOWN) {
        this.actionResolver = undefined;
        resolve('down');
      } else if (actionPressed) {
        this.actionResolver = undefined;
        resolve('ok');
      }
      this.applyPlayerSprite();
      this.updateEvents(delta, false);
      this.syncEventSprites(time);
      this.mapView.update(this.cameras.main.worldView, time);
      return;
    }

    if (this.interpreter.isRunning) {
      this.player.update(delta, null, (x, y, d) => this.canStepPlayer(x, y, d));
    } else {
      const cursors = this.input.keyboard!.createCursorKeys();
      let dir: number | null = touchDir;
      if (cursors.left.isDown || this.keys.A.isDown) dir = DIR_LEFT;
      else if (cursors.right.isDown || this.keys.D.isDown) dir = DIR_RIGHT;
      else if (cursors.up.isDown || this.keys.W.isDown) dir = DIR_UP;
      else if (cursors.down.isDown || this.keys.S.isDown) dir = DIR_DOWN;

      this.player.update(delta, dir, (x, y, d) => this.canStepPlayer(x, y, d));
      if (actionPressed) void this.interact();
    }

    this.applyPlayerSprite();
    this.updateEvents(delta, !this.interpreter.isRunning);
    this.syncEventSprites(time);
    this.mapView.update(this.cameras.main.worldView, time);
    this.updateHud();
  }

  /** Events with an autonomous "random" move route wander on the 32px grid. */
  private updateEvents(delta: number, allowMove: boolean): void {
    for (const entry of this.eventSprites.values()) {
      const ch = entry.character;
      if (!ch) continue;
      let dir: number | null = null;
      if (allowMove && !ch.moving) {
        entry.timer -= delta;
        if (entry.timer <= 0) {
          entry.timer = 2200 / Math.max(1, entry.page.moveFrequency || 3);
          dir = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
        }
      }
      ch.update(delta, dir, (x, y, d) => this.canStepEvent(entry, x, y, d));
    }
  }

  private blockedForEvent(self: EventSpriteEntry, x: number, y: number): boolean {
    if (this.blockers.has(`${x},${y}`)) return true;
    if (this.player.tileX === x && this.player.tileY === y) return true;
    for (const entry of this.eventSprites.values()) {
      if (entry === self) continue;
      const ch = entry.character;
      if (ch && ch.tileX === x && ch.tileY === y) return true;
    }
    return false;
  }

  private syncEventSprites(time: number): void {
    const step = Math.floor(time / STEP_ANIME_MS);
    for (const entry of this.eventSprites.values()) {
      const charset = entry.charset;
      if (!charset) continue;
      const ch = entry.character;
      if (ch) {
        entry.sprite.setPosition(Math.round(ch.px) + TILE / 2, Math.round(ch.py) + TILE - charset.anchorShift);
        entry.sprite.setDepth(this.characterDepth(ch.py, charset.frameHeight));
        const pattern = ch.moving ? ch.pattern : (entry.page.stepAnime ? (entry.page.graphic.pattern + step) % 4 : entry.page.graphic.pattern);
        entry.sprite.setFrame(CharsetStore.frameOf(charset, ch.direction, pattern));
      } else {
        const direction = entry.directionOverride ?? entry.page.graphic.direction;
        const pattern = entry.page.stepAnime ? (entry.page.graphic.pattern + step) % 4 : entry.page.graphic.pattern;
        entry.sprite.setFrame(CharsetStore.frameOf(charset, direction, pattern));
      }
    }
  }
}

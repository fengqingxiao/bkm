import Phaser from 'phaser';
import type { LoadedMap, LoadedTileset } from '../data/loader';
import type { MapImages } from './assets';
import {
  AUTOTILE_FRAME_DURATION_MS,
  TILE_SIZE,
  autotileIndexFor,
  autotileQuads,
  neighborMask,
  regularTileRect,
} from './autotile';
import { tileAt, tilePriority } from './movement';

const CHUNK_TILES = 8;
const CHUNK_PX = CHUNK_TILES * TILE_SIZE;

interface Strip {
  canvas: HTMLCanvasElement;
  tex: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
}

interface Chunk {
  key: string;
  cx: number;
  cy: number;
  groundCanvas: HTMLCanvasElement;
  groundTex: Phaser.Textures.CanvasTexture;
  groundImg: Phaser.GameObjects.Image;
  strips: Map<string, Strip>;
  animated: boolean;
  frameSig: number;
}

export class MapView {
  private chunks = new Map<string, Chunk>();

  constructor(
    private scene: Phaser.Scene,
    private map: LoadedMap,
    private ts: LoadedTileset,
    private imgs: MapImages,
  ) {}

  private autotileFrameCount(index: number): number {
    const img = this.imgs.autotiles[index];
    if (!img) return 1;
    return Math.max(1, Math.floor(img.width / (img.height === 32 ? 32 : 96)));
  }

  private frameOf(index: number, time: number): number {
    const count = this.autotileFrameCount(index);
    if (count <= 1) return 0;
    return Math.floor(time / AUTOTILE_FRAME_DURATION_MS) % count;
  }

  private drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, dx: number, dy: number, time: number): boolean {
    const id = tileAt(this.map, x, y, z);
    if (id === 0) return false;
    if (id >= 384) {
      const { srcX, srcY } = regularTileRect(id);
      ctx.drawImage(this.imgs.tileset, srcX, srcY, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
      return false;
    }
    const index = autotileIndexFor(id);
    if (index === null) return false;
    const img = this.imgs.autotiles[index];
    if (!img) return false;
    const frames = this.autotileFrameCount(index);
    const frame = this.frameOf(index, time);
    if (img.height === 32) {
      ctx.drawImage(img, frame * 32, 0, 32, 32, dx, dy, TILE_SIZE, TILE_SIZE);
      return frames > 1;
    }
    const mask = neighborMask(
      {
        width: this.map.width,
        height: this.map.height,
        z,
        get: (lx, ly) => tileAt(this.map, lx, ly, z),
      },
      x,
      y,
    );
    for (const q of autotileQuads(id, mask, frame)) {
      ctx.drawImage(img, q.srcX, q.srcY, 16, 16, dx + q.destX, dy + q.destY, 16, 16);
    }
    return frames > 1;
  }

  /** Depth of a tile row inside a chunk follows RGSS: y*32 + priority*32 + 32. */
  private stripDepth(cy: number, ty: number, priority: number): number {
    return (cy * CHUNK_TILES + ty) * TILE_SIZE + priority * TILE_SIZE + TILE_SIZE;
  }

  private stripFor(chunk: Chunk, ty: number, priority: number): Strip {
    const key = `${ty}_${priority}`;
    let strip = chunk.strips.get(key);
    if (!strip) {
      const canvas = document.createElement('canvas');
      canvas.width = CHUNK_PX;
      canvas.height = TILE_SIZE;
      const tex = this.scene.textures.addCanvas(`map_s_${chunk.key}_${key}`, canvas)!;
      const img = this.scene.add
        .image(chunk.cx * CHUNK_PX, (chunk.cy * CHUNK_TILES + ty) * TILE_SIZE, tex)
        .setOrigin(0)
        .setDepth(this.stripDepth(chunk.cy, ty, priority));
      strip = { canvas, tex, img };
      chunk.strips.set(key, strip);
    }
    return strip;
  }

  private drawStrip(chunk: Chunk, strip: Strip, ty: number, priority: number, time: number): boolean {
    const ctx = strip.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CHUNK_PX, TILE_SIZE);
    ctx.imageSmoothingEnabled = false;
    let animated = false;
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const mx = chunk.cx * CHUNK_TILES + tx;
      const my = chunk.cy * CHUNK_TILES + ty;
      if (mx >= this.map.width || my >= this.map.height) continue;
      for (let z = 0; z < 3; z++) {
        const id = tileAt(this.map, mx, my, z);
        if (id === 0 || tilePriority(this.ts, id) !== priority) continue;
        if (this.drawTile(ctx, mx, my, z, tx * TILE_SIZE, 0, time)) animated = true;
      }
    }
    strip.tex.refresh();
    return animated;
  }

  private renderChunk(chunk: Chunk, time: number): void {
    const gctx = chunk.groundCanvas.getContext('2d')!;
    gctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    gctx.imageSmoothingEnabled = false;

    let animated = false;
    const usedStrips = new Map<string, { ty: number; priority: number }>();

    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const mx = chunk.cx * CHUNK_TILES + tx;
        const my = chunk.cy * CHUNK_TILES + ty;
        if (mx >= this.map.width || my >= this.map.height) continue;
        for (let z = 0; z < 3; z++) {
          const id = tileAt(this.map, mx, my, z);
          if (id === 0) continue;
          const priority = tilePriority(this.ts, id);
          if (priority === 0) {
            if (this.drawTile(gctx, mx, my, z, tx * TILE_SIZE, ty * TILE_SIZE, time)) animated = true;
          } else {
            usedStrips.set(`${ty}_${priority}`, { ty, priority });
          }
        }
      }
    }

    for (const meta of usedStrips.values()) {
      const strip = this.stripFor(chunk, meta.ty, meta.priority);
      if (this.drawStrip(chunk, strip, meta.ty, meta.priority, time)) animated = true;
    }

    for (const [key, strip] of chunk.strips) {
      if (usedStrips.has(key)) continue;
      strip.img.destroy();
      this.scene.textures.remove(`map_s_${chunk.key}_${key}`);
      chunk.strips.delete(key);
    }

    chunk.animated = animated;
    chunk.groundTex.refresh();
  }

  private createChunk(cx: number, cy: number, time: number): Chunk {
    const key = `${cx},${cy}`;
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = groundCanvas.height = CHUNK_PX;
    const groundTex = this.scene.textures.addCanvas(`map_g_${key}`, groundCanvas)!;
    const groundImg = this.scene.add.image(cx * CHUNK_PX, cy * CHUNK_PX, groundTex).setOrigin(0).setDepth(0);
    const chunk: Chunk = {
      key,
      cx,
      cy,
      groundCanvas,
      groundTex,
      groundImg,
      strips: new Map(),
      animated: false,
      frameSig: -1,
    };
    this.renderChunk(chunk, time);
    return chunk;
  }

  private destroyChunk(chunk: Chunk): void {
    chunk.groundImg.destroy();
    this.scene.textures.remove(`map_g_${chunk.key}`);
    for (const [key, strip] of chunk.strips) {
      strip.img.destroy();
      this.scene.textures.remove(`map_s_${chunk.key}_${key}`);
    }
    chunk.strips.clear();
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) this.destroyChunk(chunk);
    this.chunks.clear();
  }

  update(view: Phaser.Geom.Rectangle, time: number): void {
    const margin = 1;
    const cx0 = Math.max(0, Math.floor(view.x / CHUNK_PX) - margin);
    const cy0 = Math.max(0, Math.floor(view.y / CHUNK_PX) - margin);
    const cx1 = Math.min(Math.ceil(this.map.width / CHUNK_TILES) - 1, Math.floor(view.right / CHUNK_PX) + margin);
    const cy1 = Math.min(Math.ceil(this.map.height / CHUNK_TILES) - 1, Math.floor(view.bottom / CHUNK_PX) + margin);
    const keep = new Set<string>();

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        keep.add(key);
        let chunk = this.chunks.get(key);
        if (!chunk) {
          chunk = this.createChunk(cx, cy, time);
          this.chunks.set(key, chunk);
        }
        const sig = Math.floor(time / AUTOTILE_FRAME_DURATION_MS);
        if (chunk.animated && chunk.frameSig !== sig) {
          this.renderChunk(chunk, time);
          chunk.frameSig = sig;
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!keep.has(key)) {
        this.destroyChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }
}

import { describe, expect, it } from 'vitest';
import { CharsetStore } from '../src/engine/charset';
import { Character } from '../src/engine/player';
import type { TerrainTag } from '../src/engine/movement';
import { eventPassable, playerPassable, surfaceTag } from '../src/engine/movement';

const TILE = 32;
const FRAME = 1000 / 60;
const FREE = () => true;

function makeMap(width = 10, height = 10, fill = 0) {
  return { width, height, data: new Int16Array(width * height * 3).fill(fill) };
}

function makeCtx() {
  return {
    passages: new Int16Array(500),
    priorities: new Int16Array(500),
    terrainTags: new Int16Array(500),
  };
}

const TAGS: TerrainTag[] = [];
for (const tag of [
  { id: 'None', idNumber: 0 },
  { id: 'Ledge', idNumber: 1, ledge: true },
  { id: 'Grass', idNumber: 2, landWildEncounters: true },
  { id: 'Water', idNumber: 7, canSurf: true },
  { id: 'TallGrass', idNumber: 10, deepBush: true, mustWalk: true },
  { id: 'Bridge', idNumber: 15, bridge: true },
  { id: 'NoEffect', idNumber: 17, ignorePassability: true },
] as TerrainTag[]) {
  TAGS[tag.idNumber] = tag;
}

describe('character grid movement', () => {
  it('walks one 32px tile in 15 frames (128 px/s, RGSS speed 3)', () => {
    const ch = new Character(3);
    ch.placeAt(5, 5);
    let frames = 0;
    while (frames < 60) {
      ch.update(FRAME, 6, FREE);
      frames++;
      if (!ch.moving && frames > 1) break;
    }
    expect(ch.tileX).toBe(6);
    expect(ch.px).toBe(6 * TILE);
    expect(frames).toBeGreaterThanOrEqual(15);
    expect(frames).toBeLessThanOrEqual(16);
  });

  it('advances the walk pattern every half tile', () => {
    const ch = new Character(3);
    ch.placeAt(5, 5);
    const patterns: number[] = [];
    for (let i = 0; i < 15; i++) {
      ch.update(FRAME, 6, FREE);
      patterns.push(ch.pattern);
    }
    // 16px per pattern: 7 frames travel 14.9px, 8 frames travel 17.1px
    expect(patterns[6]).toBe(0);
    expect(patterns[7]).toBe(1);
  });

  it('turns without moving when the step is blocked', () => {
    const ch = new Character(3);
    ch.placeAt(5, 5);
    ch.update(FRAME, 8, () => false);
    expect(ch.tileY).toBe(5);
    expect(ch.moving).toBe(false);
    expect(ch.direction).toBe(8);
  });

  it('resolves scripted move steps when the tile is reached', async () => {
    const ch = new Character(3);
    ch.placeAt(5, 5);
    const done = ch.moveStep(2, FREE);
    for (let i = 0; i < 20; i++) ch.update(FRAME, null, FREE);
    await expect(done).resolves.toBe(true);
    expect(ch.tileY).toBe(6);
  });
});

describe('tile passability', () => {
  it('reads passage bits per direction and falls through priority tiles', () => {
    const map = makeMap();
    const ctx = makeCtx();
    ctx.passages[384] = 0x02; // left blocked
    map.data[(0 * 10 + 2) * 10 + 2] = 384;
    expect(playerPassable(ctx, TAGS, map, 2, 2, 4)).toBe(false);
    expect(playerPassable(ctx, TAGS, map, 2, 2, 6)).toBe(true);
  });

  it('skips bridge tiles when not on a bridge, so you can walk under them', () => {
    const map = makeMap();
    const ctx = makeCtx();
    ctx.passages[385] = 0x0f;
    ctx.terrainTags[385] = 15; // Bridge
    map.data[(0 * 10 + 3) * 10 + 3] = 385;
    expect(playerPassable(ctx, TAGS, map, 3, 3, 2)).toBe(true);
    // NPCs use the plain rule and are blocked by the same tile
    expect(eventPassable(ctx, TAGS, map, 3, 3, 2)).toBe(false);
  });

  it('treats ledges as impassable and ignore_passability tiles as transparent', () => {
    const map = makeMap();
    const ctx = makeCtx();
    ctx.passages[386] = 0x0f;
    ctx.terrainTags[386] = 1; // Ledge
    map.data[(0 * 10 + 4) * 10 + 4] = 386;
    expect(playerPassable(ctx, TAGS, map, 4, 4, 2)).toBe(false);

    const map2 = makeMap();
    const ctx2 = makeCtx();
    ctx2.passages[387] = 0x0f;
    ctx2.terrainTags[387] = 17; // NoEffect / ignore passability
    map2.data[(0 * 10 + 5) * 10 + 5] = 387;
    expect(playerPassable(ctx2, TAGS, map2, 5, 5, 2)).toBe(true);
  });

  it('reports the topmost non-zero terrain tag', () => {
    const map = makeMap();
    const ctx = makeCtx();
    ctx.terrainTags[388] = 10; // TallGrass on the ground layer
    ctx.terrainTags[389] = 15; // Bridge above it
    map.data[(0 * 10 + 6) * 10 + 6] = 388;
    map.data[(1 * 10 + 6) * 10 + 6] = 389;
    expect(surfaceTag(ctx, TAGS, map, 6, 6)?.id).toBe('Bridge');
  });
});

describe('charset frames', () => {
  const charset = { key: 'k', frameWidth: 64, frameHeight: 64, anchorShift: 0 };

  it('maps direction to the RGSS row order down/left/right/up', () => {
    expect(CharsetStore.frameOf(charset, 2, 0)).toBe(0);
    expect(CharsetStore.frameOf(charset, 4, 0)).toBe(4);
    expect(CharsetStore.frameOf(charset, 6, 0)).toBe(8);
    expect(CharsetStore.frameOf(charset, 8, 0)).toBe(12);
  });

  it('uses four walk patterns per direction', () => {
    expect(CharsetStore.frameOf(charset, 2, 3)).toBe(3);
    expect(CharsetStore.frameOf(charset, 8, 2)).toBe(14);
    expect(CharsetStore.frameOf(charset, 2, 4)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AUTOTILE_PATTERNS,
  NEIGHBORS_TO_AUTOTILE_INDEX,
  autotileIndexFor,
  autotileQuads,
  neighborMask,
  regularTileRect,
} from '../src/engine/autotile';

describe('autotile tables', () => {
  it('keeps the 6x8 pattern layout from the game renderer', () => {
    expect(AUTOTILE_PATTERNS).toHaveLength(6);
    for (const row of AUTOTILE_PATTERNS) {
      expect(row).toHaveLength(8);
      for (const quad of row) {
        expect(quad).toHaveLength(4);
        for (const chunk of quad) {
          expect(chunk).toBeGreaterThanOrEqual(1);
          expect(chunk).toBeLessThanOrEqual(48);
        }
      }
    }
  });

  it('maps every neighbour mask to a pattern index', () => {
    expect(NEIGHBORS_TO_AUTOTILE_INDEX).toHaveLength(256);
    for (const idx of NEIGHBORS_TO_AUTOTILE_INDEX) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(47);
    }
    // surrounded on all sides -> fully interior pattern
    expect(NEIGHBORS_TO_AUTOTILE_INDEX[0xff]).toBe(0);
    // isolated tile -> fully bordered pattern
    expect(NEIGHBORS_TO_AUTOTILE_INDEX[0]).toBe(46);
  });

  it('splits autotile ids into 48-pattern slots', () => {
    expect(autotileIndexFor(48)).toBe(0);
    expect(autotileIndexFor(95)).toBe(0);
    expect(autotileIndexFor(96)).toBe(1);
    expect(autotileIndexFor(383)).toBe(6);
    expect(autotileIndexFor(47)).toBeNull();
    expect(autotileIndexFor(384)).toBeNull();
  });

  it('maps regular tiles to an 8-column grid', () => {
    expect(regularTileRect(384)).toEqual({ srcX: 0, srcY: 0 });
    expect(regularTileRect(391)).toEqual({ srcX: 224, srcY: 0 });
    expect(regularTileRect(392)).toEqual({ srcX: 0, srcY: 32 });
  });

  it('computes neighbour masks from layer equality with edge clamping', () => {
    const w = 3;
    const h = 3;
    const data = [5, 5, 5, 5, 5, 5, 5, 5, 0];
    const layer = { width: w, height: h, z: 0, get: (x: number, y: number) => data[y * w + x] };
    expect(neighborMask(layer, 1, 1)).toBe(0xf7);
    expect(neighborMask(layer, 2, 2)).toBe(0x1c);
    // corner clamping treats out-of-range neighbours as the same tile
    expect(neighborMask(layer, 0, 0)).toBe(0xff);
  });

  it('picks four 16px chunks per tile and offsets animation by 96px', () => {
    const quads = autotileQuads(48, 0xff, 0);
    expect(quads).toHaveLength(4);
    expect(quads[0].srcX % 16).toBe(0);
    expect(quads.map((q) => `${q.destX},${q.destY}`)).toEqual(['0,0', '16,0', '0,16', '16,16']);
    const animated = autotileQuads(48, 0xff, 2);
    expect(animated[0].srcX - quads[0].srcX).toBe(192);
  });
});

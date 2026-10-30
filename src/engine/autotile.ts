// Ported from the game's own renderer: Data/Scripts/006_Map renderer/004_TileDrawingHelper.rb
// and 003_AutotileExpander.rb. Source layout: 96x128 = 6x8 grid of 16px chunks,
// animation frames appended horizontally (each frame is 96px wide).

export const TILE_SIZE = 32;
export const CHUNK = TILE_SIZE / 2; // 16
export const TILES_PER_AUTOTILE = 48;
export const TILESET_START_ID = 384;
export const AUTOTILE_FRAME_DURATION_MS = 250;

// Each entry lists the four 16x16 source chunks (1-based) used for the
// top-left, top-right, bottom-left and bottom-right quadrant of the tile.
export const AUTOTILE_PATTERNS: number[][][] = [
  [[27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
   [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12]],
  [[27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
   [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12]],
  [[25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
   [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12]],
  [[29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
   [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46]],
  [[25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
   [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48]],
  [[37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
   [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8]],
];

export const NEIGHBORS_TO_AUTOTILE_INDEX: number[] = [
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
  37, 27, 37, 27, 23, 15, 23, 13, 37, 27, 37, 27, 22, 11, 22, 9,
  45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
  36, 26, 36, 26, 21, 7, 21, 5, 36, 26, 36, 26, 20, 3, 20, 1,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
  37, 25, 37, 25, 23, 14, 23, 12, 37, 25, 37, 25, 22, 10, 22, 8,
  45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
  36, 24, 36, 24, 21, 6, 21, 4, 36, 24, 36, 24, 20, 2, 20, 0,
];

export interface TileLayerView {
  width: number;
  height: number;
  /** layer index into the map table (0..2) */
  z: number;
  get(x: number, y: number): number;
}

export function neighborMask(layer: TileLayerView, x: number, y: number): number {
  const t = layer.get(x, y);
  const xp1 = Math.min(x + 1, layer.width - 1);
  const yp1 = Math.min(y + 1, layer.height - 1);
  const xm1 = Math.max(x - 1, 0);
  const ym1 = Math.max(y - 1, 0);
  let i = 0;
  if (layer.get(x, ym1) === t) i |= 0x01; // N
  if (layer.get(xp1, ym1) === t) i |= 0x02; // NE
  if (layer.get(xp1, y) === t) i |= 0x04; // E
  if (layer.get(xp1, yp1) === t) i |= 0x08; // SE
  if (layer.get(x, yp1) === t) i |= 0x10; // S
  if (layer.get(xm1, yp1) === t) i |= 0x20; // SW
  if (layer.get(xm1, y) === t) i |= 0x40; // W
  if (layer.get(xm1, ym1) === t) i |= 0x80; // NW
  return i;
}

export interface AutotileDrawRect {
  srcX: number;
  srcY: number;
  destX: number;
  destY: number;
}

/**
 * Quadrant source rects for one autotile tile. `tileId` is the raw map value
 * (48..383); `frame` is the animation frame index.
 */
export function autotileQuads(tileId: number, mask: number, frame: number): AutotileDrawRect[] {
  const pattern = NEIGHBORS_TO_AUTOTILE_INDEX[mask];
  const chunks = AUTOTILE_PATTERNS[pattern >> 3][pattern & 7];
  const anim = frame * 96;
  const out: AutotileDrawRect[] = [];
  for (let i = 0; i < 4; i++) {
    const pos = chunks[i] - 1;
    out.push({
      srcX: (pos % 6) * CHUNK + anim,
      srcY: Math.floor(pos / 6) * CHUNK,
      destX: (i % 2) * CHUNK,
      destY: Math.floor(i / 2) * CHUNK,
    });
  }
  return out;
}

export function autotileIndexFor(tileId: number): number | null {
  if (tileId < TILES_PER_AUTOTILE) return null; // ids 1..47 belong to the blank autotile slot
  if (tileId >= TILESET_START_ID) return null;
  const index = Math.floor(tileId / TILES_PER_AUTOTILE) - 1;
  return index >= 0 && index < 7 ? index : null;
}

export function regularTileRect(tileId: number): { srcX: number; srcY: number } {
  const n = tileId - TILESET_START_ID;
  return { srcX: (n % 8) * TILE_SIZE, srcY: Math.floor(n / 8) * TILE_SIZE };
}

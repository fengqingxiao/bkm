export const TILE = 32;

export const DIR_DOWN = 2;
export const DIR_LEFT = 4;
export const DIR_RIGHT = 6;
export const DIR_UP = 8;

export interface TerrainTag {
  id: string;
  idNumber: number;
  canSurf?: boolean;
  canDive?: boolean;
  waterfall?: boolean;
  waterfallCrest?: boolean;
  ledge?: boolean;
  ice?: boolean;
  bridge?: boolean;
  mustWalk?: boolean;
  ignorePassability?: boolean;
  deepBush?: boolean;
  landWildEncounters?: boolean;
}

export function tileAt(map: { width: number; height: number; data: Int16Array }, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.data[(z * map.height + y) * map.width + x];
}

export function tilePriority(ctx: { priorities: Int16Array }, tileId: number): number {
  return ctx.priorities[tileId] ?? 0;
}

/** Passage bit for a direction, as used by RGSS1: down=1, left=2, right=4, up=8. */
export function passageBit(dir: number): number {
  return (1 << (dir / 2 - 1)) & 0x0f;
}

export interface PassabilityContext {
  passages: Int16Array;
  priorities: Int16Array;
  terrainTags: Int16Array;
}

export function terrainTagAt(ctx: PassabilityContext, tags: TerrainTag[], tileId: number): TerrainTag | undefined {
  return tags[ctx.terrainTags[tileId] ?? 0];
}

/**
 * Port of Game_Map#playerPassable? — layers are scanned top-down; bridge tiles are
 * skipped when the player is not on a bridge (so you can walk under one), tags that
 * ignore passability are skipped entirely, and the first layer that either blocks or
 * is a priority-0 tile decides.
 */
export function playerPassable(
  ctx: PassabilityContext,
  tags: TerrainTag[],
  map: { width: number; height: number; data: Int16Array },
  x: number,
  y: number,
  dir: number,
): boolean {
  const bit = passageBit(dir);
  for (const z of [2, 1, 0]) {
    const id = tileAt(map, x, y, z);
    if (id === 0) continue;
    const tag = terrainTagAt(ctx, tags, id);
    if (tag?.bridge) continue;
    if (tag?.ledge) return false;
    if (tag?.ignorePassability) continue;
    const passage = ctx.passages[id] ?? 0;
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) return false;
    if ((ctx.priorities[id] ?? 0) === 0) return true;
  }
  return true;
}

/** Simpler rule used by NPCs: no bridge/ledge tag handling. */
export function eventPassable(
  ctx: PassabilityContext,
  tags: TerrainTag[],
  map: { width: number; height: number; data: Int16Array },
  x: number,
  y: number,
  dir: number,
): boolean {
  const bit = passageBit(dir);
  for (const z of [2, 1, 0]) {
    const id = tileAt(map, x, y, z);
    if (id === 0) continue;
    const tag = terrainTagAt(ctx, tags, id);
    if (tag?.ignorePassability) continue;
    const passage = ctx.passages[id] ?? 0;
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) return false;
    if ((ctx.priorities[id] ?? 0) === 0) return true;
  }
  return true;
}

/** Terrain tag of the topmost layer that carries one (used for encounters/bushes). */
export function surfaceTag(
  ctx: PassabilityContext,
  tags: TerrainTag[],
  map: { width: number; height: number; data: Int16Array },
  x: number,
  y: number,
): TerrainTag | undefined {
  for (const z of [2, 1, 0]) {
    const id = tileAt(map, x, y, z);
    if (id === 0) continue;
    const tag = terrainTagAt(ctx, tags, id);
    if (tag && tag.idNumber !== 0) return tag;
  }
  return undefined;
}

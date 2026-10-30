import type { CommonEvent, MapInfo, MapJson, SystemJson, TilesetJson } from './types';
import type { TerrainTag } from '../engine/movement';

const base = import.meta.env.BASE_URL;

function b64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const assetUrl = (relPath: string) => `${base}assets/${relPath}`;

export interface LoadedTileset extends Omit<TilesetJson, 'passages' | 'priorities' | 'terrainTags'> {
  passages: Int16Array;
  priorities: Int16Array;
  terrainTags: Int16Array;
}

export interface LoadedMap extends Omit<MapJson, 'data'> {
  data: Int16Array;
}

export class DataStore {
  private tilesets?: LoadedTileset[];
  private system?: SystemJson;
  private maps = new Map<number, LoadedMap>();
  private mapInfos?: Record<string, MapInfo>;
  private commonEvents?: (CommonEvent | null)[];

  async getTilesets(): Promise<LoadedTileset[]> {
    if (!this.tilesets) {
      const raw = await getJson<TilesetJson[]>('data/tilesets.json');
      this.tilesets = raw.map((t) => t && {
        ...t,
        passages: b64ToInt16(t.passages),
        priorities: b64ToInt16(t.priorities),
        terrainTags: b64ToInt16(t.terrainTags),
      });
    }
    return this.tilesets as LoadedTileset[];
  }

  async getSystem(): Promise<SystemJson> {
    this.system ??= await getJson<SystemJson>('data/system.json');
    return this.system;
  }

  async getMapInfos(): Promise<Record<string, MapInfo>> {
    this.mapInfos ??= await getJson<Record<string, MapInfo>>('data/mapinfos.json');
    return this.mapInfos;
  }

  private entrances?: Record<string, { x: number; y: number; dir: number }[]>;

  async getEntrances(): Promise<Record<string, { x: number; y: number; dir: number }[]>> {
    this.entrances ??= await getJson<Record<string, { x: number; y: number; dir: number }[]>>('data/entrances.json');
    return this.entrances;
  }

  async getCommonEvents(): Promise<(CommonEvent | null)[]> {
    this.commonEvents ??= await getJson<(CommonEvent | null)[]>('data/common_events.json');
    return this.commonEvents;
  }

  private terrainTags?: TerrainTag[];

  async getTerrainTags(): Promise<TerrainTag[]> {
    if (!this.terrainTags) {
      const raw = await getJson<TerrainTag[]>('data/terrain_tags.json');
      const byIdNumber: TerrainTag[] = [];
      for (const tag of raw) byIdNumber[tag.idNumber] = tag;
      this.terrainTags = byIdNumber;
    }
    return this.terrainTags;
  }

  async getMap(id: number): Promise<LoadedMap> {
    const cached = this.maps.get(id);
    if (cached) return cached;
    const raw = await getJson<MapJson>(`data/maps/${id}.json`);
    const map: LoadedMap = { ...raw, data: b64ToInt16(raw.data) };
    this.maps.set(id, map);
    return map;
  }
}

export const store = new DataStore();

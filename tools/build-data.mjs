import fs from 'node:fs';
import path from 'node:path';
import { unmarshal } from './marshal.mjs';

const ROOT = 'assets-src/宝可梦先锋';
const DATA = path.join(ROOT, 'Data');
const OUT = 'public/data';

const load = (f) => unmarshal(fs.readFileSync(path.join(DATA, f)));
const toB64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');

fs.mkdirSync(path.join(OUT, 'maps'), { recursive: true });

function tableToB64(table) {
  return toB64(table.data);
}

// ---- tilesets ----
const rawTilesets = load('Tilesets.rxdata');
const tilesets = rawTilesets.map((ts, id) => {
  if (!ts) return null;
  return {
    id,
    name: ts['@name'],
    image: ts['@tileset_name'],
    autotiles: ts['@autotile_names'],
    passages: tableToB64(ts['@passages']),
    priorities: tableToB64(ts['@priorities']),
    terrainTags: tableToB64(ts['@terrain_tags']),
  };
});
fs.writeFileSync(path.join(OUT, 'tilesets.json'), JSON.stringify(tilesets));

// ---- map infos ----
const rawInfos = load('MapInfos.rxdata');
const mapInfos = {};
for (const [id, info] of rawInfos) {
  mapInfos[id] = { name: info['@name'], order: info['@order'], parentId: info['@parent_id'] };
}
fs.writeFileSync(path.join(OUT, 'mapinfos.json'), JSON.stringify(mapInfos));

// ---- system ----
const sys = load('System.rxdata');
const system = {
  startMapId: sys['@start_map_id'],
  startX: sys['@start_x'],
  startY: sys['@start_y'],
  playerGraphic: sys['@player'] ? { characterName: sys['@player']['@character_name'], hue: sys['@player']['@character_hue'] } : null,
  switches: sys['@switches'],
  variables: sys['@variables'],
  party: sys['@party'],
  titleName: sys['@title_name'],
  windowskin: sys['@windowskin_name'],
  battleBgm: sys['@battle_bgm']?.['@name'],
  battleEndMe: sys['@battle_end_me']?.['@name'],
};
fs.writeFileSync(path.join(OUT, 'system.json'), JSON.stringify(system));

// ---- terrain tags (hardcoded in 011_TerrainTag.rb) ----
const tagSource = fs.readFileSync(
  path.join(ROOT, 'Data/Scripts/010_Data/001_Hardcoded data/011_TerrainTag.rb'),
  'utf8',
);
const terrainTags = new Map();
for (const block of tagSource.matchAll(/GameData::TerrainTag\.register\(\{([\s\S]*?)\n\}\)/g)) {
  const entry = { id: '', idNumber: 0 };
  for (const pair of block[1].matchAll(/:([a-z_]+)\s*=>\s*(:[A-Za-z_]+|true|false|-?\d+)/g)) {
    const [, key, raw] = pair;
    const value = raw.startsWith(':') ? raw.slice(1) : raw === 'true' ? true : raw === 'false' ? false : Number(raw);
    if (key === 'id') entry.id = String(value);
    else if (key === 'id_number') entry.idNumber = Number(value);
    else entry[key] = value;
  }
  terrainTags.set(entry.idNumber, entry);
}
fs.writeFileSync(
  path.join(OUT, 'terrain_tags.json'),
  JSON.stringify([...terrainTags.values()].sort((a, b) => a.idNumber - b.idNumber)),
);
console.log('terrain tags:', terrainTags.size);

// ---- common events ----
const rawCommon = load('CommonEvents.rxdata');
const commonEvents = rawCommon.map((ce, id) => {
  if (!ce) return null;
  return {
    id,
    name: ce['@name'],
    trigger: ce['@trigger'],
    switchId: ce['@switch_id'],
    list: ce['@list'].map((c) => ({ code: c['@code'], indent: c['@indent'], params: c['@parameters'] })),
  };
});
fs.writeFileSync(path.join(OUT, 'common_events.json'), JSON.stringify(commonEvents));

// ---- maps ----
const mapFiles = fs.readdirSync(DATA).filter((f) => /^Map\d+\.rxdata$/.test(f));
let total = 0;
const entrances = new Map();
for (const f of mapFiles) {
  const id = Number(f.match(/\d+/)[0]);
  const map = load(f);
  const out = {
    id,
    width: map['@data'].xsize,
    height: map['@data'].ysize,
    tilesetId: map['@tileset_id'],
    displayName: map['@display_name'],
    bgm: map['@bgm'] ? { name: map['@bgm']['@name'], volume: map['@bgm']['@volume'], pitch: map['@bgm']['@pitch'] } : null,
    data: tableToB64(map['@data']),
    events: [...map['@events']].map(([evId, ev]) => ({
      id: evId,
      name: ev['@name'],
      x: ev['@x'],
      y: ev['@y'],
      pages: ev['@pages'].map((p) => ({
        trigger: p['@trigger'],
        moveType: p['@move_type'],
        moveSpeed: p['@move_speed'],
        moveFrequency: p['@move_frequency'],
        walkAnime: p['@walk_anime'],
        stepAnime: p['@step_anime'],
        directionFix: p['@direction_fix'],
        through: p['@through'],
        alwaysOnTop: p['@always_on_top'],
        condition: {
          switch1Valid: p['@condition']['@switch1_valid'],
          switch1: p['@condition']['@switch1_id'],
          switch2Valid: p['@condition']['@switch2_valid'],
          switch2: p['@condition']['@switch2_id'],
          variableValid: p['@condition']['@variable_valid'],
          variable: p['@condition']['@variable_id'],
          variableValue: p['@condition']['@variable_value'],
          selfSwitch: p['@condition']['@self_switch_valid'] ? p['@condition']['@self_switch_ch'] : '',
        },
        graphic: {
          tileId: p['@graphic']['@tile_id'],
          characterName: p['@graphic']['@character_name'],
          characterHue: p['@graphic']['@character_hue'],
          direction: p['@graphic']['@direction'],
          pattern: p['@graphic']['@pattern'],
          opacity: p['@graphic']['@opacity'],
        },
        moveRoute: (p['@move_route']?.['@list'] ?? []).map((c) => ({ code: c['@code'], params: c['@parameters'] })),
        list: p['@list'].map((c) => ({ code: c['@code'], indent: c['@indent'], params: c['@parameters'] })),
      })),
    })),
  };
  const json = JSON.stringify(out);
  total += json.length;
  fs.writeFileSync(path.join(OUT, 'maps', `${id}.json`), json);

  for (const ev of out.events) {
    for (const page of ev.pages) {
      for (const cmd of page.list) {
        if (cmd.code !== 201) continue;
        const [mode, destMap, x, y, dir] = cmd.params;
        if (mode !== 0 || !destMap) continue;
        if (!entrances.has(destMap)) entrances.set(destMap, []);
        const list = entrances.get(destMap);
        if (!list.some((e) => e.x === x && e.y === y)) list.push({ x, y, dir });
      }
    }
  }
}
console.log(`maps ${mapFiles.length}, total JSON ${(total / 1048576).toFixed(1)} MiB`);
fs.writeFileSync(path.join(OUT, 'entrances.json'), JSON.stringify(Object.fromEntries(entrances)));
console.log('entrance maps:', entrances.size);
console.log('sample map sizes:', [56, 1, 234].map((id) => {
  const p = path.join(OUT, 'maps', `${id}.json`);
  return fs.existsSync(p) ? `${id}=${(fs.statSync(p).size / 1024).toFixed(0)}KB` : `${id}=missing`;
}).join(' '));

import fs from 'node:fs';
import path from 'node:path';
import { unmarshal } from './marshal.mjs';

const DATA = 'assets-src/宝可梦先锋/Data';
const load = (f) => unmarshal(fs.readFileSync(path.join(DATA, f)));

const mapInfos = load('MapInfos.rxdata');
const tilesets = load('Tilesets.rxdata');
const system = load('System.rxdata');

console.log('tilesets:', tilesets.length);
const ts = tilesets[1];
console.log('tileset[0]:', ts['@name'], '| img:', ts['@tileset_name'], '| autotiles:', (ts['@autotile_names'] ?? []).join(', '));
console.log('passages table:', ts['@passages']?.xsize, 'x', ts['@passages']?.ysize);

console.log('system: startMap', system['@start_map_id'], 'party', system['@party'], 'switches', system['@switches']?.length, 'variables', system['@variables']?.length);
console.log('system battle BGM', system['@battle_bgm']?.['@name'], '| title', system['@title_name']);

const mapFiles = fs.readdirSync(DATA).filter((f) => /^Map\d+\.rxdata$/.test(f));
const codes = new Map();
const scriptCmds = new Map();
let eventCount = 0;
let pageCount = 0;
let cmdCount = 0;
let totalEventBytes = 0;

for (const f of mapFiles) {
  const map = unmarshal(fs.readFileSync(path.join(DATA, f)));
  totalEventBytes += fs.statSync(path.join(DATA, f)).size;
  for (const [, ev] of map['@events'] ?? []) {
    eventCount++;
    for (const page of ev['@pages'] ?? []) {
      pageCount++;
      for (const cmd of page['@list'] ?? []) {
        cmdCount++;
        codes.set(cmd['@code'], (codes.get(cmd['@code']) ?? 0) + 1);
        if (cmd['@code'] === 355 || cmd['@code'] === 655) {
          const src = String(cmd['@parameters']?.[0] ?? '').trim().split('\n')[0].slice(0, 70);
          scriptCmds.set(src, (scriptCmds.get(src) ?? 0) + 1);
        }
      }
    }
  }
}

console.log(`\nmaps: ${mapFiles.length}, events: ${eventCount}, pages: ${pageCount}, commands: ${cmdCount}`);
console.log('\ntop command codes:');
[...codes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  .forEach(([code, n]) => console.log(`  ${String(code).padStart(4)}  ${String(n).padStart(7)}`));

let scriptTotal = 0;
for (const n of scriptCmds.values()) scriptTotal += n;
console.log(`\nscript commands (355/655): ${scriptTotal} calls, ${scriptCmds.size} distinct first lines`);
[...scriptCmds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  .forEach(([src, n]) => console.log(`  ${String(n).padStart(5)}  ${src}`));

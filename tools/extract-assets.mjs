import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ARCHIVE = '/root/workspace/.aicode/attachments/宝可梦先锋.rar';
const INDEX_CACHE = '.cache/archive-index.txt';
const OUT = 'public/assets';
const DATA = 'public/data';

const mapIds = process.argv.slice(2).map(Number);
if (!mapIds.length) {
  console.error('usage: node tools/extract-assets.mjs <mapId> [mapId...]');
  process.exit(1);
}

function archiveIndex() {
  fs.mkdirSync('.cache', { recursive: true });
  if (!fs.existsSync(INDEX_CACHE)) {
    const out = execFileSync('bsdtar', ['-tf', ARCHIVE], { maxBuffer: 1 << 30 }).toString();
    fs.writeFileSync(INDEX_CACHE, out);
  }
  return fs.readFileSync(INDEX_CACHE, 'utf8').split('\n').filter(Boolean);
}

const index = archiveIndex();
const lower = new Map(index.map((p) => [p.toLowerCase(), p]));

const tilesets = JSON.parse(fs.readFileSync(path.join(DATA, 'tilesets.json'), 'utf8'));
const system = JSON.parse(fs.readFileSync(path.join(DATA, 'system.json'), 'utf8'));

const wanted = new Map(); // archive path -> reason
const manifest = {};

function find(candidates) {
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function addAsset(relPath, exts, reason) {
  const candidates = [];
  for (const ext of exts) candidates.push(`宝可梦先锋/${relPath}${ext}`);
  const hit = find(candidates);
  if (hit) {
    wanted.set(hit, reason);
    manifest[relPath] = hit.replace(/^宝可梦先锋\//, '');
  } else console.warn(`missing: ${relPath} (${reason})`);
}

function addAudio(kind, name) {
  if (!name) return;
  addAsset(`Audio/${kind}/${name}`, ['.ogg', '.wav', '.mp3', '.mid', '.wma'], `audio ${kind}`);
}

function addCharacter(name) {
  if (!name || name.startsWith('$') === false && name.length === 0) return;
  addAsset(`Graphics/Characters/${name}`, ['.png'], 'character');
}

for (const id of mapIds) {
  const map = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', `${id}.json`), 'utf8'));
  const ts = tilesets[map.tilesetId];
  addAsset(`Graphics/Tilesets/${ts.image}`, ['.png'], `tileset ${ts.name}`);
  for (const at of ts.autotiles) {
    if (at) addAsset(`Graphics/Autotiles/${at}`, ['.png'], 'autotile');
  }
  if (map.bgm?.name) addAudio('BGM', map.bgm.name);
  for (const ev of map.events) {
    for (const page of ev.pages) {
      addCharacter(page.graphic.characterName);
      for (const cmd of page.list) {
        const p = cmd.params ?? [];
        if (cmd.code === 241) addAudio('BGM', p[0]?.__class ? p[0]['@name'] : p[0]);
        if (cmd.code === 249) addAudio('ME', p[0]?.__class ? p[0]['@name'] : p[0]);
        if (cmd.code === 250) addAudio('SE', p[0]?.__class ? p[0]['@name'] : p[0]);
      }
    }
  }
}

addCharacter(system.playerGraphic?.characterName);
addAsset(`Graphics/Windowskins/${system.windowskin}`, ['.png'], 'windowskin');

const paths = [...wanted.keys()];
console.log(`need ${paths.length} files (${wanted.size} resolved)`);
fs.writeFileSync('.cache/needed-assets.txt', paths.join('\n') + '\n');

fs.mkdirSync(OUT, { recursive: true });
const args = ['-xf', ARCHIVE, '-C', OUT, '--strip-components=1', '--no-same-owner'];
for (const p of paths) args.push('--include', p);
execFileSync('bsdtar', args, { stdio: 'inherit' });

const audioManifest = {};
for (const [rel, actual] of Object.entries(manifest)) {
  if (rel.startsWith('Audio/')) audioManifest[rel.replace(/^Audio\//, '')] = actual;
}
fs.writeFileSync(`${DATA}/audio.json`, JSON.stringify(audioManifest));
console.log(`extracted into ${OUT}; audio entries ${Object.keys(audioManifest).length}`);

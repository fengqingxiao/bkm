import fs from 'node:fs';

const tilesets = JSON.parse(fs.readFileSync('public/data/tilesets.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('public/data/maps/56.json', 'utf8'));
const ts = tilesets[map.tilesetId];
const passages = Buffer.from(ts.passages, 'base64');
const priorities = Buffer.from(ts.priorities, 'base64');
const tags = Buffer.from(ts.terrainTags, 'base64');
const i16 = (buf, i) => buf.readInt16LE(i * 2);

const width = map.width;
const height = map.height;
const data = Buffer.from(map.data, 'base64');
const tile = (x, y, z) => data.readInt16LE(((z * height + y) * width + x) * 2);

const usage = new Map();
for (let z = 0; z < 3; z++) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = tile(x, y, z);
      if (!id) continue;
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
}

const rows = [...usage.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([id, n]) => ({
    id,
    count: n,
    passage: '0x' + i16(passages, id).toString(16).padStart(2, '0'),
    priority: i16(priorities, id),
    tag: i16(tags, id),
    kind: id >= 384 ? 'tile' : `autotile${Math.floor(id / 48) - 1}`,
  }));

console.log('autotiles:', ts.autotiles.join(' | '));
console.table(rows.slice(0, 25));
console.log('priority histogram:', rows.reduce((acc, r) => (acc[r.priority] = (acc[r.priority] ?? 0) + r.count, acc), {}));
console.log('tag histogram:', rows.reduce((acc, r) => (acc[r.tag] = (acc[r.tag] ?? 0) + r.count, acc), {}));

import fs from 'node:fs';

const DATA = 'public/data/maps';
const target = Number(process.argv[2] ?? 56);
const hits = [];

for (const f of fs.readdirSync(DATA)) {
  const map = JSON.parse(fs.readFileSync(`${DATA}/${f}`, 'utf8'));
  for (const ev of map.events) {
    for (const page of ev.pages) {
      for (const cmd of page.list) {
        if (cmd.code !== 201) continue;
        const [mode, mapId, x, y, dir] = cmd.params;
        if (mapId === target) hits.push({ from: map.id, event: ev.id, name: ev.name, x, y, dir, mode });
      }
    }
  }
}
console.log(JSON.stringify(hits.slice(0, 20), null, 1));
console.log('total', hits.length);

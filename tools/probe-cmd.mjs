import fs from 'node:fs';
import { unmarshal } from './marshal.mjs';

const DATA = 'assets-src/宝可梦先锋/Data';
const map = unmarshal(fs.readFileSync(`${DATA}/Map056.rxdata`));
const seen = new Map();
for (const [id, ev] of map['@events']) {
  for (const [pi, page] of ev['@pages'].entries()) {
    for (const cmd of page['@list']) {
      const code = cmd['@code'];
      if (code === 509 || code === 208 || code === 209) {
        const key = `${code}:${JSON.stringify(cmd['@parameters']).slice(0, 90)}`;
        if (!seen.has(key)) seen.set(key, { id, pi, cmd });
      }
    }
  }
}
for (const [key, { id, pi, cmd }] of [...seen].slice(0, 12)) {
  console.log(key, '| event', id, 'page', pi);
}

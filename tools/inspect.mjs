import fs from 'node:fs';
import path from 'node:path';
import { unmarshal } from './marshal.mjs';

const DATA = process.argv[2] ?? 'assets-src/宝可梦先锋/Data';
const file = process.argv[3] ?? 'MapInfos.rxdata';
const target = path.join(DATA, file);

const t0 = Date.now();
const value = unmarshal(fs.readFileSync(target));
const ms = Date.now() - t0;

function summarize(v, depth = 0, seen = new Set()) {
  const pad = '  '.repeat(depth);
  if (v === null || typeof v !== 'object') return pad + JSON.stringify(v);
  if (seen.has(v)) return pad + '<cycle>';
  seen.add(v);
  if (v instanceof Map) {
    const keys = [...v.keys()].slice(0, 3);
    const body = keys.map((k) => `${pad}  ${JSON.stringify(k)} => ${summarize(v.get(k), depth + 2, seen)}`).join('\n');
    return `${pad}Hash(${v.size})\n${body}`;
  }
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => summarize(x, depth + 1, seen)).join('\n');
    return `${pad}Array(${v.length})\n${head}`;
  }
  if (v.__class === 'Table') {
    return `${pad}Table(${v.xsize}x${v.ysize}x${v.zsize} dim=${v.dim}) nonZero=${v.data.reduce((a, b) => a + (b !== 0 ? 1 : 0), 0)}`;
  }
  const parts = Object.entries(v).slice(0, 12).map(([k, val]) => `${pad}  ${k}: ${summarize(val, depth + 2, seen)}`);
  if (Object.keys(v).length > 12) parts.push(`${pad}  ...`);
  return `${pad}${v.__class ?? 'Object'}\n${parts.join('\n')}`;
}

console.log(`${file}: ${value instanceof Map ? `Hash(${value.size})` : Array.isArray(value) ? `Array(${value.length})` : value?.__class} in ${ms}ms`);
console.log(summarize(value).slice(0, 3000));

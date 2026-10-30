import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unmarshal } from '../tools/marshal.mjs';

const DATA = path.join('assets-src', '宝可梦先锋', 'Data');
const hasData = fs.existsSync(DATA);

describe.skipIf(!hasData)('ruby marshal reader', () => {
  it('reads the map info hash with localized names', () => {
    const infos = unmarshal(fs.readFileSync(path.join(DATA, 'MapInfos.rxdata')));
    expect(infos).toBeInstanceOf(Map);
    expect(infos.size).toBe(319);
    expect(infos.get(56)['@name']).toBe('一号道路');
    expect(infos.get(56)['@parent_id']).toBe(35);
  });

  it('decodes Table objects inside a map', () => {
    const map = unmarshal(fs.readFileSync(path.join(DATA, 'Map056.rxdata')));
    expect(map['@class']).toBeUndefined();
    expect(map['__class']).toBe('RPG::Map');
    const table = map['@data'];
    expect(table.__class).toBe('Table');
    expect(table.dim).toBe(3);
    expect(table.data.length).toBe(table.xsize * table.ysize * table.zsize);
    expect(table.xsize).toBe(100);
    expect(table.ysize).toBe(100);
    // tile ids must be inside the tileset range (384 + tile count), never the table size header
    const max = Math.max(...table.data);
    expect(max).toBeLessThan(4000);
    expect(map['@events'].size).toBe(93);
  });

  it('keeps UTF-8 text intact inside event commands', () => {
    const map = unmarshal(fs.readFileSync(path.join(DATA, 'Map056.rxdata')));
    const events = [...map['@events'].values()];
    const texts = events
      .flatMap((ev) => ev['@pages'])
      .flatMap((page) => page['@list'])
      .filter((cmd) => cmd['@code'] === 101)
      .map((cmd) => cmd['@parameters'][0]);
    expect(texts.some((t) => typeof t === 'string' && /[\u4e00-\u9fff]/.test(t))).toBe(true);
  });
});

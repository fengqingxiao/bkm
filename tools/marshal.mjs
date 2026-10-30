// Ruby Marshal 4.8 reader, scoped to the subset used by RPG Maker XP / Essentials data files.
// Encoding rules verified against ruby/marshal.c (ruby_marshal_write_long).

const TYPE_NIL = 0x30;        // '0'
const TYPE_TRUE = 0x54;       // 'T'
const TYPE_FALSE = 0x46;      // 'F'
const TYPE_FIXNUM = 0x69;     // 'i'
const TYPE_BIGNUM = 0x6c;     // 'l'
const TYPE_FLOAT = 0x66;      // 'f'
const TYPE_STRING = 0x22;     // '"'
const TYPE_SYMBOL = 0x3a;     // ':'
const TYPE_SYMLINK = 0x3b;    // ';'
const TYPE_LINK = 0x40;       // '@'
const TYPE_IVAR = 0x49;       // 'I'
const TYPE_ARRAY = 0x5b;      // '['
const TYPE_HASH = 0x7b;       // '{'
const TYPE_HASH_DEF = 0x7d;   // '}'
const TYPE_OBJECT = 0x6f;     // 'o'
const TYPE_USERDEF = 0x75;    // 'u'
const TYPE_USRMARSHAL = 0x55;// 'U'
const TYPE_CLASS = 0x63;      // 'c'
const TYPE_MODULE = 0x6d;     // 'm'
const TYPE_UCLASS = 0x43;     // 'C'
const TYPE_STRUCT = 0x53;     // 'S'
const TYPE_REGEXP = 0x2f;     // '/'
const TYPE_EXTENDED = 0x65;   // 'e'
const TYPE_DATA = 0x64;       // 'd'

const utf8 = new TextDecoder('utf-8', { fatal: false });

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
    this.symbols = [];
    this.objects = [];
  }

  u8() {
    if (this.pos >= this.buf.length) throw new Error('unexpected end of marshal data');
    return this.buf[this.pos++];
  }

  i8() {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }

  take(n) {
    if (this.pos + n > this.buf.length) throw new Error('unexpected end of marshal data');
    const s = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }

  long() {
    const c = this.u8();
    if (c === 0) return 0;
    if (c >= 6 && c <= 127) return c - 5;
    if (c >= 128 && c <= 250) return c - 251;
    const negative = c >= 251;
    const count = negative ? 256 - c : c;
    let x = 0;
    for (let i = 0; i < count; i++) x += this.u8() * 2 ** (8 * i);
    if (negative) x -= 2 ** (8 * count);
    return x;
  }

  bytes() {
    return this.take(this.long());
  }
}

function decodeTable(raw) {
  // RGSS Table#_dump: [dim, xsize, ysize, zsize, data.size].pack('V5') + data.pack('s*')
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const dim = dv.getInt32(0, true);
  const xsize = dv.getInt32(4, true);
  const ysize = dv.getInt32(8, true);
  const zsize = dv.getInt32(12, true);
  const stored = dv.getInt32(16, true);
  const capacity = Math.floor((raw.byteLength - 20) / 2);
  const count = stored > 0 && stored <= capacity ? stored : xsize * ysize * zsize;
  const data = new Int16Array(count);
  for (let i = 0; i < count; i++) data[i] = dv.getInt16(20 + i * 2, true);
  return { __class: 'Table', dim, xsize, ysize, zsize, data };
}

function decodeFloats(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = Math.floor(raw.byteLength / 8);
  const values = [];
  for (let i = 0; i < n; i++) values.push(dv.getFloat64(i * 8, true));
  return values;
}

export function unmarshal(buf) {
  const r = new Reader(buf);
  const major = r.u8();
  const minor = r.u8();
  if (major !== 4) throw new Error(`unsupported marshal version ${major}.${minor}`);

  function readSymbolValue() {
    const t = r.u8();
    if (t === TYPE_SYMBOL) {
      const name = utf8.decode(r.bytes());
      const sym = Symbol.for(name);
      r.symbols.push(name);
      return name;
    }
    if (t === TYPE_SYMLINK) return r.symbols[r.long()];
    if (t === TYPE_IVAR) {
      const name = readSymbolValue();
      const count = r.long();
      for (let i = 0; i < count; i++) {
        readSymbolValue();
        readValue();
      }
      return name;
    }
    throw new Error(`expected symbol, got 0x${t.toString(16)}`);
  }

  function readValue() {
    const t = r.u8();
    switch (t) {
      case TYPE_NIL: return null;
      case TYPE_TRUE: return true;
      case TYPE_FALSE: return false;
      case TYPE_FIXNUM: return r.long();
      case TYPE_BIGNUM: {
        const sign = String.fromCharCode(r.u8());
        const len = r.long();
        let v = 0n;
        for (let i = 0; i < len; i++) v |= BigInt(r.u8()) << BigInt(i * 16);
        return sign === '-' ? -v : v;
      }
      case TYPE_FLOAT: return parseFloat(utf8.decode(r.bytes()));
      case TYPE_STRING: {
        const s = utf8.decode(r.bytes());
        r.objects.push(s);
        return s;
      }
      case TYPE_SYMBOL:
      case TYPE_SYMLINK:
        r.pos--;
        return readSymbolValue();
      case TYPE_IVAR: {
        const inner = readValue();
        const count = r.long();
        let encoding = null;
        for (let i = 0; i < count; i++) {
          const key = readSymbolValue();
          const val = readValue();
          if (key === 'E' && val === true) encoding = 'utf-8';
          if (key === 'encoding' && typeof val === 'string') encoding = val;
        }
        if (encoding && typeof inner === 'string') return inner;
        return inner;
      }
      case TYPE_ARRAY: {
        const len = r.long();
        const arr = [];
        r.objects.push(arr);
        for (let i = 0; i < len; i++) arr.push(readValue());
        return arr;
      }
      case TYPE_HASH:
      case TYPE_HASH_DEF: {
        const len = r.long();
        const map = new Map();
        r.objects.push(map);
        for (let i = 0; i < len; i++) {
          const k = readValue();
          map.set(k, readValue());
        }
        if (t === TYPE_HASH_DEF) map.set('__default', readValue());
        return map;
      }
      case TYPE_OBJECT: {
        const className = readSymbolValue();
        const count = r.long();
        const obj = { __class: className };
        r.objects.push(obj);
        for (let i = 0; i < count; i++) {
          const key = readSymbolValue();
          obj[key] = readValue();
        }
        return obj;
      }
      case TYPE_USERDEF: {
        const className = readSymbolValue();
        const raw = r.bytes();
        let value;
        if (className === 'Table') value = decodeTable(raw);
        else if (className === 'Color' || className === 'Tone') {
          value = { __class: className, values: decodeFloats(raw) };
        } else value = { __class: className, raw };
        r.objects.push(value);
        return value;
      }
      case TYPE_USRMARSHAL: {
        readSymbolValue();
        return readValue();
      }
      case TYPE_UCLASS: {
        readSymbolValue();
        return readValue();
      }
      case TYPE_STRUCT: {
        const className = readSymbolValue();
        const count = r.long();
        const obj = { __class: className };
        r.objects.push(obj);
        for (let i = 0; i < count; i++) {
          const key = readSymbolValue();
          obj[key] = readValue();
        }
        return obj;
      }
      case TYPE_EXTENDED: {
        readSymbolValue();
        return readValue();
      }
      case TYPE_REGEXP: {
        const src = utf8.decode(r.bytes());
        r.u8();
        return { __class: 'Regexp', source: src };
      }
      case TYPE_LINK: return r.objects[r.long()];
      case TYPE_CLASS:
      case TYPE_MODULE:
        return { __class: 'Name', name: utf8.decode(r.bytes()) };
      case TYPE_DATA:
        readSymbolValue();
        return readValue();
      default:
        throw new Error(`unknown marshal type 0x${t.toString(16)} at ${r.pos - 1}`);
    }
  }

  return readValue();
}

export function unmarshalFile(fs, path) {
  return unmarshal(fs.readFileSync(path));
}

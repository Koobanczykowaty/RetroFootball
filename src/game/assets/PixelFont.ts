// ============================================================
// PixelFont — Builds the "Retro Gała" pixel font (glyphs in
// PixelFontGlyphs.ts) into a TrueType font in memory and registers
// it with the browser (FontFace API), so every Phaser Text can use
// it like any font: colours, strokes and sizes keep working, and
// the project still ships without font files.
//
// One pixel = 100 font units, 1000 units per em: the font is crisp
// at 10, 20, 30… px. Every glyph is 5 pixels wide on a 6-pixel
// advance (0.6 em, the same as typical monospace).
// ============================================================

import { GLYPHS, GlyphDef } from './PixelFontGlyphs';

export const PIXEL_FONT_FAMILY = 'RetroGala';

const UNITS_PER_EM = 1000;
const PX = 100;
const ADVANCE = 600;
const LSB = 50;
const ASCENT = 950;
const DESCENT = 250;

interface Glyph {
  code: number;
  /** Rectangles [x0, y0, x1, y1] in font units. */
  rects: Array<[number, number, number, number]>;
}

/** Pixel runs of a glyph definition as rectangles. */
export function glyphRects(def: GlyphDef): Array<[number, number, number, number]> {
  const [top, ...rows] = def;
  const rects: Array<[number, number, number, number]> = [];
  rows.forEach((row, i) => {
    const y0 = (top - i) * PX;
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const on = row[x] === '#';
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        rects.push([LSB + start * PX, y0, LSB + x * PX, y0 + PX]);
        start = -1;
      }
    }
  });
  return rects;
}

// ------------------------------------------------------------------ writer

class Writer {
  private bytes: number[] = [];
  get length(): number {
    return this.bytes.length;
  }
  u8(v: number): this {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number): this {
    return this.u16((v >>> 16) & 0xffff).u16(v & 0xffff);
  }
  tag(s: string): this {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  pad4(): this {
    while (this.bytes.length % 4) this.u8(0);
    return this;
  }
  append(other: Writer | number[]): this {
    for (const b of other instanceof Writer ? other.bytes : other) this.bytes.push(b);
    return this;
  }
  toArray(): number[] {
    return this.bytes;
  }
}

function checksum(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const w = ((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    sum = (sum + (w >>> 0)) >>> 0;
  }
  return sum;
}

// ------------------------------------------------------------------ tables

/** Builds the TrueType font file. */
export function buildPixelFont(): ArrayBuffer {
  const chars = Object.keys(GLYPHS).map((ch) => ({ ch, code: ch.codePointAt(0)! }));
  chars.sort((p, q) => p.code - q.code);
  // Glyph 0 = .notdef (a hollow box), glyph 1 = space
  const notdef: Glyph = {
    code: -1,
    rects: [
      [LSB, 0, LSB + 500, PX], [LSB, 600, LSB + 500, 700], [LSB, PX, LSB + PX, 600], [LSB + 400, PX, LSB + 500, 600],
    ],
  };
  const glyphs: Glyph[] = [notdef, { code: 32, rects: [] }];
  for (const { ch, code } of chars) {
    if (code !== 32) glyphs.push({ code, rects: glyphRects(GLYPHS[ch]) });
  }

  // glyf + loca
  const glyf = new Writer();
  const loca: number[] = [];
  let maxPoints = 0;
  let maxContours = 0;
  let xMinAll = 0;
  let yMinAll = 0;
  let xMaxAll = 0;
  let yMaxAll = 0;
  const bounds: Array<{ xMin: number }> = [];
  for (const g of glyphs) {
    loca.push(glyf.length);
    if (g.rects.length === 0) {
      bounds.push({ xMin: 0 });
      continue;
    }
    const xMin = Math.min(...g.rects.map((r) => r[0]));
    const yMin = Math.min(...g.rects.map((r) => r[1]));
    const xMax = Math.max(...g.rects.map((r) => r[2]));
    const yMax = Math.max(...g.rects.map((r) => r[3]));
    bounds.push({ xMin });
    xMinAll = Math.min(xMinAll, xMin);
    yMinAll = Math.min(yMinAll, yMin);
    xMaxAll = Math.max(xMaxAll, xMax);
    yMaxAll = Math.max(yMaxAll, yMax);
    maxContours = Math.max(maxContours, g.rects.length);
    maxPoints = Math.max(maxPoints, g.rects.length * 4);

    glyf.i16(g.rects.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    g.rects.forEach((_, i) => glyf.u16(i * 4 + 3)); // end point of each contour
    glyf.u16(0); // no instructions
    for (let i = 0; i < g.rects.length * 4; i++) glyf.u8(0x01); // all points on the curve
    // Clockwise rectangles: (x0,y0) → (x0,y1) → (x1,y1) → (x1,y0)
    const pts: Array<[number, number]> = [];
    for (const [x0, y0, x1, y1] of g.rects) pts.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]);
    let px = 0;
    for (const [x] of pts) {
      glyf.i16(x - px);
      px = x;
    }
    let py = 0;
    for (const [, y] of pts) {
      glyf.i16(y - py);
      py = y;
    }
    glyf.pad4();
  }
  loca.push(glyf.length);
  const locaW = new Writer();
  for (const off of loca) locaW.u32(off);

  const numGlyphs = glyphs.length;

  const head = new Writer()
    .u32(0x00010000).u32(0x00010000).u32(0) // version, revision, checkSumAdjustment (set later)
    .u32(0x5f0f3cf5).u16(0x000b).u16(UNITS_PER_EM)
    .u32(0).u32(0).u32(0).u32(0) // created, modified
    .i16(xMinAll).i16(yMinAll).i16(xMaxAll).i16(yMaxAll)
    .u16(0).u16(8).i16(2).i16(1).i16(0); // macStyle, lowestRecPPEM, direction hint, long loca, glyph format

  const hhea = new Writer()
    .u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0)
    .u16(ADVANCE).i16(0).i16(0).i16(xMaxAll)
    .i16(1).i16(0).i16(0)
    .i16(0).i16(0).i16(0).i16(0)
    .i16(0).u16(numGlyphs);

  const maxp = new Writer()
    .u32(0x00010000).u16(numGlyphs).u16(maxPoints).u16(maxContours)
    .u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  const codes = glyphs.slice(1).map((g) => g.code);
  const os2 = new Writer()
    .u16(4).i16(ADVANCE).u16(400).u16(5).u16(0)
    .i16(650).i16(700).i16(0).i16(140).i16(650).i16(700).i16(0).i16(480).i16(50).i16(250)
    .i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0); // panose
  os2.u32(0b111).u32(0).u32(0).u32(0) // Basic Latin, Latin-1, Latin Extended-A
    .tag('NONE').u16(0x40) // fsSelection: regular
    .u16(Math.min(...codes)).u16(Math.min(0xffff, Math.max(...codes)))
    .i16(ASCENT).i16(-DESCENT).i16(0).u16(ASCENT).u16(DESCENT)
    .u32(0b11).u32(0) // code pages 1252 + 1250 (Central European)
    .i16(500).i16(700).u16(0).u16(32).u16(1);

  const hmtx = new Writer();
  glyphs.forEach((_, i) => hmtx.u16(ADVANCE).i16(bounds[i].xMin));

  // cmap format 4: one segment per character
  const mapped = glyphs.map((g, gid) => ({ code: g.code, gid })).filter((m) => m.code >= 0);
  const segCount = mapped.length + 1;
  const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(segCount)));
  const sub = new Writer()
    .u16(4).u16(16 + 8 * segCount).u16(0)
    .u16(segCount * 2).u16(searchRange).u16(Math.log2(searchRange / 2)).u16(segCount * 2 - searchRange);
  for (const m of mapped) sub.u16(m.code);
  sub.u16(0xffff).u16(0);
  for (const m of mapped) sub.u16(m.code);
  sub.u16(0xffff);
  for (const m of mapped) sub.u16((m.gid - m.code + 0x10000) & 0xffff);
  sub.u16(1);
  for (let i = 0; i < segCount; i++) sub.u16(0);
  const cmap = new Writer().u16(0).u16(1).u16(3).u16(1).u32(12).append(sub);

  // name
  const names: Array<[number, string]> = [
    [1, 'RetroGala'], [2, 'Regular'], [3, 'RetroGala-Regular-1.0'], [4, 'RetroGala'], [5, 'Version 1.0'],
    [6, 'RetroGala-Regular'],
  ];
  const strings = new Writer();
  const name = new Writer().u16(0).u16(names.length).u16(6 + 12 * names.length);
  for (const [id, text] of names) {
    const start = strings.length;
    for (const ch of text) strings.u16(ch.charCodeAt(0));
    name.u16(3).u16(1).u16(0x409).u16(id).u16(strings.length - start).u16(start);
  }
  name.append(strings);

  const post = new Writer().u32(0x00030000).u32(0).i16(-150).i16(PX).u32(1).u32(0).u32(0).u32(0).u32(0);

  // ---- assemble (tables sorted by tag)
  const tables: Array<[string, Writer]> = [
    ['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea],
    ['hmtx', hmtx], ['loca', locaW], ['maxp', maxp], ['name', name], ['post', post],
  ];
  const n = tables.length;
  const sr = 16 * Math.pow(2, Math.floor(Math.log2(n)));
  const font = new Writer().u32(0x00010000).u16(n).u16(sr).u16(Math.log2(sr / 16)).u16(n * 16 - sr);
  let offset = 12 + 16 * n;
  const body = new Writer();
  let headOffset = 0;
  for (const [tag, w] of tables) {
    const data = w.toArray();
    font.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    if (tag === 'head') headOffset = offset;
    body.append(data).pad4();
    offset = 12 + 16 * n + body.length;
  }
  font.append(body);
  const bytes = font.toArray();
  // head.checkSumAdjustment makes the whole font sum to 0xB1B0AFBA
  const adjust = (0xb1b0afba - checksum(bytes)) >>> 0;
  bytes[headOffset + 8] = adjust >>> 24;
  bytes[headOffset + 9] = (adjust >>> 16) & 0xff;
  bytes[headOffset + 10] = (adjust >>> 8) & 0xff;
  bytes[headOffset + 11] = adjust & 0xff;
  return new Uint8Array(bytes).buffer;
}

/**
 * Registers the font (normal and bold: a pixel font looks best without a
 * synthetic bold) and waits until it is ready. Falls back to the default
 * monospace font if the browser rejects it.
 */
export async function loadPixelFont(): Promise<boolean> {
  try {
    const data = buildPixelFont();
    for (const weight of ['normal', 'bold']) {
      const face = new FontFace(PIXEL_FONT_FAMILY, data, { weight });
      await face.load();
      document.fonts.add(face);
    }
    return true;
  } catch (err) {
    console.warn('Pixel font could not be loaded, using monospace', err);
    return false;
  }
}

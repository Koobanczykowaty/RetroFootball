import { describe, expect, it } from 'vitest';
import { buildPixelFont, glyphRects } from '../src/game/assets/PixelFont';
import { GLYPHS } from '../src/game/assets/PixelFontGlyphs';
import { STRINGS } from '../src/game/config/i18n';

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

describe('pixel font', () => {
  it('every glyph is 5 pixels wide', () => {
    for (const [ch, [, ...rows]] of Object.entries(GLYPHS)) {
      for (const row of rows) expect(row.length, `glyph ${ch}`).toBe(5);
    }
  });

  it('covers every character of the UI texts (both languages)', () => {
    const missing = new Set<string>();
    const scan = (v: unknown) => {
      if (typeof v === 'string') {
        for (const ch of v) if (ch !== ' ' && !GLYPHS[ch]) missing.add(ch);
      } else if (typeof v === 'function') {
        scan(String((v as (...a: unknown[]) => unknown)('X', 'X')));
      }
    };
    for (const lang of Object.values(STRINGS)) for (const v of Object.values(lang)) scan(v);
    expect([...missing]).toEqual([]);
  });

  it('turns pixel runs into rectangles', () => {
    expect(glyphRects([0, '#.##.'])).toEqual([[50, 0, 150, 100], [250, 0, 450, 100]]);
  });

  it('builds a structurally valid TrueType file', () => {
    const bytes = new Uint8Array(buildPixelFont());
    expect(u32(bytes, 0)).toBe(0x00010000);
    const numTables = (bytes[4] << 8) | bytes[5];
    expect(numTables).toBe(10);
    const tags: string[] = [];
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      tags.push(String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]));
      const offset = u32(bytes, o + 8);
      const length = u32(bytes, o + 12);
      expect(offset % 4).toBe(0);
      expect(offset + length).toBeLessThanOrEqual(bytes.length);
    }
    expect(tags).toEqual([...tags].sort());
    // Whole-font checksum must be the TrueType magic value
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) sum = (sum + u32(bytes, i)) >>> 0;
    expect(sum).toBe(0xb1b0afba);
  });
});

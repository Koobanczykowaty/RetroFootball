// Desktop build: the app icon (build/icon.png, 256x256) generated from
// public/favicon.svg, which is plain 16x16 pixel rectangles. Each pixel
// becomes a 16x16 block, so the icon stays crisp pixel art. No image
// files are kept in the repository; this runs before electron-builder.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SCALE = 16;
const SIZE = 16 * SCALE;
const svg = readFileSync('public/favicon.svg', 'utf8');
const rgba = Buffer.alloc(SIZE * SIZE * 4); // transparent

const attr = (tag, name) => Number(new RegExp(`${name}="([\\d.]+)"`).exec(tag)?.[1] ?? 0);
for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
  const fill = /fill="#([0-9a-fA-F]{6})"/.exec(tag)?.[1];
  if (!fill) continue;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(fill.slice(i, i + 2), 16));
  const x0 = attr(tag, 'x') * SCALE;
  const y0 = attr(tag, 'y') * SCALE;
  const w = attr(tag, 'width') * SCALE;
  const h = attr(tag, 'height') * SCALE;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * SIZE + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
}

// Minimal PNG encoder (8-bit RGBA, no filter)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`build/icon.png (${SIZE}x${SIZE})`);

// Draws the Lychee app icon (pink lychee + leaf) and writes src/shared/icon.png and icon.ico.
// Pure Node: supersampled shapes + zlib PNG encoder. Run: node tools/make-icon.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// SIZE env var lets the build make a 1024px master for macOS (.icns needs 512+)
const S = +(process.env.SIZE || 256), SS = S > 512 ? 2 : 4;
const K = S / 256; // all the shape numbers below are in 256-space
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BODY = hex('#ff6b8b'), BODY_D = hex('#d94467'), BUMP = hex('#c23a5b'), LEAF = hex('#6fcf72'), LEAF_D = hex('#3f9e4a');

const body = { x: 128, y: 146, r: 96 };
const bumps = [];
for (let a = 0; a < 70; a++) {
  // golden-angle scatter inside the body
  const t = a * 2.39996, rr = Math.sqrt((a + 0.5) / 70) * (body.r - 14);
  bumps.push({ x: body.x + Math.cos(t) * rr, y: body.y + Math.sin(t) * rr, r: 5.2 });
}

function inLeaf(x, y) {
  // rotated ellipse leaf sticking out of the top
  const cx = 158, cy = 50, a = -0.62, rx = 44, ry = 19;
  const dx = x - cx, dy = y - cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1 ? (v > 0 ? 2 : 1) : 0;
}

function shade(x, y) {
  const leaf = inLeaf(x, y);
  const dx = x - body.x, dy = y - body.y;
  const d = Math.hypot(dx, dy);
  if (d <= body.r) {
    // simple top-left lit sphere
    const l = Math.max(0, Math.min(1, 0.55 - (dx + dy) / (body.r * 3.2) + (1 - d / body.r) * 0.25));
    let c = BODY.map((v, i) => v * (0.45 + 0.55 * l) + BODY_D[i] * (0.55 - 0.55 * l));
    for (const b of bumps) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r) { c = c.map((v, i) => v * 0.55 + BUMP[i] * 0.45); break; }
    }
    const hl = Math.hypot(x - 92, y - 104);
    if (hl < 26) c = c.map((v) => v + (255 - v) * 0.32 * (1 - hl / 26));
    return [...c.map((v) => Math.max(0, Math.min(255, v))), 255];
  }
  if (leaf) return [...(leaf === 2 ? LEAF_D : LEAF), 255];
  return null;
}

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const c = shade((x + (sx + 0.5) / SS) / K, (y + (sy + 0.5) / SS) / K);
    if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
  }
  const o = (y * S + x) * 4;
  if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = (a / (SS * SS)) * 255; }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);

// ICO with the PNG embedded (Vista+ supports PNG entries)
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico[8] = 0; ico[9] = 0;
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);

if (S !== 256) {
  // big master for packaging (electron-builder turns it into .icns for macOS)
  const dir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.png'), png);
  console.log(`wrote build/icon.png (${S}px)`, png.length, 'bytes');
} else {
  const out = path.join(__dirname, '..', 'src', 'shared');
  fs.writeFileSync(path.join(out, 'icon.png'), png);
  fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([ico, png]));
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), Buffer.concat([ico, png]));
  console.log('wrote icon.png + icon.ico', png.length, 'bytes');
}

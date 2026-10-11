// Measures the goggle lens + printed iris in assets/pet.png (pure Node, zero deps).
// Writes assets/eye-debug.png with the detected circle for visual verification.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const input = path.join(root, 'assets', 'pet.png');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
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

const raw = fs.readFileSync(input);
const w = raw.readUInt32BE(16);
const h = raw.readUInt32BE(20);
console.log(`image: ${w}x${h} bd=${raw[24]} ct=${raw[25]}`);
let pos = 8;
const idat = [];
while (pos < raw.length) {
  const len = raw.readUInt32BE(pos);
  const type = raw.subarray(pos + 4, pos + 8).toString('ascii');
  if (type === 'IDAT') idat.push(raw.subarray(pos + 8, pos + 8 + len));
  if (type === 'IEND') break;
  pos += 12 + len;
}
const data = zlib.inflateSync(Buffer.concat(idat));
const ch = 4;
const stride = w * ch;
const px = Buffer.alloc(w * h * ch);
let p = 0;
for (let y = 0; y < h; y++) {
  const f = data[p++];
  const row = px.subarray(y * stride, (y + 1) * stride);
  const src = data.subarray(p, p + stride);
  p += stride;
  for (let x = 0; x < stride; x++) {
    const a = x >= ch ? row[x - ch] : 0;
    const b = x >= stride ? px[(y - 1) * stride + x] : 0;
    const c = x >= stride + ch ? px[(y - 1) * stride + x - ch] : 0;
    let v = src[x];
    if (f === 1) v = (v + a) & 255;
    else if (f === 2) v = (v + b) & 255;
    else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
    else if (f === 4) {
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    row[x] = v;
  }
}

const y0 = Math.floor(h * 0.05), y1 = Math.floor(h * 0.55);
// Glass: bright, low saturation.
const glass = new Uint8Array(w * h);
for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  if (px[i + 3] < 128) continue; // transparent bg
  const m = Math.min(px[i], px[i + 1], px[i + 2]);
  if (m >= 205) glass[y * w + x] = 1;
}
// Largest connected glass blob = lens.
const seen = new Uint8Array(w * h);
let best = [];
const stack = [];
for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
  const s = y * w + x;
  if (!glass[s] || seen[s]) continue;
  const comp = [];
  stack.push(s);
  while (stack.length) {
    const c = stack.pop();
    if (seen[c] || !glass[c]) continue;
    seen[c] = true;
    comp.push(c);
    const cx = c % w, cy = (c / w) | 0;
    if (cx > 0) stack.push(c - 1);
    if (cx < w - 1) stack.push(c + 1);
    if (cy > 0) stack.push(c - w);
    if (cy < h - 1) stack.push(c + w);
  }
  if (comp.length > best.length) best = comp;
}
let sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
for (const c of best) {
  const x = c % w, y = (c / w) | 0;
  sx += x; sy += y;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const lensCx = sx / best.length, lensCy = sy / best.length;
const lensR = Math.sqrt(best.length / Math.PI);
console.log(`glass pixels: ${best.length}`);
// Brown iris inside lens bbox.
let ix = 0, iy = 0, in_ = 0, iminX = w, imaxX = 0, iminY = h, imaxY = 0;
for (let y = Math.max(0, minY - 10); y <= Math.min(h - 1, maxY + 10); y++) {
  for (let x = Math.max(0, minX - 10); x <= Math.min(w - 1, maxX + 10); x++) {
    const i = (y * w + x) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (r > 100 && g > 45 && g < 150 && b < 105 && r > b + 35) {
      ix += x; iy += y; in_++;
      if (x < iminX) iminX = x; if (x > imaxX) imaxX = x;
      if (y < iminY) iminY = y; if (y > imaxY) imaxY = y;
    }
  }
}
const irisCx = ix / in_, irisCy = iy / in_;
const irisD = Math.max(imaxX - iminX, imaxY - iminY);
console.log(`LENS cx=${(100 * lensCx / w).toFixed(2)}% cy=${(100 * lensCy / h).toFixed(2)}% r=${(100 * lensR / w).toFixed(2)}%w bbox=[${minX},${minY},${maxX},${maxY}]`);
console.log(`IRIS cx=${(100 * irisCx / w).toFixed(2)}% cy=${(100 * irisCy / h).toFixed(2)}% d=${(100 * irisD / w).toFixed(2)}%w offset=(${(irisCx - lensCx).toFixed(1)}px,${(irisCy - lensCy).toFixed(1)}px)`);

// Debug visualization: red circle on lens, crosshair on iris.
const out = Buffer.from(px);
function dot(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  out[i] = 255; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255;
}
for (let a = 0; a < 360; a += 1) {
  const r = a * Math.PI / 180;
  dot(lensCx + lensR * Math.cos(r), lensCy + lensR * Math.sin(r));
}
for (let k = -12; k <= 12; k++) { dot(irisCx + k, irisCy); dot(irisCx, irisCy + k); }
const enc = Buffer.alloc(h * (w * 4 + 1));
for (let y = 0; y < h; y++) {
  enc[y * (w * 4 + 1)] = 0;
  out.copy(enc, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(path.join(root, 'assets', 'eye-debug.png'), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(enc)),
  chunk('IEND', Buffer.alloc(0))
]));
console.log('wrote assets/eye-debug.png');

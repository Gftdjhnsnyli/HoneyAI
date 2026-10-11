// Keys edge-connected near-white background to transparent (pure Node, zero deps).
// Usage: node scripts/key-pet.cjs [input] [output]
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const input = process.argv[2] || path.join(root, 'assets', 'stu.png');
const output = process.argv[3] || path.join(root, 'assets', 'pet.png');

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
const bd = raw[24];
const ct = raw[25];
console.log(`input: ${w}x${h} bitdepth=${bd} colortype=${ct}`);
if (bd !== 8 || (ct !== 2 && ct !== 6)) {
  console.error(' key-pet: only 8-bit RGB/RGBA supported');
  process.exit(2);
}
const ch = ct === 2 ? 3 : 4;
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

const at = (x, y) => (y * w + x) * ch;
const isWhite = (i, tol) => {
  const m = Math.min(px[i], px[i + 1], px[i + 2]);
  return m >= tol;
};
// Flood fill edge-connected near-white.
const seen = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) { stack.push([x, 0], [x, h - 1]); }
for (let y = 0; y < h; y++) { stack.push([0, y], [w - 1, y]); }
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
  seen[y * w + x] = 1;
  const i = at(x, y);
  if (!isWhite(i, 225)) continue;
  px[i + ch - 1] = ch === 4 ? 0 : px[i + ch - 1];
  if (ch === 3) { /* RGB has no alpha; handled at encode */ }
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
// Halo cleanup: non-filled pixels touching cleared areas that are still
// very bright get cleared too (eats the white fringe, keeps dark outline).
const cleared = new Uint8Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = at(x, y);
  const alphaZero = ch === 4 ? px[i + 3] === 0 : seen[y * w + x] && isWhite(i, 225);
  if (alphaZero) cleared[y * w + x] = 1;
}
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (cleared[y * w + x]) continue;
  const i = at(x, y);
  const touches = (x > 0 && cleared[y * w + x - 1]) || (x < w - 1 && cleared[y * w + x + 1]) ||
    (y > 0 && cleared[(y - 1) * w + x]) || (y < h - 1 && cleared[(y + 1) * w + x]);
  if (touches && isWhite(i, 200)) cleared[y * w + x] = 1;
}

// Encode RGBA.
const out = Buffer.alloc(h * (w * 4 + 1));
for (let y = 0; y < h; y++) {
  out[y * (w * 4 + 1)] = 0;
  for (let x = 0; x < w; x++) {
    const s = at(x, y);
    const d = y * (w * 4 + 1) + 1 + x * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2];
    out[d + 3] = cleared[y * w + x] ? 0 : ch === 4 ? px[s + 3] : 255;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(out)),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(output, png);
let clearCount = 0;
for (let i = 0; i < cleared.length; i++) clearCount += cleared[i];
console.log(`wrote ${output} (${png.length} bytes, ${(100 * clearCount / cleared.length).toFixed(1)}% transparent)`);

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// Small deterministic rasterizer. No remote assets or image dependencies.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}
function rounded(x, y, left, top, width, height, radius) {
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius));
  return (
    x >= left &&
    x <= left + width &&
    y >= top &&
    y <= top + height &&
    dx * dx + dy * dy <= radius * radius
  );
}
function color(x, y) {
  if (!rounded(x, y, 0, 0, 128, 128, 28)) return [0, 0, 0, 0];
  let rgb = [39, 92, 218, 255];
  if (rounded(x, y, 28, 23, 62, 78, 8)) rgb = [165, 193, 255, 255];
  if (rounded(x, y, 39, 31, 61, 78, 8)) rgb = [255, 255, 255, 255];
  if (rounded(x, y, 51, 49, 35, 5, 2)) rgb = [39, 92, 218, 255];
  if (rounded(x, y, 51, 63, 35, 5, 2)) rgb = [39, 92, 218, 255];
  if (rounded(x, y, 51, 77, 24, 5, 2)) rgb = [39, 92, 218, 255];
  return rgb;
}
mkdirSync('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) {
          const c = color(((x + (a + 0.5) / 4) * 128) / size, ((y + (b + 0.5) / 4) * 128) / size);
          c.forEach((v, i) => (sum[i] += v));
        }
      for (let c = 0; c < 4; c++)
        rows[y * (size * 4 + 1) + 1 + x * 4 + c] = Math.round(sum[c] / 16);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icon/${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.log('Generated extension icons.');

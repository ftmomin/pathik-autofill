// Generates icons/icon16.png, icon48.png, icon128.png using only Node stdlib
const fs   = require("fs");
const zlib = require("zlib");

function makePng(size, bg = [79, 142, 247], fg = [255, 255, 255]) {
  const pixels = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [...bg])
  );

  // Draw a simple letter "P" scaled to the icon
  const scale = Math.max(1, Math.floor(size / 16));
  const ox = Math.floor(size / 4);       // left margin
  const oy = Math.floor(size / 6);       // top margin
  const h  = Math.floor(size * 0.7);     // glyph height
  const sw = Math.floor(size * 0.22);    // stem width
  const bh = Math.floor(h   * 0.48);     // bowl height
  const bw = Math.floor(size * 0.35);    // bowl width

  const dot = (x, y) => {
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const rx = x + dx, ry = y + dy;
        if (rx >= 0 && rx < size && ry >= 0 && ry < size)
          pixels[ry][rx] = [...fg];
      }
  };

  // Stem
  for (let r = 0; r < h;  r++) for (let c = 0; c < sw; c++) dot(ox + c, oy + r);
  // Bowl
  for (let r = 0; r < bh; r++) {
    const span = r < scale ? bw - scale : bw;
    for (let c = sw; c < sw + span; c++) dot(ox + c, oy + r);
  }

  // Build raw image bytes (filter byte 0x00 per row)
  const rows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    rows[y * (1 + size * 3)] = 0; // None filter
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 3) + 1 + x * 3;
      rows[off]     = pixels[y][x][0];
      rows[off + 1] = pixels[y][x][1];
      rows[off + 2] = pixels[y][x][2];
    }
  }

  const compressed = zlib.deflateSync(rows, { level: 9 });

  function chunk(tag, data) {
    const tagBuf = Buffer.from(tag);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])) >>> 0);
    return Buffer.concat([len, tagBuf, data, crc]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // colour type RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG sig
    chunk("IHDR", ihdrData),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

fs.mkdirSync("icons", { recursive: true });
for (const size of [16, 48, 128]) {
  const path = `icons/icon${size}.png`;
  fs.writeFileSync(path, makePng(size));
  console.log(`Created ${path}  (${size}x${size})`);
}

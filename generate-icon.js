const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Generate a clean 256x256 RGBA PNG and wrap it in a standard Windows .ico container
const width = 256;
const height = 256;

// Build raw scanlines (filter byte 0 + RGBA pixels)
const rawData = Buffer.alloc(height * (1 + width * 4));

for (let y = 0; y < height; y++) {
  const rowStart = y * (1 + width * 4);
  rawData[rowStart] = 0; // No filter
  for (let x = 0; x < width; x++) {
    const px = rowStart + 1 + x * 4;
    // Rounded square mask (radius 54)
    const cx = Math.max(54, Math.min(width - 55, x));
    const cy = Math.max(54, Math.min(height - 55, y));
    const dist = Math.hypot(x - cx, y - cy);

    if (dist > 54) {
      rawData[px] = 0;
      rawData[px + 1] = 0;
      rawData[px + 2] = 0;
      rawData[px + 3] = 0;
      continue;
    }

    // Indigo -> Violet gradient background (#4f46e5 to #9333ea)
    const t = (x + y) / (width + height);
    let r = Math.round(79 * (1 - t) + 147 * t);
    let g = Math.round(70 * (1 - t) + 51 * t);
    let b = Math.round(229 * (1 - t) + 234 * t);

    // Draw white/amber floating note & pin glyph in center
    const inPad = x >= 60 && x <= 196 && y >= 68 && y <= 204;
    const inPinHead = Math.hypot(x - 128, y - 62) <= 22;
    const inLine1 = x >= 82 && x <= 174 && y >= 108 && y <= 120;
    const inLine2 = x >= 82 && x <= 174 && y >= 136 && y <= 148;
    const inLine3 = x >= 82 && x <= 144 && y >= 164 && y <= 176;

    if (inPinHead) {
      r = 251; g = 191; b = 36; // Amber pin head (#fbbf24)
    } else if (inLine1 || inLine2 || inLine3) {
      r = 99; g = 102; b = 241; // Indigo text lines
    } else if (inPad) {
      r = 248; g = 250; b = 252; // Crisp white note pad
    }

    rawData[px] = r;
    rawData[px + 1] = g;
    rawData[px + 2] = b;
    rawData[px + 3] = 255;
  }
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const idatData = zlib.deflateSync(rawData);
const pngBuf = Buffer.concat([
  pngSig,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', idatData),
  makeChunk('IEND', Buffer.alloc(0))
]);

// Wrap PNG inside a Windows .ico file
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // ICO type
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 0; // 256px width
icoEntry[1] = 0; // 256px height
icoEntry[2] = 0;
icoEntry[3] = 0;
icoEntry.writeUInt16LE(1, 4); // color planes
icoEntry.writeUInt16LE(32, 6); // bits per pixel
icoEntry.writeUInt32LE(pngBuf.length, 8);
icoEntry.writeUInt32LE(22, 12); // offset (6 + 16)

const icoBuf = Buffer.concat([icoHeader, icoEntry, pngBuf]);

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuf);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngBuf);
console.log('Generated assets/icon.ico and assets/icon.png');

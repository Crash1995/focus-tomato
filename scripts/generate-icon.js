const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 512;
const outputPath = path.join(__dirname, '..', 'assets', 'icon.png');

function createIconBuffer() {
  const rawRows = [];
  for (let y = 0; y < SIZE; y += 1) {
    const row = Buffer.alloc(1 + SIZE * 4);
    row[0] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const offset = 1 + x * 4;
      const color = getPixelColor(x, y);
      row[offset] = color[0];
      row[offset + 1] = color[1];
      row[offset + 2] = color[2];
      row[offset + 3] = color[3];
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const chunks = [
    createChunk('IHDR', createIHDR()),
    createChunk('IDAT', zlib.deflateSync(rawData)),
    createChunk('IEND', Buffer.alloc(0))
  ];

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks
  ]);
}

function getPixelColor(x, y) {
  const dx = x - 256;
  const dy = y - 256;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (!isInsideRoundedSquare(x, y, 96)) {
    return [0, 0, 0, 0];
  }

  if (isInsideLightning(x, y)) {
    return [0, 245, 212, 255];
  }

  if (Math.sqrt((x - 344) ** 2 + (y - 156) ** 2) <= 34) {
    return [123, 237, 159, 255];
  }

  if (distance >= 163 && distance <= 181) {
    return [0, 245, 212, 255];
  }

  if (distance < 163) {
    return [26, 26, 46, 255];
  }

  return [10, 10, 15, 255];
}

function isInsideRoundedSquare(x, y, radius) {
  const left = radius;
  const right = SIZE - radius;
  const top = radius;
  const bottom = SIZE - radius;
  const clampedX = Math.max(left, Math.min(x, right));
  const clampedY = Math.max(top, Math.min(y, bottom));
  return (x - clampedX) ** 2 + (y - clampedY) ** 2 <= radius ** 2;
}

function isInsideLightning(x, y) {
  return isInsidePolygon(x, y, [
    [286, 76],
    [150, 286],
    [236, 286],
    [212, 436],
    [362, 210],
    [272, 210]
  ]);
}

function isInsidePolygon(x, y, polygon) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      isInside = !isInside;
    }
  }
  return isInside;
}

function createIHDR() {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(SIZE, 0);
  buffer.writeUInt32BE(SIZE, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(calculateCRC(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function calculateCRC(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

fs.writeFileSync(outputPath, createIconBuffer());

export type SupportedImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const PNG_IHDR = "IHDR";
const PNG_IEND = "IEND";

let crcTable: Uint32Array | null = null;

function matches(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function getCrcTable() {
  if (crcTable) return crcTable;

  crcTable = new Uint32Array(256);

  for (let index = 0; index < crcTable.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    crcTable[index] = value >>> 0;
  }

  return crcTable;
}

function calculateCrc32(bytes: Uint8Array, start: number, end: number) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let index = start; index < end; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(bytes: Uint8Array) {
  if (bytes.length < 45 || !matches(bytes, 0, PNG_SIGNATURE)) {
    return false;
  }

  let offset: number = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let foundEnd = false;

  while (offset + 12 <= bytes.length) {
    const dataLength = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + dataLength;
    const nextOffset = crcOffset + 4;

    if (nextOffset > bytes.length) return false;

    const chunkType = readAscii(bytes, typeOffset, 4);

    if (chunkIndex === 0 && (chunkType !== PNG_IHDR || dataLength !== 13)) {
      return false;
    }

    const expectedCrc = readUint32(bytes, crcOffset);
    const actualCrc = calculateCrc32(bytes, typeOffset, crcOffset);

    if (actualCrc !== expectedCrc) return false;

    offset = nextOffset;
    chunkIndex += 1;

    if (chunkType === PNG_IEND) {
      if (dataLength !== 0 || offset !== bytes.length) return false;
      foundEnd = true;
      break;
    }
  }

  return foundEnd;
}

function validateJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return false;
  }

  for (let index = bytes.length - 2; index >= 2; index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) return true;
  }

  return false;
}

function validateWebp(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    readAscii(bytes, 0, 4) !== "RIFF" ||
    readAscii(bytes, 8, 4) !== "WEBP"
  ) {
    return false;
  }

  const declaredSize =
    (bytes[4] |
      (bytes[5] << 8) |
      (bytes[6] << 16) |
      (bytes[7] << 24)) >>>
    0;

  return declaredSize + 8 <= bytes.length;
}

export function detectValidImageMimeType(
  bytes: Uint8Array,
): SupportedImageMimeType | null {
  if (matches(bytes, 0, PNG_SIGNATURE)) {
    return validatePng(bytes) ? "image/png" : null;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return validateJpeg(bytes) ? "image/jpeg" : null;
  }

  if (readAscii(bytes, 0, Math.min(bytes.length, 4)) === "RIFF") {
    return validateWebp(bytes) ? "image/webp" : null;
  }

  return null;
}

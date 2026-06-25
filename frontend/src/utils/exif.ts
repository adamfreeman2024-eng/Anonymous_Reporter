export class ExifError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExifError";
  }
}

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_APP1 = 0xe1;
const JPEG_SOS = 0xda;

const JPEG_MIME_TYPES = new Set(["image/jpeg", "image/jpg"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Strips EXIF metadata from image files before encryption.
 * JPEG: removes all APP1 (0xFFE1) segments where EXIF data lives.
 * PNG: returned unchanged (metadata uses chunk structure, not JPEG APP1).
 */
export async function stripExifData(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new ExifError("Only image files are supported.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new ExifError(
      `Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)} MB limit.`,
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new ExifError("Failed to read image file.", { cause: err });
  }

  const bytes = new Uint8Array(buffer);

  if (isJpeg(bytes, file)) {
    const sanitized = stripJpegApp1Segments(bytes);
    return new File([toArrayBuffer(sanitized)], file.name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  return new File([buffer], file.name, {
    type: file.type,
    lastModified: Date.now(),
  });
}

function isJpeg(bytes: Uint8Array, file: File): boolean {
  const hasJpegMagic = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === JPEG_SOI;
  const hasJpegMime = JPEG_MIME_TYPES.has(file.type.toLowerCase());
  return hasJpegMagic || hasJpegMime;
}

/**
 * Walks JPEG marker segments and omits every APP1 (EXIF) block.
 * Entropy-coded scan data after SOS is copied verbatim.
 */
function stripJpegApp1Segments(data: Uint8Array): Uint8Array {
  if (data.length < 2 || data[0] !== 0xff || data[1] !== JPEG_SOI) {
    throw new ExifError("File is not a valid JPEG.");
  }

  const segments: Uint8Array[] = [data.subarray(0, 2)];
  let offset = 2;

  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      throw new ExifError(`Malformed JPEG: expected marker at byte ${offset}.`);
    }

    const markerStart = offset;
    offset++;

    if (offset >= data.length) {
      throw new ExifError("Unexpected end of JPEG before marker code.");
    }

    const marker = data[offset];
    offset++;

    if (marker === 0x00 || marker === 0xff) {
      throw new ExifError(`Invalid JPEG marker code 0x${marker.toString(16)}.`);
    }

    if (marker === JPEG_EOI) {
      segments.push(data.subarray(markerStart, offset));
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push(data.subarray(markerStart, offset));
      continue;
    }

    if (marker === JPEG_SOS) {
      segments.push(data.subarray(markerStart));
      break;
    }

    if (offset + 1 >= data.length) {
      throw new ExifError("Truncated JPEG segment length field.");
    }

    const segmentLength = (data[offset] << 8) | data[offset + 1];
    if (segmentLength < 2) {
      throw new ExifError("Invalid JPEG segment length.");
    }

    const segmentEnd = offset + segmentLength;
    if (segmentEnd > data.length) {
      throw new ExifError("JPEG segment extends beyond end of file.");
    }

    if (marker !== JPEG_APP1) {
      segments.push(data.subarray(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const output = new Uint8Array(totalLength);
  let writeOffset = 0;

  for (const segment of segments) {
    output.set(segment, writeOffset);
    writeOffset += segment.length;
  }

  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

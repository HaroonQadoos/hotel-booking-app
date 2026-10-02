// The browser's Content-Type for an upload is whatever the client claims, so
// the file's own first bytes decide what it is. Anything not on this list —
// SVG included, since it can carry script — is refused.
const SIGNATURES: Array<{ ext: string; matches: (b: Buffer) => boolean }> = [
  {
    ext: 'jpg',
    matches: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    matches: (b) =>
      b.length > 8 &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'gif',
    matches: (b) =>
      b.length > 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6)),
  },
  {
    ext: 'webp',
    matches: (b) =>
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    // ISO-BMFF with an AVIF brand: "....ftypavif" or "....ftypavis".
    ext: 'avif',
    matches: (b) =>
      b.length > 12 &&
      b.toString('ascii', 4, 8) === 'ftyp' &&
      /^avi[fs]$/.test(b.toString('ascii', 8, 12)),
  },
];

// The extension to store the file under, or null if it is not an image we
// accept. Phones' HEIC photos are not here: browsers other than Safari cannot
// display them, so the dashboard asks for JPEG instead.
export function detectImageType(buffer: Buffer): string | null {
  return SIGNATURES.find((s) => s.matches(buffer))?.ext ?? null;
}

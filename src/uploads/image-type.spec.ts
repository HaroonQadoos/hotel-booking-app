import { detectImageType } from './image-type';

const bytes = (...values: number[]) =>
  Buffer.concat([Buffer.from(values), Buffer.alloc(16)]);
const ascii = (text: string) =>
  Buffer.concat([Buffer.from(text, 'ascii'), Buffer.alloc(16)]);

describe('detectImageType', () => {
  it.each([
    ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ['gif', ascii('GIF89a')],
    ['webp', ascii('RIFF\0\0\0\0WEBPVP8 ')],
    ['avif', ascii('\0\0\0\x1cftypavif')],
  ])('recognises %s from its first bytes', (ext, buffer) => {
    expect(detectImageType(buffer)).toBe(ext);
  });

  it.each([
    [
      'an SVG',
      ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    ],
    ['HTML', ascii('<!doctype html><script>alert(1)</script>')],
    ['an empty file', Buffer.alloc(0)],
  ])('refuses %s', (_label, buffer) => {
    expect(detectImageType(buffer)).toBeNull();
  });
});

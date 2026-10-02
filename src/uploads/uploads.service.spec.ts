import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { UploadsService } from './uploads.service';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const file = (originalname: string, buffer: Buffer) =>
  ({ originalname, buffer }) as Express.Multer.File;

function service(env: Record<string, string> = {}) {
  const config = { get: (key: string) => env[key] } as ConfigService;
  return new UploadsService(config);
}

describe('UploadsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores each image under a random name and returns its public URL', async () => {
    const urls = await service().saveImages([
      file('IMG_0001.jpeg', JPEG),
      file('IMG_0002.jpeg', JPEG),
    ]);
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url).toMatch(
        /^http:\/\/localhost:3000\/uploads\/[0-9a-f-]{36}\.jpg$/,
      );
    }
    expect(urls[0]).not.toBe(urls[1]);
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('links to PUBLIC_API_URL when it is set', async () => {
    const [url] = await service({
      PUBLIC_API_URL: 'https://api.example.com/',
    }).saveImages([file('a.jpg', JPEG)]);
    expect(url).toMatch(/^https:\/\/api\.example\.com\/uploads\//);
  });

  it('saves nothing when any file in the batch is not an image', async () => {
    await expect(
      service().saveImages([
        file('ok.jpg', JPEG),
        file('evil.jpg', Buffer.from('<svg onload=alert(1)>')),
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects an empty upload', async () => {
    await expect(service().saveImages([])).rejects.toThrow(BadRequestException);
  });
});

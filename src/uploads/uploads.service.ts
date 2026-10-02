import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectImageType } from './image-type';

// Uploaded photos live on the API's own disk and are served from /uploads.
// Fine for one server; behind several, or on a host with an ephemeral disk,
// this is the one class to swap for an object store (S3, Cloudinary).
export const UPLOAD_DIR = join(process.cwd(), 'uploads');
export const UPLOAD_ROUTE = '/uploads';

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  // Every file is checked before any is written, so a batch with one bad
  // file saves nothing rather than leaving the rest orphaned.
  async saveImages(files: Express.Multer.File[]): Promise<string[]> {
    if (!files?.length) {
      throw new BadRequestException('Choose at least one image to upload');
    }
    const typed = files.map((file) => {
      const ext = detectImageType(file.buffer);
      if (!ext) {
        throw new BadRequestException(
          `${file.originalname} is not a JPEG, PNG, WebP, AVIF or GIF image`,
        );
      }
      return { file, ext };
    });

    await mkdir(UPLOAD_DIR, { recursive: true });
    // The stored name is random, never the client's: no path tricks, no
    // collisions, and nothing personal from a phone's file name leaks out.
    return Promise.all(
      typed.map(async ({ file, ext }) => {
        const name = `${randomUUID()}.${ext}`;
        await writeFile(join(UPLOAD_DIR, name), file.buffer);
        return `${this.publicBase()}${UPLOAD_ROUTE}/${name}`;
      }),
    );
  }

  // Rooms store absolute image URLs (the guest site loads them directly), so
  // the API needs to know the address the world reaches it at.
  private publicBase(): string {
    const configured = this.config.get<string>('PUBLIC_API_URL');
    if (configured) return configured.replace(/\/+$/, '');
    return `http://localhost:${this.config.get<string>('PORT') ?? 3000}`;
  }
}

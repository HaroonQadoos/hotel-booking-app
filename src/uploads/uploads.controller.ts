import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadsService } from './uploads.service';

// Per request. A room or venue holds at most 20 images, so one batch can
// never need more than that.
export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // Admin-only: staff add photos to rooms and venues. Files are held in
  // memory (bounded by the limits) so they can be sniffed before touching
  // disk. The guards run before the interceptor, so an anonymous request is
  // rejected without its body ever being buffered.
  @Post('images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    return { urls: await this.uploadsService.saveImages(files) };
  }
}

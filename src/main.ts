import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ensureUsableDnsServers } from './ensure-dns';
import { UPLOAD_DIR, UPLOAD_ROUTE } from './uploads/uploads.service';

async function bootstrap() {
  ensureUsableDnsServers();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Populates req.cookies, which JwtStrategy reads the session token from.
  // Without this the cookie arrives as a raw header the strategy never sees.
  app.use(cookieParser());
  // Without this the class-validator decorators on the DTOs never run.
  // whitelist strips unknown fields, so a client cannot smuggle `role: 'admin'`
  // into a registration payload.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Room and venue photos uploaded from the dashboard. Public, like the rooms
  // themselves. Names are random UUIDs that never change, so they can be
  // cached for good; nosniff stops a browser second-guessing the image type.
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: UPLOAD_ROUTE,
    maxAge: '365d',
    immutable: true,
    setHeaders: (res: Response) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

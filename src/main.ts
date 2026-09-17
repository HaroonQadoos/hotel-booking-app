import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ensureUsableDnsServers } from './ensure-dns';

async function bootstrap() {
  ensureUsableDnsServers();
  const app = await NestFactory.create(AppModule);
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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

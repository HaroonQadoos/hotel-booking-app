import * as dns from 'dns';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// On this machine Node's bundled c-ares resolver fails to read the Windows
// adapter DNS config and falls back to 127.0.0.1, where nothing is listening.
// That breaks dns.resolveSrv(), which the driver needs for mongodb+srv:// URIs
// (plain socket connects are unaffected — they use the OS resolver).
// Only override when the resolver is actually in that broken state.
function ensureUsableDnsServers() {
  const servers = dns.getServers();
  const usable = servers.filter((s) => s !== '127.0.0.1' && s !== '::1');
  if (usable.length === 0) {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  }
}

async function bootstrap() {
  ensureUsableDnsServers();
  const app = await NestFactory.create(AppModule);
  // Without this the class-validator decorators on the DTOs never run.
  // whitelist strips unknown fields, so a client cannot smuggle `role: 'admin'`
  // into a registration payload.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

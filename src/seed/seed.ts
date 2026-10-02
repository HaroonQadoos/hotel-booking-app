import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { ensureUsableDnsServers } from '../ensure-dns';
import { Room } from '../rooms/schemas/room.schema';
import { Venue } from '../venues/schemas/venue.schema';
import { ROOM_SEED } from './rooms.seed';
import { VENUE_SEED } from './venues.seed';

// Idempotent: upserts by name, so running it twice leaves one row per room
// type (and venue) with the latest seed values. Safe on a database that already has data.
async function seed() {
  ensureUsableDnsServers();
  const logger = new Logger('Seed');
  // An application context boots the modules (and the Mongo connection)
  // without listening on a port. Levels are narrowed so module start-up
  // chatter doesn't drown the one line that matters; 'log' stays on for it.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const roomModel = app.get<Model<Room>>(getModelToken(Room.name));
    for (const room of ROOM_SEED) {
      await roomModel.updateOne(
        { name: room.name },
        { $set: room },
        { upsert: true, runValidators: true },
      );
    }
    logger.log(`Seeded ${ROOM_SEED.length} room types`);

    const venueModel = app.get<Model<Venue>>(getModelToken(Venue.name));
    for (const venue of VENUE_SEED) {
      await venueModel.updateOne(
        { name: venue.name },
        { $set: venue },
        { upsert: true, runValidators: true },
      );
    }
    logger.log(`Seeded ${VENUE_SEED.length} venues`);
  } finally {
    await app.close();
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

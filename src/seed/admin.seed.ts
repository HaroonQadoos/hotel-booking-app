import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { ensureUsableDnsServers } from '../ensure-dns';
import { User } from '../users/schemas/user.schema';

// Creates the admin account, or promotes it if the email is already
// registered. Signup can never grant `admin` (the whitelist strips `role`),
// so this script is the way in. An existing user's password is left alone —
// promoting someone should not silently change how they log in — unless
// ADMIN_RESET_PASSWORD=true asks for it explicitly.
async function seedAdmin() {
  ensureUsableDnsServers();
  const logger = new Logger('SeedAdmin');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Read after boot: ConfigModule is what loads .env into process.env.
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME?.trim() || 'Admin';
    const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';
    if (!email) {
      throw new Error('Set ADMIN_EMAIL (and ADMIN_PASSWORD for a new account)');
    }

    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const existing = await userModel.findOne({ email });

    if (existing) {
      existing.role = 'admin';
      existing.isEmailVerified = true;
      if (resetPassword) {
        if (!password) {
          throw new Error('ADMIN_RESET_PASSWORD=true needs ADMIN_PASSWORD');
        }
        // Plaintext on purpose: the pre-save hook sees it modified and hashes.
        existing.password = password;
      }
      await existing.save();
      logger.log(
        `Promoted ${email} to admin` +
          (resetPassword ? ' and reset the password' : ''),
      );
      return;
    }

    if (!password) {
      throw new Error(
        `No user ${email} yet — set ADMIN_PASSWORD to create one`,
      );
    }
    // save() rather than updateOne so the pre-save hook hashes the password.
    await new userModel({
      name,
      email,
      password,
      role: 'admin',
      isEmailVerified: true,
    }).save();
    logger.log(`Created admin ${email}`);
  } finally {
    await app.close();
  }
}

seedAdmin().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

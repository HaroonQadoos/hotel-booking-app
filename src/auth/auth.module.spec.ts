import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/schemas/user.schema';

// A missing provider is a boot-time failure, not a compile error — the unit
// tests above hand-build their dependencies, so none of them would catch one.
// This builds the real module graph instead, with only the database stubbed.
describe('AuthModule', () => {
  it('resolves every dependency its providers declare', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ AUTH_SECRET: 'test-secret' })],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);

    await moduleRef.close();
  });
});

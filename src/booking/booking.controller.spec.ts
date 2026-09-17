import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('BookingController', () => {
  let controller: BookingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [{ provide: BookingService, useValue: {} }],
    }).compile();

    controller = module.get<BookingController>(BookingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const metadataOf = <T>(key: string, method?: keyof BookingController) => {
    const target = method
      ? (Object.getOwnPropertyDescriptor(BookingController.prototype, method)
          ?.value as object)
      : BookingController;
    return Reflect.getMetadata(key, target) as T | undefined;
  };

  // Bookings belong to someone, so the whole controller sits behind the JWT
  // guard — no route can be added later and forgotten.
  it('requires a signed-in user on every route', () => {
    expect(metadataOf<unknown[]>(GUARDS_METADATA)).toHaveLength(1);
  });

  it('restricts the full listing to admins', () => {
    expect(metadataOf<string[]>(ROLES_KEY, 'findAll')).toEqual(['admin']);
    expect(metadataOf<unknown[]>(GUARDS_METADATA, 'findAll')).toHaveLength(1);
  });

  it.each(['create', 'findMine', 'findOne', 'cancel'] as const)(
    'leaves %s open to any signed-in user',
    (name) => {
      expect(metadataOf(ROLES_KEY, name)).toBeUndefined();
    },
  );
});

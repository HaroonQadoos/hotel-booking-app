import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { VenueBookingsController } from './venue-bookings.controller';
import { VenueBookingsService } from './venue-bookings.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('VenueBookingsController', () => {
  let controller: VenueBookingsController;
  let service: { findForUser: jest.Mock };

  beforeEach(async () => {
    service = { findForUser: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VenueBookingsController],
      providers: [{ provide: VenueBookingsService, useValue: service }],
    }).compile();

    controller = module.get<VenueBookingsController>(VenueBookingsController);
  });

  const metadataOf = <T>(
    key: string,
    method?: keyof VenueBookingsController,
  ) => {
    const target = method
      ? (Object.getOwnPropertyDescriptor(
          VenueBookingsController.prototype,
          method,
        )?.value as object)
      : VenueBookingsController;
    return Reflect.getMetadata(key, target) as T | undefined;
  };

  it('requires a signed-in user on every route', () => {
    expect(metadataOf<unknown[]>(GUARDS_METADATA)).toHaveLength(1);
  });

  it.each(['findAll', 'confirm', 'countPending'] as const)(
    'restricts %s to admins',
    (name) => {
      expect(metadataOf<string[]>(ROLES_KEY, name)).toEqual(['admin']);
      expect(metadataOf<unknown[]>(GUARDS_METADATA, name)).toHaveLength(1);
    },
  );

  it.each(['create', 'findMine', 'findOne', 'cancel'] as const)(
    'leaves %s open to any signed-in user',
    (name) => {
      expect(metadataOf(ROLES_KEY, name)).toBeUndefined();
    },
  );

  it('shapes bookings through VenueBookingResponseDto', async () => {
    const venueId = new Types.ObjectId();
    service.findForUser.mockResolvedValue([
      {
        _id: 'b1',
        user: 'u1',
        venue: { _id: venueId, name: 'Rooftop Swimming Pool', type: 'pool' },
        date: new Date('2026-11-15T00:00:00Z'),
        startHour: 14,
        endHour: 17,
        guests: 10,
        totalPrice: 360,
        status: 'pending',
        createdAt: new Date(),
      },
    ]);

    const [booking] = await controller.findMine({
      userId: 'u1',
      email: 'g@example.com',
      role: 'user',
    });

    expect(booking).toMatchObject({
      id: 'b1',
      venue: {
        id: String(venueId),
        name: 'Rooftop Swimming Pool',
        type: 'pool',
      },
      date: '2026-11-15',
      hours: 3,
      notes: null,
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { VenueBookingsService } from './venue-bookings.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('VenuesController', () => {
  let controller: VenuesController;
  let service: { findAvailable: jest.Mock };
  let bookings: { findDayAvailability: jest.Mock };

  beforeEach(async () => {
    service = { findAvailable: jest.fn() };
    bookings = { findDayAvailability: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VenuesController],
      providers: [
        { provide: VenuesService, useValue: service },
        { provide: VenueBookingsService, useValue: bookings },
      ],
    }).compile();

    controller = module.get<VenuesController>(VenuesController);
  });

  const metadataOf = <T>(key: string, method: keyof VenuesController) => {
    const fn = Object.getOwnPropertyDescriptor(
      VenuesController.prototype,
      method,
    )?.value as object;
    return Reflect.getMetadata(key, fn) as T | undefined;
  };

  // Guests browse and check free hours before they sign up.
  it.each(['findAvailable', 'findOne', 'availability'] as const)(
    'leaves %s public',
    (name) => {
      expect(metadataOf(GUARDS_METADATA, name)).toBeUndefined();
    },
  );

  it.each(['findAll', 'create', 'update', 'remove'] as const)(
    'restricts %s to admins',
    (name) => {
      expect(metadataOf<unknown[]>(GUARDS_METADATA, name)).toHaveLength(2);
      expect(metadataOf<string[]>(ROLES_KEY, name)).toEqual(['admin']);
    },
  );

  it('shapes venues through VenueResponseDto', async () => {
    service.findAvailable.mockResolvedValue([
      {
        _id: 'v1',
        name: 'Rooftop Swimming Pool',
        pricePerHour: 120,
        discountPercent: 25,
        discountStartsAt: null,
        discountEndsAt: null,
        amenities: [],
        images: [],
      },
    ]);

    const [venue] = await controller.findAvailable({});

    expect(venue).toMatchObject({
      id: 'v1',
      name: 'Rooftop Swimming Pool',
      discountActive: true,
      effectivePricePerHour: 90,
    });
    expect(venue).not.toHaveProperty('_id');
  });

  it('passes the date through to the day availability', async () => {
    bookings.findDayAvailability.mockResolvedValue({ booked: [] });

    await controller.availability('v1', { date: '2026-11-15' });

    expect(bookings.findDayAvailability).toHaveBeenCalledWith(
      'v1',
      '2026-11-15',
    );
  });
});

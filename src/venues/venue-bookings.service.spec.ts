import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { VenueBookingsService } from './venue-bookings.service';
import { VenuesService } from './venues.service';
import { Venue } from './schemas/venue.schema';
import { VenueBooking } from './schemas/venue-booking.schema';
import type { AuthUser } from '../auth/types/auth-user';

const VENUE_ID = new Types.ObjectId();
const USER_ID = new Types.ObjectId().toString();

const guest: AuthUser = {
  userId: USER_ID,
  email: 'g@example.com',
  role: 'user',
};
const admin: AuthUser = {
  userId: 'admin-id',
  email: 'a@example.com',
  role: 'admin',
};

// A fixed "now" so the past and 180-days-ahead rules are deterministic.
const NOW = new Date('2026-10-03T12:00:00Z');
const DATE = '2026-11-15';
const DAY = new Date(`${DATE}T00:00:00Z`);

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    _id: VENUE_ID,
    name: 'Celebration Birthday Hall',
    type: 'hall',
    pricePerHour: 90,
    capacity: 60,
    openingHour: 10,
    closingHour: 23,
    minHours: 3,
    maxHours: 8,
    isActive: true,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    ...overrides,
  } as unknown as Venue;
}

const dto = {
  venue: VENUE_ID.toString(),
  date: DATE,
  startHour: 14,
  endHour: 18,
  guests: 25,
  notes: 'Birthday for 8-year-old, need cake table',
};

interface FakeBooking {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: string;
  date: Date;
  populate: jest.Mock;
  save: jest.Mock;
}

function makeBooking(overrides: Partial<FakeBooking> = {}): FakeBooking {
  const doc: FakeBooking = {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(USER_ID),
    status: 'pending',
    date: DAY,
    populate: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  doc.populate.mockResolvedValue(doc);
  return doc;
}

function makeQuery(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const populate = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ populate, exec });
  return { sort, populate, exec };
}

describe('VenueBookingsService', () => {
  let service: VenueBookingsService;
  let model: {
    countDocuments: jest.Mock;
    create: jest.Mock;
    deleteOne: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
  };
  let venues: { findOne: jest.Mock };

  beforeEach(async () => {
    model = {
      countDocuments: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      find: jest.fn(),
      findById: jest.fn(),
    };
    venues = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenueBookingsService,
        { provide: getModelToken(VenueBooking.name), useValue: model },
        { provide: VenuesService, useValue: venues },
      ],
    }).compile();

    service = module.get<VenueBookingsService>(VenueBookingsService);
  });

  describe('create', () => {
    beforeEach(() => {
      venues.findOne.mockResolvedValue(makeVenue());
      // Before the insert: nothing held. After: only this booking.
      model.countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      model.create.mockImplementation((data: object) =>
        Promise.resolve(makeBooking(data as Partial<FakeBooking>)),
      );
    });

    it('creates a pending booking priced at hours × rate', async () => {
      await service.create(USER_ID, dto, NOW);

      expect(model.create).toHaveBeenCalledWith({
        user: new Types.ObjectId(USER_ID),
        venue: VENUE_ID,
        date: DAY,
        startHour: 14,
        endHour: 18,
        guests: 25,
        notes: 'Birthday for 8-year-old, need cake table',
        totalPrice: 360, // 4 hours × 90
        status: 'pending',
      });
    });

    it('applies a discount when the date is inside the window', async () => {
      venues.findOne.mockResolvedValue(
        makeVenue({ discountPercent: 10, discountStartsAt: DATE }),
      );

      await service.create(USER_ID, dto, NOW);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalPrice: 324 }), // 4 × 81
      );
    });

    it('ignores a discount whose window has ended by the date', async () => {
      venues.findOne.mockResolvedValue(
        makeVenue({ discountPercent: 10, discountEndsAt: '2026-11-14' }),
      );

      await service.create(USER_ID, dto, NOW);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalPrice: 360 }),
      );
    });

    // The overlap query is the heart of the module; pin its shape.
    it('counts only holding bookings that overlap the slot', async () => {
      await service.create(USER_ID, dto, NOW);

      expect(model.countDocuments).toHaveBeenCalledWith({
        venue: VENUE_ID,
        status: { $in: ['pending', 'confirmed'] },
        date: DAY,
        startHour: { $lt: 18 },
        endHour: { $gt: 14 },
      });
    });

    it('returns the booking with its venue populated', async () => {
      await service.create(USER_ID, dto, NOW);

      const created = (await model.create.mock.results[0].value) as FakeBooking;
      expect(created.populate).toHaveBeenCalledWith('venue', 'name type');
    });

    it('refuses a slot that overlaps a holding booking', async () => {
      model.countDocuments.mockReset().mockResolvedValue(1);

      await expect(service.create(USER_ID, dto, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    it('withdraws its own booking if another slipped in alongside it', async () => {
      model.countDocuments
        .mockReset()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);

      await expect(service.create(USER_ID, dto, NOW)).rejects.toThrow(
        /just taken/,
      );
      const created = (await model.create.mock.results[0].value) as FakeBooking;
      expect(model.deleteOne).toHaveBeenCalledWith({ _id: created._id });
    });

    // The hall opens 10:00–23:00.
    it.each([
      [9, 13],
      [20, 24],
    ])(
      'rejects %d–%d, outside the opening hours',
      async (startHour, endHour) => {
        await expect(
          service.create(USER_ID, { ...dto, startHour, endHour }, NOW),
        ).rejects.toThrow('open from 10:00 to 23:00');
        expect(model.countDocuments).not.toHaveBeenCalled();
      },
    );

    it('rejects fewer hours than minHours', async () => {
      await expect(
        service.create(USER_ID, { ...dto, startHour: 14, endHour: 16 }, NOW),
      ).rejects.toThrow('booked for 3 to 8 hours');
    });

    it('rejects more hours than maxHours', async () => {
      await expect(
        service.create(USER_ID, { ...dto, startHour: 10, endHour: 19 }, NOW),
      ).rejects.toThrow('booked for 3 to 8 hours');
    });

    it('rejects an end hour that is not after the start', async () => {
      await expect(
        service.create(USER_ID, { ...dto, startHour: 15, endHour: 15 }, NOW),
      ).rejects.toThrow('endHour must be after startHour');
      expect(venues.findOne).not.toHaveBeenCalled();
    });

    it('rejects more guests than the venue holds', async () => {
      await expect(
        service.create(USER_ID, { ...dto, guests: 61 }, NOW),
      ).rejects.toThrow('holds at most 60 guests');
      expect(model.countDocuments).not.toHaveBeenCalled();
    });

    it('rejects a date in the past', async () => {
      await expect(
        service.create(USER_ID, { ...dto, date: '2026-10-02' }, NOW),
      ).rejects.toThrow('cannot be in the past');
      expect(venues.findOne).not.toHaveBeenCalled();
    });

    it('accepts today', async () => {
      await expect(
        service.create(USER_ID, { ...dto, date: '2026-10-03' }, NOW),
      ).resolves.toBeDefined();
    });

    // 2026-10-03 + 180 days = 2027-04-01.
    it('allows exactly 180 days ahead and no further', async () => {
      await expect(
        service.create(USER_ID, { ...dto, date: '2027-04-01' }, NOW),
      ).resolves.toBeDefined();
      await expect(
        service.create(USER_ID, { ...dto, date: '2027-04-02' }, NOW),
      ).rejects.toThrow('at most 180 days ahead');
    });

    it('rejects a date that is not real', async () => {
      await expect(
        service.create(USER_ID, { ...dto, date: '2026-11-31' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a venue that has been withdrawn', async () => {
      venues.findOne.mockResolvedValue(makeVenue({ isActive: false }));

      await expect(service.create(USER_ID, dto, NOW)).rejects.toThrow(
        'no longer offered',
      );
    });

    it('propagates an unknown venue as 404', async () => {
      venues.findOne.mockRejectedValue(
        new NotFoundException('Venue not found'),
      );

      await expect(service.create(USER_ID, dto, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findDayAvailability', () => {
    it('returns opening hours and the held slots, without guest details', async () => {
      venues.findOne.mockResolvedValue(makeVenue());
      const query = makeQuery([
        { startHour: 10, endHour: 13, user: 'secret' },
        { startHour: 18, endHour: 22, user: 'secret' },
      ]);
      model.find.mockReturnValue(query);

      const result = await service.findDayAvailability(String(VENUE_ID), DATE);

      expect(model.find).toHaveBeenCalledWith(
        {
          venue: VENUE_ID,
          status: { $in: ['pending', 'confirmed'] },
          date: DAY,
        },
        'startHour endHour',
      );
      expect(query.sort).toHaveBeenCalledWith({ startHour: 1 });
      expect(result).toEqual({
        date: DATE,
        openingHour: 10,
        closingHour: 23,
        booked: [
          { startHour: 10, endHour: 13 },
          { startHour: 18, endHour: 22 },
        ],
      });
    });

    it('rejects a malformed date before loading the venue', async () => {
      await expect(
        service.findDayAvailability(String(VENUE_ID), '15/11/2026'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(venues.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('maps status and a [from, to) date window', async () => {
      model.find.mockReturnValue(makeQuery([]));

      await service.findAll({
        status: 'pending',
        from: '2026-11-01',
        to: '2026-12-01',
      });

      expect(model.find).toHaveBeenCalledWith({
        status: 'pending',
        date: {
          $gte: new Date('2026-11-01T00:00:00Z'),
          $lt: new Date('2026-12-01T00:00:00Z'),
        },
      });
    });

    it('passes no filter when nothing is asked', async () => {
      model.find.mockReturnValue(makeQuery([]));

      await service.findAll({});

      expect(model.find).toHaveBeenCalledWith({});
    });
  });

  describe('findOne / cancel / confirm', () => {
    function stubFind(booking: FakeBooking | null) {
      const exec = jest.fn().mockResolvedValue(booking);
      model.findById.mockReturnValue({ populate: () => ({ exec }) });
    }

    it("refuses another guest's booking", async () => {
      stubFind(makeBooking({ user: new Types.ObjectId() }));

      await expect(service.findOne('id', guest)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws 404 for an unknown id', async () => {
      stubFind(null);

      await expect(service.findOne('id', guest)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets the owner cancel a future booking', async () => {
      const booking = makeBooking({
        date: new Date(`${new Date().getUTCFullYear() + 1}-01-01T00:00:00Z`),
      });
      stubFind(booking);

      await service.cancel('id', guest);

      expect(booking.status).toBe('cancelled');
      expect(booking.save).toHaveBeenCalledTimes(1);
    });

    it('stops a guest cancelling once the date has passed', async () => {
      stubFind(makeBooking({ date: new Date('2020-01-01T00:00:00Z') }));

      await expect(service.cancel('id', guest)).rejects.toThrow(
        'cannot be cancelled after its date',
      );
    });

    it('lets an admin cancel a past booking', async () => {
      const booking = makeBooking({ date: new Date('2020-01-01T00:00:00Z') });
      stubFind(booking);

      await service.cancel('id', admin);

      expect(booking.status).toBe('cancelled');
    });

    it('rejects cancelling twice', async () => {
      stubFind(makeBooking({ status: 'cancelled' }));

      await expect(service.cancel('id', guest)).rejects.toThrow(
        'already cancelled',
      );
    });

    it('confirms a pending booking', async () => {
      const booking = makeBooking();
      stubFind(booking);

      await service.confirm('id', admin);

      expect(booking.status).toBe('confirmed');
    });

    it.each(['confirmed', 'cancelled'])(
      'rejects accepting a %s booking',
      async (status) => {
        const booking = makeBooking({ status });
        stubFind(booking);

        await expect(service.confirm('id', admin)).rejects.toThrow(
          'Only a pending booking can be accepted',
        );
        expect(booking.save).not.toHaveBeenCalled();
      },
    );
  });

  describe('countPending', () => {
    it('counts pending bookings only', async () => {
      model.countDocuments.mockResolvedValue(2);

      await expect(service.countPending()).resolves.toBe(2);
      expect(model.countDocuments).toHaveBeenCalledWith({ status: 'pending' });
    });
  });
});

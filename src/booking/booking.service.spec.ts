import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingService } from './booking.service';
import { Booking } from './schemas/booking.schema';
import { RoomsService } from '../rooms/rooms.service';
import { Room } from '../rooms/schemas/room.schema';
import type { AuthUser } from '../auth/types/auth-user';

const ROOM_ID = new Types.ObjectId();
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

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    _id: ROOM_ID,
    name: 'Deluxe Double',
    type: 'double',
    pricePerNight: 100,
    capacity: 2,
    totalUnits: 3,
    isActive: true,
    ...overrides,
  } as unknown as Room;
}

// Dates a year out so "not in the past" never trips as the calendar moves.
const year = new Date().getUTCFullYear() + 1;
const IN = `${year}-06-10`;
const OUT = `${year}-06-13`;
const dto = { room: ROOM_ID.toString(), checkIn: IN, checkOut: OUT, guests: 2 };

interface FakeBooking {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: string;
  checkIn: Date;
  populate: jest.Mock;
  save: jest.Mock;
}

function makeBooking(overrides: Partial<FakeBooking> = {}): FakeBooking {
  const doc: FakeBooking = {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(USER_ID),
    status: 'pending',
    checkIn: new Date(`${IN}T00:00:00Z`),
    populate: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  doc.populate.mockResolvedValue(doc);
  return doc;
}

// The chain findX(…).sort(…).populate(…).exec() / findById(…).populate(…).exec()
function makeQuery(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const populate = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ populate });
  return { sort, populate, exec };
}

describe('BookingService', () => {
  let service: BookingService;
  let model: {
    countDocuments: jest.Mock;
    create: jest.Mock;
    deleteOne: jest.Mock;
    aggregate: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
  };
  let rooms: { findOne: jest.Mock; findAvailable: jest.Mock };

  beforeEach(async () => {
    model = {
      countDocuments: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      aggregate: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
    };
    rooms = { findOne: jest.fn(), findAvailable: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: getModelToken(Booking.name), useValue: model },
        { provide: RoomsService, useValue: rooms },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  describe('create', () => {
    beforeEach(() => {
      rooms.findOne.mockResolvedValue(makeRoom());
      // Before the insert: 1 held. After: 2. Both under totalUnits 3.
      model.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      model.create.mockImplementation((data: object) =>
        Promise.resolve(makeBooking(data as Partial<FakeBooking>)),
      );
    });

    it('creates a pending booking priced at nights × rate', async () => {
      await service.create(USER_ID, dto);

      expect(model.create).toHaveBeenCalledWith({
        user: new Types.ObjectId(USER_ID),
        room: ROOM_ID,
        checkIn: new Date(`${IN}T00:00:00Z`),
        checkOut: new Date(`${OUT}T00:00:00Z`),
        guests: 2,
        totalPrice: 300, // 3 nights × 100
        status: 'pending',
      });
    });

    // The overlap query is the heart of the whole module; pin its shape.
    it('counts only holding bookings that overlap the stay', async () => {
      await service.create(USER_ID, dto);

      expect(model.countDocuments).toHaveBeenCalledWith({
        room: ROOM_ID,
        status: { $in: ['pending', 'confirmed'] },
        checkIn: { $lt: new Date(`${OUT}T00:00:00Z`) },
        checkOut: { $gt: new Date(`${IN}T00:00:00Z`) },
      });
    });

    it('returns the booking with its room populated', async () => {
      await service.create(USER_ID, dto);

      const created = (await model.create.mock.results[0].value) as FakeBooking;
      const populate = created.populate;
      expect(populate).toHaveBeenCalledWith('room', 'name type');
    });

    it('refuses when every unit is already held', async () => {
      model.countDocuments.mockReset().mockResolvedValue(3);

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    // Two requests can both pass the pre-check for the last unit. The one
    // whose post-insert count comes back over inventory withdraws itself.
    it('withdraws its own booking if the post-insert count is over inventory', async () => {
      model.countDocuments
        .mockReset()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(4);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(/just taken/);

      expect(model.create).toHaveBeenCalledTimes(1);
      const created = (await model.create.mock.results[0].value) as FakeBooking;
      expect(model.deleteOne).toHaveBeenCalledWith({ _id: created._id });
    });

    it('rejects more guests than the room sleeps', async () => {
      await expect(
        service.create(USER_ID, { ...dto, guests: 3 }),
      ).rejects.toThrow('sleeps at most 2 guests');
      expect(model.countDocuments).not.toHaveBeenCalled();
    });

    it('rejects a room type that has been withdrawn', async () => {
      rooms.findOne.mockResolvedValue(makeRoom({ isActive: false }));

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        'no longer offered',
      );
    });

    it('validates the stay before touching the database', async () => {
      await expect(
        service.create(USER_ID, { ...dto, checkOut: dto.checkIn }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rooms.findOne).not.toHaveBeenCalled();
    });

    it('propagates an unknown room as 404', async () => {
      rooms.findOne.mockRejectedValue(new NotFoundException('Room not found'));

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAvailableRooms', () => {
    it('subtracts held units per room and floors at zero', async () => {
      const a = makeRoom({ _id: new Types.ObjectId(), totalUnits: 3 });
      const b = makeRoom({ _id: new Types.ObjectId(), totalUnits: 1 });
      const c = makeRoom({ _id: new Types.ObjectId(), totalUnits: 2 });
      rooms.findAvailable.mockResolvedValue([a, b, c]);
      model.aggregate.mockResolvedValue([
        { _id: a._id, held: 1 },
        { _id: b._id, held: 1 },
        // c: nothing held, so absent from the aggregation
      ]);

      const result = await service.findAvailableRooms(IN, OUT, 2);

      expect(rooms.findAvailable).toHaveBeenCalledWith({ guests: 2 });
      expect(result.map((r) => r.availableUnits)).toEqual([2, 0, 2]);
    });

    it('asks the aggregation for exactly the overlapping holds', async () => {
      const room = makeRoom();
      rooms.findAvailable.mockResolvedValue([room]);
      model.aggregate.mockResolvedValue([]);

      await service.findAvailableRooms(IN, OUT);

      const [pipeline] = model.aggregate.mock.calls[0] as [unknown[]];
      expect(pipeline[0]).toEqual({
        $match: {
          room: { $in: [ROOM_ID] },
          status: { $in: ['pending', 'confirmed'] },
          checkIn: { $lt: new Date(`${OUT}T00:00:00Z`) },
          checkOut: { $gt: new Date(`${IN}T00:00:00Z`) },
        },
      });
    });
  });

  describe('findAll', () => {
    it('maps status and a date window onto the overlap rule', async () => {
      const query = makeQuery([]);
      model.find.mockReturnValue(query);

      await service.findAll({ status: 'pending', from: IN, to: OUT });

      expect(model.find).toHaveBeenCalledWith({
        status: 'pending',
        checkIn: { $lt: new Date(`${OUT}T00:00:00Z`) },
        checkOut: { $gt: new Date(`${IN}T00:00:00Z`) },
      });
    });

    it('passes no filter when nothing is asked', async () => {
      model.find.mockReturnValue(makeQuery([]));

      await service.findAll({});

      expect(model.find).toHaveBeenCalledWith({});
    });
  });

  describe('findOne', () => {
    function stubFind(booking: FakeBooking | null) {
      const exec = jest.fn().mockResolvedValue(booking);
      model.findById.mockReturnValue({ populate: () => ({ exec }) });
    }

    it('returns the owner their booking', async () => {
      const booking = makeBooking();
      stubFind(booking);

      await expect(service.findOne('id', guest)).resolves.toBe(booking);
    });

    it('returns any booking to an admin', async () => {
      const booking = makeBooking({ user: new Types.ObjectId() });
      stubFind(booking);

      await expect(service.findOne('id', admin)).resolves.toBe(booking);
    });

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
  });

  describe('cancel', () => {
    function stubFind(booking: FakeBooking) {
      const exec = jest.fn().mockResolvedValue(booking);
      model.findById.mockReturnValue({ populate: () => ({ exec }) });
    }

    it('marks a future booking cancelled and saves it', async () => {
      const booking = makeBooking();
      stubFind(booking);

      await service.cancel('id', guest);

      expect(booking.status).toBe('cancelled');
      expect(booking.save).toHaveBeenCalledTimes(1);
    });

    it('rejects cancelling twice', async () => {
      stubFind(makeBooking({ status: 'cancelled' }));

      await expect(service.cancel('id', guest)).rejects.toThrow(
        'already cancelled',
      );
    });

    it('stops a guest cancelling after check-in', async () => {
      stubFind(makeBooking({ checkIn: new Date('2020-01-01T00:00:00Z') }));

      await expect(service.cancel('id', guest)).rejects.toThrow(
        'cannot be cancelled after check-in',
      );
    });

    it('lets an admin cancel after check-in', async () => {
      const booking = makeBooking({
        checkIn: new Date('2020-01-01T00:00:00Z'),
      });
      stubFind(booking);

      await service.cancel('id', admin);

      expect(booking.status).toBe('cancelled');
    });
  });
});

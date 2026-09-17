import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { Room } from './schemas/room.schema';
import { CreateRoomDto } from './dto/create-room.dto';

const roomDto: CreateRoomDto = {
  name: 'Deluxe Double',
  description: 'A comfortable double room with a city view.',
  type: 'double',
  pricePerNight: 120,
  capacity: 2,
  totalUnits: 8,
};

// Stands in for the chain the service builds: find(…).sort(…).exec()
function makeFindQuery(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const sort = jest.fn().mockReturnValue({ exec });
  return { sort, exec };
}

describe('RoomsService', () => {
  let service: RoomsService;
  let model: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: getModelToken(Room.name), useValue: model },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('create', () => {
    it('creates the room when the name is free', async () => {
      model.findOne.mockResolvedValue(null);
      model.create.mockResolvedValue({ _id: 'r1', ...roomDto });

      const room = await service.create(roomDto);

      expect(model.findOne).toHaveBeenCalledWith({ name: 'Deluxe Double' });
      expect(model.create).toHaveBeenCalledWith(roomDto);
      expect(room).toMatchObject({ _id: 'r1', name: 'Deluxe Double' });
    });

    it('rejects a duplicate name with 409', async () => {
      model.findOne.mockResolvedValue({ _id: 'existing' });

      await expect(service.create(roomDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });
  });

  describe('findAvailable', () => {
    it('returns only active rooms, cheapest first', async () => {
      const query = makeFindQuery([]);
      model.find.mockReturnValue(query);

      await service.findAvailable({});

      expect(model.find).toHaveBeenCalledWith({ isActive: true });
      expect(query.sort).toHaveBeenCalledWith({ pricePerNight: 1 });
    });

    it('filters by capacity when guests is given', async () => {
      model.find.mockReturnValue(makeFindQuery([]));

      await service.findAvailable({ guests: 3 });

      expect(model.find).toHaveBeenCalledWith({
        isActive: true,
        capacity: { $gte: 3 },
      });
    });
  });

  describe('findAll', () => {
    it('includes inactive rooms, for staff', async () => {
      const query = makeFindQuery([]);
      model.find.mockReturnValue(query);

      await service.findAll();

      expect(model.find).toHaveBeenCalledWith();
      expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    });
  });

  describe('findOne', () => {
    it('returns the room', async () => {
      model.findById.mockResolvedValue({ _id: 'r1' });

      await expect(service.findOne('r1')).resolves.toEqual({ _id: 'r1' });
    });

    it('throws 404 for an unknown id', async () => {
      model.findById.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates with schema validators on', async () => {
      model.findByIdAndUpdate.mockResolvedValue({
        _id: 'r1',
        pricePerNight: 99,
      });

      await service.update('r1', { pricePerNight: 99 });

      expect(model.findOne).not.toHaveBeenCalled();
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'r1',
        { pricePerNight: 99 },
        { new: true, runValidators: true },
      );
    });

    it('rejects renaming onto another room', async () => {
      model.findOne.mockResolvedValue({ _id: 'r2' });

      await expect(
        service.update('r1', { name: 'Taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(model.findOne).toHaveBeenCalledWith({
        name: 'Taken',
        _id: { $ne: 'r1' },
      });
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('lets a room keep its own name', async () => {
      model.findOne.mockResolvedValue(null);
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'r1' });

      await expect(
        service.update('r1', { name: 'Deluxe Double' }),
      ).resolves.toBeDefined();
    });

    it('throws 404 for an unknown id', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        service.update('nope', { capacity: 2 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    // Bookings reference room types, so a delete must not remove the document.
    it('soft-deletes by flagging the room inactive', async () => {
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'r1' });

      await service.remove('r1');

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith('r1', {
        isActive: false,
      });
    });

    it('throws 404 for an unknown id', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VenuesService } from './venues.service';
import { Venue } from './schemas/venue.schema';
import { CreateVenueDto } from './dto/create-venue.dto';

const venueDto: CreateVenueDto = {
  name: 'Rooftop Swimming Pool',
  description: 'A heated rooftop pool for private hire.',
  type: 'pool',
  pricePerHour: 120,
  capacity: 30,
};

const stored = {
  _id: 'v1',
  openingHour: 8,
  closingHour: 22,
  minHours: 1,
  maxHours: 12,
  discountStartsAt: null,
  discountEndsAt: null,
};

function makeFindQuery(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const sort = jest.fn().mockReturnValue({ exec });
  return { sort, exec };
}

describe('VenuesService', () => {
  let service: VenuesService;
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
        VenuesService,
        { provide: getModelToken(Venue.name), useValue: model },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);
  });

  describe('create', () => {
    it('creates the venue when the name is free', async () => {
      model.findOne.mockResolvedValue(null);
      model.create.mockResolvedValue({ _id: 'v1', ...venueDto });

      await service.create(venueDto);

      expect(model.findOne).toHaveBeenCalledWith({
        name: 'Rooftop Swimming Pool',
      });
      expect(model.create).toHaveBeenCalledWith(venueDto);
    });

    it('rejects a duplicate name with 409', async () => {
      model.findOne.mockResolvedValue({ _id: 'existing' });

      await expect(service.create(venueDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    // closingHour falls back to its default of 22 here.
    it('rejects opening at or after the (default) closing hour', async () => {
      await expect(
        service.create({ ...venueDto, openingHour: 22 }),
      ).rejects.toThrow('closingHour must be after openingHour');
      expect(model.create).not.toHaveBeenCalled();
    });

    it('rejects maxHours below minHours', async () => {
      await expect(
        service.create({ ...venueDto, minHours: 4, maxHours: 2 }),
      ).rejects.toThrow('maxHours must be at least minHours');
    });
  });

  describe('findAvailable', () => {
    it('returns active venues, cheapest first', async () => {
      const query = makeFindQuery([]);
      model.find.mockReturnValue(query);

      await service.findAvailable({});

      expect(model.find).toHaveBeenCalledWith({ isActive: true });
      expect(query.sort).toHaveBeenCalledWith({ pricePerHour: 1 });
    });

    it('filters by type and capacity', async () => {
      model.find.mockReturnValue(makeFindQuery([]));

      await service.findAvailable({ type: 'pool', guests: 20 });

      expect(model.find).toHaveBeenCalledWith({
        isActive: true,
        type: 'pool',
        capacity: { $gte: 20 },
      });
    });
  });

  describe('findAll', () => {
    it('includes inactive venues, for staff', async () => {
      const query = makeFindQuery([]);
      model.find.mockReturnValue(query);

      await service.findAll();

      expect(model.find).toHaveBeenCalledWith();
      expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    });
  });

  describe('findOne', () => {
    it('throws 404 for an unknown id', async () => {
      model.findById.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    beforeEach(() => model.findById.mockResolvedValue(stored));

    it('updates with schema validators on', async () => {
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'v1' });

      await service.update('v1', { pricePerHour: 99 });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'v1',
        { pricePerHour: 99 },
        { new: true, runValidators: true },
      );
    });

    // Stored closingHour is 22.
    it('checks a lone openingHour against the stored closingHour', async () => {
      await expect(
        service.update('v1', { openingHour: 23 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('checks a lone discount bound against the stored one', async () => {
      model.findById.mockResolvedValue({
        ...stored,
        discountEndsAt: '2026-12-01',
      });

      await expect(
        service.update('v1', { discountStartsAt: '2026-12-31' }),
      ).rejects.toThrow('discountEndsAt must be on or after discountStartsAt');
    });

    it('lets null clear a stored bound', async () => {
      model.findById.mockResolvedValue({
        ...stored,
        discountEndsAt: '2026-12-01',
      });
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'v1' });

      await expect(
        service.update('v1', {
          discountStartsAt: '2026-12-31',
          discountEndsAt: null,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects renaming onto another venue', async () => {
      model.findOne.mockResolvedValue({ _id: 'v2' });

      await expect(
        service.update('v1', { name: 'Taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(model.findOne).toHaveBeenCalledWith({
        name: 'Taken',
        _id: { $ne: 'v1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      model.findById.mockResolvedValue(null);

      await expect(
        service.update('nope', { capacity: 2 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes by flagging the venue inactive', async () => {
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'v1' });

      await service.remove('v1');

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith('v1', {
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

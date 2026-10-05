import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LocationService } from './location.service';
import { HotelLocation } from './schemas/hotel-location.schema';
import { UpdateLocationDto } from './dto/update-location.dto';

describe('LocationService', () => {
  let service: LocationService;
  let model: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };

  beforeEach(async () => {
    model = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getModelToken(HotelLocation.name), useValue: model },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
  });

  it('reads the single hotel document', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(service.get()).resolves.toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ key: 'hotel' });
  });

  it('upserts every field, defaulting the ones left out', async () => {
    const saved = { latitude: 1, longitude: 2 };
    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(saved),
    });

    await expect(service.set({ latitude: 1, longitude: 2 })).resolves.toBe(
      saved,
    );
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'hotel' },
      { latitude: 1, longitude: 2, zoom: 15, address: '', description: '' },
      { upsert: true, new: true, runValidators: true },
    );
  });
});

describe('UpdateLocationDto', () => {
  const check = (body: object) =>
    validateSync(plainToInstance(UpdateLocationDto, body)).map(
      (e) => e.property,
    );

  it('accepts a pin with an empty description', () => {
    expect(
      check({ latitude: 24.8607, longitude: 67.0011, description: '' }),
    ).toEqual([]);
  });

  it('rejects coordinates off the globe', () => {
    expect(check({ latitude: 91, longitude: -181 })).toEqual([
      'latitude',
      'longitude',
    ]);
  });

  it('sanitises the description', () => {
    const dto = plainToInstance(UpdateLocationDto, {
      latitude: 0,
      longitude: 0,
      description: '<p>Hi</p><script>x()</script>',
    });
    expect(dto.description).toBe('<p>Hi</p>');
  });
});

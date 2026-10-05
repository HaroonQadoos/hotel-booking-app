import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('LocationController', () => {
  let controller: LocationController;
  let service: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    service = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationController],
      providers: [{ provide: LocationService, useValue: service }],
    }).compile();

    controller = module.get<LocationController>(LocationController);
  });

  const metadataOf = <T>(key: string, method: keyof LocationController) => {
    const fn = Object.getOwnPropertyDescriptor(
      LocationController.prototype,
      method,
    )?.value as object;
    return Reflect.getMetadata(key, fn) as T | undefined;
  };

  it('leaves get public', () => {
    expect(metadataOf(GUARDS_METADATA, 'get')).toBeUndefined();
  });

  it('restricts set to admins', () => {
    expect(metadataOf<unknown[]>(GUARDS_METADATA, 'set')).toHaveLength(2);
    expect(metadataOf<string[]>(ROLES_KEY, 'set')).toEqual(['admin']);
  });

  it('answers { location: null } before one is set', async () => {
    service.get.mockResolvedValue(null);
    await expect(controller.get()).resolves.toEqual({ location: null });
  });

  it('shapes the stored location, without internal fields', async () => {
    service.get.mockResolvedValue({
      _id: 'x',
      key: 'hotel',
      latitude: 24.86,
      longitude: 67.01,
      zoom: 15,
      address: 'Seafront Road',
      description: '<p>Ten minutes from the station.</p>',
    });
    await expect(controller.get()).resolves.toEqual({
      location: {
        latitude: 24.86,
        longitude: 67.01,
        zoom: 15,
        address: 'Seafront Road',
        description: '<p>Ten minutes from the station.</p>',
      },
    });
  });
});

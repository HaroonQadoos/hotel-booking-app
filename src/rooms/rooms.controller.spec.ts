import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('RoomsController', () => {
  let controller: RoomsController;
  let service: {
    create: jest.Mock;
    findAvailable: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAvailable: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: service }],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Route decorators store their metadata on the method function itself.
  // Fetched via the property descriptor so nothing reads an unbound method.
  const metadataOf = <T>(key: string, method: keyof RoomsController) => {
    const fn = Object.getOwnPropertyDescriptor(
      RoomsController.prototype,
      method,
    )?.value as object;
    return Reflect.getMetadata(key, fn) as T | undefined;
  };

  // Guests browse before they sign up, so these two must stay guard-free.
  it.each(['findAvailable', 'findOne'] as const)('leaves %s public', (name) => {
    expect(metadataOf(GUARDS_METADATA, name)).toBeUndefined();
  });

  it.each(['findAll', 'create', 'update', 'remove'] as const)(
    'restricts %s to admins',
    (name) => {
      expect(metadataOf<unknown[]>(GUARDS_METADATA, name)).toHaveLength(2);
      expect(metadataOf<string[]>(ROLES_KEY, name)).toEqual(['admin']);
    },
  );

  it('shapes rooms through RoomResponseDto', async () => {
    service.findAvailable.mockResolvedValue([
      { _id: 'r1', name: 'Deluxe Double', amenities: [], images: [] },
    ]);

    const [room] = await controller.findAvailable({});

    expect(room).toMatchObject({ id: 'r1', name: 'Deluxe Double' });
    expect(room).not.toHaveProperty('_id');
  });
});

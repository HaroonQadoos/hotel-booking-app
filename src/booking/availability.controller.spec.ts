import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { AvailabilityController } from './availability.controller';
import { BookingService } from './booking.service';

describe('AvailabilityController', () => {
  let controller: AvailabilityController;
  let service: { findAvailableRooms: jest.Mock };

  beforeEach(async () => {
    service = { findAvailableRooms: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [{ provide: BookingService, useValue: service }],
    }).compile();

    controller = module.get<AvailabilityController>(AvailabilityController);
  });

  // Guests search before they sign up.
  it('is public', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AvailabilityController),
    ).toBeUndefined();
  });

  it('shapes each result as a room plus its free units', async () => {
    const _id = new Types.ObjectId();
    service.findAvailableRooms.mockResolvedValue([
      {
        room: { _id, name: 'Deluxe Double', amenities: [], images: [] },
        availableUnits: 2,
      },
    ]);

    const [row] = await controller.search({
      checkIn: '2030-01-01',
      checkOut: '2030-01-03',
      guests: 2,
    });

    expect(service.findAvailableRooms).toHaveBeenCalledWith(
      '2030-01-01',
      '2030-01-03',
      2,
    );
    expect(row).toMatchObject({
      id: String(_id),
      name: 'Deluxe Double',
      availableUnits: 2,
    });
  });
});

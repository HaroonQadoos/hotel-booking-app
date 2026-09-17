import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { Room } from './schemas/room.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { FindRoomsDto } from './dto/find-rooms.dto';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<Room>) {}

  async create(dto: CreateRoomDto): Promise<Room> {
    // Checked up front for a readable 409. The unique index still backs this
    // up if two staff create the same name at once.
    const existing = await this.roomModel.findOne({ name: dto.name });
    if (existing) {
      throw new ConflictException('A room type with this name already exists');
    }
    return this.roomModel.create(dto);
  }

  // Guest-facing: only what the hotel is currently selling. Date-range
  // availability is BookingService's concern and is layered on top of this.
  async findAvailable(query: FindRoomsDto): Promise<Room[]> {
    const filter: QueryFilter<Room> = { isActive: true };
    if (query.guests !== undefined) filter.capacity = { $gte: query.guests };
    return this.roomModel.find(filter).sort({ pricePerNight: 1 }).exec();
  }

  // Staff-facing: everything, including types that were soft-deleted.
  async findAll(): Promise<Room[]> {
    return this.roomModel.find().sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.roomModel.findById(id);
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async update(id: string, dto: UpdateRoomDto): Promise<Room> {
    if (dto.name !== undefined) {
      const clash = await this.roomModel.findOne({
        name: dto.name,
        _id: { $ne: id },
      });
      if (clash) {
        throw new ConflictException(
          'A room type with this name already exists',
        );
      }
    }
    // runValidators: findByIdAndUpdate skips schema validation by default, so
    // without it an update could write a price of -5 past the min: 0 rule.
    const room = await this.roomModel.findByIdAndUpdate(id, dto, {
      new: true,
      runValidators: true,
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  // Soft delete — see the note on Room.isActive. The document stays so that
  // existing bookings still resolve their room.
  async remove(id: string): Promise<void> {
    const room = await this.roomModel.findByIdAndUpdate(id, {
      isActive: false,
    });
    if (!room) throw new NotFoundException('Room not found');
  }
}

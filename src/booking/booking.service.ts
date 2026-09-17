import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { RoomsService } from '../rooms/rooms.service';
import { Room } from '../rooms/schemas/room.schema';
import type { AuthUser } from '../auth/types/auth-user';
import { Booking, HOLDING_STATUSES } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { FindBookingsDto } from './dto/find-bookings.dto';
import { parseStay, parseStayDate, todayUtc } from './stay-dates';

// What the client needs to render a booking without a second request.
const ROOM_SUMMARY = 'name type';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    private readonly roomsService: RoomsService,
  ) {}

  async create(userId: string, dto: CreateBookingDto): Promise<Booking> {
    const stay = parseStay(dto.checkIn, dto.checkOut);
    const room = await this.roomsService.findOne(dto.room);

    if (!room.isActive) {
      throw new BadRequestException('This room type is no longer offered');
    }
    if (dto.guests > room.capacity) {
      throw new BadRequestException(
        `This room sleeps at most ${room.capacity} guest${room.capacity === 1 ? '' : 's'}`,
      );
    }

    const held = await this.countHeld(room._id, stay.checkIn, stay.checkOut);
    if (held >= room.totalUnits) {
      throw new ConflictException(
        'No rooms of this type are available for those dates',
      );
    }

    const booking = await this.bookingModel.create({
      user: new Types.ObjectId(userId),
      room: room._id,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      guests: dto.guests,
      totalPrice: stay.nights * room.pricePerNight,
      status: 'pending',
    });

    // Two requests for the last unit can both pass the check above before
    // either has written. Re-counting after the insert catches that: if this
    // booking pushed the room over its inventory, it is withdrawn. The worst
    // case is that both lose the race and retry — never that both win.
    const heldNow = await this.countHeld(room._id, stay.checkIn, stay.checkOut);
    if (heldNow > room.totalUnits) {
      await this.bookingModel.deleteOne({ _id: booking._id });
      throw new ConflictException(
        'That room was just taken — please choose different dates or another room',
      );
    }

    return booking.populate('room', ROOM_SUMMARY);
  }

  // How many units of a room are held for any part of [checkIn, checkOut).
  // Two stays overlap when each starts before the other ends; a stay ending
  // on the day another begins does not, because checkout is in the morning.
  async countHeld(
    roomId: Types.ObjectId,
    checkIn: Date,
    checkOut: Date,
  ): Promise<number> {
    return this.bookingModel.countDocuments({
      room: roomId,
      status: { $in: HOLDING_STATUSES },
      checkIn: { $lt: checkOut },
      checkOut: { $gt: checkIn },
    });
  }

  // Same count, for many rooms in one query — feeds the availability search.
  // Rooms with nothing held are simply absent from the map.
  async countHeldByRoom(
    roomIds: Types.ObjectId[],
    checkIn: Date,
    checkOut: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.bookingModel.aggregate<{
      _id: Types.ObjectId;
      held: number;
    }>([
      {
        $match: {
          room: { $in: roomIds },
          status: { $in: HOLDING_STATUSES },
          checkIn: { $lt: checkOut },
          checkOut: { $gt: checkIn },
        },
      },
      { $group: { _id: '$room', held: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.held]));
  }

  // Guest-facing search: every active room type that fits the party, with
  // how many units are free for the stay. Fully booked types are included
  // with 0 so the client can show them as sold out rather than missing.
  async findAvailableRooms(
    checkInRaw: string,
    checkOutRaw: string,
    guests?: number,
  ): Promise<Array<{ room: Room; availableUnits: number }>> {
    const stay = parseStay(checkInRaw, checkOutRaw);
    const rooms = await this.roomsService.findAvailable({ guests });
    const held = await this.countHeldByRoom(
      rooms.map((r) => r._id),
      stay.checkIn,
      stay.checkOut,
    );
    return rooms.map((room) => ({
      room,
      availableUnits: Math.max(
        0,
        room.totalUnits - (held.get(String(room._id)) ?? 0),
      ),
    }));
  }

  async findForUser(userId: string): Promise<Booking[]> {
    return this.bookingModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ checkIn: -1 })
      .populate('room', ROOM_SUMMARY)
      .exec();
  }

  async findAll(query: FindBookingsDto): Promise<Booking[]> {
    const filter: QueryFilter<Booking> = {};
    if (query.status) filter.status = query.status;
    // Overlap with [from, to), same rule as availability.
    if (query.to) filter.checkIn = { $lt: parseStayDate(query.to, 'to') };
    if (query.from)
      filter.checkOut = { $gt: parseStayDate(query.from, 'from') };
    return this.bookingModel
      .find(filter)
      .sort({ checkIn: -1 })
      .populate('room', ROOM_SUMMARY)
      .exec();
  }

  async findOne(id: string, actor: AuthUser): Promise<Booking> {
    const booking = await this.bookingModel
      .findById(id)
      .populate('room', ROOM_SUMMARY)
      .exec();
    if (!booking) throw new NotFoundException('Booking not found');
    this.assertCanActOn(booking, actor);
    return booking;
  }

  async cancel(id: string, actor: AuthUser): Promise<Booking> {
    const booking = await this.findOne(id, actor);

    if (booking.status === 'cancelled') {
      throw new BadRequestException('This booking is already cancelled');
    }
    // Staff can still cancel a stay in progress (a no-show, say); a guest
    // cannot, so they cannot claim a refund on a night they have slept.
    if (actor.role !== 'admin' && booking.checkIn < todayUtc()) {
      throw new BadRequestException(
        'A booking cannot be cancelled after check-in',
      );
    }

    booking.status = 'cancelled';
    await booking.save();
    return booking;
  }

  // Ownership lives on the booking, not in RolesGuard: "is this yours" needs
  // the record. Admins see everything; a guest sees only their own.
  private assertCanActOn(booking: Booking, actor: AuthUser): void {
    if (actor.role === 'admin') return;
    if (String(booking.user) === actor.userId) return;
    throw new ForbiddenException('You can only act on your own bookings');
  }
}

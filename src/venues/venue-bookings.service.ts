import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import type { AuthUser } from '../auth/types/auth-user';
import { HOLDING_STATUSES } from '../booking/schemas/booking.schema';
import { parseStayDate, todayUtc } from '../booking/stay-dates';
import { priceOn, roundMoney } from '../common/discount';
import { VenuesService } from './venues.service';
import { VenueBooking } from './schemas/venue-booking.schema';
import { CreateVenueBookingDto } from './dto/create-venue-booking.dto';
import { FindVenueBookingsDto } from './dto/find-venue-bookings.dto';

const MS_PER_DAY = 86_400_000;

// How far ahead a venue can be booked. Keeps a mistyped year from holding a
// slot indefinitely.
export const MAX_ADVANCE_DAYS = 180;

// What the client needs to render a booking without a second request.
const VENUE_SUMMARY = 'name type';

export interface BookedSlot {
  startHour: number;
  endHour: number;
}

export interface VenueDayAvailability {
  date: string;
  openingHour: number;
  closingHour: number;
  booked: BookedSlot[];
}

@Injectable()
export class VenueBookingsService {
  constructor(
    @InjectModel(VenueBooking.name)
    private venueBookingModel: Model<VenueBooking>,
    private readonly venuesService: VenuesService,
  ) {}

  async create(
    userId: string,
    dto: CreateVenueBookingDto,
    now: Date = new Date(),
  ): Promise<VenueBooking> {
    // Everything that needs no venue is checked before touching the database.
    const date = parseBookingDate(dto.date, now);
    if (dto.endHour <= dto.startHour) {
      throw new BadRequestException('endHour must be after startHour');
    }
    const hours = dto.endHour - dto.startHour;

    const venue = await this.venuesService.findOne(dto.venue);
    if (!venue.isActive) {
      throw new BadRequestException('This venue is no longer offered');
    }
    if (dto.guests > venue.capacity) {
      throw new BadRequestException(
        `This venue holds at most ${venue.capacity} guest${venue.capacity === 1 ? '' : 's'}`,
      );
    }
    if (dto.startHour < venue.openingHour || dto.endHour > venue.closingHour) {
      throw new BadRequestException(
        `This venue is open from ${venue.openingHour}:00 to ${venue.closingHour}:00`,
      );
    }
    if (hours < venue.minHours || hours > venue.maxHours) {
      throw new BadRequestException(
        `This venue is booked for ${venue.minHours} to ${venue.maxHours} hours`,
      );
    }

    const held = await this.countHeld(
      venue._id,
      date,
      dto.startHour,
      dto.endHour,
    );
    if (held > 0) {
      throw new ConflictException('That time is already booked');
    }

    const booking = await this.venueBookingModel.create({
      user: new Types.ObjectId(userId),
      venue: venue._id,
      date,
      startHour: dto.startHour,
      endHour: dto.endHour,
      guests: dto.guests,
      notes: dto.notes,
      totalPrice: roundMoney(hours * priceOn(venue.pricePerHour, venue, date)),
      status: 'pending',
    });

    // Same race guard as room bookings: two overlapping requests can both
    // pass the check above. A venue is one space, so after the insert this
    // booking must be the only hold; if not, it withdraws. Both may lose and
    // retry — never both win.
    const heldNow = await this.countHeld(
      venue._id,
      date,
      dto.startHour,
      dto.endHour,
    );
    if (heldNow > 1) {
      await this.venueBookingModel.deleteOne({ _id: booking._id });
      throw new ConflictException(
        'That time was just taken — please choose another slot',
      );
    }

    return booking.populate('venue', VENUE_SUMMARY);
  }

  // Holds on the venue that overlap [startHour, endHour) on the day. Two
  // slots overlap when each starts before the other ends.
  async countHeld(
    venueId: Types.ObjectId,
    date: Date,
    startHour: number,
    endHour: number,
  ): Promise<number> {
    return this.venueBookingModel.countDocuments({
      venue: venueId,
      status: { $in: HOLDING_STATUSES },
      date,
      startHour: { $lt: endHour },
      endHour: { $gt: startHour },
    });
  }

  // Public: which hours of a day are taken. Only the slots — never who holds
  // them.
  async findDayAvailability(
    venueId: string,
    dateRaw: string,
  ): Promise<VenueDayAvailability> {
    const date = parseStayDate(dateRaw, 'date');
    const venue = await this.venuesService.findOne(venueId);
    const bookings = await this.venueBookingModel
      .find(
        { venue: venue._id, status: { $in: HOLDING_STATUSES }, date },
        'startHour endHour',
      )
      .sort({ startHour: 1 })
      .exec();
    return {
      date: dateRaw,
      openingHour: venue.openingHour,
      closingHour: venue.closingHour,
      booked: bookings.map((b) => ({
        startHour: b.startHour,
        endHour: b.endHour,
      })),
    };
  }

  async findForUser(userId: string): Promise<VenueBooking[]> {
    return this.venueBookingModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ date: -1, startHour: -1 })
      .populate('venue', VENUE_SUMMARY)
      .exec();
  }

  async findAll(query: FindVenueBookingsDto): Promise<VenueBooking[]> {
    const filter: QueryFilter<VenueBooking> = {};
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      const date: { $gte?: Date; $lt?: Date } = {};
      if (query.from) date.$gte = parseStayDate(query.from, 'from');
      if (query.to) date.$lt = parseStayDate(query.to, 'to');
      filter.date = date;
    }
    return this.venueBookingModel
      .find(filter)
      .sort({ date: -1, startHour: -1 })
      .populate('venue', VENUE_SUMMARY)
      .exec();
  }

  async findOne(id: string, actor: AuthUser): Promise<VenueBooking> {
    const booking = await this.venueBookingModel
      .findById(id)
      .populate('venue', VENUE_SUMMARY)
      .exec();
    if (!booking) throw new NotFoundException('Venue booking not found');
    this.assertCanActOn(booking, actor);
    return booking;
  }

  async cancel(id: string, actor: AuthUser): Promise<VenueBooking> {
    const booking = await this.findOne(id, actor);

    if (booking.status === 'cancelled') {
      throw new BadRequestException('This booking is already cancelled');
    }
    // Mirrors room bookings: a guest can cancel up to and including the day
    // itself, not once it has passed. Staff can always cancel.
    if (actor.role !== 'admin' && booking.date < todayUtc()) {
      throw new BadRequestException(
        'A booking cannot be cancelled after its date',
      );
    }

    booking.status = 'cancelled';
    await booking.save();
    return booking;
  }

  // Only a pending booking can be accepted: a cancelled one released its
  // slot, which may since have been taken.
  async confirm(id: string, actor: AuthUser): Promise<VenueBooking> {
    const booking = await this.findOne(id, actor);

    if (booking.status !== 'pending') {
      throw new BadRequestException(
        `Only a pending booking can be accepted; this one is ${booking.status}`,
      );
    }

    booking.status = 'confirmed';
    await booking.save();
    return booking;
  }

  // Feeds the dashboard badge.
  async countPending(): Promise<number> {
    return this.venueBookingModel.countDocuments({ status: 'pending' });
  }

  private assertCanActOn(booking: VenueBooking, actor: AuthUser): void {
    if (actor.role === 'admin') return;
    if (String(booking.user) === actor.userId) return;
    throw new ForbiddenException('You can only act on your own bookings');
  }
}

// A bookable day: a real date, not in the past, within the advance window.
function parseBookingDate(raw: string, now: Date): Date {
  const date = parseStayDate(raw, 'date');
  const today = todayUtc(now);
  if (date < today) {
    throw new BadRequestException('date cannot be in the past');
  }
  if (date.getTime() - today.getTime() > MAX_ADVANCE_DAYS * MS_PER_DAY) {
    throw new BadRequestException(
      `Venues can be booked at most ${MAX_ADVANCE_DAYS} days ahead`,
    );
  }
  return date;
}

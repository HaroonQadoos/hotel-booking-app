import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { isValidDiscountWindow } from '../common/discount';
import { Venue, VENUE_DEFAULTS } from './schemas/venue.schema';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { FindVenuesDto } from './dto/find-venues.dto';

type VenueRules = Pick<
  Venue,
  | 'openingHour'
  | 'closingHour'
  | 'minHours'
  | 'maxHours'
  | 'discountStartsAt'
  | 'discountEndsAt'
>;

@Injectable()
export class VenuesService {
  constructor(@InjectModel(Venue.name) private venueModel: Model<Venue>) {}

  async create(dto: CreateVenueDto): Promise<Venue> {
    assertVenueRules({
      openingHour: dto.openingHour ?? VENUE_DEFAULTS.openingHour,
      closingHour: dto.closingHour ?? VENUE_DEFAULTS.closingHour,
      minHours: dto.minHours ?? VENUE_DEFAULTS.minHours,
      maxHours: dto.maxHours ?? VENUE_DEFAULTS.maxHours,
      discountStartsAt: dto.discountStartsAt ?? null,
      discountEndsAt: dto.discountEndsAt ?? null,
    });
    // Checked up front for a readable 409; the unique index backs it up.
    const existing = await this.venueModel.findOne({ name: dto.name });
    if (existing) {
      throw new ConflictException('A venue with this name already exists');
    }
    return this.venueModel.create(dto);
  }

  // Guest-facing: only what the hotel currently hires out.
  async findAvailable(query: FindVenuesDto): Promise<Venue[]> {
    const filter: QueryFilter<Venue> = { isActive: true };
    if (query.type !== undefined) filter.type = query.type;
    if (query.guests !== undefined) filter.capacity = { $gte: query.guests };
    return this.venueModel.find(filter).sort({ pricePerHour: 1 }).exec();
  }

  // Staff-facing: everything, including soft-deleted venues.
  async findAll(): Promise<Venue[]> {
    return this.venueModel.find().sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<Venue> {
    const venue = await this.venueModel.findById(id);
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto): Promise<Venue> {
    // A PATCH may move one side of a pair (opening/closing, min/max, the sale
    // window); the rule has to hold against the stored other side.
    const current = await this.findOne(id);
    const pick = <K extends keyof VenueRules>(key: K): VenueRules[K] =>
      dto[key] !== undefined ? (dto[key] as VenueRules[K]) : current[key];
    assertVenueRules({
      openingHour: pick('openingHour'),
      closingHour: pick('closingHour'),
      minHours: pick('minHours'),
      maxHours: pick('maxHours'),
      discountStartsAt: pick('discountStartsAt'),
      discountEndsAt: pick('discountEndsAt'),
    });

    if (dto.name !== undefined) {
      const clash = await this.venueModel.findOne({
        name: dto.name,
        _id: { $ne: id },
      });
      if (clash) {
        throw new ConflictException('A venue with this name already exists');
      }
    }
    // runValidators: findByIdAndUpdate skips schema validation by default.
    const venue = await this.venueModel.findByIdAndUpdate(id, dto, {
      new: true,
      runValidators: true,
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  // Soft delete: venue bookings still need to resolve their venue.
  async remove(id: string): Promise<void> {
    const venue = await this.venueModel.findByIdAndUpdate(id, {
      isActive: false,
    });
    if (!venue) throw new NotFoundException('Venue not found');
  }
}

// The cross-field rules no single-field validator can express.
function assertVenueRules(v: VenueRules): void {
  if (v.closingHour <= v.openingHour) {
    throw new BadRequestException('closingHour must be after openingHour');
  }
  if (v.maxHours < v.minHours) {
    throw new BadRequestException('maxHours must be at least minHours');
  }
  if (!isValidDiscountWindow(v.discountStartsAt, v.discountEndsAt)) {
    throw new BadRequestException(
      'discountEndsAt must be on or after discountStartsAt',
    );
  }
}

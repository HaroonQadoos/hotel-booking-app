import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One hotel, so one location: the collection holds a single document, found
// by this fixed key rather than by an id the client would have to know.
export const HOTEL_LOCATION_KEY = 'hotel';

export const LOCATION_DEFAULTS = { zoom: 15 } as const;

@Schema({ timestamps: true })
export class HotelLocation extends Document {
  @Prop({ required: true, unique: true, default: HOTEL_LOCATION_KEY })
  key!: string;

  @Prop({ required: true, min: -90, max: 90 })
  latitude!: number;

  @Prop({ required: true, min: -180, max: 180 })
  longitude!: number;

  // OpenStreetMap zoom: 3 is a continent, 19 a single building.
  @Prop({ default: LOCATION_DEFAULTS.zoom, min: 3, max: 19 })
  zoom!: number;

  // The street address as guests should read it; optional, the pin is enough.
  @Prop({ default: '', trim: true })
  address!: string;

  // Shown under the map: directions, parking, nearest station. Sanitised HTML
  // from the dashboard's rich-text editor, like room and venue descriptions.
  @Prop({ default: '' })
  description!: string;
}

export const HotelLocationSchema = SchemaFactory.createForClass(HotelLocation);

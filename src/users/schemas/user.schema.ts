import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  // select: false keeps the hash out of every query that doesn't explicitly
  // ask for it, so it can never leak through a response by accident.
  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Hashing lives here — on the document itself — rather than in a service,
// because every write path (create(), new User().save(), a seed script)
// funnels through save(). A caller cannot forget to hash.
// Takes no `next` on purpose: Mongoose detects an async hook and awaits the
// returned promise instead of passing a callback, so declaring `next` here
// would hand us undefined and throw the moment we called it.
export async function hashPasswordPreSave(this: User): Promise<void> {
  // Only hash when the plaintext actually changed, otherwise a plain
  // profile update would re-hash the existing hash and lock the user out.
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
}

UserSchema.pre('save', hashPasswordPreSave);

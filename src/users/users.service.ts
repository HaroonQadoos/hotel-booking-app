import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    // create() runs the document's pre('save') hook, which hashes the password.
    return this.userModel.create(dto);
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email });
  }

  // Only for authentication: the password field is select:false, so it has to
  // be requested explicitly. Never hand the result straight back to a client.
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).select('+password');
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(id, dto, { new: true });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async remove(id: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('User not found');
  }

  // Only for the change-password flow, which has to verify the current one.
  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('+password').exec();
  }

  // The expiry is part of the filter rather than something the caller checks
  // afterwards, so an expired link simply finds no user — there is no code
  // path that can forget to reject it.
  async findByResetTokenHash(tokenHash: string): Promise<User | null> {
    return this.userModel
      .findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: { $gt: new Date() },
      })
      .select('+password +passwordResetTokenHash +passwordResetExpires')
      .exec();
  }

  // An update query is correct here precisely because no password is involved:
  // nothing needs the pre('save') hook, and this avoids loading the document
  // just to write two fields.
  async setResetToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel.updateOne(
      { _id: id },
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: expiresAt,
      },
    );
  }

  // Takes the document, not an id, because this MUST go through save().
  // findByIdAndUpdate and friends do not fire the schema's pre('save') hook,
  // so writing a password through one would store it in plaintext.
  //
  // Clearing the reset fields in this same save is what makes a reset token
  // single-use: once the digest is gone, findByResetTokenHash can never match
  // that token again, so a replay is indistinguishable from a forged token.
  async replacePassword(user: User, newPassword: string): Promise<void> {
    user.password = newPassword;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
  }

  async markEmailAsVerified(id: string): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { isEmailVerified: true },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}

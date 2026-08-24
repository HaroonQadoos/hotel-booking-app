import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// `import type` is required: isolatedModules + emitDecoratorMetadata reject a
// value import for a type that only appears in a decorated signature.
import type { AuthUser } from '../auth/types/auth-user';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  // Admin-only: public sign-up belongs to POST /auth/register, which is the
  // route that issues a token. This one exists for staff creating accounts.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateUserDto) {
    const user = await this.userService.create(dto);
    return new UserResponseDto(user);
  }

  // Admin-only: this returns every user's email address.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAll() {
    const users = await this.userService.findAll();
    return users.map((u) => new UserResponseDto(u));
  }

  // Must stay above @Get(':id'). Nest matches routes in declaration order, so
  // a ':id' declared first would capture "me" and try to load it as an id.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthUser) {
    // req.user is only a snapshot from when the token was signed. Read the
    // record back so a changed role — or a deleted account — shows up now
    // rather than whenever the token happens to expire.
    const profile = await this.userService.findOne(user.userId);
    return new UserResponseDto(profile);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    this.assertCanActOn(id, actor);
    const user = await this.userService.findOne(id);
    return new UserResponseDto(user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    this.assertCanActOn(id, actor);
    const user = await this.userService.update(id, dto);
    return new UserResponseDto(user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    this.assertCanActOn(id, actor);
    await this.userService.remove(id);
  }

  // Ownership can't live in RolesGuard: that guard only sees the role, and
  // "is this your own record" depends on the :id in the URL. Signed in is not
  // enough — without this check any user could delete any other account.
  private assertCanActOn(targetId: string, actor: AuthUser): void {
    if (actor.role === 'admin') return;
    if (actor.userId === targetId) return;
    throw new ForbiddenException('You can only act on your own account');
  }
}

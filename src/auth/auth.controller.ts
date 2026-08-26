import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
// `import type` is required: isolatedModules + emitDecoratorMetadata reject a
// value import for a type that only appears in a decorated signature.
import type { AuthUser } from './types/auth-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // GET, because this is the target of a link in an email — the user clicks it
  // in their mail client, which can only issue a GET.
  @Get('verify-email')
  async verifyEmail(@Query() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // Unguarded on purpose: someone locked out of their account has no token to
  // present. 200 rather than the default 201 — nothing was created, and the
  // body is the same whether or not the address is registered.
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // POST, not GET like verify-email: the emailed link goes to the frontend
  // form, which collects the new password and calls this. A GET here would
  // put the token in this server's access logs and in Referer headers.
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // The one route in this group that needs a session. The id comes from the
  // verified token via @CurrentUser, never from the body — taking it from the
  // body would let anyone change anyone's password.
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }
}

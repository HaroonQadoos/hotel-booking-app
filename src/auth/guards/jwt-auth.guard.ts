import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// A named class rather than AuthGuard('jwt') inline at every call site: the
// strategy name is spelled once, and it gives us somewhere to hang custom
// error handling later without touching the controllers.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

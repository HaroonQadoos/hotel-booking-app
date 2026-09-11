import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './cookie';
import type { AuthUser } from './types/auth-user';

const sessionResult = {
  accessToken: 'signed-token',
  user: {
    id: 'user-1',
    name: 'Guest',
    email: 'guest@example.com',
    role: 'user',
  },
};

// Only the two methods the controller touches. Cast because the real Response
// has a hundred other members none of this exercises.
const makeResponse = () =>
  ({ cookie: jest.fn(), clearCookie: jest.fn() }) as unknown as Response &
    ForwardedResponse;

interface ForwardedResponse {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
}

const signedInUser: AuthUser = {
  userId: 'user-1',
  email: 'guest@example.com',
  role: 'user',
};

// Nest stores routing and guard information as metadata on the handler.
// Reflect.getMetadata is untyped, so it is read through these helpers rather
// than sprinkling casts through the assertions.
const handlerOf = (name: string): object =>
  (AuthController.prototype as unknown as Record<string, object>)[name];

const routePath = (name: string) =>
  Reflect.getMetadata('path', handlerOf(name)) as string;

const routeMethod = (name: string) =>
  Reflect.getMetadata('method', handlerOf(name)) as RequestMethod;

const routeHttpCode = (name: string) =>
  Reflect.getMetadata('__httpCode__', handlerOf(name)) as number | undefined;

const routeGuards = (name: string) =>
  (Reflect.getMetadata('__guards__', handlerOf(name)) ?? []) as Array<{
    name: string;
  }>;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    changePassword: jest.Mock;
  };
  let nodeEnv: string;

  beforeEach(async () => {
    nodeEnv = 'test';
    authService = {
      register: jest.fn().mockResolvedValue(sessionResult),
      login: jest.fn().mockResolvedValue(sessionResult),
      forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
      resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
      changePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: { get: () => nodeEnv } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('forgotPassword', () => {
    it('hands the request to the service', async () => {
      const dto = { email: 'guest@example.com' };

      await controller.forgotPassword(dto);

      expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
    });

    it('is a POST on /auth/forgot-password', () => {
      expect(routePath('forgotPassword')).toBe('forgot-password');
      expect(routeMethod('forgotPassword')).toBe(RequestMethod.POST);
    });

    // 200, not Nest's default 201 for POST: nothing was created, and the
    // response deliberately reveals nothing about what happened.
    it('answers 200 rather than 201', () => {
      expect(routeHttpCode('forgotPassword')).toBe(200);
    });
  });

  describe('resetPassword', () => {
    it('hands the request to the service', async () => {
      const dto = { token: 'raw-token', newPassword: 'brand-new-password' };

      await controller.resetPassword(dto);

      expect(authService.resetPassword).toHaveBeenCalledWith(dto);
    });

    it('is a POST on /auth/reset-password', () => {
      expect(routePath('resetPassword')).toBe('reset-password');
      expect(routeMethod('resetPassword')).toBe(RequestMethod.POST);
    });

    it('answers 200 rather than 201', () => {
      expect(routeHttpCode('resetPassword')).toBe(200);
    });
  });

  describe('changePassword', () => {
    // The id comes from the verified token, never from the request body —
    // otherwise the endpoint would let anyone change anyone's password.
    it('changes the password of the authenticated user', async () => {
      const dto = {
        currentPassword: 'current-password',
        newPassword: 'brand-new-password',
      };

      await controller.changePassword(signedInUser, dto);

      expect(authService.changePassword).toHaveBeenCalledWith('user-1', dto);
    });

    it('is a POST on /auth/change-password', () => {
      expect(routePath('changePassword')).toBe('change-password');
      expect(routeMethod('changePassword')).toBe(RequestMethod.POST);
    });

    it('answers 200 rather than 201', () => {
      expect(routeHttpCode('changePassword')).toBe(200);
    });

    // The one route here that must not be reachable anonymously.
    it('is behind JwtAuthGuard', () => {
      const names = routeGuards('changePassword').map((g) => g.name);

      expect(names).toContain('JwtAuthGuard');
    });
  });

  describe('the session cookie', () => {
    it.each([
      ['register', () => authService.register],
      ['login', () => authService.login],
    ])('%s puts the token in an httpOnly cookie', async (handler) => {
      const res = makeResponse();

      await (
        controller[handler as 'register' | 'login'] as (
          dto: never,
          res: Response,
        ) => Promise<unknown>
      )({} as never, res);

      const [name, value, options] = res.cookie.mock.calls[0] as [
        string,
        string,
        { httpOnly?: boolean; sameSite?: string; path?: string },
      ];
      expect(name).toBe(AUTH_COOKIE);
      expect(value).toBe('signed-token');
      expect(options.httpOnly).toBe(true);
      // Withholds the cookie from cross-site POSTs, which is what stops CSRF.
      expect(options.sameSite).toBe('lax');
    });

    // The whole point of the move off localStorage: if the body carried the
    // token, page JavaScript could read it and so could an XSS.
    it.each([
      ['register', () => authService.register],
      ['login', () => authService.login],
    ])('%s does not return the token in the body', async (handler) => {
      const result = await (
        controller[handler as 'register' | 'login'] as (
          dto: never,
          res: Response,
        ) => Promise<unknown>
      )({} as never, makeResponse());

      expect(result).not.toHaveProperty('accessToken');
      expect(result).toEqual({ user: sessionResult.user });
    });

    it('marks the cookie secure only in production', async () => {
      const devRes = makeResponse();
      await controller.login({} as never, devRes);
      expect(
        (devRes.cookie.mock.calls[0][2] as { secure: boolean }).secure,
      ).toBe(false);

      nodeEnv = 'production';
      const prodRes = makeResponse();
      await controller.login({} as never, prodRes);
      expect(
        (prodRes.cookie.mock.calls[0][2] as { secure: boolean }).secure,
      ).toBe(true);
    });

    it('clears the cookie on logout', () => {
      const res = makeResponse();

      controller.logout(res);

      const [name, options] = res.clearCookie.mock.calls[0] as [
        string,
        { path?: string; maxAge?: number },
      ];
      expect(name).toBe(AUTH_COOKIE);
      expect(options.path).toBe('/');
      // clearCookie must not carry maxAge, or the attributes stop matching.
      expect(options.maxAge).toBeUndefined();
    });

    it('is a POST on /auth/logout answering 200', () => {
      expect(routePath('logout')).toBe('logout');
      expect(routeMethod('logout')).toBe(RequestMethod.POST);
      expect(routeHttpCode('logout')).toBe(200);
    });

    // Signing out must work when the token has already expired — that is
    // precisely when someone wants the cookie gone.
    it('logout is reachable without a valid token', () => {
      expect(routeGuards('logout')).toHaveLength(0);
    });
  });

  describe('the anonymous reset routes', () => {
    it.each(['forgotPassword', 'resetPassword'])(
      '%s is reachable without a token — a locked-out user has none',
      (handler) => {
        expect(routeGuards(handler)).toHaveLength(0);
      },
    );
  });
});

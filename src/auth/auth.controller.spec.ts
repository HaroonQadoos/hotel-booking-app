import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthUser } from './types/auth-user';

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
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    changePassword: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
      resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
      changePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
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

  describe('the anonymous reset routes', () => {
    it.each(['forgotPassword', 'resetPassword'])(
      '%s is reachable without a token — a locked-out user has none',
      (handler) => {
        expect(routeGuards(handler)).toHaveLength(0);
      },
    );
  });
});

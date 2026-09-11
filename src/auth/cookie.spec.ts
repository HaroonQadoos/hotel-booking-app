import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE_MS,
  authCookieOptions,
  clearAuthCookieOptions,
} from './cookie';

describe('auth cookie', () => {
  it('is named consistently', () => {
    expect(AUTH_COOKIE).toBe('access_token');
  });

  describe('authCookieOptions', () => {
    it('is httpOnly, so page JavaScript cannot read the session', () => {
      expect(authCookieOptions(false).httpOnly).toBe(true);
    });

    // The browser sends cookies on its own, so CSRF protection has to come
    // from somewhere. 'lax' withholds the cookie from cross-site POST, PATCH
    // and DELETE — every state-changing route in this API.
    it('is sameSite lax', () => {
      expect(authCookieOptions(false).sameSite).toBe('lax');
    });

    // Over plain http a secure cookie is dropped silently: every request then
    // looks signed out with nothing in the logs to explain why.
    it('is secure in production and not over local http', () => {
      expect(authCookieOptions(true).secure).toBe(true);
      expect(authCookieOptions(false).secure).toBe(false);
    });

    // Guards the invariant the comment in cookie.ts describes: a cookie that
    // outlives its token makes the browser send a credential already certain
    // to be rejected.
    it('expires with the token, not after it', () => {
      expect(authCookieOptions(false).maxAge).toBe(AUTH_COOKIE_MAX_AGE_MS);
      expect(AUTH_COOKIE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('clearAuthCookieOptions', () => {
    // clearCookie only matches when the attributes match. Drift here means
    // pressing sign out leaves the user signed in.
    it('repeats the attributes the cookie was set with', () => {
      const set = authCookieOptions(true);
      const clear = clearAuthCookieOptions(true);

      expect(clear.path).toBe(set.path);
      expect(clear.sameSite).toBe(set.sameSite);
      expect(clear.secure).toBe(set.secure);
      expect(clear.httpOnly).toBe(set.httpOnly);
    });

    it('carries no maxAge', () => {
      expect(clearAuthCookieOptions(false).maxAge).toBeUndefined();
    });
  });
});

// auth/cookie.ts
import type { CookieOptions } from 'express';

// The name the session cookie is stored under. Nothing in the browser can read
// its value — that is the point of httpOnly — so anything that needs to know
// whether a visitor is signed in asks the API (GET /users/me) instead of
// inspecting a token.
export const AUTH_COOKIE = 'access_token';

// Must track signOptions.expiresIn in auth.module.ts. A cookie that outlives
// its token leaves the browser cheerfully sending a credential the server has
// already decided to reject, which surfaces as a confusing 401 rather than a
// clean signed-out state.
export const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function baseOptions(isProduction: boolean): CookieOptions {
  return {
    // Unreadable from document.cookie, so an XSS on the page cannot exfiltrate
    // the session the way it could lift a token out of localStorage.
    httpOnly: true,
    // The browser attaches cookies automatically, which reintroduces the CSRF
    // risk that a bearer header does not have. 'lax' withholds the cookie from
    // cross-site POST/PATCH/DELETE, and every state-changing route here is one
    // of those.
    sameSite: 'lax',
    // Must stay false over plain http, or the browser silently drops the
    // cookie and every request looks signed out with no error to explain it.
    secure: isProduction,
    path: '/',
  };
}

export function authCookieOptions(isProduction: boolean): CookieOptions {
  return { ...baseOptions(isProduction), maxAge: AUTH_COOKIE_MAX_AGE_MS };
}

// Clearing only works when the attributes match the ones the cookie was set
// with. A mismatch on path or sameSite leaves the original cookie in place and
// the user stays signed in after pressing sign out.
export function clearAuthCookieOptions(isProduction: boolean): CookieOptions {
  return baseOptions(isProduction);
}

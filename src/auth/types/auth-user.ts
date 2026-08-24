// The shape JwtStrategy.validate() puts on req.user. This is decoded token
// data, not a database record — it reflects the moment the token was signed.
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

// What AuthService.signToken() puts inside the JWT. `sub` is the JWT standard
// claim for the subject (the user id).
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface EmailVerificationPayload {
  sub: string;
}
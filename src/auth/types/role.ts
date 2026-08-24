// Mirrors the enum on UserSchema.role. Keep the two in step — the schema is the
// source of truth for what the database will accept.
export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

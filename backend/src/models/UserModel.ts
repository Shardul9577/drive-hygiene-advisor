import { config } from "../config/env.js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  /**
   * Short-lived Google access token, held only for the life of the session.
   *
   * No refresh token is stored: the app does not request offline access, so an
   * idle session ends in a re-authentication rather than in this process
   * holding a durable credential to someone's Drive.
   */
  accessToken: string;
  /** Wall-clock expiry for the access token (approx; Google issues ~1h tokens). */
  accessTokenExpiresAt: number;
  provider: "google";
  createdAt: string;
  lastLoginAt: string;
}

/**
 * In-memory user store for the prototype.
 * In production this would be a database (Model layer).
 */
const usersByGoogleId = new Map<string, UserProfile>();

export const UserModel = {
  upsertFromGoogle(input: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    accessToken: string;
  }): UserProfile {
    const existing = usersByGoogleId.get(input.id);
    const now = new Date().toISOString();
    const user: UserProfile = {
      id: input.id,
      email: input.email,
      name: input.name,
      picture: input.picture,
      accessToken: input.accessToken,
      accessTokenExpiresAt: Date.now() + config.accessTokenTtlMs,
      provider: "google",
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
    };
    usersByGoogleId.set(input.id, user);
    return user;
  },

  findById(id: string): UserProfile | undefined {
    return usersByGoogleId.get(id);
  },

  isAccessTokenExpired(user: UserProfile): boolean {
    return Date.now() >= user.accessTokenExpiresAt;
  },

  toPublic(user: UserProfile) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      tokenExpiresAt: new Date(user.accessTokenExpiresAt).toISOString(),
      tokenExpired: UserModel.isAccessTokenExpired(user),
    };
  },
};

import { randomBytes } from "node:crypto";

export interface AddonHandoffPayload {
  accessToken: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  expiresAt: number;
}

/** One-time tickets bridging Google Add-on OAuth → web session. */
const tickets = new Map<string, AddonHandoffPayload>();

const DEFAULT_TTL_MS = 2 * 60 * 1000;

function pruneExpired(now = Date.now()): void {
  for (const [key, value] of tickets) {
    if (value.expiresAt <= now) tickets.delete(key);
  }
}

export const AddonHandoff = {
  create(
    input: Omit<AddonHandoffPayload, "expiresAt">,
    ttlMs: number = DEFAULT_TTL_MS,
  ): string {
    pruneExpired();
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, { ...input, expiresAt: Date.now() + ttlMs });
    return ticket;
  },

  /** Returns the payload once, then invalidates the ticket. */
  consume(ticket: string): AddonHandoffPayload | null {
    pruneExpired();
    const payload = tickets.get(ticket);
    if (!payload) return null;
    tickets.delete(ticket);
    if (Date.now() >= payload.expiresAt) return null;
    return payload;
  },
};

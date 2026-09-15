import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

/**
 * A predictable session secret lets anyone forge a session cookie, so the
 * development convenience of having a default must not follow the app into
 * production. Locally the fallback keeps setup to one command; in production a
 * missing SESSION_SECRET is a startup failure rather than a silent weakness.
 */
function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (nodeEnv === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production. Refusing to start with the development default.",
    );
  }
  return "dev-session-secret-change-me";
}

/**
 * FRONTEND_URL may be a single origin or a comma-separated allowlist.
 * The first entry is the default redirect target after OAuth locally.
 * In production we prefer an https origin so Google Add-on openLink never
 * points at localhost when both are listed.
 */
function resolveFrontendOrigins(): string[] {
  const fromPrimary = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const fromExtra = process.env.FRONTEND_URLS ?? "";
  const origins = [...fromPrimary.split(","), ...fromExtra.split(",")]
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set(origins)];
}

function resolveDefaultFrontendUrl(origins: string[]): string {
  if (nodeEnv === "production") {
    const httpsOrigin = origins.find((origin) => origin.startsWith("https://"));
    if (httpsOrigin) return httpsOrigin;
  }
  return origins[0] ?? "http://localhost:5173";
}

const frontendOrigins = resolveFrontendOrigins();
const frontendUrl = resolveDefaultFrontendUrl(frontendOrigins);

/**
 * Vercel (HTTPS) + Render (HTTPS) are different sites. Credentialed fetches only
 * keep the session cookie when it is SameSite=None; Secure. Local Vite → local
 * API can stay on Lax.
 */
function resolveCookiePolicy(): { sameSite: "lax" | "none"; secure: boolean } {
  if (process.env.COOKIE_SAME_SITE === "none") {
    return { sameSite: "none", secure: true };
  }
  if (process.env.COOKIE_SAME_SITE === "lax") {
    return { sameSite: "lax", secure: nodeEnv === "production" };
  }
  const needsCrossSite = frontendOrigins.some((origin) => origin.startsWith("https://"));
  if (nodeEnv === "production" || needsCrossSite) {
    return { sameSite: "none", secure: true };
  }
  return { sameSite: "lax", secure: false };
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  /** Default post-OAuth / add-on handoff redirect. */
  frontendUrl,
  /** All origins allowed for CORS + OAuth return redirects. */
  frontendOrigins,
  cookie: resolveCookiePolicy(),
  sessionSecret: resolveSessionSecret(),
  /**
   * Access tokens from Google last ~1 hour. The session cookie is capped to the
   * same window so a cookie cannot outlive a usable Drive credential.
   */
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_MS ?? 55 * 60 * 1000),
  /** Google access tokens are typically valid for 3600s; refresh ~5 min early. */
  accessTokenTtlMs: Number(process.env.ACCESS_TOKEN_TTL_MS ?? 55 * 60 * 1000),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      "http://localhost:4000/api/auth/google/callback",
  },
  driveScope: "https://www.googleapis.com/auth/drive.metadata.readonly",
  useMockDrive: process.env.USE_MOCK_DRIVE === "true",
  scan: {
    // MVP default: ~1,000 files. Override with SCAN_MAX_PAGES in production.
    defaultMaxPages: Number(process.env.SCAN_MAX_PAGES ?? 10),
    hardCapMaxPages: Number(process.env.SCAN_MAX_PAGES_HARD_CAP ?? 50),
  },
};

export function assertGoogleConfigured(): void {
  required("GOOGLE_CLIENT_ID", config.google.clientId || undefined);
  required("GOOGLE_CLIENT_SECRET", config.google.clientSecret || undefined);
}

export function isGoogleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

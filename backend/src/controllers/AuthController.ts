import type { Request, Response } from "express";
import passport from "passport";
import { config, isGoogleConfigured } from "../config/env.js";
import { UserModel } from "../models/UserModel.js";
import { AddonHandoff } from "../services/auth/addonHandoff.js";
import { audit } from "../services/audit/auditLog.js";

declare module "express-session" {
  interface SessionData {
    oauthReturnOrigin?: string;
  }
}

function isAllowedOrigin(origin: string | undefined): origin is string {
  return Boolean(origin && config.frontendOrigins.includes(origin.replace(/\/$/, "")));
}

/** Prefer the frontend that started login; fall back to the default allowlisted origin. */
function redirectBase(req: Request): string {
  const fromSession = req.session.oauthReturnOrigin;
  if (isAllowedOrigin(fromSession)) return fromSession.replace(/\/$/, "");
  return config.frontendUrl;
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export const AuthController = {
  status(_req: Request, res: Response): void {
    res.json({
      googleConfigured: isGoogleConfigured(),
      loginUrl: "/api/auth/google",
      callbackUrl: config.google.callbackUrl,
      frontendUrl: config.frontendUrl,
      frontendOrigins: config.frontendOrigins,
    });
  },

  async googleStart(req: Request, res: Response, next: (err?: unknown) => void): Promise<void> {
    if (!isGoogleConfigured()) {
      res.status(503).json({
        error:
          "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env",
        code: "OAUTH_NOT_CONFIGURED",
      });
      return;
    }

    const returnOrigin =
      typeof req.query.returnOrigin === "string" ? req.query.returnOrigin : undefined;
    if (isAllowedOrigin(returnOrigin)) {
      req.session.oauthReturnOrigin = returnOrigin.replace(/\/$/, "");
    } else {
      delete req.session.oauthReturnOrigin;
    }

    try {
      // Persist returnOrigin + let Passport write OAuth `state` before redirecting.
      // Without this, MemoryStore can lose the session mid-hop → auth_failed.
      await saveSession(req);
    } catch (err) {
      next(err);
      return;
    }

    // No accessType: "offline". Offline access exists to obtain a refresh token
    // for acting on a user's behalf while they are away; this product only
    // reads metadata while someone is looking at the dashboard, so asking for a
    // durable grant would request more than it needs and force the consent
    // screen on every sign-in. CSRF state is configured on the strategy.
    passport.authenticate("google", {
      scope: ["openid", "email", "profile", config.driveScope],
    })(req, res, next);
  },

  googleCallback(req: Request, res: Response, next: (err?: unknown) => void): void {
    const frontend = redirectBase(req);

    if (!isGoogleConfigured()) {
      res.redirect(`${frontend}/login?error=oauth_not_configured`);
      return;
    }

    passport.authenticate("google", (err: Error | null, user: Express.User | false) => {
      if (err) {
        console.error("[auth] Google callback error:", err.message);
        res.redirect(`${frontend}/login?error=${encodeURIComponent(err.message)}`);
        return;
      }
      if (!user) {
        res.redirect(`${frontend}/login?error=auth_failed`);
        return;
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          res.redirect(`${frontend}/login?error=login_failed`);
          return;
        }
        delete req.session.oauthReturnOrigin;
        try {
          // Ensure the session cookie is committed before leaving Render/Vercel.
          await saveSession(req);
        } catch (saveErr) {
          console.error("[auth] session save failed after login:", saveErr);
          res.redirect(`${frontend}/login?error=login_failed`);
          return;
        }
        res.redirect(`${frontend}/dashboard`);
      });
    })(req, res, next);
  },

  /**
   * One-time handoff from Google Workspace Add-on → web session.
   * Browser hits this via the Vercel /api rewrite so the session cookie is
   * bound to the frontend host (same pattern as OAuth callback).
   */
  async addonHandoff(req: Request, res: Response): Promise<void> {
    const frontend = config.frontendUrl;
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
    const payload = ticket ? AddonHandoff.consume(ticket) : null;

    if (!payload) {
      res.redirect(`${frontend}/login?error=addon_handoff_expired`);
      return;
    }

    const user = UserModel.upsertFromGoogle({
      id: payload.googleId,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      accessToken: payload.accessToken,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        req.logIn(user, (err) => (err ? reject(err) : resolve()));
      });
      await saveSession(req);
      void audit({ type: "auth.login", userId: user.id, email: user.email });
      res.redirect(`${frontend}/dashboard`);
    } catch (err) {
      console.error("[auth] addon handoff login failed:", err);
      res.redirect(`${frontend}/login?error=addon_handoff_failed`);
    }
  },

  me(req: Request, res: Response): void {
    // Always 200 — logged-out is a normal state, not an API error.
    // (A 401 here previously broke the login page: Promise.all failed
    // before googleConfigured could be read from /api/auth/status.)
    if (!req.isAuthenticated?.() || !req.user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({
      authenticated: true,
      user: UserModel.toPublic(req.user),
    });
  },

  logout(req: Request, res: Response): void {
    req.logout((err) => {
      if (err) {
        res.status(500).json({ error: "Logout failed", code: "LOGOUT_FAILED" });
        return;
      }
      req.session.destroy(() => {
        res.clearCookie("connect.sid", {
          httpOnly: true,
          sameSite: config.cookie.sameSite,
          secure: config.cookie.secure,
        });
        res.json({ ok: true });
      });
    });
  },
};

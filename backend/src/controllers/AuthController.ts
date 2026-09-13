import type { Request, Response } from "express";
import passport from "passport";
import { config, isGoogleConfigured } from "../config/env.js";
import { UserModel } from "../models/UserModel.js";

export const AuthController = {
  status(_req: Request, res: Response): void {
    res.json({
      googleConfigured: isGoogleConfigured(),
      loginUrl: "/api/auth/google",
      callbackUrl: config.google.callbackUrl,
      frontendUrl: config.frontendUrl,
    });
  },

  googleStart(req: Request, res: Response, next: (err?: unknown) => void): void {
    if (!isGoogleConfigured()) {
      res.status(503).json({
        error:
          "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env",
        code: "OAUTH_NOT_CONFIGURED",
      });
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
    if (!isGoogleConfigured()) {
      res.redirect(`${config.frontendUrl}/login?error=oauth_not_configured`);
      return;
    }

    passport.authenticate("google", (err: Error | null, user: Express.User | false) => {
      if (err) {
        console.error("[auth] Google callback error:", err.message);
        res.redirect(
          `${config.frontendUrl}/login?error=${encodeURIComponent(err.message)}`,
        );
        return;
      }
      if (!user) {
        res.redirect(`${config.frontendUrl}/login?error=auth_failed`);
        return;
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) {
          res.redirect(`${config.frontendUrl}/login?error=login_failed`);
          return;
        }
        // Same Google OAuth flow covers first-time sign-up and returning login
        res.redirect(`${config.frontendUrl}/dashboard`);
      });
    })(req, res, next);
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
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  },
};

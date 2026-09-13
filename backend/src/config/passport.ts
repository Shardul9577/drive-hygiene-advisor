import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { config, isGoogleConfigured } from "../config/env.js";
import { UserModel, type UserProfile } from "../models/UserModel.js";
import { audit } from "../services/audit/auditLog.js";

export function configurePassport(): void {
  passport.serializeUser((user, done) => {
    done(null, (user as UserProfile).id);
  });

  passport.deserializeUser((id: string, done) => {
    const user = UserModel.findById(id);
    if (!user) {
      done(null, false);
      return;
    }
    done(null, user);
  });

  if (!isGoogleConfigured()) {
    console.warn(
      "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing. Google OAuth routes will return a setup error until configured.",
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        // CSRF protection for the OAuth flow. passport-oauth2 uses a NullStore
        // unless this is set, which means the callback would accept an
        // authorization code that this session never asked for (login CSRF).
        // With it, a signed state value is kept in the session and verified on
        // return. It must be set on the strategy, not on authenticate().
        state: true,
      },
      (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (error: Error | null, user?: UserProfile) => void,
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            done(new Error("Google account did not return an email address."));
            return;
          }

          // The refresh token is deliberately not stored. We do not request
          // offline access, so Google does not issue one; retaining a long-lived
          // credential for a tool that only reads metadata during an
          // interactive session would be storing more than the product needs.
          const user = UserModel.upsertFromGoogle({
            id: profile.id,
            email,
            name: profile.displayName || email,
            picture: profile.photos?.[0]?.value,
            accessToken,
          });

          void audit({ type: "auth.login", userId: user.id, email: user.email });
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

declare global {
  namespace Express {
    interface User extends UserProfile {}
  }
}

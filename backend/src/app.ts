import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
// memorystore ships CJS; default import works under NodeNext/tsx.
import createMemoryStore from "memorystore";
import { config } from "./config/env.js";
import { configurePassport } from "./config/passport.js";
import { authRoutes } from "./routes/authRoutes.js";
import { scanRoutes } from "./routes/scanRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

configurePassport();

const MemoryStore = createMemoryStore(session);

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      // API serves JSON to a separate Vite origin; CSP is owned by the frontend.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: config.frontendOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    session({
      name: "connect.sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      // memorystore prunes expired sessions; default MemoryStore never does and
      // leaks. Multi-instance production should swap this for Redis/Postgres.
      store: new MemoryStore({
        checkPeriod: 15 * 60 * 1000,
      }),
      cookie: {
        httpOnly: true,
        // Production frontend (Vercel) and API are different sites; lax blocks
        // credentialed cross-origin fetches. Local Vite → local API can use lax.
        sameSite: config.nodeEnv === "production" ? "none" : "lax",
        secure: config.nodeEnv === "production",
        // Aligned with Google access-token lifetime so the cookie cannot outlive
        // a usable Drive credential.
        maxAge: config.sessionMaxAgeMs,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Rate-limit auth and scan *starts* only. Progress polling (GET /api/scan/:id)
  // must not share this budget — the UI hits it every ~800ms while a job runs.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "drive-hygiene-backend" });
  });

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/scan", scanRoutes);

  app.use(errorHandler);
  return app;
}

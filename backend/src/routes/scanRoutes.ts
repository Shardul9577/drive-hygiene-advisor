import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ScanController } from "../controllers/ScanController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const scanRoutes = Router();

// Every scan route requires a session; none of them are public.
scanRoutes.use(requireAuth);

// Only POST / (start / continue) is rate-limited. GET progress + results poll
// frequently and must stay uncapped for the async scan UX to work.
const startScanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many scan requests. Please wait a few minutes and try again.",
    code: "RATE_LIMITED",
  },
});

scanRoutes.post("/", startScanLimiter, (req, res, next) => {
  ScanController.scan(req, res).catch(next);
});

scanRoutes.get("/latest", (req, res, next) => {
  ScanController.latest(req, res).catch(next);
});

scanRoutes.get("/history", (req, res, next) => {
  ScanController.history(req, res).catch(next);
});

// Registered before /:id so "latest" / "history" are never swallowed as an id.
scanRoutes.get("/:id/results/:kind", (req, res, next) => {
  ScanController.results(req, res).catch(next);
});

scanRoutes.get("/:id", (req, res, next) => {
  ScanController.getJob(req, res).catch(next);
});

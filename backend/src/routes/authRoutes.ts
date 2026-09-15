import { Router } from "express";
import { AuthController } from "../controllers/AuthController.js";

export const authRoutes = Router();

authRoutes.get("/status", AuthController.status);
authRoutes.get("/google", (req, res, next) => {
  void AuthController.googleStart(req, res, next);
});
authRoutes.get("/google/callback", AuthController.googleCallback);
authRoutes.get("/addon-handoff", (req, res) => {
  void AuthController.addonHandoff(req, res);
});
authRoutes.get("/me", AuthController.me);
authRoutes.post("/logout", AuthController.logout);

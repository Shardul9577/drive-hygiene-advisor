import { Router } from "express";
import { AuthController } from "../controllers/AuthController.js";

export const authRoutes = Router();

authRoutes.get("/status", AuthController.status);
authRoutes.get("/google", AuthController.googleStart);
authRoutes.get("/google/callback", AuthController.googleCallback);
authRoutes.get("/me", AuthController.me);
authRoutes.post("/logout", AuthController.logout);

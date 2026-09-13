import type { NextFunction, Request, Response } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated?.() && req.user) {
    next();
    return;
  }
  res.status(401).json({
    error: "Authentication required. Please sign in with Google.",
    code: "UNAUTHENTICATED",
  });
}

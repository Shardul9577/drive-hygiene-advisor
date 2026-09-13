import type { NextFunction, Request, Response } from "express";

/**
 * Last-resort handler for errors no route dealt with.
 *
 * The message is logged but not returned. Anything reaching here is unexpected,
 * so its text is an internal detail — stack frames, file paths, driver messages
 * — and echoing it to the client leaks implementation detail without helping the
 * user. Errors the user can actually act on (expired credentials, Drive rate
 * limits, a partial scan) are turned into deliberate messages at the point they
 * are understood, in ScanController and the retry helper.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[error]", err instanceof Error ? err.stack ?? err.message : err);

  if (res.headersSent) return;

  res.status(500).json({
    error: "Something went wrong on our side. Please try again.",
    code: "INTERNAL_ERROR",
  });
}

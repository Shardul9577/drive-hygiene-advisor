import type { DriveFile } from "../../types/hygiene";

export interface FilePage {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * The single boundary between this product and Google Drive.
 *
 * Everything above this interface (scan pipeline, analysis engines, HTTP layer,
 * UI) is written against DriveFile — a normalised, Google-agnostic shape.
 * Swapping GoogleDriveRepository for MockDriveRepository therefore requires no
 * change anywhere else in the codebase.
 *
 * listFilesPage returns exactly one page plus an opaque cursor. It deliberately
 * does NOT expose a "fetch everything" method, because no caller should be able
 * to request an unbounded result set.
 */
export interface DriveRepository {
  readonly source: "google" | "mock";
  listFilesPage(pageToken?: string, pageSize?: number): Promise<FilePage>;
}

/** Drive allows up to 1000; 100 keeps individual requests fast and retryable. */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * MVP page budget: 10 × 100 ≈ 1,000 files. Production raises SCAN_MAX_PAGES
 * (or removes the cap behind a background worker).
 */
export const MAX_PAGES_DEFAULT = 10;

/** Hard ceiling including Continue expansions. Raise in production via env. */
export const MAX_PAGES_HARD_CAP = 50;

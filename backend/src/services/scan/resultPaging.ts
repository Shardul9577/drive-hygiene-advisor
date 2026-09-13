import type { HygieneReport } from "../../types/hygiene";

export type ResultKind = "duplicates" | "large-files" | "risks";

export interface ResultPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Everything in a report EXCEPT the detail arrays.
 *
 * Sending the full report in one response would reintroduce, at the HTTP layer,
 * exactly the unbounded-payload problem the scan pipeline was built to avoid: a
 * Drive with 40,000 duplicate groups would produce a response no browser should
 * be asked to parse. The summary is bounded by construction — counts, a capped
 * attention list, and one row per MIME category — so its size does not grow
 * with the size of the Drive.
 */
export type HygieneSummary = Omit<HygieneReport, "duplicates" | "largeFiles" | "risks"> & {
  counts: {
    duplicates: number;
    largeFiles: number;
    risks: number;
  };
};

export function summariseReport(report: HygieneReport): HygieneSummary {
  const { duplicates, largeFiles, risks, ...bounded } = report;
  return {
    ...bounded,
    counts: {
      duplicates: duplicates.length,
      largeFiles: largeFiles.length,
      risks: risks.length,
    },
  };
}

const MAX_PAGE_SIZE = 50;

/**
 * Serves one page of stored analysis results.
 *
 * This is the read side of the pipeline: analysis was persisted once, and the
 * UI pages through it on demand. Slicing an in-memory array is the prototype's
 * implementation; the call shape (offset + limit, total count) is deliberately
 * the same one a `LIMIT … OFFSET …` query would satisfy, so moving the store to
 * Postgres does not change this interface.
 */
export function pageResults(
  report: HygieneReport,
  kind: ResultKind,
  requestedPage: number,
  requestedSize: number,
): ResultPage<unknown> {
  const source =
    kind === "duplicates"
      ? report.duplicates
      : kind === "large-files"
        ? report.largeFiles
        : report.risks;

  const pageSize = clamp(requestedSize, 1, MAX_PAGE_SIZE);
  const total = source.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clamp(requestedPage, 0, totalPages - 1);
  const start = page * pageSize;

  return {
    items: source.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages - 1,
    hasPrevious: page > 0,
  };
}

export function isResultKind(value: string): value is ResultKind {
  return value === "duplicates" || value === "large-files" || value === "risks";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

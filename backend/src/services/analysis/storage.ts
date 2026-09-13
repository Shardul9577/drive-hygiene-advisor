import type { DriveFile } from "../../types/hygiene";

/**
 * Storage helpers used by StorageAccumulator (accumulators.ts), which does the
 * actual folding. Nothing here takes a full file list.
 */

/**
 * Bytes this file charges against the owner's Drive quota.
 *
 * `size` is the size of the current version's content; `quotaBytesUsed` is what
 * Drive actually bills, which includes retained revisions. For a heavily-edited
 * file the two differ substantially, so storage figures use `quotaBytesUsed`
 * whenever Drive reports it.
 *
 * Duplicate detection deliberately does NOT use this value — it compares
 * content, and two byte-identical files with different revision histories have
 * the same `size` but different `quotaBytesUsed`.
 *
 * Google-native files (Docs, Sheets, Slides) report no `size` and a
 * `quotaBytesUsed` of 0 because they do not consume Drive quota. They resolve to
 * undefined here and are excluded from storage figures rather than counted as
 * zero, which would add meaningless 0% rows to the breakdown.
 */
export function storageBytesOf(file: DriveFile): number | undefined {
  for (const value of [file.quotaBytesUsed, file.size]) {
    if (typeof value === "number" && value > 0) return value;
  }
  return undefined;
}

export function categoriseMime(mimeType: string): string {
  if (mimeType.startsWith("video/")) return "Videos";
  if (mimeType.startsWith("image/")) return "Images";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType === "application/pdf") return "PDFs";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  ) {
    return "Archives";
  }
  if (mimeType.startsWith("application/vnd.google-apps.")) return "Google Docs";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("csv")
  ) {
    return "Spreadsheets";
  }
  if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return "Presentations";
  }
  if (mimeType.includes("word") || mimeType.includes("document")) return "Documents";
  return "Other";
}

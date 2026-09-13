/**
 * Filename normalisation used by duplicate grouping.
 *
 * The grouping itself lives in DuplicateAccumulator (accumulators.ts), because
 * it has to fold page by page rather than run over a complete file list. This
 * module holds only the naming rule, which both the accumulator and its tests
 * depend on.
 *
 * Decoration stripping is what lets "invoice.pdf", "invoice copy.pdf" and
 * "invoice (1).pdf" share one name key. It is deliberately conservative: the
 * name key is never sufficient on its own, since the accumulator also requires
 * MIME type and exact byte size to agree before grouping anything.
 */
export function normalizeFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s*\(\d+\)\s*/g, " ")
    .replace(/\s+copy\b/g, " ")
    .replace(/\s+final\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

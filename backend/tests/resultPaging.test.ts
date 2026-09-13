import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageResults, summariseReport } from "../src/services/scan/resultPaging";
import type { HygieneReport } from "../src/types/hygiene";

function reportWith(largeFileCount: number): HygieneReport {
  return {
    score: 80,
    label: "Good",
    filesAnalysed: largeFileCount,
    riskyFileCount: 0,
    duplicateGroupCount: 0,
    largeFilesBytes: 0,
    scannedAt: new Date().toISOString(),
    source: "mock",
    storageByType: [],
    attention: [],
    warnings: [],
    pagination: { pagesFetched: 1, pageSize: 100, truncated: false },
    duplicates: [],
    risks: [],
    largeFiles: Array.from({ length: largeFileCount }, (_, i) => ({
      file: {
        id: `f${i}`,
        name: `file-${i}`,
        mimeType: "application/pdf",
        size: 1000 - i,
      },
      sizeBytes: 1000 - i,
    })),
  };
}

describe("result paging", () => {
  it("returns the requested slice with accurate navigation flags", () => {
    const page = pageResults(reportWith(25), "large-files", 1, 10);

    assert.equal(page.items.length, 10);
    assert.equal(page.page, 1);
    assert.equal(page.total, 25);
    assert.equal(page.totalPages, 3);
    assert.equal(page.hasNext, true);
    assert.equal(page.hasPrevious, true);
  });

  it("clamps a page beyond the end to the last page instead of returning nothing", () => {
    // A stale client asking for page 99 should see real data, not an empty list
    // it cannot distinguish from "no results".
    const page = pageResults(reportWith(25), "large-files", 99, 10);

    assert.equal(page.page, 2);
    assert.equal(page.items.length, 5);
    assert.equal(page.hasNext, false);
  });

  it("caps page size so one request cannot pull the whole result set", () => {
    const page = pageResults(reportWith(500), "large-files", 0, 100_000);

    assert.equal(page.pageSize, 50);
    assert.equal(page.items.length, 50);
  });

  it("rejects non-numeric paging input by falling back to the first page", () => {
    const page = pageResults(reportWith(25), "large-files", Number.NaN, Number.NaN);

    assert.equal(page.page, 0);
    assert.equal(page.pageSize, 1);
  });

  it("reports an empty result set as a single empty page", () => {
    const page = pageResults(reportWith(0), "large-files", 0, 10);

    assert.equal(page.total, 0);
    assert.equal(page.totalPages, 1);
    assert.equal(page.hasNext, false);
    assert.equal(page.hasPrevious, false);
  });

  it("strips detail arrays from the summary but keeps their counts", () => {
    // The summary must stay bounded: its size cannot grow with the Drive, or
    // the API response becomes the new unbounded-memory problem.
    const summary = summariseReport(reportWith(300)) as Record<string, unknown>;

    assert.equal(summary.largeFiles, undefined);
    assert.equal(summary.duplicates, undefined);
    assert.equal(summary.risks, undefined);
    assert.deepEqual(summary.counts, { duplicates: 0, largeFiles: 300, risks: 0 });
    assert.equal(summary.score, 80);
  });
});

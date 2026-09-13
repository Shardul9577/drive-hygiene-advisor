import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryScanJobStore } from "../src/services/scan/ScanJobStore";
import { runScan } from "../src/services/scan/scanRunner";
import { MockDriveRepository, MOCK_FILES } from "../src/services/drive/mockRepository";
import type { DriveRepository, FilePage } from "../src/services/drive/repository";

async function startJob(store: InMemoryScanJobStore) {
  return store.create({ userId: "u1", source: "mock" });
}

describe("scan pipeline", () => {
  it("walks every page and completes", async () => {
    const store = new InMemoryScanJobStore();
    const job = await startJob(store);

    const finished = await runScan({
      repository: new MockDriveRepository(),
      store,
      jobId: job.id,
      pageSize: 4,
      ownerEmail: "demo.user@example.com",
    });

    assert.equal(finished.status, "completed");
    assert.equal(finished.filesSeen, MOCK_FILES.length);
    assert.ok(finished.report);
  });

  it("checkpoints the cursor after every page, not just at the end", async () => {
    const store = new InMemoryScanJobStore();
    const job = await startJob(store);

    const checkpoints: number[] = [];
    const original = store.update.bind(store);
    store.update = async (id, patch) => {
      if (typeof patch.pagesFetched === "number") checkpoints.push(patch.pagesFetched);
      return original(id, patch);
    };

    await runScan({
      repository: new MockDriveRepository(),
      store,
      jobId: job.id,
      pageSize: 4,
    });

    // 15 mock files at 4 per page = 4 pages, each one checkpointed.
    assert.deepEqual(checkpoints.slice(0, 4), [1, 2, 3, 4]);
  });

  it("keeps partial results and a resume cursor when a page fails", async () => {
    const store = new InMemoryScanJobStore();
    const job = await startJob(store);

    // Serves one good page, then fails — simulating a rate limit mid-scan.
    const flaky: DriveRepository = {
      source: "mock",
      async listFilesPage(pageToken?: string): Promise<FilePage> {
        if (!pageToken) {
          return { files: MOCK_FILES.slice(0, 5), nextPageToken: "page-2" };
        }
        throw new Error("Rate limit exceeded after retries.");
      },
    };

    const finished = await runScan({ repository: flaky, store, jobId: job.id });

    assert.equal(finished.status, "interrupted");
    assert.equal(finished.filesSeen, 5, "files from the good page are retained");
    assert.equal(finished.cursor, "page-2", "resume point is saved");
    assert.ok(finished.report, "a partial report is still produced");
    assert.match(finished.warnings.join(" "), /Stopped at page 2/);
  });

  it("resumes from a supplied cursor instead of restarting", async () => {
    const store = new InMemoryScanJobStore();
    const job = await startJob(store);
    const requested: (string | undefined)[] = [];

    const recording: DriveRepository = {
      source: "mock",
      async listFilesPage(pageToken?: string): Promise<FilePage> {
        requested.push(pageToken);
        return { files: MOCK_FILES.slice(0, 2), nextPageToken: undefined };
      },
    };

    await runScan({
      repository: recording,
      store,
      jobId: job.id,
      startCursor: "8",
    });

    assert.deepEqual(requested, ["8"]);
  });

  it("stops at the prototype page cap and says so", async () => {
    const store = new InMemoryScanJobStore();
    const job = await startJob(store);

    // Endless Drive — the cap is the only thing that halts this.
    const endless: DriveRepository = {
      source: "mock",
      async listFilesPage(): Promise<FilePage> {
        return { files: MOCK_FILES.slice(0, 2), nextPageToken: "always-more" };
      },
    };

    const finished = await runScan({
      repository: endless,
      store,
      jobId: job.id,
      maxPages: 3,
    });

    assert.equal(finished.pagesFetched, 3);
    assert.equal(finished.status, "interrupted");
    assert.match(finished.warnings.join(" "), /page limit reached/i);
  });

  it("scoping a job to its owner is possible via the store", async () => {
    const store = new InMemoryScanJobStore();
    const mine = await store.create({ userId: "u1", source: "mock" });
    await store.create({ userId: "u2", source: "mock" });

    const latest = await store.latestForUser("u1");
    assert.equal(latest?.id, mine.id);
  });
});

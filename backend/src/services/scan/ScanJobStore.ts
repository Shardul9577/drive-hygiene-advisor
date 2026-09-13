import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/env.js";
import type { HygieneReport } from "../../types/hygiene";

export type ScanStatus = "running" | "completed" | "failed" | "interrupted";

export interface ScanJob {
  id: string;
  userId: string;
  source: "google" | "mock";
  status: ScanStatus;
  /**
   * The Drive page cursor to resume from. This is the single value needed to
   * continue an interrupted scan, which is why it is written after every page
   * rather than only at the end.
   */
  cursor?: string;
  pagesFetched: number;
  filesSeen: number;
  startedAt: string;
  updatedAt: string;
  report?: HygieneReport;
  error?: string;
  warnings: string[];
  includeSharedDrives?: boolean;
  continuedFrom?: string;
}

export interface ScoreHistoryEntry {
  jobId: string;
  scannedAt: string;
  score: number;
  label: string;
  filesAnalysed: number;
  source: "google" | "mock";
  status: ScanStatus;
}

/**
 * Persistence boundary for scan progress and results.
 *
 * Two separate concerns live behind this interface, and both are the reason it
 * exists rather than keeping state in a local variable:
 *
 *  1. Resumability — the cursor is checkpointed after every page, so a scan
 *     killed at page 4,000 restarts at page 4,000 rather than page 1.
 *  2. Result storage — reports are read back by the UI after the request that
 *     produced them has ended, which is what makes background execution
 *     possible at all.
 *
 * FileScanJobStore writes to DATA_DIR so history survives process restarts.
 * Swapping for Postgres or Redis still means implementing these methods only.
 */
export interface ScanJobStore {
  create(input: {
    userId: string;
    source: "google" | "mock";
    includeSharedDrives?: boolean;
    continuedFrom?: string;
  }): Promise<ScanJob>;
  /** Called after every page — this is the checkpoint. */
  update(id: string, patch: Partial<Omit<ScanJob, "id" | "userId">>): Promise<ScanJob>;
  get(id: string): Promise<ScanJob | undefined>;
  /** Most recent job for a user, so the UI can restore state on reload. */
  latestForUser(userId: string): Promise<ScanJob | undefined>;
  /** Completed / interrupted scans with scores, newest first. */
  historyForUser(userId: string, limit?: number): Promise<ScoreHistoryEntry[]>;
}

export class InMemoryScanJobStore implements ScanJobStore {
  private readonly jobs = new Map<string, ScanJob>();

  /** Used by FileScanJobStore to hydrate from disk. */
  hydrate(jobs: ScanJob[]): void {
    this.jobs.clear();
    for (const job of jobs) this.jobs.set(job.id, job);
  }

  snapshot(): ScanJob[] {
    return [...this.jobs.values()];
  }

  async create(input: {
    userId: string;
    source: "google" | "mock";
    includeSharedDrives?: boolean;
    continuedFrom?: string;
  }): Promise<ScanJob> {
    const now = new Date().toISOString();
    const job: ScanJob = {
      id: randomUUID(),
      userId: input.userId,
      source: input.source,
      status: "running",
      pagesFetched: 0,
      filesSeen: 0,
      startedAt: now,
      updatedAt: now,
      warnings: [],
      includeSharedDrives: input.includeSharedDrives,
      continuedFrom: input.continuedFrom,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async update(
    id: string,
    patch: Partial<Omit<ScanJob, "id" | "userId">>,
  ): Promise<ScanJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Scan job ${id} not found`);

    const updated: ScanJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async get(id: string): Promise<ScanJob | undefined> {
    return this.jobs.get(id);
  }

  async latestForUser(userId: string): Promise<ScanJob | undefined> {
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }

  async historyForUser(userId: string, limit = 10): Promise<ScoreHistoryEntry[]> {
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId && j.report)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map(toHistoryEntry);
  }
}

/**
 * JSON file persistence under DATA_DIR. Correct for a single-process deploy;
 * multi-instance production should swap this for Postgres with the same interface.
 */
export class FileScanJobStore implements ScanJobStore {
  private readonly memory = new InMemoryScanJobStore();
  private readonly filePath: string;
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dataDir = config.dataDir) {
    this.filePath = path.join(dataDir, "scan-jobs.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const jobs = JSON.parse(raw) as ScanJob[];
      this.memory.hydrate(jobs);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error("[scan-store] failed to load persisted jobs:", error);
      }
    }
  }

  private persist(): void {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.memory.snapshot(), null, 2), "utf8");
    }).catch((error) => {
      console.error("[scan-store] failed to persist jobs:", error);
    });
  }

  async create(input: {
    userId: string;
    source: "google" | "mock";
    includeSharedDrives?: boolean;
    continuedFrom?: string;
  }): Promise<ScanJob> {
    await this.ensureLoaded();
    const job = await this.memory.create(input);
    this.persist();
    return job;
  }

  async update(
    id: string,
    patch: Partial<Omit<ScanJob, "id" | "userId">>,
  ): Promise<ScanJob> {
    await this.ensureLoaded();
    const job = await this.memory.update(id, patch);
    this.persist();
    return job;
  }

  async get(id: string): Promise<ScanJob | undefined> {
    await this.ensureLoaded();
    return this.memory.get(id);
  }

  async latestForUser(userId: string): Promise<ScanJob | undefined> {
    await this.ensureLoaded();
    return this.memory.latestForUser(userId);
  }

  async historyForUser(userId: string, limit = 10): Promise<ScoreHistoryEntry[]> {
    await this.ensureLoaded();
    return this.memory.historyForUser(userId, limit);
  }
}

function toHistoryEntry(job: ScanJob): ScoreHistoryEntry {
  return {
    jobId: job.id,
    scannedAt: job.report?.scannedAt ?? job.updatedAt,
    score: job.report!.score,
    label: job.report!.label,
    filesAnalysed: job.report!.filesAnalysed,
    source: job.source,
    status: job.status,
  };
}

export const scanJobStore: ScanJobStore = new FileScanJobStore();

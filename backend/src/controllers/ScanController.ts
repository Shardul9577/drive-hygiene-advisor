import type { Request, Response } from "express";
import { config } from "../config/env.js";
import { audit } from "../services/audit/auditLog.js";
import { UserModel } from "../models/UserModel.js";
import { scanJobStore, type ScanJob } from "../services/scan/ScanJobStore.js";
import { createDriveRepository, runScan } from "../services/scan/scanRunner.js";
import {
  isResultKind,
  pageResults,
  summariseReport,
} from "../services/scan/resultPaging.js";

export const ScanController = {
  /**
   * POST /api/scan
   *
   * Starts a scan in the background and returns the job id immediately.
   * Clients poll GET /api/scan/:id until status is completed / interrupted / failed.
   *
   * Body:
   *  - useMock?: boolean
   *  - includeSharedDrives?: boolean
   *  - maxPages?: number
   *  - continueFromJobId?: string — expands coverage by re-scanning from the
   *    start with priorPages + default budget (correct for duplicates that
   *    span the old page boundary; cursor-only resume cannot seed accumulators)
   */
  async scan(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Sign in to scan.", code: "UNAUTHENTICATED" });
      return;
    }

    if (UserModel.isAccessTokenExpired(user)) {
      await audit({ type: "auth.token_expired", userId: user.id });
      res.status(401).json({
        error: "Your Google session has expired. Sign in again to scan your Drive.",
        code: "TOKEN_EXPIRED",
      });
      return;
    }

    const useMock = req.body?.useMock === true || config.useMockDrive;
    const includeSharedDrives = req.body?.includeSharedDrives === true;

    if (!useMock && !user.accessToken) {
      res.status(401).json({
        error: "Your Google session has expired. Sign in again to scan your Drive.",
        code: "MISSING_ACCESS_TOKEN",
      });
      return;
    }

    let maxPages = clamp(
      Number(req.body?.maxPages ?? config.scan.defaultMaxPages),
      1,
      config.scan.hardCapMaxPages,
    );
    let continuedFrom: string | undefined;

    const continueFromJobId =
      typeof req.body?.continueFromJobId === "string"
        ? req.body.continueFromJobId
        : undefined;

    if (continueFromJobId) {
      const prior = await scanJobStore.get(continueFromJobId);
      if (!prior || prior.userId !== user.id) {
        res.status(404).json({ error: "Scan not found.", code: "NOT_FOUND" });
        return;
      }
      // Restart from the beginning with an expanded page budget so duplicate
      // grouping across the old/new boundary stays correct. A cursor-only
      // resume would fold new pages into empty accumulators and miss matches.
      maxPages = clamp(
        prior.pagesFetched + config.scan.defaultMaxPages,
        1,
        config.scan.hardCapMaxPages,
      );
      continuedFrom = prior.id;
    }

    const repository = createDriveRepository({
      accessToken: user.accessToken,
      forceMock: useMock,
      includeSharedDrives,
    });

    const job = await scanJobStore.create({
      userId: user.id,
      source: repository.source,
      includeSharedDrives,
      continuedFrom,
    });

    await audit({
      type: "scan.started",
      userId: user.id,
      jobId: job.id,
      source: repository.source,
      includeSharedDrives,
      maxPages,
      continuedFrom,
    });

    // Fire-and-forget: the HTTP response returns immediately so long Drive
    // walks do not block the request. Progress is polled via GET /api/scan/:id.
    void runScan({
      repository,
      store: scanJobStore,
      jobId: job.id,
      ownerEmail: user.email,
      maxPages,
    })
      .then(async (finished) => {
        await audit({
          type: "scan.finished",
          userId: user.id,
          jobId: finished.id,
          status: finished.status,
          filesSeen: finished.filesSeen,
          score: finished.report?.score,
        });
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : "Scan failed";
        await scanJobStore.update(job.id, { status: "failed", error: message });
        await audit({
          type: "scan.finished",
          userId: user.id,
          jobId: job.id,
          status: "failed",
          filesSeen: 0,
        });
      });

    res.status(202).json({
      jobId: job.id,
      status: "running",
      summary: null,
    });
  },

  /**
   * GET /api/scan/:id/results/:kind?page=0&pageSize=10
   *
   * The read side of the pipeline. Analysis was computed and persisted once;
   * the UI pulls it back one page at a time and never holds the whole result
   * set, mirroring how the scan never held the whole Drive.
   */
  async results(req: Request, res: Response): Promise<void> {
    const job = await requireOwnJob(req, res);
    if (!job) return;

    const kind = String(req.params.kind);
    if (!isResultKind(kind)) {
      res.status(400).json({
        error: "Unknown result type. Expected duplicates, large-files or risks.",
        code: "BAD_RESULT_KIND",
      });
      return;
    }

    if (!job.report) {
      res.status(409).json({
        error: "This scan has no stored results yet.",
        code: "RESULTS_NOT_READY",
      });
      return;
    }

    res.json(
      pageResults(
        job.report,
        kind,
        Number(req.query.page ?? 0),
        Number(req.query.pageSize ?? 10),
      ),
    );
  },

  /** GET /api/scan/:id — progress and summary for one job. */
  async getJob(req: Request, res: Response): Promise<void> {
    const job = await requireOwnJob(req, res);
    if (!job) return;

    res.json({ job: publicJob(job) });
  },

  /** GET /api/scan/latest — lets the UI restore the last scan after a reload. */
  async latest(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: "Sign in first.", code: "UNAUTHENTICATED" });
      return;
    }

    const job = await scanJobStore.latestForUser(req.user.id);
    res.json({ job: job ? publicJob(job) : null });
  },

  /** GET /api/scan/history — score over time for the signed-in user. */
  async history(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: "Sign in first.", code: "UNAUTHENTICATED" });
      return;
    }

    const limit = clamp(Number(req.query.limit ?? 10), 1, 50);
    const history = await scanJobStore.historyForUser(req.user.id, limit);
    res.json({ history });
  },
};

/**
 * Loads a job and confirms it belongs to the caller.
 *
 * Returns 404 rather than 403 for someone else's job, so a job id cannot be
 * probed to learn whether it exists.
 */
async function requireOwnJob(req: Request, res: Response): Promise<ScanJob | null> {
  const job = await scanJobStore.get(String(req.params.id));
  if (!job || job.userId !== req.user?.id) {
    res.status(404).json({ error: "Scan not found.", code: "NOT_FOUND" });
    return null;
  }
  return job;
}

/** Strips the detail arrays; clients page through those separately. */
function publicJob(job: ScanJob) {
  const { report, userId: _userId, ...rest } = job;
  return { ...rest, summary: report ? summariseReport(report) : null };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

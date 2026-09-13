import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGES_DEFAULT,
  type DriveRepository,
} from "../drive/repository";
import { GoogleDriveRepository } from "../drive/googleRepository";
import { MockDriveRepository } from "../drive/mockRepository";
import {
  DuplicateAccumulator,
  RiskAccumulator,
  StorageAccumulator,
} from "../analysis/accumulators";
import { assembleReport } from "../analysis/hygieneService";
import type { ScanJobStore } from "./ScanJobStore";

export function createDriveRepository(options: {
  accessToken?: string | null;
  forceMock?: boolean;
  includeSharedDrives?: boolean;
}): DriveRepository {
  if (options.forceMock || !options.accessToken) {
    return new MockDriveRepository();
  }
  return new GoogleDriveRepository(options.accessToken, {
    includeSharedDrives: options.includeSharedDrives,
  });
}

export interface RunScanOptions {
  repository: DriveRepository;
  store: ScanJobStore;
  jobId: string;
  ownerEmail?: string;
  pageSize?: number;
  maxPages?: number;
  /** Resume point. Omit to start from the beginning of the Drive. */
  startCursor?: string;
}

/**
 * The scan pipeline:
 *
 *   Drive page → fold into accumulators → checkpoint cursor → next page
 *
 * The important property is what is NOT here: there is no array of every file.
 * A page is fetched, folded into fixed-shape accumulator state, and released
 * before the next page is requested. Peak memory is therefore governed by page
 * size and result size, not by how large the Drive is.
 *
 * Because the cursor is written to the store after every page, an interrupted
 * run — crash, deploy, rate-limit exhaustion — resumes from the last completed
 * page instead of restarting. That is the same mechanism a production worker
 * would use; only the trigger differs (HTTP request here, queue consumer there).
 */
export async function runScan(options: RunScanOptions) {
  const {
    repository,
    store,
    jobId,
    ownerEmail,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = MAX_PAGES_DEFAULT,
  } = options;

  const duplicates = new DuplicateAccumulator();
  const storage = new StorageAccumulator();
  const risk = new RiskAccumulator(ownerEmail);

  const warnings: string[] = [];
  let cursor = options.startCursor;
  let pagesFetched = 0;
  let filesSeen = 0;
  let truncated = false;

  while (pagesFetched < maxPages) {
    let page;
    try {
      page = await repository.listFilesPage(cursor, pageSize);
    } catch (error) {
      // A failed page does not discard the pages already folded in. We persist
      // the last good cursor and surface a partial report, because a partial
      // answer plus a resume point is more useful than an error page.
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Stopped at page ${pagesFetched + 1}: ${message} Results below cover the ${filesSeen} files scanned so far.`,
      );
      truncated = true;
      await store.update(jobId, {
        status: "interrupted",
        cursor,
        pagesFetched,
        filesSeen,
        warnings,
      });
      break;
    }

    duplicates.addPage(page.files);
    storage.addPage(page.files);
    risk.addPage(page.files);

    pagesFetched += 1;
    filesSeen += page.files.length;
    cursor = page.nextPageToken;

    // Checkpoint. Written every page, not just at the end.
    await store.update(jobId, { cursor, pagesFetched, filesSeen });

    if (!cursor) break;

    if (pagesFetched >= maxPages) {
      truncated = true;
      warnings.push(
        `Scan page limit reached (${maxPages} pages ≈ ${maxPages * pageSize} files). Use Continue scan to analyse more from the start with an expanded budget.`,
      );
    }
  }

  if (duplicates.didOverflow) {
    warnings.push(
      "Duplicate index reached its key budget; some files were not compared. Production moves this index into the database.",
    );
  }

  const report = assembleReport({
    duplicates: duplicates.finalise(),
    storage: storage.finalise(),
    risk: risk.finalise(),
    filesAnalysed: filesSeen,
    source: repository.source,
    pagesFetched,
    pageSize,
    truncated,
    nextPageToken: cursor,
    warnings,
  });

  const finalJob = await store.update(jobId, {
    status: truncated ? "interrupted" : "completed",
    cursor,
    pagesFetched,
    filesSeen,
    warnings,
    report,
  });

  return finalJob;
}

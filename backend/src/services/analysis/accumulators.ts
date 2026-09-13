import type {
  DriveFile,
  DuplicateConfidence,
  DuplicateGroup,
  LargeFileInsight,
  RiskAssessment,
  StorageByType,
} from "../../types/hygiene";
import { normalizeFilename } from "./duplicates";
import { scoreFile } from "./risk";
import { categoriseMime, storageBytesOf } from "./storage";

/**
 * Streaming analysis primitives.
 *
 * Each accumulator folds one page of files into fixed-shape state and then
 * discards the page. Nothing here ever holds the full Drive in memory, which is
 * the property that lets the same code survive a 10-million-file domain.
 *
 * See DECISIONS.md §4 for the memory characteristics of each one.
 */
export interface Accumulator<TResult> {
  addPage(files: DriveFile[]): void;
  finalise(): TResult;
}

/* ------------------------------------------------------------------ storage */

const TOP_FILES_KEPT = 25;

/**
 * Memory: O(TOP_FILES_KEPT + distinct MIME categories) — constant.
 *
 * We never sort "all files"; we maintain a bounded leaderboard instead. A file
 * is compared against the current smallest entry and discarded immediately if
 * it cannot place, so a 10-million-file Drive costs the same as a 100-file one.
 */
export class StorageAccumulator implements Accumulator<{
  largeFiles: LargeFileInsight[];
  storageByType: StorageByType[];
  largeFilesBytes: number;
}> {
  private readonly leaderboard: LargeFileInsight[] = [];
  private readonly byCategory = new Map<string, { bytes: number; count: number }>();
  private totalBytes = 0;

  addPage(files: DriveFile[]): void {
    for (const file of files) {
      // Quota-billed bytes where Drive reports them, content size otherwise.
      // Google-native files report neither and are excluded rather than counted
      // as zero, which would skew every percentage.
      const bytes = storageBytesOf(file);
      if (typeof bytes !== "number") continue;

      this.totalBytes += bytes;

      const category = categoriseMime(file.mimeType);
      const entry = this.byCategory.get(category) ?? { bytes: 0, count: 0 };
      entry.bytes += bytes;
      entry.count += 1;
      this.byCategory.set(category, entry);

      this.offerToLeaderboard(file, bytes);
    }
  }

  private offerToLeaderboard(file: DriveFile, sizeBytes: number): void {
    const full = this.leaderboard.length >= TOP_FILES_KEPT;
    if (full && sizeBytes <= this.leaderboard[this.leaderboard.length - 1].sizeBytes) {
      return;
    }
    this.leaderboard.push({ file, sizeBytes });
    this.leaderboard.sort((a, b) => b.sizeBytes - a.sizeBytes);
    if (this.leaderboard.length > TOP_FILES_KEPT) this.leaderboard.length = TOP_FILES_KEPT;
  }

  finalise() {
    const storageByType: StorageByType[] = [...this.byCategory.entries()]
      .map(([category, { bytes, count }]) => ({
        category,
        bytes,
        fileCount: count,
        percent:
          this.totalBytes === 0 ? 0 : Math.round((bytes / this.totalBytes) * 1000) / 10,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return {
      largeFiles: this.leaderboard,
      storageByType,
      largeFilesBytes: this.leaderboard.reduce((sum, f) => sum + f.sizeBytes, 0),
    };
  }
}

/* --------------------------------------------------------------------- risk */

const TOP_RISKS_KEPT = 100;

/**
 * Memory: O(TOP_RISKS_KEPT) — constant.
 *
 * Risk is scored per file with no cross-file dependency, so it folds perfectly.
 * Only files that actually score above LOW are retained; a tidy Drive costs
 * almost nothing to analyse.
 */
export class RiskAccumulator implements Accumulator<{
  risks: RiskAssessment[];
  highCount: number;
  mediumCount: number;
  unknownCount: number;
}> {
  private readonly kept: RiskAssessment[] = [];
  private highCount = 0;
  private mediumCount = 0;
  private unknownCount = 0;

  constructor(private readonly ownerEmail?: string) {}

  addPage(files: DriveFile[]): void {
    for (const file of files) {
      const assessment = scoreFile(file, this.ownerEmail);

      // A file whose ACL Drive would not return scores 0, which puts it in the
      // same bucket as a genuinely private file. Counting it separately is what
      // stops "we could not check this" from being presented as "this is fine".
      if (!assessment.sharingKnown) {
        this.unknownCount += 1;
        continue;
      }

      if (assessment.level === "LOW") continue;

      if (assessment.level === "HIGH") this.highCount += 1;
      else this.mediumCount += 1;

      const full = this.kept.length >= TOP_RISKS_KEPT;
      if (full && assessment.score <= this.kept[this.kept.length - 1].score) continue;

      this.kept.push(assessment);
      this.kept.sort((a, b) => b.score - a.score);
      if (this.kept.length > TOP_RISKS_KEPT) this.kept.length = TOP_RISKS_KEPT;
    }
  }

  finalise() {
    return {
      risks: this.kept,
      highCount: this.highCount,
      mediumCount: this.mediumCount,
      unknownCount: this.unknownCount,
    };
  }
}

/* --------------------------------------------------------------- duplicates */

/** Minimal record retained per file — deliberately not the whole DriveFile. */
interface DuplicateCandidate {
  file: DriveFile;
  size: number;
  checksum?: string;
}

const MAX_TRACKED_KEYS = 50_000;

/**
 * Memory: O(files that carry a grouping key), not O(total files).
 *
 * Duplicate detection is the one analysis that genuinely needs to compare files
 * against each other, so it cannot be reduced to a constant-size fold. What it
 * CAN be reduced to is a keyed index — which is exactly a database GROUP BY.
 *
 * These Maps are a stand-in for that table. In production the same algorithm
 * runs against `SELECT ... FROM scanned_file GROUP BY dup_key HAVING
 * COUNT(*) > 1`, so the index lives in Postgres rather than in process memory.
 * MAX_TRACKED_KEYS caps the prototype so a pathological Drive degrades the
 * result instead of exhausting the heap.
 *
 * Two indexes, not one. A single key per file cannot work, because Drive
 * reports `md5Checksum` for some copies of a file and not others: keying the
 * checksummed copies under `ck:` and the rest under `nm:` would put copies of
 * the same file in different namespaces, and the copy without a checksum would
 * never be reported at all. So each file is indexed under every key its
 * metadata supports, and finalise() merges the buckets that overlap.
 */
export class DuplicateAccumulator implements Accumulator<DuplicateGroup[]> {
  private readonly byChecksum = new Map<string, DuplicateCandidate[]>();
  private readonly byName = new Map<string, DuplicateCandidate[]>();
  private keysTracked = 0;
  private overflowed = false;

  addPage(files: DriveFile[]): void {
    for (const file of files) {
      // Size is required by both keys. Without it there is no evidence strong
      // enough to group on — matching names alone produces far too many false
      // positives to put in front of someone about to delete things.
      if (typeof file.size !== "number") continue;

      const candidate: DuplicateCandidate = {
        file,
        size: file.size,
        checksum: file.md5Checksum,
      };

      if (candidate.checksum) {
        this.track(this.byChecksum, `ck:${candidate.checksum}:${candidate.size}`, candidate);
      }

      const name = normalizeFilename(file.name);
      if (name) {
        this.track(this.byName, `nm:${name}:${file.mimeType}:${candidate.size}`, candidate);
      }
    }
  }

  private track(
    index: Map<string, DuplicateCandidate[]>,
    key: string,
    candidate: DuplicateCandidate,
  ): void {
    const existing = index.get(key);
    if (existing) {
      existing.push(candidate);
      return;
    }
    if (this.keysTracked >= MAX_TRACKED_KEYS) {
      this.overflowed = true;
      return;
    }
    index.set(key, [candidate]);
    this.keysTracked += 1;
  }

  /** True when the key budget was hit and some files went untracked. */
  get didOverflow(): boolean {
    return this.overflowed;
  }

  finalise(): DuplicateGroup[] {
    const merger = new GroupMerger();

    // Same bytes: unconditionally the same file, whatever it is called.
    for (const bucket of this.byChecksum.values()) {
      merger.link(bucket);
    }

    // Same normalised name, MIME type and exact size. This is the tier that
    // rescues a copy whose checksum Drive did not report.
    for (const bucket of this.byName.values()) {
      merger.add(bucket);

      const withoutChecksum = bucket.filter((c) => !c.checksum);
      if (withoutChecksum.length === 0) continue;

      merger.link(withoutChecksum);

      // Bridge the checksum-less copies onto their checksummed siblings, but
      // only when those siblings agree. Two different checksums under one name
      // key means the files are provably NOT identical, and there would be no
      // way to tell which group the checksum-less copy belongs to.
      const checksums = new Set(
        bucket.filter((c) => c.checksum).map((c) => c.checksum as string),
      );
      if (checksums.size !== 1) continue;

      const anchor = bucket.find((c) => c.checksum);
      if (anchor) merger.link([anchor, withoutChecksum[0]]);
    }

    return merger
      .groups()
      .map(buildGroup)
      .sort((a, b) => b.recoverableBytes - a.recoverableBytes);
  }
}

/**
 * Union-find over file ids.
 *
 * Needed because a file can be linked to its copies through either key, and
 * those links have to compose: "invoice.pdf" and "invoice copy.pdf" link by
 * checksum, "invoice (1).pdf" links to "invoice.pdf" by name, and all three
 * belong in one group. Grouping by a single key cannot express that.
 */
class GroupMerger {
  private readonly parent = new Map<string, string>();
  private readonly candidates = new Map<string, DuplicateCandidate>();

  add(candidates: DuplicateCandidate[]): void {
    for (const candidate of candidates) {
      const id = candidate.file.id;
      if (this.candidates.has(id)) continue;
      this.candidates.set(id, candidate);
      this.parent.set(id, id);
    }
  }

  /** Places every candidate in one group. */
  link(candidates: DuplicateCandidate[]): void {
    this.add(candidates);
    for (let i = 1; i < candidates.length; i++) {
      this.union(candidates[0].file.id, candidates[i].file.id);
    }
  }

  private find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;

    // Path compression, so repeated lookups stay near-constant.
    let cursor = id;
    while (cursor !== root) {
      const next = this.parent.get(cursor) as string;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  private union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }

  /** Connected components with at least two members. */
  groups(): DuplicateCandidate[][] {
    const components = new Map<string, DuplicateCandidate[]>();
    for (const candidate of this.candidates.values()) {
      const root = this.find(candidate.file.id);
      const members = components.get(root) ?? [];
      members.push(candidate);
      components.set(root, members);
    }
    return [...components.values()].filter((members) => members.length > 1);
  }
}

function buildGroup(members: DuplicateCandidate[]): DuplicateGroup {
  // A checksum is only evidence if another member of the group shares it.
  const checksumCounts = new Map<string, number>();
  for (const member of members) {
    if (!member.checksum) continue;
    checksumCounts.set(member.checksum, (checksumCounts.get(member.checksum) ?? 0) + 1);
  }

  const evidence = members.map((member): DuplicateConfidence =>
    member.checksum && (checksumCounts.get(member.checksum) ?? 0) > 1 ? "strong" : "likely",
  );

  // The group is only as strong as its weakest member. A group where one copy
  // joined on filename evidence is reported as "likely" even if the others
  // matched byte-for-byte, and each row states which applied to it.
  const anyLikely = evidence.includes("likely");
  const anyStrong = evidence.includes("strong");
  const confidence: DuplicateConfidence = anyLikely ? "likely" : "strong";

  const sizes = members.map((m) => m.size);

  // One copy is presumed worth keeping, so only the redundant copies count
  // toward recoverable space.
  const recoverableBytes = Math.max(
    0,
    sizes.reduce((a, b) => a + b, 0) - Math.max(...sizes),
  );

  return {
    id: `dup-${members.map((m) => m.file.id).sort().join("-")}`,
    confidence,
    reason:
      anyStrong && anyLikely
        ? "Some copies share an identical checksum; the rest match on filename, type and exact size"
        : anyStrong
          ? "Identical checksum and byte size — these are the same file"
          : "Same normalised filename, type and exact size",
    recoverableBytes,
    files: members.map((member, i) => ({
      file: member.file,
      reason:
        evidence[i] === "strong"
          ? "Checksum match"
          : "Name, type and size match (no checksum available)",
    })),
  };
}

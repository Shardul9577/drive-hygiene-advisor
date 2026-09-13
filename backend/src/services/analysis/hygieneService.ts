import type {
  AttentionItem,
  DuplicateGroup,
  HygieneReport,
  LargeFileInsight,
  RiskAssessment,
  StorageByType,
} from "../../types/hygiene";

export interface AssembleInput {
  duplicates: DuplicateGroup[];
  storage: {
    largeFiles: LargeFileInsight[];
    storageByType: StorageByType[];
    largeFilesBytes: number;
  };
  risk: {
    risks: RiskAssessment[];
    highCount: number;
    mediumCount: number;
    unknownCount: number;
  };
  filesAnalysed: number;
  source: "google" | "mock";
  pagesFetched: number;
  pageSize: number;
  truncated: boolean;
  nextPageToken?: string;
  warnings: string[];
}

/**
 * Combines the three accumulator outputs into the report the UI renders.
 *
 * This function takes finished summaries rather than a file list — it has no
 * access to the raw Drive data and could not accidentally reintroduce a
 * full-dataset pass even if someone tried.
 */
export function assembleReport(input: AssembleInput): HygieneReport {
  const score = computeHygieneScore({
    filesAnalysed: input.filesAnalysed,
    high: input.risk.highCount,
    medium: input.risk.mediumCount,
    duplicateGroups: input.duplicates.length,
    veryLargeFiles: input.storage.largeFiles.filter((f) => f.sizeBytes >= 100_000_000).length,
  });

  return {
    score,
    label: scoreLabel(score),
    filesAnalysed: input.filesAnalysed,
    riskyFileCount: input.risk.highCount + input.risk.mediumCount,
    unknownExposureCount: input.risk.unknownCount,
    duplicateGroupCount: input.duplicates.length,
    largeFilesBytes: input.storage.largeFilesBytes,
    scannedAt: new Date().toISOString(),
    source: input.source,
    duplicates: input.duplicates,
    largeFiles: input.storage.largeFiles,
    storageByType: input.storage.storageByType,
    risks: input.risk.risks,
    attention: buildAttention(input.risk.risks, input.duplicates, input.storage.largeFiles),
    pagination: {
      pagesFetched: input.pagesFetched,
      pageSize: input.pageSize,
      truncated: input.truncated,
      nextPageToken: input.nextPageToken,
    },
    warnings: input.warnings,
  };
}

/**
 * Hygiene score: 100 minus weighted deductions.
 *
 * The weights encode a product opinion — a file anyone on the internet can open
 * is a bigger problem than a wasted gigabyte, so exposure costs more than
 * clutter. Deductions are capped so that one noisy category cannot drive the
 * score to zero on its own and hide everything else.
 */
function computeHygieneScore(input: {
  filesAnalysed: number;
  high: number;
  medium: number;
  duplicateGroups: number;
  veryLargeFiles: number;
}): number {
  if (input.filesAnalysed === 0) return 100;

  const exposure = Math.min(45, input.high * 12 + input.medium * 5);
  const clutter = Math.min(25, input.duplicateGroups * 4);
  const bulk = Math.min(20, input.veryLargeFiles * 2);

  return Math.max(0, 100 - exposure - clutter - bulk);
}

function scoreLabel(score: number): HygieneReport["label"] {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs attention";
}

/** A single prioritised list so the Overview answers "what do I look at first". */
function buildAttention(
  risks: RiskAssessment[],
  duplicates: DuplicateGroup[],
  largeFiles: LargeFileInsight[],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const risk of risks.slice(0, 5)) {
    items.push({
      id: `risk-${risk.file.id}`,
      name: risk.file.name,
      kind: "risk",
      label: risk.level,
      detail: risk.reasons[0] ?? "Broad access configuration",
    });
  }

  for (const group of duplicates.slice(0, 3)) {
    const primary = group.files[0]?.file;
    if (!primary) continue;
    items.push({
      id: group.id,
      name: primary.name,
      kind: "duplicate",
      label: "DUPLICATE",
      detail: `${group.files.length} copies · ${formatCompactBytes(group.recoverableBytes)} recoverable`,
    });
  }

  for (const large of largeFiles.slice(0, 3)) {
    items.push({
      id: `large-${large.file.id}`,
      name: large.file.name,
      kind: "large",
      label: formatCompactBytes(large.sizeBytes),
      detail: "Among the largest files in this Drive",
    });
  }

  return items.slice(0, 8);
}

function formatCompactBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

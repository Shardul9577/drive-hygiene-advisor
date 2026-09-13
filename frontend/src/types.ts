export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type DuplicateConfidence = "strong" | "likely";

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: "google";
  createdAt: string;
  lastLoginAt: string;
  tokenExpiresAt?: string;
  tokenExpired?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  ownedByMe?: boolean;
}

export interface ScoreHistoryEntry {
  jobId: string;
  scannedAt: string;
  score: number;
  label: string;
  filesAnalysed: number;
  source: "google" | "mock";
  status: "running" | "completed" | "failed" | "interrupted";
}

export interface StorageByType {
  category: string;
  bytes: number;
  percent: number;
  fileCount: number;
}

export interface AttentionItem {
  id: string;
  name: string;
  kind: "risk" | "duplicate" | "large";
  label: string;
  detail: string;
}

export interface ScanPagination {
  pagesFetched: number;
  pageSize: number;
  truncated: boolean;
  nextPageToken?: string;
}

/**
 * Bounded portion of a report. Detail lists are fetched separately, one page at
 * a time, so this payload does not grow with the size of the Drive.
 */
export interface HygieneSummary {
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Needs attention";
  filesAnalysed: number;
  riskyFileCount: number;
  /** Files whose sharing settings Drive would not return. */
  unknownExposureCount: number;
  duplicateGroupCount: number;
  largeFilesBytes: number;
  scannedAt: string;
  source: "google" | "mock";
  storageByType: StorageByType[];
  attention: AttentionItem[];
  pagination: ScanPagination;
  warnings: string[];
  counts: {
    duplicates: number;
    largeFiles: number;
    risks: number;
  };
}

export interface DuplicateGroup {
  id: string;
  confidence: DuplicateConfidence;
  reason: string;
  recoverableBytes: number;
  files: Array<{ file: DriveFile; reason: string }>;
}

export interface LargeFileInsight {
  file: DriveFile;
  sizeBytes: number;
}

export interface RiskAssessment {
  file: DriveFile;
  level: RiskLevel;
  score: number;
  reasons: string[];
  sharingKnown: boolean;
}

export interface ResultPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ScanJob {
  id: string;
  source: "google" | "mock";
  status: "running" | "completed" | "failed" | "interrupted";
  cursor?: string;
  pagesFetched: number;
  filesSeen: number;
  startedAt: string;
  updatedAt: string;
  warnings: string[];
  error?: string;
  summary: HygieneSummary | null;
}

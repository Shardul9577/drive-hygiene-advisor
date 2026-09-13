export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type DuplicateConfidence = "strong" | "likely";

export interface DrivePermission {
  id?: string;
  type: "user" | "group" | "domain" | "anyone" | string;
  role: "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader" | string;
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Byte size of the current version's content. Used to compare files. */
  size?: number;
  /** Bytes charged against the owner's quota, including retained revisions. */
  quotaBytesUsed?: number;
  /** True when the signed-in user owns the file (Drive's ownedByMe). */
  ownedByMe?: boolean;
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
  shared?: boolean;
  permissions?: DrivePermission[];
  createdTime?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  /** Deep link into the Drive UI — used for "Open in Drive" actions. */
  webViewLink?: string;
  parents?: string[];
}

export interface DuplicateMember {
  file: DriveFile;
  reason: string;
}

export interface DuplicateGroup {
  id: string;
  confidence: DuplicateConfidence;
  reason: string;
  files: DuplicateMember[];
  recoverableBytes: number;
}

export interface LargeFileInsight {
  file: DriveFile;
  sizeBytes: number;
}

export interface StorageByType {
  category: string;
  bytes: number;
  percent: number;
  fileCount: number;
}

export interface RiskAssessment {
  file: DriveFile;
  level: RiskLevel;
  score: number;
  reasons: string[];
  /**
   * False when Drive did not return an ACL for this file, so its exposure could
   * not be assessed at all. Such a file scores 0 and would otherwise be
   * indistinguishable from a genuinely private one, which is the opposite of
   * what the data supports — so it is counted and reported separately.
   */
  sharingKnown: boolean;
}

export interface AttentionItem {
  id: string;
  name: string;
  kind: "risk" | "duplicate" | "large";
  label: string;
  detail: string;
}

export interface HygieneReport {
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Needs attention";
  filesAnalysed: number;
  riskyFileCount: number;
  /** Files whose ACL Drive would not return, so exposure is genuinely unknown. */
  unknownExposureCount: number;
  duplicateGroupCount: number;
  largeFilesBytes: number;
  scannedAt: string;
  source: "google" | "mock";
  duplicates: DuplicateGroup[];
  largeFiles: LargeFileInsight[];
  storageByType: StorageByType[];
  risks: RiskAssessment[];
  attention: AttentionItem[];
  pagination: {
    pagesFetched: number;
    pageSize: number;
    truncated: boolean;
    nextPageToken?: string;
  };
  warnings: string[];
}

export interface ScanProgress {
  pagesFetched: number;
  filesFetched: number;
  checkpointToken?: string;
}

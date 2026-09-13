import type { DriveFile } from "../../types/hygiene";
import {
  DEFAULT_PAGE_SIZE,
  type DriveRepository,
  type FilePage,
} from "./repository";

/**
 * Deterministic stand-in for Google Drive, used for local demos and tests.
 *
 * It implements the same DriveRepository contract as GoogleDriveRepository,
 * including opaque cursor pagination, so the scan pipeline cannot tell the two
 * apart. The dataset deliberately includes awkward cases the real API produces:
 *
 *  - a Google-native Doc with no size and quotaBytesUsed of 0 (f10)
 *  - a third copy whose checksum Drive did not report, so it can only join its
 *    siblings through the filename tier (f4)
 *  - a file whose quotaBytesUsed exceeds its size because of retained
 *    revisions (f1)
 *  - a file whose ACL could not be read, so permissions come back empty (f15)
 */
export class MockDriveRepository implements DriveRepository {
  readonly source = "mock" as const;
  private readonly files: DriveFile[];

  constructor(files: DriveFile[] = MOCK_FILES) {
    this.files = files;
  }

  async listFilesPage(
    pageToken?: string,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<FilePage> {
    const start = pageToken ? Number(pageToken) : 0;
    if (Number.isNaN(start) || start < 0) {
      throw new Error("Invalid page cursor. Restart the scan.");
    }
    const next = start + pageSize;
    return {
      files: this.files.slice(start, next),
      nextPageToken: next < this.files.length ? String(next) : undefined,
    };
  }
}

const OWNER = [{ emailAddress: "demo.user@example.com", displayName: "Demo User" }];

export const MOCK_FILES: DriveFile[] = [
  {
    id: "f1",
    name: "Financial Report Q3.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 2_450_000,
    // Edited many times, so retained revisions bill far more than the current
    // version's content length. Storage figures use this number, not `size`.
    quotaBytesUsed: 6_100_000,
    ownedByMe: true,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "anyone", role: "reader", allowFileDiscovery: false },
      { type: "user", role: "writer", emailAddress: "contractor@external.co" },
    ],
    createdTime: "2025-06-01T10:00:00Z",
    modifiedTime: "2026-08-12T14:00:00Z",
    md5Checksum: "aaa111",
    webViewLink: "https://docs.google.com/spreadsheets/d/f1/edit",
  },
  {
    id: "f2",
    name: "invoice.pdf",
    mimeType: "application/pdf",
    size: 2_400_000,
    ownedByMe: true,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2025-01-10T09:00:00Z",
    modifiedTime: "2025-01-10T09:00:00Z",
    md5Checksum: "bbb222",
    webViewLink: "https://drive.google.com/file/d/f2/view",
  },
  {
    id: "f3",
    name: "invoice copy.pdf",
    mimeType: "application/pdf",
    size: 2_400_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2025-01-11T09:00:00Z",
    modifiedTime: "2025-01-11T09:00:00Z",
    md5Checksum: "bbb222",
  },
  {
    id: "f4",
    name: "invoice (1).pdf",
    mimeType: "application/pdf",
    size: 2_400_000,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "user", role: "reader", emailAddress: "ap@vendor.io" },
    ],
    createdTime: "2025-01-12T09:00:00Z",
    modifiedTime: "2025-01-12T09:00:00Z",
    // No md5Checksum. Its two siblings above have one, so this copy can only be
    // grouped through the filename tier — the case that requires the accumulator
    // to index under both keys and merge, rather than pick one key per file.
  },
  {
    id: "f5",
    name: "presentation-video.mp4",
    mimeType: "video/mp4",
    size: 1_800_000_000,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "domain", role: "reader", domain: "example.com" },
    ],
    createdTime: "2024-11-01T12:00:00Z",
    modifiedTime: "2024-11-02T12:00:00Z",
    md5Checksum: "ccc333",
  },
  {
    id: "f6",
    name: "database-backup.zip",
    mimeType: "application/zip",
    size: 950_000_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2026-01-05T08:00:00Z",
    modifiedTime: "2026-01-05T08:00:00Z",
    md5Checksum: "ddd444",
  },
  {
    id: "f7",
    name: "design-assets.zip",
    mimeType: "application/zip",
    size: 720_000_000,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "user", role: "writer", emailAddress: "designer@agency.com" },
      { type: "user", role: "writer", emailAddress: "freelancer@gmail.com" },
    ],
    createdTime: "2025-09-20T15:00:00Z",
    modifiedTime: "2026-07-01T11:00:00Z",
    md5Checksum: "eee555",
  },
  {
    id: "f8",
    name: "old-recording.mp4",
    mimeType: "video/mp4",
    size: 650_000_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2023-04-01T10:00:00Z",
    modifiedTime: "2023-04-01T10:00:00Z",
    md5Checksum: "fff666",
  },
  {
    id: "f9",
    name: "HR - Salary Band 2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 180_000,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "user", role: "reader", emailAddress: "partner@outside.org" },
    ],
    createdTime: "2026-02-01T09:00:00Z",
    modifiedTime: "2026-03-15T09:00:00Z",
  },
  {
    id: "f10",
    name: "Team Notes.gdoc",
    mimeType: "application/vnd.google-apps.document",
    // Google-native files report no size or checksum, and consume no quota.
    quotaBytesUsed: 0,
    ownedByMe: true,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "user", role: "writer", emailAddress: "teammate@example.com" },
      // Group shares must be scored — ignoring them falsely looks private.
      { type: "group", role: "reader", emailAddress: "eng@example.com" },
    ],
    createdTime: "2026-05-01T09:00:00Z",
    modifiedTime: "2026-09-01T09:00:00Z",
    webViewLink: "https://docs.google.com/document/d/f10/edit",
  },
  {
    id: "f11",
    name: "roadmap-final.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 45_000_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2026-06-01T09:00:00Z",
    modifiedTime: "2026-06-10T09:00:00Z",
    md5Checksum: "ggg777",
  },
  {
    id: "f12",
    name: "roadmap-final-copy.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 45_000_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2026-06-11T09:00:00Z",
    modifiedTime: "2026-06-11T09:00:00Z",
    md5Checksum: "ggg777",
  },
  {
    id: "f13",
    name: "customer-passport-scan.pdf",
    mimeType: "application/pdf",
    size: 3_200_000,
    owners: OWNER,
    shared: true,
    permissions: [
      { type: "user", role: "owner", emailAddress: "demo.user@example.com" },
      { type: "anyone", role: "writer", allowFileDiscovery: true },
    ],
    createdTime: "2025-12-01T09:00:00Z",
    modifiedTime: "2025-12-01T09:00:00Z",
    md5Checksum: "hhh888",
  },
  {
    id: "f14",
    name: "brand-photo-hero.jpg",
    mimeType: "image/jpeg",
    size: 12_000_000,
    owners: OWNER,
    shared: false,
    permissions: [{ type: "user", role: "owner", emailAddress: "demo.user@example.com" }],
    createdTime: "2026-04-01T09:00:00Z",
    modifiedTime: "2026-04-01T09:00:00Z",
    md5Checksum: "iii999",
  },
  {
    id: "f15",
    name: "meeting-notes-private.txt",
    mimeType: "text/plain",
    size: 4_200,
    owners: OWNER,
    shared: false,
    // Drive omits the permissions array when the caller cannot read the ACL.
    // Exposure is unknown here, not zero.
    permissions: [],
    createdTime: "2026-08-01T09:00:00Z",
    modifiedTime: "2026-08-20T09:00:00Z",
  },
];

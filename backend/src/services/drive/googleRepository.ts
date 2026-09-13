import { google } from "googleapis";
import type { DriveFile, DrivePermission } from "../../types/hygiene";
import {
  DEFAULT_PAGE_SIZE,
  type DriveRepository,
  type FilePage,
} from "./repository";
import { withRetry } from "./retry";

/**
 * Requested explicitly rather than using "*".
 *
 * Drive bills partial responses by field cost and returns large payloads for
 * wildcards; naming fields keeps each page small and makes it obvious during
 * review exactly which metadata this product reads. Notably absent: anything
 * about file *content*.
 */
const FILE_FIELDS = [
  "id",
  "name",
  "mimeType",
  // Both size fields, because they answer different questions. `size` is the
  // current version's content length and is what duplicate detection compares;
  // `quotaBytesUsed` is what Drive actually bills, including retained
  // revisions, and is what storage figures should report.
  "size",
  "quotaBytesUsed",
  "ownedByMe",
  "owners(emailAddress,displayName)",
  "shared",
  "permissions(id,type,role,emailAddress,domain,allowFileDiscovery)",
  "createdTime",
  "modifiedTime",
  "md5Checksum",
  "webViewLink",
].join(",");

export interface GoogleDriveOptions {
  /**
   * When true, list across Shared Drives the user can access as well as My Drive.
   * Still restricted to files the user owns (`'me' in owners` + ownedByMe filter).
   */
  includeSharedDrives?: boolean;
}

export class GoogleDriveRepository implements DriveRepository {
  readonly source = "google" as const;
  private readonly drive;
  private readonly includeSharedDrives: boolean;

  constructor(accessToken: string, options: GoogleDriveOptions = {}) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: "v3", auth });
    this.includeSharedDrives = options.includeSharedDrives === true;
  }

  async listFilesPage(
    pageToken?: string,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<FilePage> {
    return withRetry(
      async () => {
        const response = await this.drive.files.list({
          pageSize,
          pageToken,
          // Trashed files are already "cleaned up" — counting them would
          // inflate duplicate groups and storage figures misleadingly.
          //
          // `'me' in owners` restricts the scan to files the user actually
          // owns. files.list otherwise returns everything shared *with* them
          // too, which consumes no quota of theirs and whose sharing they
          // cannot change — counting those would attribute other people's
          // gigabytes to this user and flag exposure they cannot act on.
          q: "trashed = false and 'me' in owners",
          fields: `nextPageToken, files(${FILE_FIELDS})`,
          spaces: "drive",
          ...(this.includeSharedDrives
            ? {
                corpora: "allDrives",
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
              }
            : {
                includeItemsFromAllDrives: false,
                supportsAllDrives: false,
              }),
        });

        const files = (response.data.files ?? [])
          .map(normaliseFile)
          // Belt-and-braces: ownedByMe must be true when present. Shared Drive
          // edge cases occasionally surface files the query should have excluded.
          .filter((f) => f.ownedByMe !== false);

        return {
          files,
          nextPageToken: response.data.nextPageToken ?? undefined,
        };
      },
      { label: "Drive files.list" },
    );
  }
}

interface RawFile {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  quotaBytesUsed?: string | null;
  ownedByMe?: boolean | null;
  owners?: Array<{ emailAddress?: string | null; displayName?: string | null }> | null;
  shared?: boolean | null;
  permissions?: Array<{
    id?: string | null;
    type?: string | null;
    role?: string | null;
    emailAddress?: string | null;
    domain?: string | null;
    allowFileDiscovery?: boolean | null;
  }> | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
  webViewLink?: string | null;
}

/**
 * Converts a raw Drive resource into our internal DriveFile.
 *
 * Every field is treated as optional on purpose. Drive omits `size` and
 * `md5Checksum` for Google-native types (Docs/Sheets/Slides), and omits
 * `permissions` entirely when the caller lacks permission to read the ACL.
 * Missing data must degrade the analysis, never crash the scan.
 */
function normaliseFile(raw: RawFile): DriveFile {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "Untitled",
    mimeType: raw.mimeType ?? "application/octet-stream",
    // Drive returns int64 byte counts as strings.
    size: parseByteCount(raw.size),
    quotaBytesUsed: parseByteCount(raw.quotaBytesUsed),
    ownedByMe: raw.ownedByMe ?? undefined,
    owners: (raw.owners ?? []).map((o) => ({
      emailAddress: o.emailAddress ?? undefined,
      displayName: o.displayName ?? undefined,
    })),
    shared: raw.shared ?? false,
    permissions: (raw.permissions ?? [])
      .filter((p): p is typeof p & { type: string; role: string } =>
        Boolean(p?.type && p?.role),
      )
      .map(
        (p): DrivePermission => ({
          id: p.id ?? undefined,
          type: p.type,
          role: p.role,
          emailAddress: p.emailAddress ?? undefined,
          domain: p.domain ?? undefined,
          allowFileDiscovery: p.allowFileDiscovery ?? undefined,
        }),
      ),
    createdTime: raw.createdTime ?? undefined,
    modifiedTime: raw.modifiedTime ?? undefined,
    md5Checksum: raw.md5Checksum ?? undefined,
    webViewLink: raw.webViewLink ?? undefined,
  };
}

function parseByteCount(value?: string | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

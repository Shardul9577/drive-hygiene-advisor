import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/env.js";

export type AuditEvent =
  | {
      type: "scan.started";
      userId: string;
      jobId: string;
      source: "google" | "mock";
      includeSharedDrives: boolean;
      maxPages: number;
      continuedFrom?: string;
    }
  | {
      type: "scan.finished";
      userId: string;
      jobId: string;
      status: string;
      filesSeen: number;
      score?: number;
    }
  | {
      type: "auth.login";
      userId: string;
      email: string;
    }
  | {
      type: "auth.token_expired";
      userId: string;
    };

/**
 * Append-only JSONL audit trail.
 *
 * Not a substitute for a SIEM, but enough for an enterprise reviewer to see
 * who scanned what and when without grepping application logs. Survives
 * restarts because it is written under DATA_DIR.
 */
export async function audit(event: AuditEvent): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
  try {
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(path.join(config.dataDir, "audit.jsonl"), line, "utf8");
  } catch (error) {
    console.error("[audit] failed to write event:", error);
  }
}

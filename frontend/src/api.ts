import type {
  DuplicateGroup,
  HygieneSummary,
  LargeFileInsight,
  ResultPage,
  RiskAssessment,
  ScanJob,
  ScoreHistoryEntry,
  User,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    // fetch only rejects on network failure, which for a local prototype almost
    // always means the API process is not running.
    throw new Error(`Cannot reach the API at ${API_URL}. Is the backend running?`);
  }

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    const err = new Error(data.error ?? `Request failed (${response.status})`) as Error & {
      code?: string;
    };
    err.code = data.code;
    throw err;
  }
  return data;
}

export interface StartScanBody {
  useMock?: boolean;
  includeSharedDrives?: boolean;
  continueFromJobId?: string;
  maxPages?: number;
}

export const api = {
  baseUrl: API_URL,

  getAuthStatus: () =>
    request<{ googleConfigured: boolean; loginUrl: string }>("/api/auth/status"),

  getMe: () => request<{ authenticated: boolean; user: User | null }>("/api/auth/me"),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  googleLoginUrl: () => `${API_URL}/api/auth/google`,

  startScan: (body?: StartScanBody) =>
    request<{ jobId: string; status: string; summary: HygieneSummary | null }>("/api/scan", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  getScan: (jobId: string) => request<{ job: ScanJob }>(`/api/scan/${jobId}`),

  latestScan: () => request<{ job: ScanJob | null }>("/api/scan/latest"),

  scanHistory: () => request<{ history: ScoreHistoryEntry[] }>("/api/scan/history"),

  /** One page of stored results. The client never holds the full list. */
  results: <T>(jobId: string, kind: ResultKind, page: number, pageSize: number) =>
    request<ResultPage<T>>(
      `/api/scan/${jobId}/results/${kind}?page=${page}&pageSize=${pageSize}`,
    ),
};

export type ResultKind = "duplicates" | "large-files" | "risks";

export type DuplicatePage = ResultPage<DuplicateGroup>;
export type LargeFilePage = ResultPage<LargeFileInsight>;
export type RiskPage = ResultPage<RiskAssessment>;

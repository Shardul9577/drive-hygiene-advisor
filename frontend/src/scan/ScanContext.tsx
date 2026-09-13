import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type ResultKind, type StartScanBody } from "../api";
import type { HygieneSummary, ResultPage, ScoreHistoryEntry } from "../types";

interface ScanContextValue {
  jobId: string | null;
  summary: HygieneSummary | null;
  status: string | null;
  scanning: boolean;
  progress: { pagesFetched: number; filesSeen: number } | null;
  restoring: boolean;
  error: string | null;
  history: ScoreHistoryEntry[];
  includeSharedDrives: boolean;
  setIncludeSharedDrives: (value: boolean) => void;
  runScan: (options?: { useMock?: boolean; continueScan?: boolean }) => Promise<void>;
  fetchResults: <T>(kind: ResultKind, page: number, pageSize: number) => Promise<ResultPage<T>>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

const TERMINAL = new Set(["completed", "interrupted", "failed"]);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<HygieneSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ pagesFetched: number; filesSeen: number } | null>(
    null,
  );
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [includeSharedDrives, setIncludeSharedDrives] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const { history: entries } = await api.scanHistory();
      setHistory(entries);
    } catch {
      /* history is optional UX */
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyJob = useCallback(
    (job: {
      id: string;
      status: string;
      summary: HygieneSummary | null;
      pagesFetched: number;
      filesSeen: number;
      error?: string;
    }) => {
      setJobId(job.id);
      setStatus(job.status);
      setProgress({ pagesFetched: job.pagesFetched, filesSeen: job.filesSeen });
      if (job.summary) setSummary(job.summary);
      if (job.status === "failed" && job.error) setError(job.error);
    },
    [],
  );

  const pollJob = useCallback(
    (id: string) => {
      stopPolling();
      setScanning(true);

      const tick = async () => {
        try {
          const { job } = await api.getScan(id);
          applyJob(job);
          if (TERMINAL.has(job.status)) {
            stopPolling();
            setScanning(false);
            void refreshHistory();
          }
        } catch (err) {
          stopPolling();
          setScanning(false);
          setError(err instanceof Error ? err.message : "Could not read scan progress");
        }
      };

      void tick();
      pollRef.current = setInterval(() => void tick(), 800);
    },
    [applyJob, refreshHistory, stopPolling],
  );

  // Results are persisted server-side, so a reload restores the last scan
  // instead of forcing the user to re-query Drive.
  useEffect(() => {
    let cancelled = false;

    Promise.all([api.latestScan(), api.scanHistory()])
      .then(([{ job }, { history: entries }]) => {
        if (cancelled) return;
        setHistory(entries);
        if (!job) return;
        applyJob(job);
        if (job.status === "running") pollJob(job.id);
      })
      .catch(() => {
        /* No previous scan is a normal first-run state, not an error. */
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [applyJob, pollJob, stopPolling]);

  const runScan = useCallback(
    async (options?: { useMock?: boolean; continueScan?: boolean }) => {
      setScanning(true);
      setError(null);
      setProgress({ pagesFetched: 0, filesSeen: 0 });

      const body: StartScanBody = {
        useMock: options?.useMock === true,
        includeSharedDrives: options?.useMock ? false : includeSharedDrives,
      };

      if (options?.continueScan && jobId) {
        body.continueFromJobId = jobId;
      }

      try {
        const { jobId: id } = await api.startScan(body);
        setJobId(id);
        setStatus("running");
        setSummary(null);
        pollJob(id);
      } catch (err) {
        setScanning(false);
        const message = err instanceof Error ? err.message : "Scan failed";
        const code = (err as Error & { code?: string }).code;
        if (code === "TOKEN_EXPIRED" || code === "MISSING_ACCESS_TOKEN") {
          setError(`${message} You’ll need to sign in with Google again.`);
        } else {
          setError(message);
        }
      }
    },
    [includeSharedDrives, jobId, pollJob],
  );

  const fetchResults = useCallback(
    async <T,>(kind: ResultKind, page: number, pageSize: number) => {
      if (!jobId) throw new Error("Run a scan first.");
      return api.results<T>(jobId, kind, page, pageSize);
    },
    [jobId],
  );

  const value = useMemo(
    () => ({
      jobId,
      summary,
      status,
      scanning,
      progress,
      restoring,
      error,
      history,
      includeSharedDrives,
      setIncludeSharedDrives,
      runScan,
      fetchResults,
    }),
    [
      jobId,
      summary,
      status,
      scanning,
      progress,
      restoring,
      error,
      history,
      includeSharedDrives,
      runScan,
      fetchResults,
    ],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
}

/**
 * Loads one page of results and re-fetches whenever the page changes.
 * Every page transition is a request; nothing is cached client-side, which is
 * what keeps browser memory independent of Drive size.
 */
export function useResultPage<T>(kind: ResultKind, pageSize = 10) {
  const { jobId, fetchResults, summary } = useScan();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ResultPage<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh scan invalidates the current page position.
  useEffect(() => setPage(0), [jobId, summary?.scannedAt]);

  useEffect(() => {
    if (!jobId || !summary) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchResults<T>(kind, page, pageSize)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load results");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, kind, page, pageSize, fetchResults, summary]);

  return { page, setPage, data, loading, error };
}

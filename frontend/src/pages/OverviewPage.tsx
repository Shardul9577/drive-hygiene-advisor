import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  GhostButton,
  PageHeader,
} from "../components/ui";
import { ScanControls } from "../components/ScanControls";
import { formatBytes } from "../lib/format";
import { useScan } from "../scan/ScanContext";
import type { HygieneSummary, ScoreHistoryEntry } from "../types";

const CHART_COLORS = [
  "#2563eb", "#7c3aed", "#0891b2", "#d97706", "#dc2626", "#059669", "#64748b",
];

export function OverviewPage() {
  const { summary, scanning, restoring, error, history, progress, runScan } = useScan();

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="A health check across duplicates, storage, and sharing exposure."
        actions={<ScanControls />}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary && (restoring || scanning) && (
        <LoadingHero scanning={scanning} progress={progress} />
      )}

      {!summary && !restoring && !scanning && (
        <EmptyState
          title="No scan yet"
          body="Scan your Drive, or load the demo dataset to see how the analysis works."
        />
      )}

      {summary && (
        <div className="space-y-6">
          {scanning && progress && (
            <Card className="border-blue-200/70 bg-blue-50/50">
              <p className="px-5 py-3.5 text-sm text-blue-900">
                Scan in progress — {progress.filesSeen.toLocaleString()} files across{" "}
                {progress.pagesFetched} pages so far…
              </p>
            </Card>
          )}

          <ScoreBanner summary={summary} />
          <PipelineStrip summary={summary} onContinue={() => runScan({ continueScan: true })} />
          {history.length > 1 && <ScoreHistory history={history} />}

          <div className="grid gap-6 lg:grid-cols-5">
            <AttentionCard summary={summary} />
            <StorageCard summary={summary} />
          </div>

          <ScanNotes summary={summary} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ score banner */

function ScoreBanner({ summary }: { summary: HygieneSummary }) {
  const tone =
    summary.score >= 85
      ? { ring: "#059669", tint: "from-emerald-500/10", text: "text-emerald-700" }
      : summary.score >= 70
        ? { ring: "#2563eb", tint: "from-blue-500/10", text: "text-blue-700" }
        : summary.score >= 50
          ? { ring: "#d97706", tint: "from-amber-500/10", text: "text-amber-700" }
          : { ring: "#dc2626", tint: "from-rose-500/10", text: "text-rose-700" };

  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${tone.tint} to-transparent`}>
      <div className="flex flex-col gap-8 p-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-5">
          <div
            className="grid h-[120px] w-[120px] shrink-0 place-items-center rounded-full transition-all"
            style={{
              background: `conic-gradient(${tone.ring} ${summary.score * 3.6}deg, #e2e8f0 0deg)`,
            }}
            role="img"
            aria-label={`Hygiene score ${summary.score} of 100`}
          >
            <div className="grid h-[98px] w-[98px] place-items-center rounded-full bg-white">
              <div className="text-center leading-none">
                <span className="text-[32px] font-bold tracking-tight text-slate-900">
                  {summary.score}
                </span>
                <span className="block pt-1 text-[10px] font-medium text-slate-400">/ 100</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Drive Hygiene Score
            </p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${tone.text}`}>
              {summary.label}
            </p>
            <p className="mt-1.5 max-w-xs text-xs leading-5 text-slate-500">
              Weighted across sharing exposure, duplicate clutter, and large-file pressure.
            </p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Files analysed" value={summary.filesAnalysed.toLocaleString()} />
          <Metric
            label="Broadly shared"
            value={summary.riskyFileCount.toLocaleString()}
            tone="text-rose-600"
            to="/dashboard/risky-files"
          />
          <Metric
            label="Duplicate groups"
            value={summary.duplicateGroupCount.toLocaleString()}
            tone="text-amber-600"
            to="/dashboard/duplicates"
          />
          <Metric
            label="Top files size"
            value={formatBytes(summary.largeFilesBytes)}
            to="/dashboard/large-files"
          />
        </div>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = "text-slate-900",
  to,
}: {
  label: string;
  value: string;
  tone?: string;
  to?: string;
}) {
  const body = (
    <div className="h-full rounded-xl border border-slate-200/70 bg-white/80 p-3.5 transition-colors hover:border-slate-300">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${tone}`}>{value}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/* --------------------------------------------------------- pipeline strip */

/**
 * Shows the scan pipeline with the numbers from the run that just happened.
 * It exists to make the architecture legible: files arrived in pages, were
 * folded as they arrived, were stored, and are now being read back in pages.
 */
function PipelineStrip({
  summary,
  onContinue,
}: {
  summary: HygieneSummary;
  onContinue: () => void;
}) {
  const { pagesFetched, pageSize, truncated } = summary.pagination;
  const totalResults =
    summary.counts.duplicates + summary.counts.largeFiles + summary.counts.risks;

  const steps = [
    {
      label: "Drive API",
      value: summary.source === "mock" ? "Mock source" : "Live metadata",
    },
    {
      label: "Paginated fetch",
      value: `${pagesFetched} ${pagesFetched === 1 ? "page" : "pages"} × ${pageSize}`,
    },
    {
      label: "Incremental analysis",
      value: `${summary.filesAnalysed.toLocaleString()} files folded`,
    },
    {
      label: "Results persisted",
      value: `${totalResults.toLocaleString()} findings`,
    },
    {
      label: "UI reads pages",
      value: "10 per request",
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Scan pipeline
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {truncated ? (
            <>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/15">
                Partial · resume point saved
              </span>
              <GhostButton onClick={onContinue}>Continue scan</GhostButton>
            </>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
              Completed
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-stretch">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-1 items-center gap-1">
            <div className="flex-1 rounded-xl bg-slate-50/80 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {step.label}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-slate-700">{step.value}</p>
            </div>
            {i < steps.length - 1 && (
              <svg
                className="hidden shrink-0 text-slate-300 sm:block"
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScoreHistory({ history }: { history: ScoreHistoryEntry[] }) {
  const chronological = [...history].reverse();
  const maxScore = 100;

  return (
    <Card>
      <CardHeader
        title="Score over time"
        hint="Persisted across backend restarts. Newest on the right."
      />
      <div className="flex items-end gap-2 px-6 pb-5 pt-4">
        {chronological.map((entry) => (
          <div key={entry.jobId} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[11px] font-semibold tabular-nums text-slate-600">
              {entry.score}
            </span>
            <div className="flex h-24 w-full items-end justify-center rounded-t-md bg-slate-50">
              <div
                className="w-full max-w-[2.5rem] rounded-t-md bg-blue-500/80"
                style={{ height: `${Math.max(8, (entry.score / maxScore) * 100)}%` }}
                title={`${entry.label} · ${new Date(entry.scannedAt).toLocaleString()}`}
              />
            </div>
            <span className="text-[10px] text-slate-400">
              {new Date(entry.scannedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- attention */

function AttentionCard({ summary }: { summary: HygieneSummary }) {
  const kindStyles: Record<string, string> = {
    risk: "bg-rose-50 text-rose-700",
    duplicate: "bg-blue-50 text-blue-700",
    large: "bg-violet-50 text-violet-700",
  };

  return (
    <Card className="lg:col-span-3">
      <CardHeader
        title="Needs attention first"
        hint="The highest-signal findings from this scan."
      />
      {summary.attention.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-400">
          Nothing stands out — this Drive looks tidy.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {summary.attention.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                  kindStyles[item.kind] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- storage */

function StorageCard({ summary }: { summary: HygieneSummary }) {
  const segments = buildSegments(summary.storageByType);

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Storage by type"
        hint="Counts quota billed, including retained revisions. Google Docs and Sheets use no quota and are excluded."
      />
      <div className="p-6">
        {segments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No size data available.</p>
        ) : (
          <>
            <div
              className="mx-auto h-32 w-32 rounded-full"
              style={{
                background: `conic-gradient(${segments
                  .map((s) => `${s.color} ${s.start}% ${s.start + s.percent}%`)
                  .join(", ")})`,
                mask: "radial-gradient(farthest-side, transparent 54%, #000 55%)",
                WebkitMask: "radial-gradient(farthest-side, transparent 54%, #000 55%)",
              }}
              role="img"
              aria-label="Storage distribution by file type"
            />
            <ul className="mt-5 space-y-2">
              {segments.map((s) => (
                <li key={s.category} className="flex items-center justify-between text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{s.category}</span>
                  </span>
                  <span className="shrink-0 font-medium text-slate-400">
                    {s.percent}% · {formatBytes(s.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function buildSegments(storage: HygieneSummary["storageByType"]) {
  let offset = 0;
  return storage.map((item, i) => {
    const start = offset;
    offset += item.percent;
    return { ...item, start, color: CHART_COLORS[i % CHART_COLORS.length] };
  });
}

/* ------------------------------------------------------------------- notes */

function ScanNotes({ summary }: { summary: HygieneSummary }) {
  const notes: string[] = [...summary.warnings];

  if (summary.unknownExposureCount > 0) {
    notes.push(
      `Drive did not return sharing settings for ${summary.unknownExposureCount.toLocaleString()} ` +
        `${summary.unknownExposureCount === 1 ? "file" : "files"}, so their exposure is unknown ` +
        "rather than low. They are excluded from the counts above.",
    );
  }

  if (summary.source === "mock") {
    notes.unshift(
      "These results come from the bundled demo dataset, not your Google Drive.",
    );
  }

  if (notes.length === 0) return null;

  return (
    <Card className="border-amber-200/70 bg-amber-50/50">
      <div className="flex gap-3 p-5">
        <span className="shrink-0 text-base leading-none text-amber-600">ℹ</span>
        <div className="space-y-1.5 text-sm text-amber-900">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- loading */

function LoadingHero({
  scanning,
  progress,
}: {
  scanning: boolean;
  progress: { pagesFetched: number; filesSeen: number } | null;
}) {
  return (
    <Card padded>
      <div className="flex items-center gap-4">
        <div className="h-[120px] w-[120px] shrink-0 animate-pulse rounded-full bg-slate-100" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-64 animate-pulse rounded-full bg-slate-50" />
          <p className="pt-2 text-sm text-slate-400">
            {scanning
              ? progress
                ? `Walking Drive… ${progress.filesSeen.toLocaleString()} files so far`
                : "Walking Drive one page at a time…"
              : "Restoring your last scan…"}
          </p>
        </div>
      </div>
    </Card>
  );
}

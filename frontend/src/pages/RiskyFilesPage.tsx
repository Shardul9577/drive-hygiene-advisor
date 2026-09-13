import {
  Card,
  EmptyState,
  ErrorBanner,
  OpenInDrive,
  PageHeader,
  Pagination,
  RiskBadge,
  SkeletonRows,
} from "../components/ui";
import { ScanControls } from "../components/ScanControls";
import { formatBytes } from "../lib/format";
import { useResultPage, useScan } from "../scan/ScanContext";
import type { HygieneSummary, RiskAssessment } from "../types";

const PAGE_SIZE = 5;

export function RiskyFilesPage() {
  const { summary } = useScan();
  const { setPage, data, loading, error } = useResultPage<RiskAssessment>(
    "risks",
    PAGE_SIZE,
  );

  return (
    <div>
      <PageHeader
        title="Sharing Exposure"
        subtitle="How widely each file can be reached, and the signals behind it."
        actions={<ScanControls />}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary ? (
        <EmptyState title="No scan yet" body="Run a scan to review how your files are shared." />
      ) : loading && !data ? (
        <SkeletonRows rows={3} />
      ) : !data || data.total === 0 ? (
        <>
          <EmptyState
            title="Nothing broadly shared"
            body="No files are shared by link, with a whole domain, or outside your organisation."
          />
          <Coverage summary={summary} listed={0} />
        </>
      ) : (
        <>
          {/* The framing is deliberate: this page reports access configuration,
              not a judgement. Only the owner knows whether the sharing is
              intentional, so nothing here calls a file unsafe. */}
          <div className="mb-5 rounded-2xl border border-blue-200/70 bg-blue-50/70 px-5 py-4">
            <p className="text-sm font-semibold text-blue-900">
              These are exposure levels, not verdicts
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-800/90">
              A high level means the file is widely reachable — which is often exactly right. A
              public brochure should be public. Use the signals below to decide whether each
              configuration still matches your intent.
            </p>
          </div>

          <Coverage summary={summary} listed={data.total} />

          <div className={`space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {data.items.map((risk) => (
              <ExposureCard key={risk.file.id} risk={risk} />
            ))}
          </div>

          <Pagination {...data} onChange={setPage} busy={loading} />
        </>
      )}
    </div>
  );
}

/**
 * Two caveats the ranked list cannot express on its own.
 *
 * The scan counts every exposed file but retains only the worst offenders, so
 * the Overview total can exceed what this page can page through. And a file
 * whose sharing settings Drive refused to return is never scored, so it would
 * otherwise vanish silently — unchecked has to read differently from private.
 */
function Coverage({ summary, listed }: { summary: HygieneSummary; listed: number }) {
  const hidden = summary.riskyFileCount - listed;
  const unknown = summary.unknownExposureCount;
  if (hidden <= 0 && unknown <= 0) return null;

  return (
    <div className="mb-5 space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4 text-sm leading-6 text-slate-600">
      {hidden > 0 && (
        <p>
          Showing the {listed.toLocaleString()} most exposed files. {hidden.toLocaleString()}{" "}
          more scored above Low and are counted in the Overview but not listed here.
        </p>
      )}
      {unknown > 0 && (
        <p>
          {unknown.toLocaleString()}{" "}
          {unknown === 1 ? "file’s sharing settings could" : "files’ sharing settings could"} not
          be read, so {unknown === 1 ? "it is" : "they are"} absent from this list. Unchecked is
          not the same as private.
        </p>
      )}
    </div>
  );
}

function ExposureCard({ risk }: { risk: RiskAssessment }) {
  const accent =
    risk.level === "HIGH"
      ? "before:bg-rose-500"
      : risk.level === "MEDIUM"
        ? "before:bg-amber-500"
        : "before:bg-emerald-500";

  return (
    <Card
      className={`relative overflow-hidden pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent}`}
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{risk.file.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span>
                Exposure score{" "}
                <strong className="font-semibold text-slate-600">{risk.score}</strong>
              </span>
              <span className="text-slate-200">|</span>
              <span>{formatBytes(risk.file.size)}</span>
              {risk.file.webViewLink && (
                <>
                  <span className="text-slate-200">|</span>
                  <OpenInDrive href={risk.file.webViewLink} />
                </>
              )}
            </p>
          </div>
          <RiskBadge level={risk.level} />
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3.5">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            What we found
          </p>
          <ul className="space-y-2">
            {risk.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2.5 text-sm text-slate-600">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="leading-6">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

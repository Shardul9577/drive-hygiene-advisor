import {
  Card,
  ConfidenceBadge,
  EmptyState,
  ErrorBanner,
  OpenInDrive,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "../components/ui";
import { ScanControls } from "../components/ScanControls";
import { formatBytes } from "../lib/format";
import { useResultPage, useScan } from "../scan/ScanContext";
import type { DuplicateGroup } from "../types";

const PAGE_SIZE = 5;

export function DuplicatesPage() {
  const { summary } = useScan();
  const { setPage, data, loading, error } = useResultPage<DuplicateGroup>(
    "duplicates",
    PAGE_SIZE,
  );

  const recoverable = data?.items.reduce((sum, g) => sum + g.recoverableBytes, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Duplicates"
        subtitle="Grouped by the strongest evidence each file's metadata supports."
        actions={<ScanControls />}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary ? (
        <EmptyState title="No scan yet" body="Run a scan to find duplicate candidates." />
      ) : loading && !data ? (
        <SkeletonRows rows={3} />
      ) : !data || data.total === 0 ? (
        <EmptyState
          title="No duplicates found"
          body="Nothing matched by checksum, or by name, type and size together."
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 text-sm">
            <span className="text-slate-500">
              <strong className="font-semibold text-slate-800">{data.total}</strong> group
              {data.total === 1 ? "" : "s"} found
            </span>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">
              <strong className="font-semibold text-emerald-600">
                {formatBytes(recoverable)}
              </strong>{" "}
              recoverable on this page
            </span>
          </div>

          <div className={`space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {data.items.map((group) => (
              <DuplicateCard key={group.id} group={group} />
            ))}
          </div>

          <Pagination {...data} onChange={setPage} busy={loading} />
        </>
      )}
    </div>
  );
}

function DuplicateCard({ group }: { group: DuplicateGroup }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <ConfidenceBadge confidence={group.confidence} />
          <span className="text-xs text-slate-500">{group.files.length} copies</span>
        </div>
        <span className="text-xs text-slate-500">
          Recoverable{" "}
          <strong className="font-semibold text-emerald-600">
            {formatBytes(group.recoverableBytes)}
          </strong>
        </span>
      </div>

      <p className="px-5 pt-3 text-xs text-slate-500">{group.reason}</p>

      <ul className="m-5 mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
        {group.files.map(({ file, reason }, index) => (
          <li
            key={file.id}
            className="flex items-center justify-between gap-3 bg-white px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
                  index === 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-400"
                }`}
                title={index === 0 ? "Presumed keeper" : "Redundant copy"}
              >
                {index === 0 ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400">{reason}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs font-medium text-slate-500">
                {formatBytes(file.size)}
              </span>
              <OpenInDrive href={file.webViewLink} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

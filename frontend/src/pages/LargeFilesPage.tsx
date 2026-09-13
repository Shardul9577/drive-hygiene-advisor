import {
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  OpenInDrive,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "../components/ui";
import { ScanControls } from "../components/ScanControls";
import { formatBytes, formatDate } from "../lib/format";
import { useResultPage, useScan } from "../scan/ScanContext";
import type { LargeFileInsight } from "../types";

const PAGE_SIZE = 10;
const BAR_COLORS = [
  "#2563eb", "#7c3aed", "#0891b2", "#d97706", "#dc2626", "#059669", "#64748b",
];

export function LargeFilesPage() {
  const { summary } = useScan();
  const { setPage, data, loading, error } = useResultPage<LargeFileInsight>(
    "large-files",
    PAGE_SIZE,
  );

  const biggest = data?.items[0]?.sizeBytes ?? 0;

  return (
    <div>
      <PageHeader
        title="Large Files"
        subtitle="The biggest space consumers, ranked from a bounded leaderboard."
        actions={<ScanControls />}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary ? (
        <EmptyState title="No scan yet" body="Run a scan to rank your largest files." />
      ) : loading && !data ? (
        <SkeletonRows rows={4} />
      ) : !data || data.total === 0 ? (
        <EmptyState
          title="No sized files"
          body="Every file in this scan reported no size, which is normal for Google-native documents."
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Largest files"
              hint={`Top ${data.total} by size · page ${data.page + 1} of ${data.totalPages}`}
            />
            <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-50" : ""}`}>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <Th className="w-12">#</Th>
                    <Th>Name</Th>
                    <Th className="w-44">Size</Th>
                    <Th className="w-32">Type</Th>
                    <Th className="w-28">Modified</Th>
                    <Th className="w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.items.map((item, i) => {
                    const rank = data.page * data.pageSize + i + 1;
                    const share = biggest > 0 ? (item.sizeBytes / biggest) * 100 : 0;
                    return (
                      <tr key={item.file.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-6 py-3.5 text-xs font-medium tabular-nums text-slate-300">
                          {rank}
                        </td>
                        <td className="max-w-xs px-6 py-3.5">
                          <p className="truncate font-medium text-slate-800">{item.file.name}</p>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.max(share, 3)}%` }}
                              />
                            </div>
                            <span className="font-semibold tabular-nums text-slate-800">
                              {formatBytes(item.sizeBytes)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-400">
                          {shortMime(item.file.mimeType)}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-400">
                          {formatDate(item.file.modifiedTime)}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <OpenInDrive href={item.file.webViewLink} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination {...data} onChange={setPage} busy={loading} />

          <Card>
            <CardHeader
              title="Storage by file type"
              hint="Computed across the whole scan, not just this page."
            />
            <div className="space-y-4 p-6">
              {summary.storageByType.map((row, i) => (
                <div key={row.category}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {row.category}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        ({row.fileCount} {row.fileCount === 1 ? "file" : "files"})
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.percent}% · {formatBytes(row.bytes)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(row.percent, 0.5)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

function shortMime(mime: string): string {
  if (mime.startsWith("application/vnd.google-apps.")) {
    return `Google ${mime.replace("application/vnd.google-apps.", "")}`;
  }
  if (mime.includes("presentationml")) return "pptx";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("wordprocessingml")) return "docx";
  return (mime.split("/")[1] ?? mime).slice(0, 18);
}

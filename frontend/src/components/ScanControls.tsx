import { GhostButton, PrimaryButton, Spinner } from "./ui";
import { useScan } from "../scan/ScanContext";

/** Scan triggers, shown on every dashboard page so a rescan is always one click away. */
export function ScanControls() {
  const {
    runScan,
    scanning,
    summary,
    progress,
    includeSharedDrives,
    setIncludeSharedDrives,
  } = useScan();

  const canContinue = Boolean(summary?.pagination.truncated);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {summary && (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500">
            {summary.source === "mock" ? "Demo data" : "Google Drive"}
          </span>
        )}

        <PrimaryButton onClick={() => runScan({ useMock: false })} disabled={scanning}>
          {scanning ? (
            <>
              <Spinner />{" "}
              {progress
                ? `Scanning… ${progress.filesSeen.toLocaleString()} files`
                : "Scanning…"}
            </>
          ) : (
            <>
              <ScanIcon /> {summary ? "Rescan Drive" : "Scan my Drive"}
            </>
          )}
        </PrimaryButton>

        {canContinue && (
          <GhostButton onClick={() => runScan({ continueScan: true })} disabled={scanning}>
            Continue scan
          </GhostButton>
        )}

        <GhostButton onClick={() => runScan({ useMock: true })} disabled={scanning}>
          Demo data
        </GhostButton>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={includeSharedDrives}
          disabled={scanning}
          onChange={(e) => setIncludeSharedDrives(e.target.checked)}
        />
        Include Shared Drives (files you own)
      </label>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

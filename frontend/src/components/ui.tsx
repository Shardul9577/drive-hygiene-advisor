import type { ReactNode } from "react";
import type { RiskLevel } from "../types";

/* ------------------------------------------------------------------ layout */

export function Card({
  children,
  className = "",
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
        padded ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-slate-100 px-6 py-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}

/* ----------------------------------------------------------------- buttons */

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ badges */

export function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    HIGH: "bg-rose-50 text-rose-700 ring-rose-600/15",
    MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/15",
    LOW: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${styles[level]}`}
    >
      {level}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    strong: "bg-blue-50 text-blue-700 ring-blue-600/15",
    likely: "bg-violet-50 text-violet-700 ring-violet-600/15",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${
        styles[confidence] ?? styles.likely
      }`}
    >
      {confidence} match
    </span>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-400">
        {icon ?? <SearchIcon />}
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">{body}</p>
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50 px-5 py-4 text-sm text-rose-800"
    >
      <span className="mt-px shrink-0 text-base leading-none">⚠</span>
      <div>{children}</div>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5">
          <div className="h-3.5 w-2/5 rounded-full bg-slate-100" />
          <div className="mt-3 h-3 w-3/5 rounded-full bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- pagination */

/**
 * Paging control for stored analysis results.
 *
 * Each change fetches one page from the API rather than filtering an array the
 * client already holds — the browser never receives the whole result set.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  hasNext,
  hasPrevious,
  onChange,
  busy,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  const isBusy = busy === true;
  if (total === 0) return null;

  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-700">{first}–{last}</span> of{" "}
        <span className="font-semibold text-slate-700">{total}</span>
        <span className="ml-2 text-slate-300">|</span>
        <span className="ml-2 text-slate-400">fetched one page at a time</span>
      </p>

      <div className="flex items-center gap-1">
        <PageArrow
          direction="prev"
          disabled={!hasPrevious || isBusy}
          onClick={() => onChange(page - 1)}
        />

        {pageWindow(page, totalPages).map((entry, i) =>
          entry === "gap" ? (
            <span key={`gap-${i}`} className="px-1.5 text-xs text-slate-300">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              disabled={isBusy}
              onClick={() => onChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                entry === page
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {entry + 1}
            </button>
          ),
        )}

        <PageArrow
          direction="next"
          disabled={!hasNext || isBusy}
          onClick={() => onChange(page + 1)}
        />
      </div>
    </div>
  );
}

function PageArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous page" : "Next page"}
      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={direction === "prev" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
      </svg>
    </button>
  );
}

/** Compact page list: first, last, and a window around the current page. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);

  const out: Array<number | "gap"> = [0];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages - 2, page + 1);

  if (start > 1) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 2) out.push("gap");

  out.push(totalPages - 1);
  return out;
}

/* ------------------------------------------------------------------- icons */

export function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Deep link into the Google Drive UI when Drive returned a webViewLink. */
export function OpenInDrive({ href }: { href?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
    >
      Open in Drive
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}

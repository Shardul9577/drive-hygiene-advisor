import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useScan } from "../scan/ScanContext";
import type { HygieneSummary } from "../types";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
  count?: (s: HygieneSummary) => number;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Overview",
    end: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/dashboard/duplicates",
    label: "Duplicates",
    count: (s) => s.counts.duplicates,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M4 16V5a1 1 0 011-1h11" />
      </svg>
    ),
  },
  {
    to: "/dashboard/large-files",
    label: "Large Files",
    count: (s) => s.counts.largeFiles,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      </svg>
    ),
  },
  {
    to: "/dashboard/risky-files",
    label: "Exposure",
    count: (s) => s.counts.risks,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { summary, scanning } = useScan();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-slate-200/80 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-600/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-slate-900">
              Hygiene Advisor
            </p>
            <p className="text-[11px] text-slate-400">Google Drive</p>
          </div>
        </div>

        {summary && <ScoreChip summary={summary} />}

        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Analysis
          </p>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.count && summary && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.count(summary)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3">
            {user?.picture ? (
              <img
                src={user.picture}
                alt=""
                className="h-9 w-9 rounded-full ring-2 ring-slate-100"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-xs font-bold text-white">
                {user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-800">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {scanning && (
          <div
            className="h-0.5 w-full overflow-hidden bg-blue-100"
            role="progressbar"
            aria-label="Scan in progress"
          >
            <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-blue-600" />
          </div>
        )}
        <main className="flex-1 overflow-auto px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Compact score readout so the headline number follows you between pages. */
function ScoreChip({ summary }: { summary: HygieneSummary }) {
  const tone =
    summary.score >= 85
      ? "text-emerald-600"
      : summary.score >= 70
        ? "text-blue-600"
        : summary.score >= 50
          ? "text-amber-600"
          : "text-rose-600";

  return (
    <div className="mx-3 mb-1 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Hygiene score
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tracking-tight ${tone}`}>{summary.score}</span>
        <span className="text-xs font-medium text-slate-400">/ 100 · {summary.label}</span>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const FEATURES = [
  {
    title: "Duplicate candidates",
    body: "Grouped by checksum where Drive provides one, and by name, type and size together where it does not. Each group states which evidence it used.",
    accent: "from-blue-500 to-indigo-600",
    icon: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M4 16V5a1 1 0 011-1h11" />
      </>
    ),
  },
  {
    title: "Storage pressure",
    body: "The largest files ranked from a bounded leaderboard, plus a breakdown by file type so you can see what is actually consuming the quota.",
    accent: "from-violet-500 to-purple-600",
    icon: (
      <>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      </>
    ),
  },
  {
    title: "Sharing exposure",
    body: "Link sharing, domain-wide access and external collaborators, scored and explained. Exposure levels, never safety verdicts.",
    accent: "from-rose-500 to-red-600",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
];

const PIPELINE = [
  "Drive API",
  "Paginated fetch",
  "Incremental analysis",
  "Persisted results",
  "UI reads pages",
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-600/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-slate-900">
              Drive Hygiene Advisor
            </span>
          </div>

          <Link
            to={user ? "/dashboard" : "/login"}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.98]"
          >
            {user ? "Open dashboard" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(50rem 28rem at 50% -8rem, rgba(59,130,246,0.18), transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50 px-3.5 py-1.5 text-[12px] font-semibold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Read-only · metadata scope only
          </span>

          <h1 className="mt-6 text-[44px] font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-[56px]">
            Understand your Drive
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              before you clean it
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-8 text-slate-600">
            Surfaces duplicate candidates, storage-heavy files, and broadly shared documents —
            then explains the reasoning behind every finding. It reports; you decide.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={user ? "/dashboard" : "/login"}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 active:scale-[0.98]"
            >
              {user ? "Open dashboard" : "Continue with Google"}
            </Link>
            <a
              href="#how"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
            >
              How it works
            </a>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            Never requests permission to read, edit, or delete file contents.
          </p>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
            >
              <div
                className={`mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-sm`}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {feature.icon}
                </svg>
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* pipeline */}
      <section id="how" className="border-y border-slate-200/70 bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Built for a Drive with millions of files
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Files are fetched one page at a time and folded into running totals as they
              arrive. Nothing holds the whole Drive in memory — not the scanner, not the API
              response, not the browser.
            </p>
          </div>

          <ol className="mt-12 flex flex-col items-stretch gap-2 sm:flex-row">
            {PIPELINE.map((step, i) => (
              <li key={step} className="flex flex-1 items-center gap-2">
                <div className="flex-1 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-center">
                  <span className="block text-[10px] font-bold tracking-widest text-slate-300">
                    0{i + 1}
                  </span>
                  <span className="mt-1.5 block text-[13px] font-semibold text-slate-700">
                    {step}
                  </span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <svg className="hidden shrink-0 text-slate-300 sm:block" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-8 text-center text-xs text-slate-400">
            A scan that fails on page 40 keeps the first 39 pages of analysis and saves the
            cursor, so it can resume rather than restart.
          </p>
        </div>
      </section>

      <footer className="py-10 text-center text-xs text-slate-400">
        Analysis only — this prototype never deletes, moves, or changes sharing on a file.
      </footer>
    </div>
  );
}

import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const BULLETS = [
  "Duplicate candidates, tiered by the evidence behind each match",
  "Largest files and a storage breakdown by type",
  "Sharing exposure explained in plain language",
  "A Drive Hygiene Score with history across scans",
];

export function LoginPage() {
  const { user, loading, loginWithGoogle, googleConfigured } = useAuth();
  const [params] = useSearchParams();
  const error = params.get("error");

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 px-14 py-12 text-white lg:flex lg:w-[46%]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(36rem 24rem at 15% 10%, rgba(59,130,246,0.35), transparent 65%), radial-gradient(30rem 22rem at 85% 90%, rgba(99,102,241,0.3), transparent 65%)",
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold">Drive Hygiene Advisor</span>
        </div>

        <div className="relative">
          <h2 className="text-[38px] font-bold leading-[1.15] tracking-tight">
            Know what's hiding
            <br />
            in your Drive.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-7 text-slate-300">
            Surface duplicates, storage pressure, and broadly shared files — without changing a
            single thing.
          </p>

          <ul className="mt-9 space-y-3.5">
            {BULLETS.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-500/20 text-[11px] text-blue-300 ring-1 ring-blue-400/25">
                  ✓
                </span>
                <span className="leading-6">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">
          Scope requested:{" "}
          <code className="rounded-md bg-white/10 px-1.5 py-0.5 text-slate-200">
            drive.metadata.readonly
          </code>{" "}
          · analysis only
        </p>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-600/25">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <h1 className="text-center text-[26px] font-bold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-sm text-slate-500">
            New here? Same button — Google handles sign-up and sign-in.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-2xl border border-rose-200/70 bg-rose-50 px-4 py-3.5 text-sm text-rose-800"
            >
              <span className="mt-px shrink-0">⚠</span>
              {decodeError(error)}
            </div>
          )}

          {!googleConfigured && (
            <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3.5 text-sm">
              <p className="font-semibold text-amber-900">Backend not configured</p>
              <p className="mt-1 leading-6 text-amber-800">
                Add <Mono>GOOGLE_CLIENT_ID</Mono> and <Mono>GOOGLE_CLIENT_SECRET</Mono> to{" "}
                <Mono>backend/.env</Mono>, then restart the API.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={loginWithGoogle}
            disabled={!googleConfigured || loading}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="mt-8 flex items-center gap-3 text-[11px] font-medium text-slate-400">
            <hr className="flex-1 border-slate-200" />
            READ-ONLY ACCESS
            <hr className="flex-1 border-slate-200" />
          </div>

          <p className="mt-4 text-center text-xs leading-6 text-slate-400">
            This app can list your file names and sharing settings. It cannot open, edit, or
            delete file contents.
          </p>

          <p className="mt-8 text-center text-xs">
            <Link to="/" className="font-medium text-blue-600 hover:underline">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
      {children}
    </code>
  );
}

function decodeError(error: string) {
  if (error === "oauth_not_configured") return "Google OAuth is not configured on the backend.";
  if (error === "auth_failed" || error === "login_failed") {
    return "Google sign-in failed. Please try again.";
  }
  if (error === "addon_handoff_expired") {
    return "That Drive add-on link expired. Open the add-on again, or sign in below.";
  }
  if (error === "addon_handoff_failed") {
    return "Could not finish sign-in from the Drive add-on. Please sign in below.";
  }
  return decodeURIComponent(error);
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.5-.4-3.5z" />
    </svg>
  );
}

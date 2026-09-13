# Google Drive Hygiene Advisor

Reads your Google Drive metadata and flags files worth reviewing: duplicates, storage hogs, and files shared more widely than you might realise. It never touches file content, never deletes anything, and never changes a permission.

---

## Quick start

Two terminals — backend on `:4000`, frontend on `:5173`.

```bash
# Backend
cd backend
cp .env.example .env   # add your Google credentials
npm install && npm run dev

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm install && npm run dev
```

Open **http://localhost:5173**. No Google project set up yet? Hit **Try demo data** on the login page to run everything against a bundled mock Drive.

### Google Cloud setup

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
2. **APIs & Services → Library** → enable Google Drive API
3. **OAuth consent screen** → External → add your email as a test user
4. **Credentials → Create OAuth client → Web application**
   - Origin: `http://localhost:5173`
   - Redirect URI: `http://localhost:4000/api/auth/google/callback`
5. Paste the client ID and secret into `backend/.env`

---

## How it works

Each page of Drive files is folded into accumulators and discarded before fetching the next — there's no array holding your whole Drive in memory. The cursor is saved after every page, so a scan can resume mid-way if it's interrupted.

Results are stored on the server and the UI pulls them one page at a time, for the same reason. The `POST /api/scan` response only returns summary counts; detail lists come through `GET /api/scan/:id/results/:kind?page=&pageSize=`.

The `DriveRepository` interface is the only place the code touches Google. `MockDriveRepository` and `GoogleDriveRepository` are interchangeable — nothing above that layer knows which one is running.

```
backend/src/
├── controllers/   AuthController, ScanController
├── middleware/    requireAuth, errorHandler
├── services/
│   ├── drive/     repository interface, Google + mock impls, retry
│   ├── analysis/  duplicates, risk, storage, accumulators
│   ├── scan/      ScanJobStore, scanRunner
│   └── audit/     append-only JSONL audit trail
└── types/

frontend/src/
├── auth/          AuthContext, ProtectedRoute
├── pages/         Overview, Duplicates, LargeFiles, RiskyFiles
└── scan/          ScanContext, useResultPage
```

---

## OAuth scopes

| Scope | Why |
|---|---|
| `openid` `email` `profile` | Identify the signed-in user |
| `drive.metadata.readonly` | Names, sizes, checksums, permissions — no file content |

Not requested: `drive`, `drive.readonly` (would grant file content), `drive.permissions` (would allow changing sharing). There's no refresh token either — the app only needs access while you're looking at it.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/auth/status` | Whether OAuth is configured |
| `GET` | `/api/auth/google` | Start OAuth |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | End session |
| `POST` | `/api/scan` | Start a scan → `202` + job id |
| `GET` | `/api/scan/:id` | Job progress + summary |
| `GET` | `/api/scan/:id/results/:kind` | Paginated results (`duplicates`, `large-files`, `risks`) |
| `GET` | `/api/scan/latest` | Most recent job |
| `GET` | `/api/scan/history` | Score history |

---

## Tests

```bash
cd backend && npm test
```

39 tests: duplicate tiering and merge logic, exposure banding, storage accounting, bounded-memory accumulator behaviour, result paging, scan pipeline (page walking, checkpointing, partial failure recovery, resume-from-cursor).

No HTTP-level or frontend tests currently.

---

## Limitations

- Default scan cap is 1,000 files (10 pages); "Continue" raises that to 5,000. Increase `SCAN_MAX_PAGES` for production.
- Google Docs/Sheets have no checksum or size, so identical native files can't be detected.
- Persistence is file-based (`backend/data/`); production would want Postgres/Redis.
- Session expires after ~55 min (no refresh token by design).
- The internal/external exposure signal is only meaningful on Google Workspace accounts.

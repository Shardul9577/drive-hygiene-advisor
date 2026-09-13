# Technical Decisions

---

## 1. Duplicate detection uses two confidence tiers

Drive doesn't give checksums for everything. Google Docs and Sheets have neither a checksum nor a size field, and even for binary files Drive sometimes omits the checksum on older copies.

A checksum-only detector misses the most common real duplicate — the same PDF saved twice. A filename-only detector produces too many false positives (every `notes.txt` in every folder would match). So duplicates use two keys:

| Tier | Key | When |
|---|---|---|
| **Strong** | `md5Checksum` + size | Drive provided a checksum |
| **Likely** | normalised name + MIME + exact size | No checksum available |

Each file is indexed under **both** keys it qualifies for. This matters: if three copies of a file exist and only two have checksums, the naive approach (pick the best key per file) puts the third copy in a different namespace and drops it from the group. Indexing under both and merging overlapping groups keeps it.

If two files share a name key but carry different checksums they're provably not the same file, so nothing is grouped — better to miss a duplicate than invent one.

Identical Google Docs can never be detected. Drive exposes no field that would prove it, and the UI says so rather than hiding it.

---

## 2. Risk scores exposure, not danger

The app can't read file content, so it can't know whether a publicly shared file is a product brochure (fine) or a payroll sheet (not fine). Only the owner can judge that.

What the app can measure is access breadth. Signals and weights:

| Signal | Points |
|---|---|
| Anyone-with-link | +50 |
| Shared outside the owner's domain | +25 |
| External collaborator has edit rights | +15 |
| Shared with a Google Group | +15 |
| Shared with entire domain | +10 |
| Sensitive-looking filename | +10 |

Bands: 0–20 Low · 21–49 Medium · 50+ High. The UI always shows which signals fired, and frames them as "access configuration" rather than a verdict.

One edge case worth noting: Drive omits the `permissions` array entirely when the ACL can't be read. Treating that as a score of 0 would show an unknown file as safely green. Instead, files with unreadable ACLs are counted separately as unknown exposure and labelled as such in the UI — absence of data is not the same as private.

---

## 3. Narrowest OAuth scope that works, no offline access

Scopes requested: `openid email profile` and `drive.metadata.readonly`.

`drive.readonly` was deliberately skipped — it grants access to file content, which this app never needs. `drive.permissions` was skipped too, since it would allow changing sharing settings. There's no endpoint in the codebase that could use either scope even if they were added.

No refresh token is requested (`accessType: offline` is not set). The app only reads metadata while someone is actively looking at a dashboard — storing a durable credential for that would be over-collection. The tradeoff is sessions expire after ~55 minutes, which is fine for an analysis tool.

The OAuth `state` parameter is explicitly enabled (`state: true` on the passport strategy). Without it, `passport-oauth2` uses a NullStore and the callback will accept a code from a session that never initiated the flow.

---

## 4. The pipeline folds pages — it never holds the full Drive in memory

The straightforward approach is: fetch all pages into an array, then analyse. That paginates the fetch but the analysis still depends on the whole dataset, so memory still scales with Drive size.

Instead each page is folded into accumulators and released:

| Accumulator | Memory |
|---|---|
| `StorageAccumulator` | O(1) — bounded top-25 leaderboard, rest discarded |
| `RiskAccumulator` | O(1) — per-file score, only worst 100 retained |
| `DuplicateAccumulator` | O(distinct keys) — honest exception, see below |

`DuplicateAccumulator` can't be O(1) because duplicate detection requires comparing files against each other. The in-process Map is a stand-in for a database `GROUP BY` — the same algorithm runs as `SELECT … GROUP BY key HAVING COUNT(*) > 1` in production, just with the index in Postgres instead of memory.

The scan returns a `202` immediately and the UI polls for progress. `POST /api/scan` returns only summary counts — returning the full result inline would just move the unbounded-payload problem from the scanner to the HTTP response. Detail pages come through a separate paginated endpoint, capped at 50 results per request server-side.

The page cursor is checkpointed after every page (not just at the end), so an interrupted scan resumes where it left off rather than starting over.

---

## 5. Missing metadata degrades the result gracefully — it doesn't break the scan

Real Drive accounts have Docs with no size, files whose ACLs can't be read, and enough files to hit rate limits. Treating those as error conditions would make the tool unusable on a real account.

| Missing field | Behaviour |
|---|---|
| `size` | Excluded from storage totals — not counted as zero, which would distort percentages |
| `md5Checksum` | Matched via name key, merged with checksummed siblings, labelled "likely" |
| `permissions` | Counted as unknown exposure, stated in the UI — not treated as safe |
| A page fails (429/5xx) | Earlier pages are kept; partial report returned with resume cursor and a note on coverage |

Storage uses `quotaBytesUsed` (what Drive bills, including revision history) rather than `size` (current version bytes). Duplicate detection uses `size` because it's comparing content — two identical files with different revision histories share a `size` but not a `quotaBytesUsed`. Google-native files report `quotaBytesUsed: 0` and are excluded rather than shown as free.

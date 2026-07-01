# AGENTS.md

Guidance for developers **and AI coding agents** working on this app. Read this before changing
data-writing behavior — several MI API details here are non-obvious and easy to get wrong.

## What this app is

A Metric Insights **Custom App** (a Portal Page template built with
[`@metricinsights/pp-dev`](https://www.npmjs.com/package/@metricinsights/pp-dev) + React + TypeScript).
It lets a user pick a **manual/CSV dataset**, add rows to it, view the last 10 rows, delete a row,
and — for an empty dataset — define its columns from scratch. It runs **inside** the MI page shell
(the native top bar is rendered around it).

It is intentionally small and is meant as a starting point you can customize.

## Architecture in one paragraph

The React app is served from the MI instance and talks to MI over its REST API using
**root-relative `/api/...` paths**. In production the browser's MI **session cookie** authenticates
every request (same origin). In local dev, the pp-dev proxy forwards `/api/*` to `backendBaseURL`
and injects auth (a personal access token or interactive login). There is **no separate backend** in
this repo — all logic is client-side against MI's API.

---

## ⚠️ Critical MI API facts (the non-obvious stuff)

These were established by reading the MI backend. **They are internal/observed behaviors, not a
published, stable API contract** — verify them against your MI version before relying on them, and
re-check after MI upgrades. This is the single most important caveat in this document.

1. **Only `data_fetch_method = 'manual'` datasets are writable.** The app lists them via
   `GET /api/dataset?data_source=manual` (MI computes `data_source` from `data_fetch_method`; for a
   manual dataset it is literally `"manual"`). SQL/plugin/external datasets are excluded; writing to
   one returns `"Not manual dataset"`.

2. **`api/*` routes are CSRF-exempt**, so no CSRF token is needed. (Non-`api/` editor routes like
   `/data/editor/...` are **not** exempt — avoid them, or you must send `X-XSRF-TOKEN`.)

3. **Adding a row = `PUT /api/dataset_data`.** Row objects are keyed by each column's
   `reference_name`. `append: "Y"` appends; `append: "N"` overwrites all data.

4. **The first write to an empty dataset must use `append: "N"`.** With `append: "Y"` the backend
   reads the dataset's storage table *before* writing; for a never-populated dataset that table
   doesn't exist yet, giving `Table 'dataset_<id>' doesn't exist` (SQL 1146). `append: "N"` skips the
   read and **provisions the table + columns + row** in one call.

5. **There is no "create column" endpoint.** Columns are **auto-created from the data keys** on that
   first write (`column_name = reference_name = the key`; `value_type` is detected from the value).
   So a numeric column needs a numeric first value or it is detected as text.

6. **There is no per-row delete.** A `measurement_time` instance is the atomic unit. To delete one
   row the app **reads all rows, drops the matched one, and rewrites the rest** with `append: "N"`
   (or clears all data via `PUT /api/dataset/id/{id}?call=delete_data` when removing the last row).
   Consequences that are baked into the code:
   - Delete is **gated by `MAX_DELETE_ROWS` (2,000)** and disabled for historical datasets — a
     full-dataset read+rewrite in the browser is not safe for large or snapshot datasets.
   - Rows are matched **by value** (no stable row id exists); if the match fails, the delete
     **aborts without writing** (so nothing is lost).
   - Surviving rows are round-tripped **as read** (raw values), so a delete does not reformat them.

7. **Reading rows: `POST /api/dataset_data`** (`{ limit, offset, amount: "Y" }`). "Last N" is done by
   reading the total (`amount`) and offsetting to the tail (`offset = total − N`). A **large offset is
   slow** on big datasets — viewing a huge dataset lags.

8. **Historical datasets (`keep_history === "Y"`) require `measurement_time`** on every write
   (`YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`).

9. **No concurrency control.** Add and delete are read-modify-write with no locking. Concurrent
   editors can silently overwrite each other; delete can drop rows another user added between the
   read and the rewrite. Treat as single-editor.

---

## Template variables

MI substitutes `[Variable Name]` tokens declared in `index.html`'s `window.PP_VARIABLES` with the
values of the hosting App's editable variables at render time. This app exposes one optional
variable, **`App Title`** (`APP_TITLE`), read in `src/constants.ts` (unreplaced placeholders fall
back to a default). Add more by declaring a token in `index.html` and reading it in `constants.ts`.

## Configuration (per MI instance)

Edit `pp-dev.config.ts`:

- `backendBaseURL` — the MI instance (e.g. `https://your-instance.metricinsights.com`).
- `appId` — the hosting App / Portal Page ID (optional; only needed to load editable variables in dev).
- `miHudLess` — `false` loads the MI top bar/HUD from the backend in dev.

For local dev, put a personal access token in `.env` (git-ignored):

```bash
MI_ACCESS_TOKEN=your_personal_access_token
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (HMR + API proxy) at http://localhost:3000 |
| `npm run build` | Type-check, build to `dist/`, and package `dist-zip/<name>.zip` |
| `npm run lint` | ESLint (max-warnings 0) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests via Node's built-in runner (`node --test`) — requires Node ≥ 22 |

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests on every push/PR.

## Deploy to Metric Insights

`npm run build`, then in MI: **Editor → Apps → Templates → ＋**, upload `dist-zip/<name>.zip`, then
create an **App** from that template and set its variables/sharing. The signed-in user needs **edit**
permission on the target dataset. Full steps are in `README.md`.

## Project layout

- `src/api/mi.ts` — the entire MI API client (list/read/add/replace/clear, column reads). Start here.
- `src/lib/rows.ts` — pure helpers (column-key resolution, value rendering, row matching, payload
  building). Unit-tested in `src/lib/rows.test.ts`.
- `src/components/add-rows/add-rows.tsx` — the UI: dataset picker, add-row form, recent-rows table
  with delete, and the define-columns-from-scratch flow.
- `src/constants.ts` / `index.html` — template-variable wiring.
- `pp-dev.config.ts` — instance/build config.

## Conventions

- TypeScript strict; **no `any`** (lint enforces). ESLint + Prettier are authoritative — run
  `npx eslint . --fix` and `npx prettier --write` before committing; `npm run lint` must be clean.
- Keep data-shaping logic in `src/lib/rows.ts` as **pure, tested functions**. Add tests when you
  touch write/delete logic — it mutates customer data.
- API calls stay in `src/api/mi.ts`; components don't call `fetch` directly.

## Known limitations (safe to hand a customer)

- Manual/CSV datasets only; historical datasets can add rows but not delete them.
- Delete rewrites the whole dataset and is capped at 2,000 rows — edit larger datasets in the MI
  dataset editor.
- No concurrent-edit protection (single-editor assumption).
- "Last 10 rows" is storage order, not guaranteed insertion order; a large dataset's read is slow.
- Behavior depends on MI's current API semantics (see the Critical section) — validate after upgrades.

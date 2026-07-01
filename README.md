# Add Dataset Rows — Metric Insights Custom App

A minimal Metric Insights **Custom App** (Power Pack / Portal Page template, built with
[pp-dev](https://www.npmjs.com/package/@metricinsights/pp-dev) + React + TypeScript).

It lets a user:

1. **Pick a dataset** from a dropdown of the datasets they can access.
2. **Fill in the column values** — inputs are generated automatically from the dataset's
   schema (one per column, typed by the column's `value_type`).
3. **Add a row** — appends the row to the dataset via the MI REST API.
4. **See the last 10 rows** of the dataset in a table below the form (refreshed after each add),
   with a "showing last N of M" count.
5. **Start from scratch** — if the dataset has no columns yet, define column names and the first
   row's values; the first write auto-creates the columns (MI infers their types).

> The app assumes a simple **CSV / manual** dataset (e.g. two columns). It works with any
> number of columns, but the dataset must be of fetch-method **`manual`**.

---

## How it works

All requests use root-relative `/api/...` paths, so they hit the MI instance that serves
the app and authenticate with the user's session cookie (no token handling in the app).
During local development the pp-dev proxy forwards `/api/*` to `backendBaseURL` and injects
auth. `api/*` routes are CSRF-exempt on the backend.

| Action | Request |
| --- | --- |
| List datasets | `GET /api/dataset` → `{ datasets: [{ id, name, keep_history }] }` |
| Get columns | `GET /api/dataset_column?dataset={id}` → `{ dataset_columns: [{ reference_name, column_name, value_type }] }` |
| Add a row | `PUT /api/dataset_data?dataset={id}` with body `{ dataset, data: [row], append: "Y", measurement_time? }` |
| Read rows | `POST /api/dataset_data?dataset={id}` with body `{ limit, offset, amount: "Y" }` → `{ data: [row], amount }` |

The read has no insertion-order key, so the "last 10 rows" are fetched by reading the total
count (`amount`) and offsetting to the tail (`offset = total − 10`).

**Defining columns:** MI has no "create column" endpoint — a `PUT` to a manual dataset with **no
columns** auto-creates them from the row's keys (`column_name` = `reference_name` = the key;
`value_type` is detected from the value). So the app collects column names + first-row values and
creates both in that first write.

The row object is keyed by each column's `reference_name`. If the selected dataset keeps
history (`keep_history === "Y"`), a **Measurement date** field appears and is sent as
`measurement_time` (required by the backend for historical datasets).

The relevant code:

- `src/api/mi.ts` — the API client (`listDatasets`, `getDatasetColumns`, `addDatasetRow`, `getLastRows`).
- `src/components/add-rows/add-rows.tsx` — the dataset picker + dynamic row form + recent-rows table.
- `src/constants.ts` — reads MI template variables from `window.PP_VARIABLES`.

---

## Prerequisites in Metric Insights

1. **A manual dataset.** Create a dataset whose data fetch method is **Manual / CSV** with
   (at least) two columns. The signed-in user must have **edit** permission on it.
2. **An App** (Portal Page) to host this template once built (see _Build & deploy_ below).

### Template variables (optional)

This template exposes one optional editable variable:

| Variable name | Token in `index.html` | Effect |
| --- | --- | --- |
| `App Title` | `APP_TITLE: '[App Title]'` | Overrides the page heading. Falls back to "Add Dataset Rows" if not set. |

MI replaces the `[App Title]` token with the variable's value at render time. To add more
variables, declare them in `index.html` (`window.PP_VARIABLES`) with a `[Variable Name]`
token and read them in `src/constants.ts`.

---

## Local development

The MI instance to develop against is set in `pp-dev.config.ts` (currently
`https://beta7.metricinsights.com`):

```ts
const config: PPDevConfig = {
  backendBaseURL: 'https://beta7.metricinsights.com',
  // appId: 123, // optional — the hosting App / Portal Page ID, for loading editable variables in dev
  miHudLess: false,
  v7Features: true,
};
```

Provide an access token (so the proxy can authenticate) via a `.env` file:

```bash
MI_ACCESS_TOKEN=your_personal_access_token
```

Then:

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build
```

This type-checks, builds to `dist/`, and produces `dist-zip/add-dataset-rows.zip` — the
archive you upload to MI.

## Configure on Beta7 (Metric Insights)

In MI, an **App Template** holds the code; an **App** (Portal Page) is an instance created
from a template. You upload this build as a template, then create an App from it.

1. **Create the App Template**
   - Admin → **Editor → Apps → Templates** (`/editor/page/template`) → **＋** (add).
   - Set **Name** (e.g. `Add Dataset Rows`) and **Internal name** (e.g. `add-dataset-rows`;
     letters/digits/`-`/`_` only).
   - Save.

2. **Upload the build**
   - Open the template you just created (`/editor/page/template/{id}`) → **Assets** (or
     **Code**) tab → upload **`dist-zip/add-dataset-rows.zip`**.
   - This populates the template's HTML/JS/CSS from the build. (`index.html` already declares
     `window.PP_VARIABLES = { APP_TITLE: '[App Title]' }`.)

3. **Define the editable variable** (optional)
   - Template → **Variables** tab → add a variable named **`App Title`**, type **Text**, with a
     default value. MI substitutes the `[App Title]` token at render time. Skip this and the
     app falls back to the built-in heading.

4. **Create the App from the template**
   - Admin → **Editor → Apps** (`/editor/page`) → **＋** → choose this **Template**.
   - Set the App's **Name** and **Internal name**. Save. The app will be served at
     `/p/{internal_name}` on Beta7.

5. **Set the variable value & visibility**
   - On the App, **Content** tab → enter the `App Title` value for this instance.
   - **Sharing** tab → grant view access to the right users/groups; tick **Visible in
     Dashboard** if it should appear in the nav.

6. **Dataset permissions (required for it to work)**
   - The signed-in user must have **edit** permission on the target dataset(s), and each
     dataset must be **Manual / CSV** fetch method. Otherwise the API returns
     "Not manual dataset" or a permission error (surfaced inline in the app).

> **Updating later:** rebuild (`npm run build`) and re-upload the new zip to the *template*
> (step 2). All Apps created from it pick up the change.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the pp-dev dev server with HMR + API proxy. |
| `npm run build` | Type-check, build, and package the deployable zip. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |

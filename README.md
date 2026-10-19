# Personal OS — Life & Finance Hub

A private, single-user command center for tasks, goals, habits and personal finances
(KZT-first, multi-currency-safe). FastAPI + PostgreSQL backend, React + TypeScript frontend.

```
Overview ─ Tasks ─ Goals & Projects ─ Habits ─ Finances (Transactions · Accounts · Budgets · Recurring · Installments) ─ Analytics ─ Settings
```

---

## Quick start

### Option A — Docker Compose (recommended for daily use)

```bash
cp .env.example .env          # then set a long random POSTGRES_PASSWORD
docker compose up -d --build
open http://127.0.0.1:8080
```

Migrations run automatically when the API container starts. Data lives in the
`pgdata` volume and survives restarts (`docker compose down` keeps it; `down -v` deletes it).

> The compose file was written for this project but could not be executed in the
> environment where the app was built (no Docker daemon there). The same
> images/commands are used in Option B, which was fully verified.

### Option B — Local development

Requirements: Python 3.12+ (tested on 3.13), Node 20+ (tested on 22), PostgreSQL 16.

```bash
# 1. Database (once)
sudo -u postgres psql -c "CREATE USER personal_os WITH PASSWORD 'personal_os_dev' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE personal_os OWNER personal_os;"
sudo -u postgres psql -c "CREATE DATABASE personal_os_test OWNER personal_os;"   # for tests

# 2. Backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd backend
cp .env.example .env                       # adjust if your DB differs
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev                                # http://127.0.0.1:5173 (proxies /api → :8000)
```

API docs (OpenAPI): http://127.0.0.1:8000/docs

**Sign in** with `admin` / `adminuser123` — the defaults for local development. **Change them**
(`POS_AUTH_USERNAME`, `POS_AUTH_PASSWORD`) before the app is reachable from anywhere but your own machine.

### Try it with demo data

Settings → **Load demo data**. Every demo record is flagged `is_demo`, demo accounts are
named `Demo · …`, and a banner is shown while demo data exists. **Remove demo data**
deletes all of it without touching your own records.

### Design system

The app uses **Premium Native** (concept D from the design lab) as its structure with **Liquid Glass** materials:

- A macOS-style window floating over a photo wallpaper; a translucent sidebar (navigation, live balances, demo notice),
  a unified toolbar with ⌘K search, appearance menu and a split **New** button (transaction / task / goal / habit).
- Material tiers in `src/index.css`: `mat-chrome` (sidebar/toolbar — wallpaper shows through), `mat-glass` (one hero
  surface per page, with a pointer-following specular light), `mat-panel` (near-opaque — where numbers, tables and forms
  live), `mat-popover` (menus, palette, dialogs). `prefers-reduced-transparency` falls back to solid surfaces;
  `prefers-reduced-motion` disables motion.
- Light, dark or "match system" plus five wallpapers (Settings → Appearance), remembered per browser.
  **Your own photo**: upload or drag an image onto Settings → Appearance. It is downscaled in the browser
  (max 2560 px, JPEG) and kept in this browser's IndexedDB only — never uploaded to the server.
- **Languages**: English, Русский, 한국어 (toolbar globe menu, Settings, ⌘K, or the login screen). Dates use the
  matching date-fns locale and plurals use `Intl.PluralRules`. Server-generated insights follow the
  `Accept-Language` header. Dictionaries live in `frontend/src/lib/locales/<lang>/`; English source strings are the keys,
  so a missing entry falls back to English. `npm run i18n:check` lists any key without a Russian or Korean entry.
- **⌘K / Ctrl+K command palette**: navigate, create, switch appearance, and search real transactions and tasks.
- Motion: blurred cross-fades between pages, spring dialogs, animated selection pills in the sidebar and segmented controls.

### Design Lab (visual direction exploration)

Open **http://127.0.0.1:5173/design-lab** (local dev) to compare four interactive redesign concepts —
Liquid Glass OS, Editorial Lifestyle, Ambient Spatial OS and Premium Native. The lab only needs the frontend
(`npm run dev`), uses clearly labelled sample data, never calls the API and is lazy-loaded so it does not affect the app.
Details: [`frontend/src/design-lab/README.md`](frontend/src/design-lab/README.md).

---

## Tests

```bash
# Backend (uses the separate personal_os_test database; refuses to run against any DB without "test" in its name)
cd backend && ../.venv/bin/python -m pytest -q

# Frontend
cd frontend && npm test            # vitest
cd frontend && npm run typecheck   # tsc
cd frontend && npm run build
```

Current status: **76 backend tests, 20 frontend tests passing**; typecheck and production build clean.
The UI was additionally driven end-to-end in Chromium (account → expense → transfer → edit/delete →
CSV import → budget → task → habit → goal → overview), with no console errors and no
horizontal overflow at 390 px width.

Backend coverage includes: transaction CRUD and balance recalculation, transfers (both sides,
excluded from income/expense), currency separation, archived accounts, zero/negative/3-decimal
amounts, month-boundary date filtering, budget utilisation (transfers never counted, history-preserving
limits), recurring scheduling (month-end anchoring, double-confirmation blocked, out-of-order
confirmation, skip, re-processing idempotent), installment balances (single expense per payment,
overpayment rejected, payoff, linked-transaction protection), task completion and recurring
spawning (exactly once), habit completion uniqueness/streaks/rates, CSV import report
(rejected/duplicate rows, dry run, semicolon files, re-import of exports), CSV export
(round-trip, formula-injection neutralised), insights, demo data removal, API token, CORS.

---

## Architecture

```
frontend/  React 18 + TS + Vite + Tailwind, Radix primitives (shadcn-style), TanStack Query, Recharts
  src/lib/           api client, types, formatting (money formatted from strings, never float math)
  src/components/    ui primitives (Button, Field, Modal, ConfirmDialog, MetricCard, Progress, …),
                     layout (AppShell, QuickActions: global "t"/"n" shortcuts), charts (ChartCard)
  src/features/      overview, tasks, goals, habits, finance/*, analytics, settings

backend/   FastAPI + SQLAlchemy 2 + Alembic + Pydantic 2 + PostgreSQL
  app/models.py      relational schema (constraints, indexes, timestamps)
  app/schemas/       request/response validation (money as Decimal, serialized as strings)
  app/services/      ALL business logic — accounts, transactions, budgets, recurring,
                     installments, analytics, insights, csv_io, tasks, goals, habits, demo
  app/api/           thin REST routers (finance, planning, system)
  alembic/           migrations
  tests/             pytest suite
```

The frontend never computes financial totals; every sum, balance and percentage comes from
tested backend services. Every successful write refreshes all queries, so the dashboard,
budgets and analytics are always consistent with the ledger.

### Accounting decisions

| Topic | Decision |
|---|---|
| Money type | `NUMERIC(14,2)` / Python `Decimal`; JSON carries strings (`"1234.50"`). Inputs with >2 decimals are **rejected**, not rounded. Half-up rounding for derived values. |
| Sign | Amounts are always positive; `type` (`income`/`expense`/`transfer`) decides direction (DB check constraint). |
| Balances | **Derived**, never stored: `opening_balance + income − expense − transfers out + transfers in`. Nothing can drift. |
| Transfers | One row, `account → to_account`, no category. Never part of income, expense, budgets or net cash flow. Same-currency only (MVP). |
| Currencies | Each account has a currency. Totals are always grouped by currency; amounts in different currencies are never added. Budgets/analytics use the primary currency (KZT). |
| Archiving | Accounts/categories with history cannot be deleted (FK `RESTRICT`), only archived. An account can be archived only at zero balance, so money never silently leaves totals. |
| Recurring rules | Describe *expected* money only. Confirming an occurrence creates one transaction tagged `(rule_id, occurrence_date)` — a unique constraint makes duplicates impossible. Expected payments are always labelled as projections. |
| Installments | Creating a plan never touches balances. `outstanding = starting_outstanding − Σ payments`. A payment can create **one** expense transaction (category *Debt and installment payments*): cash movement + expense live in that transaction; the payment row only reduces the liability. Analytics count the expense once (cash basis). No interest/amortisation yet. |
| Budgets | Per expense category, effective from a month until replaced/disabled — editing a limit doesn't rewrite past months. Spending = actual expense transactions only. |
| Terminology | *Net cash flow* (income − expenses), *balance* (money in tracked accounts), *savings balance* (savings-type accounts), *outstanding liabilities* (installment plans) are shown separately. Total balance is **never** called net worth. |
| Dates | Calendar dates are plain `DATE`s in the owner's timezone (Settings, default Asia/Almaty); audit timestamps are UTC `TIMESTAMPTZ`. |

### Data model

`app_settings` (singleton owner/preferences) · `accounts` · `categories` · `transactions` ·
`budget_limits` · `recurring_rules` · `installment_plans` · `installment_payments` · `goals` ·
`goal_progress_logs` · `projects` · `milestones` · `tasks` · `habits` · `habit_completions`
(unique per habit+date) · `insight_dismissals`.

Deletion behaviour: deleting a goal cascades its milestones/progress log and *unlinks* tasks and
projects; deleting a recurring rule keeps its transactions (unlinked); deleting a habit deletes its
completions (archive keeps them); installment plans with payments must be cancelled rather than deleted;
deleting an installment payment also deletes its linked transaction.

### Insights engine

`app/services/insights.py` — deterministic rules, each returning a title, an explanation of *why*,
a link, and an `estimate` flag for projections: budget over/≥85 %, recurring/installment payment due or
overdue, expected outflows exceeding available cash (projection), month-to-date category spending up ≥30 %
vs the same days last month (only when history covers the whole previous month), overdue tasks,
goals past target date or without progress for 21 days. Dismissals are stored per period-specific key.
The module is the extension point for future AI-assisted analysis; no external AI API is used.

### CSV format

`date, type, amount, account, to_account, category, description, payee, tags, currency`
(header required, `date/amount/account` mandatory, `,` `;` or tab delimited, UTF-8 or CP1251).
Import is a two-step preview → commit; every row is reported as imported, rejected (with reason) or
duplicate. Nothing (accounts, categories) is ever created implicitly. Exports re-import losslessly.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `POS_DATABASE_URL` | local dev URL | SQLAlchemy URL (`postgresql+psycopg://…`) |
| `POS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Explicit allowed origins (`*` is ignored) |
| `POS_AUTH_USERNAME` / `POS_AUTH_PASSWORD` | `admin` / `adminuser123` | Login for the web UI. **Change before exposing the app** |
| `POS_AUTH_ENABLED` | `true` | Set `false` to skip the login page (localhost-only setups) |
| `POS_SECRET_KEY` | auto | Signs session cookies; if unset a random key is created in `backend/.secret_key` |
| `POS_SESSION_DAYS` | `30` | Session lifetime |
| `POS_COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `POS_API_TOKEN` | empty | Optional bearer token for scripts/integrations (`Authorization: Bearer <token>`) |
| `POS_DEFAULT_TIMEZONE` | `Asia/Almaty` | Initial timezone (changeable in Settings) |
| `POS_LOG_LEVEL` | `INFO` | Logging level |
| `POSTGRES_PASSWORD` | — (required for compose) | Database password |

The default local database password (`personal_os_dev`) is for development on your own machine only.

### Migrations

```bash
cd backend
alembic upgrade head                               # apply
alembic revision --autogenerate -m "describe change"  # after editing app/models.py
alembic check                                      # verify models and migrations agree
```

---

## Security & privacy — deployment model and limitations

- Designed for **one person on their own machine**. The dev servers bind to `127.0.0.1`; in Docker only
  the web UI is published, on `127.0.0.1:8080`. The API and database are not exposed.
- Running locally is **not** automatically secure: anyone with access to your user account, the
  database, backups or an exposed port can read the data. Data is not encrypted at rest by the app —
  use disk encryption.
- Login is a single owner account configured by environment variables (not a multi-user system).
  A successful login sets an HttpOnly, SameSite=Strict cookie signed with HMAC-SHA256; credentials are
  compared in constant time and failed attempts are throttled (10 per 5 minutes per client).
  **The default `admin` / `adminuser123` is public knowledge** (it is in this README) — set your own
  `POS_AUTH_PASSWORD` and `POS_SECRET_KEY`, enable `POS_COOKIE_SECURE`, and put the app behind HTTPS
  (reverse proxy) or a VPN such as Tailscale before exposing it beyond localhost.
- `POS_API_TOKEN` (optional) is a shared secret for scripts; when entered in Settings it is stored in localStorage.
- All input is validated server-side (Pydantic + DB constraints); all SQL goes through SQLAlchemy
  parameter binding; CORS is an explicit allow-list; responses carry `nosniff`, `DENY` framing and
  `no-store`; request bodies and amounts are not logged; CSV exports neutralise spreadsheet formulas.

---

## Known limitations & next steps

- Cross-currency transfers and FX conversion are not supported (rejected with a clear message).
- Installments have no interest/amortisation model; payoff dates are estimates without interest.
- Recurring rules are confirmed manually (by design); there is no automatic posting or reminders/notifications.
- Budget limits are per category per month; no rollover or yearly budgets.
- Task recurrence covers daily/weekdays/weekly/monthly; no custom RRULEs or subtasks.
- Only manual/CSV data entry — no bank API sync.
- No backup/restore UI yet: use `pg_dump personal_os > backup.sql` (and test restoring it).
- Possible next steps: backup export, transaction splits, cross-currency accounts with FX rates,
  net-worth tracking with manual assets, PWA/offline quick-add, optional AI analysis on top of the
  insights module.

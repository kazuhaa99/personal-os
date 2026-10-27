# Personal OS — Life & Finance Hub

A private command center for tasks, goals, habits and personal finances — every account sees only its own data
(KZT-first, multi-currency-safe). FastAPI + PostgreSQL backend, React + TypeScript frontend.

```
Overview ─ Tasks ─ Goals & Projects ─ Habits ─ Finances (Transactions · Accounts · Budgets · Recurring · Installments) ─ Analytics ─ Profile ─ Settings
```

---

## Quick start

### Option A — Docker Compose (recommended for daily use)

```bash
cp .env.example .env          # then set long random POSTGRES_PASSWORD and POS_APP_DB_PASSWORD
docker compose up -d --build
open http://127.0.0.1:8080
```

Migrations run automatically when the API container starts. Data lives in the
`pgdata` volume and survives restarts (`docker compose down` keeps it; `down -v` deletes it).

The API connects as the restricted role `personal_os_app` (so row-level security applies, see
[Security](#security--privacy--deployment-model-and-limitations)); `backend/db-init/10-app-role.sh` creates it
from `POS_APP_DB_PASSWORD` when the volume is first initialised. **Upgrading an existing volume**: init scripts
don't run again, so create the role once, then restart the API (its migrations grant the role access):

```bash
docker compose exec db psql -U personal_os -d personal_os   -c "CREATE ROLE personal_os_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<POS_APP_DB_PASSWORD>'"
docker compose restart api
```

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
# the API's restricted role (row-level security applies to it; migrations run as personal_os)
sudo -u postgres psql -c "CREATE ROLE personal_os_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'personal_os_app_dev';"

# 2. Backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd backend
cp .env.example .env                       # adjust if your DB differs; for RLS set
#   POS_DATABASE_URL=postgresql+psycopg://personal_os_app:personal_os_app_dev@localhost:5432/personal_os
#   POS_MIGRATION_DATABASE_URL=postgresql+psycopg://personal_os:personal_os_dev@localhost:5432/personal_os
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev                                # http://127.0.0.1:5173 (proxies /api → :8000)
```

API docs (OpenAPI): http://127.0.0.1:8000/docs

**Sign in** with `admin` / `adminuser123` — the first account, created on first start (existing data
belongs to it). **Change that password** (Profile → Login & security) before the app is reachable from anywhere
but your own machine. Anyone else can **create an account** on the login screen; each account has its own
tasks, finances, habits, settings and profile.

### Accounts, email confirmation and the Profile

- Sign in with **username or email**. Registration asks for username, email and password and mails a
  6-digit code (sent from `spokeesofficial@gmail.com`); the account works once the code is entered.
  Forgotten passwords are reset with an emailed code. Changing the login email confirms the new address first.
- **Profile** (sidebar → your name): avatar, first/last name, phone, birthday, city, occupation, employer, bio,
  salary (amount, currency, frequency, payday) and additional income sources. It shows the expected income per
  month (all schedules normalised to a month) next to what has actually arrived this month.
- **Sending email** needs an SMTP password. For Gmail: enable 2-Step Verification on the Google account, create an
  *App password* (Google Account → Security → App passwords) and start the API with
  `POS_SMTP_PASSWORD=<app password>` (host/port/user default to `smtp.gmail.com:587` / `spokeesofficial@gmail.com`).
  Never commit it. Without it, registration is closed (the login page hides "Create account"). For local testing
  `POS_MAIL_DEV_LOG=true` prints the emails, codes included, to the API log instead of sending them.
- **Deleting an account**: Profile → Login & security → *Delete account*. It asks for the current password and for
  the login to be typed, then removes the account and everything it owns (finances, tasks, goals, habits, profile)
  and signs out. The last remaining account can't be deleted.

### Serving under a path (e.g. `https://host/personalos/`)

Set `POS_BASE_PATH=/personalos/` in `.env` (with both slashes) and `POS_COOKIE_SECURE=true` behind HTTPS, then
`docker compose up -d --build`. The frontend is built for that prefix (links, API, icons, PWA), the web
container strips the prefix itself (so `http://127.0.0.1:8080/personalos/` works directly too), and the session
cookie is limited to the path. In the host's reverse proxy pass the path through unchanged and overwrite
`X-Forwarded-For` (the API uses it to rate-limit sign-ins per client):

```nginx
location /personalos/ {
    proxy_pass http://127.0.0.1:8080;          # no URI part: the prefix is kept
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 6m;
}
```

The service worker registers with the prefix as its scope, so it never controls the host site's other pages.
Sharing a domain still means sharing an origin (localStorage, script-readable cookies) with the host site — a
separate subdomain isolates the two completely. `E2E_BASE=/personalos/ npm run e2e` runs the browser tests
against a prefixed build.

### Install as an app (PWA)

The production build (`npm run build`, Docker) is an installable PWA: web app manifest, icons, `standalone`
display, iOS home-screen meta tags and safe-area padding for the notch. Its service worker (`public/sw.js`, production
only) caches the static app — hashed bundles, icons, wallpapers — but **never anything under `/api`**: finances and
all other data always come from the network. Without a connection, pages show an offline notice. Installing needs
`localhost` or HTTPS.

### iOS and macOS apps

The same React app also ships as an iPhone app (Capacitor, `frontend/ios/`) and a Mac app for Apple Silicon (Tauri,
`frontend/src-tauri/`). What differs per platform lives in `frontend/src/platform/`; the web build is unaffected.

- **Sign-in:** the apps don't use the web's cookie. They get an access + refresh token pair (`POST /api/auth/token`);
  the refresh token is kept in the Keychain, the access token only in memory. Sign-out revokes the session on the
  server. The API needs migration `0004` and allows the apps' origins (`POS_NATIVE_ORIGINS`, default
  `capacitor://localhost,tauri://localhost`).
- **Offline:** the apps show the last loaded data read-only, with a "no connection" banner; nothing is written offline.
- **App lock:** optional Face ID / Touch ID (Settings → App lock).
- **Mac:** remembered window size, app menu, <kbd>⌘N</kbd> new transaction, <kbd>⌘F</kbd> search, <kbd>⌘,</kbd> settings.

Requirements (macOS): Node 20+, [Rust](https://rustup.rs) for the Mac app, Xcode for the iPhone app. The apps call the
API at an absolute HTTPS address given at build time in `VITE_API_BASE` (the build refuses anything else, except
`http://localhost` / `127.0.0.1` for development).

```bash
cd frontend
npm run mac:dev                                   # Mac app against the local API (via the Vite dev server)
VITE_API_BASE=https://host/api npm run mac:build  # → src-tauri/target/release/bundle/macos/Personal OS.app
VITE_API_BASE=https://host/api npm run mac:dmg    # the same plus a .dmg (run in your own Terminal: it drives Finder)
npm run ios:dev                                   # iPhone simulator against http://127.0.0.1:8000/api
VITE_API_BASE=https://host/api npm run ios:build  # build, sync and open the Xcode project to run on a device
npm run native:icons                              # regenerate all icons and splash screens from public/icons/icon-1024.png
```

**Running on your own iPhone without a paid Apple Developer account:** in Xcode open *Signing & Capabilities*, pick
your Apple ID as the team (a free "Personal Team") and press Run with the phone connected. On the phone, enable
*Settings → Privacy & Security → Developer Mode* and trust your certificate under *Settings → General → VPN & Device
Management*. Such a build **expires after 7 days** and has to be run again from Xcode; a free account also allows only
a few apps at a time. TestFlight, the App Store and longer-lived builds need the paid Apple Developer Program.

**The Mac app** is signed ad hoc: the first time, open it with right-click → *Open*. After each rebuild macOS may ask
once more whether the app may use its Keychain item. Sharing it with other Macs needs a Developer ID signature and
notarisation (paid account).

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
- **Colours from the wallpaper** (Settings → Appearance, on by default): the accent takes the wallpaper's most vivid
  recurring colour (not its average), with lightness adjusted per theme to keep WCAG AA 4.5:1 for text and button ink;
  colourless photos keep the standard blue. Optionally the sidebar/toolbar and hero glass get a light tint of it.
  Charts keep their own colours. The colours are remembered and applied before React starts, so there is no flash.
- **Languages**: English, Русский, 한국어 (toolbar globe menu, Settings, ⌘K, or the login screen). Dates use the
  matching date-fns locale and plurals use `Intl.PluralRules`. Server-generated insights follow the
  `Accept-Language` header, and so do server error messages (validation and business rules, in
  `backend/app/services/error_text.py`; a test fails if a raised message has no RU/KO entry). Dictionaries live in `frontend/src/lib/locales/<lang>/`; English source strings are the keys,
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
# … the same suite as the restricted role, with row-level security in force (recommended):
POS_DATABASE_URL=postgresql+psycopg://personal_os_app:<pw>@localhost:5432/personal_os_test POS_TEST_OWNER_DATABASE_URL=postgresql+psycopg://personal_os:<pw>@localhost:5432/personal_os_test   ../.venv/bin/python -m pytest -q

# End-to-end (Playwright on the installed Chrome; builds the app and starts its own API on :8001
# with a fresh personal_os_e2e database — set E2E_OWNER_URL / E2E_APP_URL if your DB differs)
cd frontend && npm run e2e

# Frontend
cd frontend && npm test            # vitest
cd frontend && npm run typecheck   # tsc
cd frontend && npm run build
```

Current status: **231 backend tests** (228 + 3 RLS checks that need the restricted role), **22 frontend tests**
and **6 end-to-end scenarios** passing — sign-out back to the login page, registration with the email code,
sign-in by email, saving the profile, server errors in Russian, deleting an account, phone layout without
sideways scroll. Typecheck and production build clean.

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
| `POS_DATABASE_URL` | local dev URL | SQLAlchemy URL the API uses (`postgresql+psycopg://…`); should be the restricted role |
| `POS_MIGRATION_DATABASE_URL` | = `POS_DATABASE_URL` | Owner URL for `alembic` (tables, policies, grants) |
| `POS_APP_DB_ROLE` | `personal_os_app` | Role that migrations grant data access to |
| `POS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Explicit allowed origins (`*` is ignored) |
| `POS_AUTH_USERNAME` / `POS_AUTH_PASSWORD` | `admin` / `adminuser123` | First account, created only if no users exist yet. **Change the password before exposing the app** |
| `POS_ALLOW_REGISTRATION` | `true` | Let new people create accounts (needs working email) |
| `POS_SMTP_HOST` / `POS_SMTP_PORT` / `POS_SMTP_USER` | `smtp.gmail.com` / `587` / `spokeesofficial@gmail.com` | Outgoing mail (STARTTLS) |
| `POS_SMTP_PASSWORD` | empty | SMTP / Gmail App password — required to send confirmation codes |
| `POS_MAIL_FROM` | `Personal OS <spokeesofficial@gmail.com>` | Sender shown in emails |
| `POS_MAIL_DEV_LOG` | `false` | Development: write emails to the log instead of sending |
| `POS_AUTH_ENABLED` | `true` | Set `false` to skip the login page — every request then acts as the first account (localhost-only) |
| `POS_SECRET_KEY` | auto | Signs session cookies; if unset a random key is created in `backend/.secret_key` |
| `POS_SESSION_DAYS` | `30` | Session lifetime |
| `POS_COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `POS_API_TOKEN` | empty | Optional bearer token for scripts/integrations (`Authorization: Bearer <token>`) |
| `POS_DEFAULT_TIMEZONE` | `Asia/Almaty` | Initial timezone (changeable in Settings) |
| `POS_LOG_LEVEL` | `INFO` | Logging level |
| `POSTGRES_PASSWORD` | — (required for compose) | Database owner password |
| `POS_BASE_PATH` | `/` | Compose: serve under a path prefix, e.g. `/personalos/` (also the cookie path) |
| `POS_COOKIE_PATH` | `/` | Session cookie path (compose sets it from `POS_BASE_PATH`) |
| `POS_APP_DB_PASSWORD` | — (required for compose) | Password of `personal_os_app` (letters/digits: it goes into a URL) |

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

- Designed to run on **your own machine** (optionally shared with people you trust). The dev servers bind to `127.0.0.1`; in Docker only
  the web UI is published, on `127.0.0.1:8080`. The API and database are not exposed.
- Running locally is **not** automatically secure: anyone with access to your user account, the
  database, backups or an exposed port can read the data. Data is not encrypted at rest by the app —
  use disk encryption.
- **Accounts.** Passwords are hashed with scrypt (per-user salt). A login sets an HttpOnly, SameSite=Strict
  cookie signed with HMAC-SHA256; changing or resetting a password signs out every other session. Unknown
  usernames cost the same time as wrong passwords, "forgot password" never reveals whether an account exists,
  and logins, registrations and code checks are throttled (10 per 5 minutes per client; 5 wrong codes per code;
  one code per minute). Email codes are 6 digits, valid 15 minutes, and only their HMAC is stored.
- **Data isolation** is enforced centrally (`backend/app/tenancy.py`): every ORM read, update and delete is
  filtered to the signed-in user, new rows are stamped with that user, and a foreign key pointing at another
  user's row is rejected. With no signed-in user, queries match nothing. Tests cover cross-account access.
- **Row-level security** in Postgres is the second, independent wall (`backend/app/rls.py`, migration 0003):
  every per-user table has `FORCE ROW LEVEL SECURITY` and a policy `user_id = app.user_id`, which the API sets
  before each statement. Even raw SQL can't read or write another user's rows, and with nobody signed in nothing
  is visible. It only applies to a non-superuser role without `BYPASSRLS` — hence the separate `personal_os_app`
  role; the API logs a warning at startup if it connects as a role that would bypass RLS.
- **The default `admin` / `adminuser123` is public knowledge** (it is in this README) — change it, set
  `POS_SECRET_KEY`, enable `POS_COOKIE_SECURE`, and put the app behind HTTPS (reverse proxy) or a VPN such as
  Tailscale before exposing it beyond localhost.
- `POS_API_TOKEN` (optional) is a shared secret for scripts and acts as the first account; when entered in
  Settings it is stored in localStorage.
- Avatars are stored in the database (PNG/JPEG/WebP checked by file signature, max 2 MB, downscaled to
  512 px in the browser). Wallpaper photos never leave the browser.
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
  net-worth tracking with manual assets, offline quick-add, optional AI analysis on top of the
  insights module.
- The Docker setup (roles, init script) is written but was not run here — Docker Desktop doesn't start on the
  machine this was developed on; everything else was verified with a local PostgreSQL.

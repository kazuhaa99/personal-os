# Personal OS — guide for Claude Code

Private life and finance hub (tasks, goals, habits, finances, analytics). Every account sees only its own data.
The public, human-facing docs are `README.md`; this file is for working on the code.

## Stack

- **Backend** (`backend/`): Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, PostgreSQL 16, pytest.
- **Frontend** (`frontend/`): React 18, TypeScript, Vite, Tailwind, Radix primitives, TanStack Query, Recharts, vitest, Playwright.
- **Native**: Capacitor for iOS (`frontend/ios/`), Tauri for macOS (`frontend/src-tauri/`). Both reuse the web app; platform differences live in `frontend/src/platform/`.

## Layout

- `backend/app/api/` thin routers (auth, finance, planning, profile, system), `deps.py`, `throttle.py` (sign-in limits).
- `backend/app/services/` all business logic. Routers call services; services never trust the caller's ownership.
- `backend/app/models.py`, `schemas/`, `tenancy.py` (per-account filtering), `rls.py` (Postgres row-level security), `config.py` (`POS_*` env vars).
- `backend/alembic/versions/` migrations `0001`–`0006`. `backend/db-init/` creates the restricted DB role on a fresh Docker volume.
- `frontend/src/features/` pages by domain; `src/components/ui/` primitives; `src/lib/` API client, formatting, locales, refresh areas.
- `frontend/e2e/` Playwright specs; `frontend/scripts/` i18n check and native build helpers.

## Commands (run from the repo root unless noted)

Backend (`cd backend`). The suite refuses any database whose name lacks "test".

```bash
../.venv/bin/python -m pytest -q                       # owner mode (default test URLs)
POS_DATABASE_URL=postgresql+psycopg://personal_os_app:<pw>@localhost:5432/personal_os_test \
POS_TEST_OWNER_DATABASE_URL=postgresql+psycopg://personal_os:<pw>@localhost:5432/personal_os_test \
../.venv/bin/python -m pytest -q                       # RLS mode: the restricted role (use this one)
../.venv/bin/python -m pytest -q tests/test_rls.py     # one file
alembic upgrade head | alembic check                   # migrations (cd backend)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend (`cd frontend`):

```bash
npm run dev            # http://127.0.0.1:5173, proxies /api to :8000
npm test               # vitest
npm run typecheck      # tsc -b --noEmit
npm run i18n:check     # every t("…") key has ru and ko entries
npm run build          # tsc + production build (PWA)
npm run e2e            # Playwright; starts its own API on :8001 and serves a build on :4174
E2E_CONTRAST=full npm run e2e   # contrast on every wallpaper
```

The e2e run needs Chrome, `.venv` at the repo root, and a PostgreSQL reachable at `E2E_OWNER_URL` / `E2E_APP_URL`
(default `127.0.0.1:5433`, no database name). The owner role needs `CREATEDB`. Passwords come from the URL or `PGPASSWORD`.

## Conventions

- **Money** is `Decimal` in the backend and a string in JSON. The frontend never does float math on money and never computes totals; use `formatMoney` (`src/lib/format.ts`, `decimals` option).
- **Dates**: "today" means the owner's timezone (`nowInAppZone` / `todayISO` in `src/lib/format.ts`), not `new Date()`.
- **Immutability and small units**: new objects, not mutation; small functions and files (under 800 lines).
- **TDD**: write the failing test first (backend pytest, frontend vitest), then the code.
- **Query counts**: batch with `serialize_many` (see `services/goals.py`, `services/habits.py`). `tests/test_query_counts.py` keeps them fixed.
- **Errors**: backend messages that reach users go through `app/services/error_text.py` with RU and KO entries. `test_error_text.py` fails otherwise.
- **UI strings** go in `src/lib/locales/{en,ru,ko}/`. English source strings are the keys. Run `npm run i18n:check`.
- **Styling**: colour and surface tokens are in `src/index.css` (light and dark). Touch targets use the Tailwind `coarse:` variant or `.tap-target` (44 px).
- **Data loading**: mutations use `useAction` (`src/lib/queries.ts`) with refresh areas from `src/lib/refresh.ts`.
- **Pages** are lazy-loaded through `page()` in `src/App.tsx`.
- **Segmented** controls are radio groups (`role="radiogroup"`).
- **Native apps** never use the web cookie. They use bearer tokens (`posat_` access, `posrt_` refresh).
- Coding rules in `.claude/rules/ecc/` apply (immutability, small functions, explicit error handling, no `console.log`).

## Never

- Never push, open a PR or force-push without the owner's explicit OK. Commit only when asked.
- Never commit or print secrets: `.env` files, `backend/.secret_key`, passwords, API tokens, SMTP credentials. Do not open `.env` files.
- Never weaken tenant isolation: no removing `tenancy.py` filters, no removing or relaxing RLS policies or `FORCE ROW LEVEL SECURITY`, and the API must never connect as a superuser or a `BYPASSRLS` role.
- Never put deployment details in this repo: no real hostnames, domains, IP addresses, server user names, absolute paths from a machine, CA or internal network details, or known weaknesses of a live server. Use placeholders such as `https://host/api` and `you@example.com`.
- Never add a default password or a hardcoded secret. The first account gets `POS_AUTH_PASSWORD` or a random password.
- Never add `*` to CORS origins. The API's `X-Forwarded-For` trust (`--forwarded-allow-ips` in `backend/Dockerfile`) is safe only because the API is reachable from the web container alone. Never publish the API port.
- Never put a personal email address or account name in code defaults or docs.
- Do not run destructive DB commands against anything but the `_test` / `_e2e` databases.

## Current state

Branch `feat/native-apps`, commit `187c720` ("fix: address the phase 5 accessibility and code reviews"). Migrations go up to `0006`. The native apps and the accessibility and contrast e2e checks are in place. Backend tests: 336 collected; frontend: 93 unit tests.

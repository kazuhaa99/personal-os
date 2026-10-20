// Starts an isolated API for the end-to-end run (used by playwright.config.ts):
//   1. recreates the database personal_os_e2e (never your real one),
//   2. migrates it as the owner role, 3. serves it on :8001 as the restricted
//   app role (row-level security on), with confirmation codes written to
//   e2e/.out/api.log instead of being emailed.
// Override the connection with E2E_OWNER_URL / E2E_APP_URL (no database name).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const backend = join(root, "backend");
const out = join(here, ".out");
mkdirSync(out, { recursive: true });

const DB = "personal_os_e2e";
const OWNER = process.env.E2E_OWNER_URL ?? "postgresql+psycopg://personal_os@127.0.0.1:5433";
const APP = process.env.E2E_APP_URL ?? "postgresql+psycopg://personal_os_app@127.0.0.1:5433";
const python = process.env.E2E_PYTHON
  ?? [join(root, ".venv", "Scripts", "python.exe"), join(root, ".venv", "bin", "python")].find(existsSync);
if (!python) throw new Error("No Python venv found; set E2E_PYTHON");
if (!process.env.E2E_ADMIN_PASSWORD) throw new Error("E2E_ADMIN_PASSWORD is set by playwright.config.ts");

const env = {
  ...process.env,
  POS_DATABASE_URL: `${APP}/${DB}`,
  POS_MIGRATION_DATABASE_URL: `${OWNER}/${DB}`,
  POS_AUTH_ENABLED: "true",
  POS_AUTH_USERNAME: "e2eadmin",
  POS_AUTH_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
  POS_SECRET_KEY: randomBytes(32).toString("hex"),
  POS_API_TOKEN: "",
  POS_SMTP_PASSWORD: "",
  POS_MAIL_DEV_LOG: "true",
  POS_ALLOW_REGISTRATION: "true",
  POS_LOG_LEVEL: "INFO",
};

function run(args, label) {
  const r = spawnSync(python, args, { cwd: backend, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

// 1. fresh database (connect to the maintenance db "postgres" as the owner)
run(["-c", `
import sqlalchemy as sa
db = ${JSON.stringify(DB)}
assert "e2e" in db
eng = sa.create_engine(${JSON.stringify(`${OWNER}/postgres`)}, isolation_level="AUTOCOMMIT")
with eng.connect() as c:
    c.execute(sa.text(f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)'))
    c.execute(sa.text(f'CREATE DATABASE "{db}"'))
`], "recreate e2e database");

// 2. schema + RLS + grants
run(["-m", "alembic", "upgrade", "head"], "alembic upgrade");

// 3. serve
const log = createWriteStream(join(out, "api.log"), { flags: "w" });
const api = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"], { cwd: backend, env });
api.stdout.pipe(log);
api.stderr.pipe(log);
api.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => api.kill());

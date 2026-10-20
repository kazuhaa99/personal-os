#!/bin/sh
# Runs once, when the Postgres volume is first initialised (docker-entrypoint-initdb.d).
# Creates the restricted role the API connects as: no superuser, no BYPASSRLS, so the
# row-level security policies from migration 0003 actually apply to it. Data grants
# are (re)applied by `alembic upgrade head`, which the API container runs on start.
set -eu
: "${POS_APP_DB_PASSWORD:?set POS_APP_DB_PASSWORD in .env}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$POS_APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE personal_os_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'personal_os_app')
\gexec
SQL

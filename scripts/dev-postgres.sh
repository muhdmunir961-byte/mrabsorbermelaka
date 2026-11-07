#!/usr/bin/env bash
# Rootless PostgreSQL 16 for local development.
# The server binary and its libraries live in ~/.local/sysroot because this image
# ships neither PostgreSQL nor the shared objects it links against.
set -euo pipefail

SYSROOT="${HOME}/.local/sysroot"
PGBIN="${SYSROOT}/usr/lib/postgresql/16/bin"
PGDATA="${HOME}/.local/var/pgdata"
PGLOG="${HOME}/.local/var/pg.log"
PORT="${PGPORT:-5433}"

export LD_LIBRARY_PATH="${SYSROOT}/usr/lib/x86_64-linux-gnu:${SYSROOT}/lib/x86_64-linux-gnu:${SYSROOT}/usr/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

usage() {
  echo "usage: $0 {start|stop|status|psql}" >&2
  exit 2
}

[ $# -eq 1 ] || usage

case "$1" in
  start)
    if "${PGBIN}/pg_ctl" -D "${PGDATA}" status >/dev/null 2>&1; then
      echo "postgres already running on port ${PORT}"
      exit 0
    fi
    "${PGBIN}/pg_ctl" -D "${PGDATA}" \
      -o "-p ${PORT} -k /tmp -c listen_addresses=127.0.0.1" \
      -l "${PGLOG}" -w start
    echo "postgres listening on 127.0.0.1:${PORT}"
    ;;
  stop)
    "${PGBIN}/pg_ctl" -D "${PGDATA}" -w stop
    ;;
  status)
    "${PGBIN}/pg_ctl" -D "${PGDATA}" status
    ;;
  psql)
    exec "${PGBIN}/psql" -h 127.0.0.1 -p "${PORT}" -U postgres -d mrabsorber
    ;;
  *)
    usage
    ;;
esac

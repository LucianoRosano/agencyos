#!/usr/bin/env bash
# AGENCYOS · prueba de restauración (mensual, cron + GitHub Actions backup-verify.yml).
#   infra/scripts/restore-test.sh [prod|staging] [--local]
#
# Por defecto baja el backup diario más nuevo de Google Drive (rclone crypt): así se prueba
# también el descifrado. Con --local usa el último backup de $BACKUP_DIR.
# Restaura el dump en un PostgreSQL efímero SIN red, cuenta filas de workspace, project,
# task y client, verifica checksums y el tar de archivos. Sale con código ≠ 0 si algo falla.
set -Eeuo pipefail

CONTAINER=""
WORK=""

cleanup() {
  [[ -n "$CONTAINER" ]] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  [[ -n "$WORK" && -d "$WORK" ]] && rm -rf -- "$WORK" || true
}

main() {
  SCRIPT_NAME=restore-test
  # shellcheck source=infra/scripts/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  trap cleanup EXIT

  local env_arg="prod" source="remote" arg
  for arg in "$@"; do
    case "$arg" in
      prod | production | staging | stg) env_arg="$arg" ;;
      --local) source="local" ;;
      *) die "argumento desconocido: $arg" ;;
    esac
  done
  resolve_env "$env_arg"
  mkdir -p "$STATE_DIR"

  local dir name
  if [[ "$source" == remote ]]; then
    local remote="${RCLONE_REMOTE:-agencyos-crypt:}"
    command -v rclone >/dev/null 2>&1 || fail "rclone no está instalado"
    name="$(rclone lsf --dirs-only "${remote}${ENV_NAME}/daily" | sed 's#/$##' | sort -r | head -n1)"
    [[ -n "$name" ]] || fail "no hay backups en ${remote}${ENV_NAME}/daily"
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/agencyos-restore.XXXXXX")"
    log "descargando ${remote}${ENV_NAME}/daily/$name…"
    rclone copy --retries 3 "${remote}${ENV_NAME}/daily/$name" "$WORK" || fail "no pude descargar el backup"
    dir="$WORK"
  else
    name="$(find "$BACKUP_DIR/$ENV_NAME" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -r | head -n1)"
    [[ -n "$name" ]] || fail "no hay backups locales en $BACKUP_DIR/$ENV_NAME"
    dir="$BACKUP_DIR/$ENV_NAME/$name"
  fi
  log "probando backup $name"

  # Integridad: checksums y tar legible.
  (cd "$dir" && sha256sum --quiet -c SHA256SUMS) || fail "checksums distintos (backup corrupto)"
  local nfiles
  nfiles="$(tar -tzf "$dir/files.tar.gz" | grep -vc '/$' || true)"
  log "files.tar.gz OK ($nfiles archivos)"

  # PostgreSQL efímero sin red, con la misma imagen mayor que producción.
  local image="${RESTORE_PG_IMAGE:-postgres:17-bookworm}" pw
  pw="$(openssl rand -hex 16)"
  CONTAINER="agencyos-restore-test-$$"
  docker run -d --name "$CONTAINER" --network none \
    -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=restore \
    --memory 1g --tmpfs /var/lib/postgresql/data:rw,size=4g "$image" >/dev/null || fail "no pude crear el contenedor efímero"

  local i
  for ((i = 1; i <= 30; i++)); do
    docker exec "$CONTAINER" pg_isready -U restore -d restore -q 2>/dev/null && break
    sleep 2
  done
  # pg_isready puede responder durante el arranque inicial: se confirma con una consulta real.
  for ((i = 1; i <= 15; i++)); do
    docker exec "$CONTAINER" psql -U restore -d restore -tAc 'select 1' >/dev/null 2>&1 && break
    sleep 2
  done

  log "restaurando dump…"
  docker exec -i "$CONTAINER" pg_restore -U restore -d restore --no-owner --no-acl --exit-on-error <"$dir/db.dump" ||
    fail "pg_restore falló"

  local table counts="" n
  for table in workspace project task client; do
    n="$(docker exec "$CONTAINER" psql -U restore -d restore -tAc "select count(*) from public.\"$table\"" 2>/dev/null)" ||
      fail "falta la tabla $table en el backup"
    counts+="\"$table\":$n,"
    log "  $table: $n filas"
  done
  local ws
  ws="$(docker exec "$CONTAINER" psql -U restore -d restore -tAc 'select count(*) from public.workspace')"
  [[ "$ws" -ge 1 ]] || fail "el backup no tiene ningún workspace"

  printf '{"env":"%s","status":"ok","backup":"%s","source":"%s","counts":{%s},"files":%s,"at":"%s"}\n' \
    "$ENV_NAME" "$name" "$source" "${counts%,}" "${nfiles:-0}" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$STATE_DIR/restore-test-$ENV_NAME.json"
  log "restauración OK ($name)"
}

fail() {
  log "FALLÓ: $*"
  printf '{"env":"%s","status":"error","error":"%s","at":"%s"}\n' "${ENV_NAME:-?}" "$*" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    >"${STATE_DIR:-/tmp}/restore-test-${ENV_NAME:-unknown}.json" 2>/dev/null || true
  exit 1
}

main "$@"

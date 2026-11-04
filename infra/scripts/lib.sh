#!/usr/bin/env bash
# Funciones comunes de los scripts de AGENCYOS. Se carga con `source`, no se ejecuta.
# shellcheck shell=bash
# shellcheck disable=SC2034  # REPO_DIR, BACKUP_DIR y LOG_DIR los usan los scripts que cargan este archivo.

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
STATE_DIR="${AGENCYOS_STATE_DIR:-$INFRA_DIR/.deploy}"
BACKUP_DIR="${AGENCYOS_BACKUP_DIR:-/var/backups/agencyos}"
LOG_DIR="${AGENCYOS_LOG_DIR:-/var/log/agencyos}"
COMPOSE_ENV="$INFRA_DIR/.env"

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${SCRIPT_NAME:-agencyos}" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

# docker compose con el archivo del repo (el proyecto se llama "agencyos").
dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Valida el entorno y define: ENV_NAME, PROFILE, ENV_FILE, SVC_WEB, SVC_WORKER, SVC_DB, SVC_MIGRATE, TAG_VAR, VERSION_VAR
resolve_env() {
  case "${1:-}" in
    prod | production)
      ENV_NAME=prod PROFILE=prod ENV_FILE="$INFRA_DIR/.env.prod"
      SVC_WEB=web SVC_WORKER=worker SVC_DB=postgres SVC_MIGRATE=migrate
      TAG_VAR=TAG_PROD VERSION_VAR=VERSION_PROD
      ;;
    staging | stg)
      ENV_NAME=staging PROFILE=staging ENV_FILE="$INFRA_DIR/.env.staging"
      SVC_WEB=web-stg SVC_WORKER=worker-stg SVC_DB=postgres-stg SVC_MIGRATE=migrate-stg
      TAG_VAR=TAG_STG VERSION_VAR=VERSION_STG
      ;;
    *) die "entorno inválido: '${1:-}' (usá staging o prod)" ;;
  esac
  export ENV_NAME PROFILE ENV_FILE SVC_WEB SVC_WORKER SVC_DB SVC_MIGRATE TAG_VAR VERSION_VAR
}

require_env_files() {
  [[ -f "$COMPOSE_ENV" ]] || die "falta $COMPOSE_ENV (corré infra/scripts/first-setup.sh)"
  [[ -f "$ENV_FILE" ]] || die "falta $ENV_FILE (corré infra/scripts/first-setup.sh)"
  local perms
  perms="$(stat -c '%a' "$ENV_FILE")"
  [[ "$perms" == "600" || "$perms" == "400" ]] || die "$ENV_FILE tiene permisos $perms; deben ser 600 (chmod 600 $ENV_FILE)"
}

# Lee una variable de un archivo KEY=valor sin ejecutarlo (sin `source`).
read_kv() {
  local file="$1" key="$2" line
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

# Escribe/actualiza KEY=valor en un archivo (valores sin espacios ni comillas).
write_kv() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  if [[ -f "$file" ]]; then
    grep -vE "^${key}=" "$file" >"$tmp" || true
    chmod --reference="$file" "$tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
}

current_tag() { read_kv "$COMPOSE_ENV" "$TAG_VAR"; }

image_exists() { docker image inspect "$1" >/dev/null 2>&1; }

# Readiness desde dentro del contenedor web: GET /api/health (incluye la base).
web_ready() {
  dc --profile "$PROFILE" exec -T "$SVC_WEB" node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json().then(j=>{console.log(JSON.stringify(j));process.exit(r.ok?0:1)}),()=>process.exit(1))" 2>/dev/null
}

# Espera a que web responda y a que el worker siga corriendo. $1 = intentos (5 s c/u).
wait_healthy() {
  local tries="${1:-36}" i out
  for ((i = 1; i <= tries; i++)); do
    if out="$(web_ready)"; then
      if [[ "$(dc --profile "$PROFILE" ps --status running -q "$SVC_WORKER" | wc -l)" -ge 1 ]]; then
        log "health OK ($i/$tries): $out"
        return 0
      fi
      log "web OK pero $SVC_WORKER no está corriendo ($i/$tries)"
    else
      log "esperando health de $SVC_WEB ($i/$tries)…"
    fi
    sleep 5
  done
  return 1
}

# Levanta web + worker del entorno con un tag de imagen ya construido.
up_with_tag() {
  local tag="$1" version="$2"
  export "$TAG_VAR=$tag" "$VERSION_VAR=$version"
  dc --profile "$PROFILE" up -d --no-build "$SVC_DB" "$SVC_WEB" "$SVC_WORKER" caddy
}

record_deploy() {
  local tag="$1" version="$2" ref="$3"
  mkdir -p "$STATE_DIR"
  write_kv "$COMPOSE_ENV" "$TAG_VAR" "$tag"
  write_kv "$COMPOSE_ENV" "$VERSION_VAR" "$version"
  printf '%s\t%s\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$tag" "$version" "$ref" >>"$STATE_DIR/$ENV_NAME.history"
}

# Tag anterior distinto del actual según el historial (para rollback).
previous_tag() {
  local current="$1"
  [[ -f "$STATE_DIR/$ENV_NAME.history" ]] || return 0
  awk -F'\t' -v cur="$current" '$2 != cur { t = $2 "\t" $3 } END { if (t) print t }' "$STATE_DIR/$ENV_NAME.history"
}

# Lock global: un solo deploy/rollback/backup a la vez.
take_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/.lock"
  flock -w "${1:-900}" 9 || die "otro deploy/backup está en curso (lock $STATE_DIR/.lock)"
}

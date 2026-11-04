#!/usr/bin/env bash
# AGENCYOS · backup de la base (pg_dump comprimido) + volumen de archivos → rclone crypt (Google Drive).
#   infra/scripts/backup.sh [prod|staging]              backup completo + subida + retención (cron 03:00)
#   infra/scripts/backup.sh prod --pre-deploy           solo local y rápido (lo llama deploy.sh)
#   infra/scripts/backup.sh prod --no-upload            solo local
#
# Retención remota: 7 diarios, 4 semanales (domingos) y 6 mensuales (día 1).
# Retención local ($BACKUP_DIR): 3 completos + 3 pre-deploy por entorno.
# Variables opcionales: RCLONE_REMOTE (por defecto "agencyos-crypt:"), RCLONE_CONFIG.
# Al terminar bien (con copia externa) registra 'backup.completed' en audit_log
# (Configuración → Estado lo muestra).
set -Eeuo pipefail

main() {
  SCRIPT_NAME=backup
  # shellcheck source=infra/scripts/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

  local env_arg="prod" mode="full" arg
  for arg in "$@"; do
    case "$arg" in
      prod | production | staging | stg) env_arg="$arg" ;;
      --pre-deploy) mode="predeploy" ;;
      --no-upload) mode="local" ;;
      *) die "argumento desconocido: $arg" ;;
    esac
  done
  resolve_env "$env_arg"
  require_env_files

  mkdir -p "$STATE_DIR"
  exec 8>"$STATE_DIR/.backup.lock"
  flock -w 1800 8 || die "hay otro backup en curso"

  local remote="${RCLONE_REMOTE:-agencyos-crypt:}"
  local stamp suffix="" dir
  stamp="$(date '+%Y-%m-%dT%H%M%S')"
  [[ "$mode" == predeploy ]] && suffix="-predeploy"
  dir="$BACKUP_DIR/$ENV_NAME/${stamp}${suffix}"
  umask 077
  mkdir -p "$dir"
  log "backup $ENV_NAME ($mode) → $dir"

  # 1) Base: formato custom de pg_dump (comprimido, permite restaurar tablas sueltas).
  # shellcheck disable=SC2016  # $POSTGRES_* se expanden dentro del contenedor.
  dc --profile "$PROFILE" exec -T "$SVC_DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 --no-owner --no-acl' >"$dir/db.dump" ||
    die "falló pg_dump"
  [[ -s "$dir/db.dump" ]] || die "el dump quedó vacío"
  dc --profile "$PROFILE" exec -T "$SVC_DB" pg_restore -l <"$dir/db.dump" >/dev/null || die "el dump no es legible por pg_restore"

  # 2) Archivos subidos (volumen Docker), en un contenedor efímero sin red y de solo lectura.
  local volume="agencyos_files" pg_image
  [[ "$ENV_NAME" == staging ]] && volume="agencyos_files_stg"
  pg_image="$(docker inspect --format '{{.Config.Image}}' "$(dc --profile "$PROFILE" ps -q "$SVC_DB")")"
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker run --rm --network none -v "$volume:/src:ro" "$pg_image" tar -C /src -czf - . >"$dir/files.tar.gz" || die "falló el tar de archivos"
  else
    log "el volumen $volume no existe todavía: se omite"
    tar -czf "$dir/files.tar.gz" -T /dev/null
  fi

  (cd "$dir" && sha256sum db.dump files.tar.gz >SHA256SUMS)
  local size
  size="$(du -sh "$dir" | cut -f1)"
  log "local OK ($size)"

  prune_local "$BACKUP_DIR/$ENV_NAME" "$suffix"

  if [[ "$mode" != full ]]; then
    write_status "ok-local" "$stamp" "$size"
    return 0
  fi

  # 3) Copia externa cifrada (rclone crypt → Google Drive).
  if ! command -v rclone >/dev/null 2>&1 || ! rclone listremotes 2>/dev/null | grep -qxF "$remote"; then
    write_status "sin-copia-externa" "$stamp" "$size"
    die "rclone no está configurado ($remote): el backup quedó SOLO en el VPS. Ver docs/DEPLOYMENT.md §rclone"
  fi
  local base="${remote}${ENV_NAME}"
  upload "$dir" "$base/daily/$stamp"
  [[ "$(date +%u)" == 7 ]] && upload "$dir" "$base/weekly/$stamp"
  [[ "$(date +%d)" == 01 ]] && upload "$dir" "$base/monthly/$stamp"
  prune_remote "$base/daily" 7
  prune_remote "$base/weekly" 4
  prune_remote "$base/monthly" 6

  write_status "ok" "$stamp" "$size"
  record_audit "$stamp" "$size"
  log "backup completo OK ($stamp, $size)"
}

upload() {
  local src="$1" dst="$2"
  log "subiendo a $dst"
  rclone copy --retries 5 --low-level-retries 10 --checksum "$src" "$dst" || die "falló la subida a $dst"
  rclone check --one-way "$src" "$dst" >/dev/null 2>&1 || die "la copia en $dst no coincide con la local"
}

prune_remote() {
  local path="$1" keep="$2" old list
  # Si la carpeta todavía no existe (p. ej. weekly antes del primer domingo) no hay nada que podar.
  list="$(rclone lsf --dirs-only "$path" 2>/dev/null || true)"
  printf '%s\n' "$list" | sed 's#/$##' | sort -r | tail -n +"$((keep + 1))" |
    while read -r old; do
      [[ -n "$old" ]] || continue
      log "retención: borro $path/$old"
      rclone purge "$path/$old" || log "no pude borrar $path/$old (se reintenta mañana)"
    done
}

# Conserva los 3 backups locales más nuevos del mismo tipo (completo o pre-deploy).
prune_local() {
  local root="$1" suffix="$2" d
  find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r |
    if [[ -n "$suffix" ]]; then grep -- "$suffix\$"; else grep -v -- '-predeploy$'; fi |
    tail -n +4 | while read -r d; do rm -rf -- "${root:?}/$d"; done || true
}

write_status() {
  printf '{"env":"%s","status":"%s","stamp":"%s","size":"%s","at":"%s"}\n' \
    "$ENV_NAME" "$1" "$2" "$3" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$STATE_DIR/backup-$ENV_NAME.json"
}

# Deja constancia en la app (audit_log es de solo inserción).
record_audit() {
  # audit_log.id no tiene default en la base (la app genera uuidv7): acá va gen_random_uuid().
  local sql="insert into audit_log (id, actor_type, action, after) values (gen_random_uuid(), 'system', 'backup.completed', jsonb_build_object('env', '$ENV_NAME', 'stamp', '$1', 'size', '$2'))"
  # shellcheck disable=SC2016  # $POSTGRES_* se expanden dentro del contenedor.
  dc --profile "$PROFILE" exec -T "$SVC_DB" sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$sql" ||
    log "AVISO: el backup está bien pero no pude registrarlo en audit_log"
}

main "$@"

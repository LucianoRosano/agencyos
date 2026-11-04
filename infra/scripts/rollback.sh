#!/usr/bin/env bash
# AGENCYOS · rollback a una imagen ya construida (sin rebuild, sin tocar la base).
#   infra/scripts/rollback.sh <staging|prod>            → vuelve al deploy anterior del historial
#   infra/scripts/rollback.sh <staging|prod> <tag>      → vuelve a un tag concreto (sha de 12 o vX.Y.Z)
#   infra/scripts/rollback.sh <staging|prod> --list     → muestra el historial
# Las migraciones NO se revierten (son forward-only). Si una migración rompió datos,
# ver docs/runbooks/restore-backup.md.
set -Eeuo pipefail

main() {
  SCRIPT_NAME=rollback
  # shellcheck source=infra/scripts/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

  resolve_env "${1:-}"
  require_env_files
  local target="${2:-}"

  if [[ "$target" == "--list" ]]; then
    printf 'fecha (UTC)\ttag\tversión\tref\n'
    cat "$STATE_DIR/$ENV_NAME.history" 2>/dev/null || echo "(sin historial)"
    printf '\nactual: %s\n' "$(current_tag)"
    return 0
  fi

  take_lock
  local current version
  current="$(current_tag)"
  if [[ -z "$target" ]]; then
    local prev
    prev="$(previous_tag "$current")"
    [[ -n "$prev" ]] || die "no hay un deploy anterior en $STATE_DIR/$ENV_NAME.history"
    target="${prev%%$'\t'*}"
    version="${prev#*$'\t'}"
  else
    [[ "$target" =~ ^[A-Za-z0-9._+-]+$ ]] || die "tag inválido: $target"
    version="$target"
  fi

  image_exists "agencyos-web:$target" || die "no existe la imagen agencyos-web:$target (docker image ls agencyos-web)"
  image_exists "agencyos-worker:$target" || die "no existe la imagen agencyos-worker:$target"
  [[ "$target" != "$current" ]] || die "$ENV_NAME ya está en $target"

  log "rollback de $ENV_NAME: $current → $target"
  up_with_tag "$target" "$version"
  if wait_healthy 36; then
    record_deploy "$target" "$version" "rollback-from-$current"
    log "rollback OK: $ENV_NAME en $version"
  else
    dc --profile "$PROFILE" logs --tail 80 "$SVC_WEB" "$SVC_WORKER" >&2 || true
    die "la versión $target tampoco pasa el health check: seguí docs/runbooks/incidente.md"
  fi
}

main "$@"

#!/usr/bin/env bash
# AGENCYOS · deploy en el VPS.
#   infra/scripts/deploy.sh staging <commit|rama>
#   infra/scripts/deploy.sh prod    <vX.Y.Z>        (solo tags alcanzables desde origin/main)
#
# Pasos: git fetch del ref → build de imágenes (o reutiliza las de staging del mismo commit)
#        → backup previo (solo prod) → migraciones → up -d → health check con reintentos
#        → si falla, rollback automático a la imagen anterior.
# Todo el cuerpo está dentro de main(): bash lo lee completo antes de que `git checkout`
# cambie este mismo archivo.
set -Eeuo pipefail

main() {
  SCRIPT_NAME=deploy
  # shellcheck source=infra/scripts/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

  local env_arg="${1:-}" ref="${2:-}"
  [[ -n "$env_arg" && -n "$ref" ]] || die "uso: deploy.sh <staging|prod> <ref>"
  [[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || die "ref inválido: $ref"
  resolve_env "$env_arg"
  require_env_files
  take_lock

  cd "$REPO_DIR"
  log "entorno=$ENV_NAME ref=$ref"

  # 1) Código: fetch y checkout del ref (HEAD separado = lo último desplegado).
  git fetch --prune --tags --force origin
  local sha
  # Ramas: siempre la de origin (la rama local del clon puede estar vieja). Tags y shas: tal cual.
  sha="$(git rev-parse --verify --quiet "origin/${ref}^{commit}" || git rev-parse --verify --quiet "${ref}^{commit}" || true)"
  [[ -n "$sha" ]] || die "no encuentro el ref '$ref' en origin"
  if [[ "$ENV_NAME" == prod ]]; then
    [[ "$ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "producción solo se despliega desde un tag vX.Y.Z (recibí '$ref')"
    git merge-base --is-ancestor "$sha" origin/main || die "el tag $ref no está en origin/main"
  fi
  git -c advice.detachedHead=false checkout --force --detach "$sha"

  local tag version
  tag="$(git rev-parse --short=12 "$sha")"
  if [[ "$ENV_NAME" == prod ]]; then version="${ref}+${tag}"; else version="$tag"; fi

  # 2) Imágenes: si staging ya construyó este commit, prod usa exactamente esas imágenes.
  local pnpm_version
  pnpm_version="$(grep -oE '"packageManager": *"pnpm@[0-9.]+"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo 10.28.0)"
  local kind
  for kind in web worker; do
    if image_exists "agencyos-$kind:$tag"; then
      log "imagen agencyos-$kind:$tag ya existe: se reutiliza"
    else
      log "construyendo agencyos-$kind:$tag…"
      DOCKER_BUILDKIT=1 docker build --pull \
        --build-arg "PNPM_VERSION=$pnpm_version" \
        -f "infra/docker/Dockerfile.$kind" -t "agencyos-$kind:$tag" .
    fi
  done
  if [[ "$ENV_NAME" == prod ]]; then
    docker tag "agencyos-web:$tag" "agencyos-web:$ref"
    docker tag "agencyos-worker:$tag" "agencyos-worker:$ref"
  fi

  local prev_tag prev_version
  prev_tag="$(current_tag)"
  prev_version="$(read_kv "$COMPOSE_ENV" "$VERSION_VAR")"

  # 3) Base arriba y backup previo (prod).
  export "$TAG_VAR=$tag" "$VERSION_VAR=$version"
  dc --profile "$PROFILE" up -d --no-build --wait "$SVC_DB"
  if [[ "$ENV_NAME" == prod ]]; then
    log "backup previo al deploy…"
    "$INFRA_DIR/scripts/backup.sh" prod --pre-deploy || die "falló el backup previo: no se despliega"
  fi

  # 4) Migraciones (forward-only; deben ser compatibles con la versión anterior: expand/contract).
  log "migrando ($SVC_MIGRATE)…"
  dc --profile "$PROFILE" run --rm --no-deps "$SVC_MIGRATE" || die "fallaron las migraciones: la versión anterior sigue en línea"

  # 5) Arranque de la versión nueva.
  log "levantando $SVC_WEB y $SVC_WORKER con $tag…"
  up_with_tag "$tag" "$version"

  # 6) Health check con reintentos; si falla → rollback a la imagen anterior.
  if wait_healthy 36; then
    record_deploy "$tag" "$version" "$ref"
    log "deploy OK: $ENV_NAME → $version"
    prune_images
    return 0
  fi

  log "health check FALLÓ para $tag"
  dc --profile "$PROFILE" logs --tail 80 "$SVC_WEB" "$SVC_WORKER" >&2 || true
  if [[ -n "$prev_tag" ]] && image_exists "agencyos-web:$prev_tag" && image_exists "agencyos-worker:$prev_tag"; then
    log "rollback automático a $prev_tag…"
    up_with_tag "$prev_tag" "${prev_version:-$prev_tag}"
    if wait_healthy 24; then
      log "rollback OK: sigue en línea $prev_tag. Revisá los logs de $tag antes de reintentar."
    else
      log "el rollback tampoco pasó el health check: seguí docs/runbooks/incidente.md"
    fi
  else
    log "no hay imagen anterior para volver (¿primer deploy?)"
  fi
  [[ "$ENV_NAME" != prod ]] || log "si la migración rompió datos: docs/runbooks/restore-backup.md (hay un backup pre-deploy en $BACKUP_DIR)"
  exit 1
}

# Borra imágenes viejas, pero nunca las que están en uso ni las de los últimos 5 deploys de
# cada entorno (son las candidatas a rollback). Los tags vX.Y.Z se conservan siempre.
prune_images() {
  local keep img
  keep="$( {
    read_kv "$COMPOSE_ENV" TAG_PROD; echo
    read_kv "$COMPOSE_ENV" TAG_STG; echo
    tail -n 5 "$STATE_DIR/prod.history" 2>/dev/null | cut -f2
    tail -n 5 "$STATE_DIR/staging.history" 2>/dev/null | cut -f2
  } | sed '/^$/d' | sort -u)"
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^agencyos-(web|worker):[0-9a-f]{12}$' |
    while read -r img; do
      grep -qxF "${img#*:}" <<<"$keep" || docker image rm "$img" >/dev/null 2>&1 || true
    done
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
}

main "$@"

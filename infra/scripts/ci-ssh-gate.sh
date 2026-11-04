#!/usr/bin/env bash
# AGENCYOS · puerta SSH para GitHub Actions.
# La clave de CI se instala en authorized_keys con:
#   command="/opt/agencyos/infra/scripts/ci-ssh-gate.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA…
# Así, aunque la clave se filtre, solo puede pedir estas órdenes (sin shell):
#   deploy staging <sha40>
#   deploy prod <vX.Y.Z>
#   rollback <staging|prod>
#   restore-test [prod|staging]
#   backup-status [prod|staging]
set -Eeuo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${AGENCYOS_STATE_DIR:-$SCRIPTS/../.deploy}"
cmd="${SSH_ORIGINAL_COMMAND:-$*}"

log() { logger -t agencyos-ci "$*" 2>/dev/null || true; }
deny() {
  log "RECHAZADO: $cmd"
  echo "ci-ssh-gate: orden no permitida: $cmd" >&2
  exit 126
}

read -r -a argv <<<"$cmd"
log "orden: $cmd"
case "${argv[0]:-}" in
  deploy)
    [[ ${#argv[@]} -eq 3 ]] || deny
    case "${argv[1]}" in
      staging) [[ "${argv[2]}" =~ ^[0-9a-f]{40}$ ]] || deny ;;
      prod) [[ "${argv[2]}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || deny ;;
      *) deny ;;
    esac
    exec "$SCRIPTS/deploy.sh" "${argv[1]}" "${argv[2]}"
    ;;
  rollback)
    [[ ${#argv[@]} -eq 2 && "${argv[1]}" =~ ^(staging|prod)$ ]] || deny
    exec "$SCRIPTS/rollback.sh" "${argv[1]}"
    ;;
  restore-test)
    [[ ${#argv[@]} -le 2 && "${argv[1]:-prod}" =~ ^(staging|prod)$ ]] || deny
    exec "$SCRIPTS/restore-test.sh" "${argv[1]:-prod}"
    ;;
  backup-status)
    [[ ${#argv[@]} -le 2 && "${argv[1]:-prod}" =~ ^(staging|prod)$ ]] || deny
    env="${argv[1]:-prod}"
    f="$STATE_DIR/backup-$env.json"
    [[ -f "$f" ]] || {
      echo "{\"env\":\"$env\",\"status\":\"sin-backups\"}"
      exit 1
    }
    cat "$f"
    # Falla si el último backup completo tiene más de 26 h o no subió a Drive.
    grep -q '"status":"ok"' "$f" || exit 1
    [[ $(($(date +%s) - $(stat -c %Y "$f"))) -lt $((26 * 3600)) ]] || exit 1
    ;;
  *) deny ;;
esac

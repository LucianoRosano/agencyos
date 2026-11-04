#!/usr/bin/env bash
# AGENCYOS · configuración inicial del VPS (una sola vez, como el usuario de deploy).
#   infra/scripts/first-setup.sh <dominio> [--email <acme-email>] [--force]
#
# Genera con permisos 600 (nunca se commitean):
#   infra/.env          variables de docker compose (dominio, email ACME, basic auth de staging)
#   infra/.env.prod     secretos de producción  (AUTH_SECRET, APP_ENCRYPTION_KEY, SETUP_TOKEN, Postgres…)
#   infra/.env.staging  secretos de staging     (todos distintos de producción)
# Instala el crontab de backups y la rotación de logs (pide sudo).
# Solo imprime los SETUP_TOKEN (los necesitás para crear la cuenta en /setup).
set -Eeuo pipefail

main() {
  SCRIPT_NAME=first-setup
  # shellcheck source=infra/scripts/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

  local domain="" email="lucianorosanott@gmail.com" force=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --email)
        email="${2:-}"
        shift 2
        ;;
      --force)
        force=1
        shift
        ;;
      -*) die "opción desconocida: $1" ;;
      *)
        domain="$1"
        shift
        ;;
    esac
  done
  [[ -n "$domain" ]] || die "uso: first-setup.sh <dominio> [--email <email>] [--force]   (ej.: first-setup.sh agencyos.com.ar)"
  domain="${domain#https://}"
  domain="${domain%/}"
  [[ "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "dominio inválido: $domain (solo minúsculas, sin https://)"
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "email inválido: $email"
  command -v openssl >/dev/null || die "falta openssl"
  command -v docker >/dev/null || die "falta docker (corré antes infra/scripts/harden-vps.sh)"

  local f
  for f in "$COMPOSE_ENV" "$INFRA_DIR/.env.prod" "$INFRA_DIR/.env.staging"; do
    if [[ -e "$f" ]]; then
      [[ "$force" == 1 ]] || die "$f ya existe. No lo piso (perderías los secretos). Usá --force solo si sabés lo que hacés."
      cp -p "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"
      log "copia de seguridad de $f creada"
    fi
  done

  umask 077
  local staging_domain="staging.$domain"
  local auth="off" auth_user="" auth_hash=""
  if [[ -t 0 ]]; then
    local answer
    read -r -p "¿Proteger staging con un usuario y contraseña extra (además del login de la app)? [s/N] " answer
    if [[ "$answer" =~ ^[sSyY] ]]; then
      read -r -p "Usuario para staging: " auth_user
      [[ "$auth_user" =~ ^[A-Za-z0-9._-]{3,32}$ ]] || die "usuario inválido"
      local p1 p2
      read -r -s -p "Contraseña (mín. 12 caracteres; guardala en Bitwarden): " p1
      echo
      read -r -s -p "Repetila: " p2
      echo
      [[ "$p1" == "$p2" ]] || die "las contraseñas no coinciden"
      [[ ${#p1} -ge 12 ]] || die "la contraseña debe tener al menos 12 caracteres"
      auth_hash="$(printf '%s\n' "$p1" | docker run --rm -i caddy:2-alpine caddy hash-password)" || die "no pude generar el hash"
      auth="on"
    fi
  fi

  {
    echo "# Generado por infra/scripts/first-setup.sh el $(date -u '+%Y-%m-%d %H:%M UTC'). Variables de docker compose."
    echo "APP_DOMAIN=$domain"
    echo "STAGING_DOMAIN=$staging_domain"
    echo "ACME_EMAIL=$email"
    echo "STAGING_BASIC_AUTH=$auth"
    echo "STAGING_BASIC_AUTH_USER=$auth_user"
    # Comillas simples: el hash bcrypt tiene '$' y compose no debe interpolarlo.
    echo "STAGING_BASIC_AUTH_HASH='$auth_hash'"
    echo "# Los actualiza deploy.sh / rollback.sh:"
    echo "TAG_PROD="
    echo "VERSION_PROD="
    echo "TAG_STG="
    echo "VERSION_STG="
  } >"$COMPOSE_ENV"

  write_app_env "$INFRA_DIR/.env.prod" postgres "https://$domain"
  write_app_env "$INFRA_DIR/.env.staging" postgres-stg "https://$staging_domain"
  chmod 600 "$COMPOSE_ENV" "$INFRA_DIR/.env.prod" "$INFRA_DIR/.env.staging"
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"

  install_cron

  cat <<EOF

Listo. Archivos creados (permisos 600, fuera de git):
  $COMPOSE_ENV
  $INFRA_DIR/.env.prod
  $INFRA_DIR/.env.staging

SETUP_TOKEN (para abrir /setup y crear tu cuenta; guardalos en Bitwarden y no los compartas):
  producción: $(read_kv "$INFRA_DIR/.env.prod" SETUP_TOKEN)
  staging:    $(read_kv "$INFRA_DIR/.env.staging" SETUP_TOKEN)

Pendiente (ver docs/DEPLOYMENT.md):
  - Copiar AUTH_SECRET y APP_ENCRYPTION_KEY de producción a Bitwarden:
      grep -E '^(AUTH_SECRET|APP_ENCRYPTION_KEY)=' $INFRA_DIR/.env.prod
  - Completar BREVO_API_KEY y EMAIL_FROM en ambos archivos cuando tengas Brevo (nano $INFRA_DIR/.env.prod).
  - Configurar rclone (backups a Google Drive).
EOF
}

# $1 archivo, $2 host de la base, $3 APP_URL
write_app_env() {
  local file="$1" dbhost="$2" url="$3" pg_pw
  pg_pw="$(openssl rand -hex 24)"
  cat >"$file" <<EOF
# Generado por infra/scripts/first-setup.sh el $(date -u '+%Y-%m-%d %H:%M UTC'). NO commitear. Copia de los secretos críticos en Bitwarden.
# Documentación de cada variable: .env.example en la raíz del repo.

# Base de datos (contenedor $dbhost, sin puertos publicados)
POSTGRES_USER=agencyos
POSTGRES_DB=agencyos
POSTGRES_PASSWORD=$pg_pw
DATABASE_URL=postgres://agencyos:$pg_pw@$dbhost:5432/agencyos
DB_POOL_MAX=10

# App
APP_URL=$url
AUTH_SECRET=$(openssl rand -hex 32)
APP_ENCRYPTION_KEY=$(openssl rand -hex 32)
SETUP_TOKEN=$(openssl rand -hex 16)
AUTH_HIBP=on
AUTH_RATE_LIMIT=on

# Email (Brevo). Sin BREVO_API_KEY la app no envía mails (recuperar contraseña queda deshabilitado).
BREVO_API_KEY=
EMAIL_FROM=
EMAIL_FROM_NAME=AGENCYOS

# Push (opcional): npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:lucianorosanott@gmail.com
EOF
}

install_cron() {
  local user tmp
  user="$(id -un)"
  tmp="$(mktemp)"
  sed -e "s#__USER__#$user#g" -e "s#__REPO__#$REPO_DIR#g" "$INFRA_DIR/cron/agencyos.crontab" >"$tmp"
  if sudo -n true 2>/dev/null || [[ -t 0 ]]; then
    sudo install -m 644 -o root -g root "$tmp" /etc/cron.d/agencyos
    sudo install -m 644 -o root -g root "$INFRA_DIR/cron/logrotate-agencyos" /etc/logrotate.d/agencyos
    sudo install -d -m 750 -o "$user" -g "$user" "$BACKUP_DIR" "$LOG_DIR"
    log "crontab instalado en /etc/cron.d/agencyos (backup diario 03:00 ART, prueba de restauración mensual)"
  else
    log "sin sudo: instalá el crontab a mano → sudo install -m 644 $tmp /etc/cron.d/agencyos"
    return 0
  fi
  rm -f "$tmp"
}

main "$@"

#!/usr/bin/env bash
# AGENCYOS · hardening de un VPS Ubuntu 24.04 LTS recién creado (Hostinger KVM 2).
# Se corre UNA vez, como root, desde la consola SSH que da Hostinger:
#
#   bash harden-vps.sh <usuario> "<clave pública ed25519>" ["<clave pública ed25519 de GitHub Actions>"]
#
#   - <usuario>: el usuario de trabajo (ej.: deploy). Tendrá sudo (con contraseña) y docker.
#   - Si no pasás la clave pública, se copian las ed25519 de /root/.ssh/authorized_keys.
#   - La 3.ª clave (opcional) es la de GitHub Actions: queda RESTRINGIDA a ci-ssh-gate.sh
#     (solo puede pedir deploy/rollback/restore-test/backup-status, sin shell).
#
# Hace: usuario no root con sudo · SSH solo con clave ed25519, sin root ni contraseñas ·
# UFW (22, 80, 443) · fail2ban · unattended-upgrades (reinicio 04:30 si hace falta) ·
# NTP + zona horaria ART · Docker oficial con logs rotados · swap 4 GB · rclone ·
# carpetas /opt/agencyos, /var/backups/agencyos, /var/log/agencyos.
# Es idempotente: se puede volver a correr.
set -Eeuo pipefail

REPO_DIR_DEFAULT=/opt/agencyos
TZ_NAME=America/Argentina/Buenos_Aires

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

main() {
  [[ $EUID -eq 0 ]] || die "correlo como root (sudo bash harden-vps.sh …)"
  . /etc/os-release
  [[ "${ID:-}" == ubuntu ]] || die "este script es para Ubuntu (detectado: ${ID:-?})"
  [[ "${VERSION_ID:-}" == 24.04 ]] || echo "AVISO: probado en Ubuntu 24.04; detectado ${VERSION_ID:-?}"

  local user="${1:-}" pubkey="${2:-}" ci_key="${3:-}"
  [[ "$user" =~ ^[a-z][a-z0-9_-]{2,31}$ ]] || die "uso: harden-vps.sh <usuario> \"<clave ssh-ed25519>\" [\"<clave CI>\"]"
  [[ "$user" != root ]] || die "el usuario no puede ser root"

  if [[ -z "$pubkey" ]]; then
    pubkey="$(grep -E '^(sk-)?ssh-ed25519 ' /root/.ssh/authorized_keys 2>/dev/null || true)"
  fi
  [[ -n "$pubkey" ]] || die "no hay clave ed25519: pasala como 2.º argumento (contenido de ~/.ssh/id_ed25519.pub de tu PC)"
  while read -r k; do
    [[ -z "$k" ]] && continue
    [[ "$k" =~ ^(sk-ssh-ed25519@openssh\.com|ssh-ed25519)\ [A-Za-z0-9+/=]+ ]] || die "la clave no es ed25519: ${k:0:30}…"
  done <<<"$pubkey"
  if [[ -n "$ci_key" ]]; then
    [[ "$ci_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+ ]] || die "la clave de CI no es ed25519"
  fi

  log "Paquetes del sistema"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
  apt-get install -y -q ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
    apt-listchanges rclone openssl jq util-linux

  log "Zona horaria y NTP"
  timedatectl set-timezone "$TZ_NAME"
  timedatectl set-ntp true
  systemctl enable --now systemd-timesyncd >/dev/null 2>&1 || true

  log "Usuario $user"
  if ! id "$user" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$user"
  fi
  usermod -aG sudo "$user"
  install -d -m 700 -o "$user" -g "$user" "/home/$user/.ssh"
  local ak="/home/$user/.ssh/authorized_keys"
  touch "$ak"
  while read -r k; do
    [[ -z "$k" ]] && continue
    grep -qxF "$k" "$ak" || echo "$k" >>"$ak"
  done <<<"$pubkey"
  if [[ -n "$ci_key" ]]; then
    local gate="$REPO_DIR_DEFAULT/infra/scripts/ci-ssh-gate.sh"
    local ci_line="command=\"$gate\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $ci_key"
    grep -qF "$ci_key" "$ak" || echo "$ci_line" >>"$ak"
  fi
  chown "$user:$user" "$ak"
  chmod 600 "$ak"
  if passwd -S "$user" | awk '{print $2}' | grep -qE '^(L|NP)$'; then
    echo "Elegí una contraseña para '$user' (la pide sudo; guardala en Bitwarden). SSH NO acepta contraseñas."
    if [[ -t 0 ]]; then passwd "$user"; else echo "AVISO: sin terminal; corré luego: passwd $user"; fi
  fi

  log "SSH: solo clave ed25519, sin root ni contraseñas"
  cat >/etc/ssh/sshd_config.d/00-agencyos.conf <<EOF
# AGENCYOS (harden-vps.sh). 00- para ganarle a 50-cloud-init.conf.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
AuthenticationMethods publickey
PubkeyAcceptedAlgorithms ssh-ed25519,sk-ssh-ed25519@openssh.com
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding local
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers $user
EOF
  sshd -t || die "configuración de sshd inválida (no se aplicó nada)"
  systemctl reload ssh || systemctl restart ssh

  log "Firewall (UFW): 22, 80, 443"
  ufw default deny incoming
  ufw default allow outgoing
  ufw limit 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP (redirige a HTTPS)'
  ufw allow 443 comment 'HTTPS + HTTP/3'
  ufw --force enable

  log "fail2ban"
  cat >/etc/fail2ban/jail.d/agencyos.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.maxtime = 1w
backend = systemd

[sshd]
enabled = true
EOF
  systemctl enable --now fail2ban
  systemctl restart fail2ban

  log "Actualizaciones de seguridad automáticas"
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  cat >/etc/apt/apt.conf.d/52agencyos-unattended <<'EOF'
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
  systemctl enable --now unattended-upgrades

  log "Kernel: ajustes de red básicos"
  cat >/etc/sysctl.d/90-agencyos.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
kernel.kptr_restrict = 2
vm.swappiness = 10
EOF
  sysctl --system >/dev/null

  log "Swap de 4 GB (colchón para builds de Docker)"
  if ! swapon --show | grep -q .; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi

  log "Docker (repositorio oficial)"
  if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      >/etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  install -d -m 755 /etc/docker
  cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true,
  "userland-proxy": false
}
EOF
  systemctl enable docker >/dev/null
  systemctl restart docker
  usermod -aG docker "$user"

  log "Carpetas de AGENCYOS"
  install -d -m 755 -o "$user" -g "$user" "$REPO_DIR_DEFAULT"
  install -d -m 750 -o "$user" -g "$user" /var/backups/agencyos /var/log/agencyos

  cat <<EOF

────────────────────────────────────────────────────────────────────
Hardening terminado.

ANTES de cerrar esta sesión, abrí OTRA terminal en tu PC y probá:
    ssh $user@$(hostname -I | awk '{print $1}')
Si entra, ya podés cerrar esta. root ya no puede entrar por SSH.

Siguiente paso (como $user): docs/DEPLOYMENT.md → "Clonar el repo".
Nota: Docker publica solo los puertos de Caddy (80/443); la base no tiene puertos.
────────────────────────────────────────────────────────────────────
EOF
}

main "$@"

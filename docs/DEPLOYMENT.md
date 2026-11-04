# Despliegue de AGENCYOS (paso a paso)

Esta guía es para Luciano. Se hace **una sola vez**; después, cada cambio se despliega solo:

- **push a `main`** → se despliega a **staging** (`https://staging.<dominio>`);
- **tag `vX.Y.Z`** → se despliega a **producción**, pero solo cuando vos lo aprobás en GitHub.

Tiempo estimado: 1 h 30 min la primera vez. Lo que dice `<dominio>` reemplazalo por el tuyo (por ejemplo `agencyos.com.ar`), y `<IP>` por la IP del VPS.

> Qué tenés que tener a mano: tu PC con Windows (PowerShell), tu cuenta de GitHub, Bitwarden abierto y la cuenta de Google `lucianorosanott@gmail.com`.

---

## 0. Qué se instala (resumen)

| Pieza | Dónde | Para qué |
|---|---|---|
| Caddy | contenedor `caddy` | HTTPS automático (Let's Encrypt), compresión, cabeceras de seguridad |
| Web producción / staging | `web` / `web-stg` | La app (Next.js), con Chromium para PDFs |
| Worker producción / staging | `worker` / `worker-stg` | Jobs, outbox, PDFs, backups internos |
| PostgreSQL 17 | `postgres` / `postgres-stg` | Bases **separadas**, sin puertos abiertos a internet |
| Backups | cron del VPS + rclone | Dump diario 03:00 → Google Drive cifrado (7 diarios, 4 semanales, 6 mensuales) |

Archivos: `infra/docker-compose.yml`, `infra/Caddyfile`, `infra/docker/*`, `infra/scripts/*`, `infra/cron/*`.

---

## 1. Comprar el VPS (Hostinger KVM 2)

1. En Hostinger: **VPS → KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe). Período: 24 meses (es el precio de la decisión, docs/03 §8).
2. **Ubicación del datacenter: São Paulo (Brasil).**
3. **Sistema operativo: Ubuntu 24.04 LTS** (plantilla "sistema operativo limpio", **sin** panel ni Docker preinstalado: el script instala todo).
4. Antes de terminar te pide una **clave SSH**. Creala en tu PC (PowerShell):

   ```powershell
   ssh-keygen -t ed25519 -C "luciano@pc"
   # Enter para aceptar la ruta (C:\Users\<vos>\.ssh\id_ed25519) y poné una frase de paso (guardala en Bitwarden)
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```

   Copiá la línea que empieza con `ssh-ed25519` y pegala en Hostinger.
5. Anotá la **IP** del VPS (panel de Hostinger → VPS → Resumen).

## 2. Comprar el dominio y apuntar el DNS

Donde compres el dominio (Hostinger, NIC Argentina, etc.), en la zona DNS creá dos registros **A**:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `<IP>` | 3600 |
| A | `staging` | `<IP>` | 3600 |

Si el VPS tiene IPv6 podés agregar los mismos dos como **AAAA**. Comprobá desde PowerShell (puede tardar unos minutos):

```powershell
Resolve-DnsName <dominio>
Resolve-DnsName staging.<dominio>
```

Ambos tienen que devolver la IP del VPS **antes** del primer deploy (Caddy necesita eso para pedir los certificados HTTPS).

## 3. Endurecer el VPS (`harden-vps.sh`)

Vas a necesitar **otra clave** solo para GitHub Actions (así, si algún día se filtra, solo sirve para pedir deploys). En PowerShell:

```powershell
ssh-keygen -t ed25519 -C "github-actions-agencyos" -N '""' -f $env:USERPROFILE\.ssh\agencyos_ci
Get-Content $env:USERPROFILE\.ssh\agencyos_ci.pub
```

Entrá al VPS como root y corré el script (reemplazá las dos claves por el contenido de tus `.pub`):

```powershell
ssh root@<IP>
```

Como el repo es privado, el script se copia a mano: en GitHub abrí `infra/scripts/harden-vps.sh`, botón **"Copy raw file"**, y en el VPS:

```bash
nano harden-vps.sh            # pegá (clic derecho en PowerShell), Ctrl+O, Enter, Ctrl+X
bash harden-vps.sh deploy "ssh-ed25519 AAAA…tu-clave… luciano@pc" "ssh-ed25519 AAAA…clave-ci… github-actions-agencyos"
```

El script:

- crea el usuario **`deploy`** (con sudo; te pide una contraseña para sudo: **guardala en Bitwarden** como "AGENCYOS · VPS sudo");
- deja SSH **solo con clave ed25519**, sin root y sin contraseñas;
- activa el firewall (solo 22, 80 y 443), **fail2ban**, actualizaciones de seguridad automáticas (reinicia a las 04:30 si hace falta), NTP y la hora de Argentina;
- instala **Docker** oficial (con logs rotados), **rclone**, 4 GB de swap;
- registra la clave de GitHub Actions **restringida** a `infra/scripts/ci-ssh-gate.sh` (solo puede pedir `deploy`, `rollback`, `restore-test` y `backup-status`).

**Antes de cerrar la sesión de root**, abrí otra ventana de PowerShell y probá `ssh deploy@<IP>`. Si entra, listo. Desde ahora root ya no puede entrar por SSH.

## 4. Clonar el repo en el VPS

El VPS necesita **leer** el repo privado. Se usa una *deploy key* de solo lectura:

```bash
ssh deploy@<IP>
ssh-keygen -t ed25519 -C "vps-agencyos-deploy-key" -N "" -f ~/.ssh/github_agencyos
cat ~/.ssh/github_agencyos.pub
```

En GitHub: repo `LucianoRosano/agencyos` (o `prod-agencyos` si ya se renombró según docs/15) → **Settings → Deploy keys → Add deploy key** → título "VPS (solo lectura)", pegá la clave, **sin** marcar "Allow write access".

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_agencyos
  IdentitiesOnly yes
EOF
ssh -T git@github.com            # responde "Hi …! You've successfully authenticated" → OK
git clone git@github.com:LucianoRosano/agencyos.git /opt/agencyos
cd /opt/agencyos
```

> La ruta **tiene que ser `/opt/agencyos`**: la clave de GitHub Actions apunta a `/opt/agencyos/infra/scripts/ci-ssh-gate.sh`.

## 5. Generar los secretos (`first-setup.sh`)

```bash
cd /opt/agencyos
infra/scripts/first-setup.sh <dominio>
```

- Te pregunta si querés **un usuario y contraseña extra delante de staging** (recomendado: sí; guardalos en Bitwarden como "AGENCYOS · staging basic auth").
- Crea `infra/.env`, `infra/.env.prod` e `infra/.env.staging` con **permisos 600** y secretos aleatorios (distintos para staging y producción). Nunca se suben a git.
- Instala el crontab (backup 03:00, prueba de restauración el día 1) y la rotación de logs.
- **Solo muestra los dos `SETUP_TOKEN`**. Guardalos en Bitwarden ("AGENCYOS · SETUP_TOKEN prod/staging").

Después, copiá a Bitwarden los dos secretos críticos de producción (sin ellos no se recuperan los datos cifrados):

```bash
grep -E '^(AUTH_SECRET|APP_ENCRYPTION_KEY)=' infra/.env.prod
```

→ Bitwarden: "AGENCYOS · APP_ENCRYPTION_KEY (prod)" y "AGENCYOS · AUTH_SECRET (prod)". Cerrá la terminal o limpiala (`clear`).

**Email (Brevo):** cuando tengas la API key, editá los dos archivos (`nano infra/.env.prod` y `nano infra/.env.staging`) y completá `BREVO_API_KEY` y `EMAIL_FROM`. Los cambios se aplican en el próximo deploy (o con `docker compose -f infra/docker-compose.yml --profile prod up -d web worker`).

## 6. Cargar los secrets en GitHub

En GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor | Obligatorio |
|---|---|---|
| `VPS_HOST` | La IP del VPS | Sí |
| `VPS_USER` | `deploy` | Sí |
| `VPS_SSH_KEY` | Contenido **completo** de `C:\Users\<vos>\.ssh\agencyos_ci` (la privada, empieza con `-----BEGIN OPENSSH PRIVATE KEY-----`) | Sí |
| `VPS_KNOWN_HOSTS` | Salida de `ssh-keyscan -t ed25519 <IP>` (ejecutalo **dentro** del VPS y pegalo) | Recomendado: fija la huella del servidor |
| `VPS_PORT` | Solo si cambiaste el puerto SSH (por defecto 22) | No |

Mientras estos secrets no existan, los workflows de deploy **se saltean con un aviso** (no fallan).

Después borrá la clave privada de CI de tu PC si querés (ya está en GitHub) o guardala en Bitwarden.

**Aprobación de producción:** **Settings → Environments → New environment → `production`**:

- **Required reviewers:** vos.
- **Deployment branches and tags:** "Selected" → regla de tag `v*.*.*`.

> En repos privados, los *required reviewers* necesitan GitHub Pro (gratis con el Student Developer Pack, ver docs/15).

## 7. Primer deploy a staging

Cualquier push a `main` despliega staging. Para el primero podés forzarlo: GitHub → **Actions → Deploy staging → Run workflow**. O desde el VPS:

```bash
cd /opt/agencyos
infra/scripts/deploy.sh staging main
```

Qué hace `deploy.sh`: trae el commit, construye las imágenes (la primera vez tarda 10–15 min), migra la base de staging, levanta `web-stg` y `worker-stg`, espera el *health check* y, si falla, **vuelve solo a la versión anterior**.

Comprobá en el navegador: `https://staging.<dominio>/api/health` → `{"ok":true,"db":"ok",…}`.

## 8. Crear tu cuenta (staging) y activar 2FA

1. Abrí `https://staging.<dominio>/setup` (si activaste el usuario extra de staging, el navegador te lo pide primero).
2. Completá nombre, email, contraseña (12+ caracteres; guardala en Bitwarden) y el **SETUP_TOKEN de staging**.
3. La app te lleva a **activar 2FA**: escaneá el QR con tu app (Bitwarden Authenticator, Google Authenticator, etc.) y **guardá los 10 códigos de respaldo** en Bitwarden.
4. Probá un cierre de sesión y un inicio con 2FA.

## 9. Backups: rclone con tu Google Drive

Los backups salen del VPS **cifrados** a tu Drive. Sin este paso, el backup queda solo en el VPS y el cron lo marca como error.

1. Desde tu PC, entrá con un túnel (permite autorizar a Google desde tu navegador):

   ```powershell
   ssh -L 53682:localhost:53682 deploy@<IP>
   ```

2. En el VPS:

   ```bash
   rclone config
   ```

   - `n` (nuevo) → nombre **`gdrive`** → tipo **`drive`** → client_id y secret vacíos → scope **`3`** (`drive.file`: rclone solo ve lo que él crea) → el resto Enter → "Use web browser to automatically authenticate?" **`y`** → abrí en tu PC el enlace `http://127.0.0.1:53682/auth?...` que muestra, iniciá sesión con **lucianorosanott@gmail.com** y aceptá → "Configure this as a Shared Drive?" `n` → `y` para guardar.
   - `n` (nuevo) → nombre **`agencyos-crypt`** → tipo **`crypt`** → remote **`gdrive:AGENCYOS-backups`** → filename_encryption `standard` → directory_name_encryption `true` → password: **`g`** (generar, 1024 bits) → **copiá la contraseña generada a Bitwarden** → password2 (salt): **`g`** → **copiala también** → `y` → `q`.
   - Guardá en Bitwarden un ítem **"AGENCYOS · rclone crypt"** con las dos contraseñas. **Sin ellas los backups no se pueden leer**, ni siquiera por vos.

3. Probá:

   ```bash
   cd /opt/agencyos
   infra/scripts/backup.sh prod      # la primera vez puede avisar que no hay base prod todavía: hacelo después del paso 10
   rclone lsd agencyos-crypt:
   ```

   En tu Drive vas a ver una carpeta `AGENCYOS-backups` con nombres ilegibles: es lo esperado (están cifrados).

Plantilla de referencia (sin secretos): `infra/rclone/rclone.conf.example`.

## 10. Deploy a producción (tag + aprobación)

1. Cuando staging esté bien, Claude te propone una versión (por ejemplo `v0.1.0`) con el resumen de cambios.
2. Se crea el tag (Claude o vos): `git tag v0.1.0 && git push origin v0.1.0`.
3. GitHub → **Actions → Deploy producción** queda "Waiting": entrás, **Review deployments → production → Approve and deploy**.
4. `deploy.sh prod` hace: verifica que el tag esté en `main` → reutiliza las imágenes ya probadas en staging (mismo commit) → **backup previo** → migraciones → levanta `web` y `worker` → health check → rollback automático si falla.
5. Primera vez: abrí `https://<dominio>/setup` con el **SETUP_TOKEN de producción**, creá la cuenta y activá 2FA igual que en staging.
6. Corré el primer backup completo: `infra/scripts/backup.sh prod` y luego `infra/scripts/restore-test.sh prod` (tiene que terminar en "restauración OK").

## 11. Si algo sale mal

- **Volver a la versión anterior:** `infra/scripts/rollback.sh prod` (o `staging`). Ver [`docs/runbooks/rollback.md`](runbooks/rollback.md).
- **Restaurar un backup:** [`docs/runbooks/restore-backup.md`](runbooks/restore-backup.md).
- **Incidente de seguridad:** [`docs/runbooks/incidente.md`](runbooks/incidente.md).
- **Rotar secretos:** [`docs/runbooks/rotar-secretos.md`](runbooks/rotar-secretos.md).
- **Detalle del deploy:** [`docs/runbooks/deploy.md`](runbooks/deploy.md).

## 12. Comandos útiles (en el VPS, desde `/opt/agencyos`)

```bash
alias dc='docker compose -f /opt/agencyos/infra/docker-compose.yml'
dc --profile prod --profile staging ps          # estado de todo
dc --profile prod logs -f --tail 100 web         # logs de la web de producción
dc --profile prod exec postgres psql -U agencyos agencyos   # consola SQL (la base no tiene puertos abiertos)
dc --profile prod run --rm worker pnpm admin reset-password <email>   # CLI de administración
infra/scripts/rollback.sh prod --list            # historial de deploys
cat infra/.deploy/backup-prod.json               # estado del último backup
tail -n 50 /var/log/agencyos/backup.log
```

## Apéndice: decisiones

- **Una sola máquina, dos entornos:** staging y producción comparten Caddy pero tienen bases, volúmenes, redes internas y secretos separados. Las bases están en redes Docker `internal` sin salida a internet ni puertos publicados.
- **Las imágenes se construyen en el VPS** (no hay registry). Staging construye `agencyos-web:<sha>` y producción reutiliza exactamente esa imagen. Se conservan las de los últimos 5 deploys de cada entorno para poder volver atrás.
- **Migraciones solo hacia adelante.** El rollback vuelve el código, no la base: toda migración tiene que ser compatible con la versión anterior (agregar antes de quitar). Si una migración rompe datos, se restaura el backup previo al deploy.
- **Sin HSTS preload:** HSTS (2 años, con subdominios) lo pone Caddy; el *preload* se evalúa cuando el dominio sea definitivo.

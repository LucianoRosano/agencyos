# Runbook · GitHub App «AGENCYOS» (Repositorios, M11)

Especificación: [`docs/15-repositorios.md`](../15-repositorios.md). Permisos: [`docs/03-arquitectura.md`](../03-arquitectura.md) §6.

## Requisitos

- AGENCYOS publicado con **dominio y https** (`APP_URL=https://…`). Sin https GitHub no puede entregar los webhooks y Repositorios lo explica en vez de ofrecer el botón.
- Ser dueño o admin del workspace (permiso `settings`).
- 2FA activo en GitHub (docs/15 §3).

## 1. Crear la App (una sola vez, flujo de manifest)

1. AGENCYOS → **Repositorios** → «Crear la GitHub App».
2. Se abre una página con «Continuar a GitHub»: envía el *manifest* (nombre, URL, webhook `${APP_URL}/api/webhooks/github`, `redirect_url` y `setup_url`, App **privada**, permisos y eventos).
3. En GitHub: «Create GitHub App».
4. GitHub vuelve a `/api/github/manifest-callback`, que canjea el código y muestra **una sola vez**:
   `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY`.
   **No se guardan en la base ni en los logs** (solo queda en la auditoría que se creó la App, sin secretos).
5. Copiarlas a `infra/.env.prod` (y staging si corresponde) + copia en **Bitwarden**. Reiniciar `web` y `worker`.

Si se pierde la página: en GitHub → Settings → Developer settings → GitHub Apps → AGENCYOS se puede generar una **nueva clave privada** y un nuevo secreto de webhook (ver «Rotación»).

### Permisos que pide (mínimos)

| Permiso | Nivel | Para qué |
|---|---|---|
| metadata | lectura | listar repositorios |
| contents | escritura | crear ramas y archivos **solo** al ejecutar un plan aprobado (siempre vía PR) |
| administration | escritura | renombrar, topics, descripción, archivar, proteger `main`, alertas de Dependabot |
| pull_requests · issues | escritura | abrir PRs con los archivos estándar |
| actions | lectura | check de CI y de gitleaks (última ejecución en `main`) |
| workflows | escritura | agregar `.github/workflows/ci.yml` vía PR (GitHub lo exige para tocar workflows) |

`actions` y `workflows` no estaban en docs/03 §6: son necesarios para los checks `ci`/`secretos` y para el CI estándar.

Eventos: `repository`, `push`, `pull_request`, `release`. `installation` e `installation_repositories` llegan siempre a una App (no se suscriben).

## 2. Instalar en la cuenta

Repositorios → «Instalar la App en GitHub» → elegir **los repositorios** (o todos). GitHub vuelve a `/api/github/install-callback?installation_id=…` (con estado anti-CSRF), AGENCYOS verifica con la API que la instalación sea de esta App, la guarda (`github_installation`) y sincroniza.

## 3. Operación

- **Sincronización:** por webhook (push a la rama por defecto, cambios del repositorio) y completa a las **04:00 ART** (job `repos-daily-sync`). Botón «Sincronizar» para hacerlo a mano.
- **Planes:** «Generar plan» (determinístico) → revisar acciones y diff → «Aprobar» (contraseña + elegir acciones) → el worker (`repos-execute-plans`, cada minuto) ejecuta con el token de instalación → resultado por acción, auditoría (`github.<acción>`) y actividad.
- **Nunca:** borrar repositorios, cambiar la visibilidad ni force-push. El cliente de GitHub no tiene esos métodos.
- **Archivos estándar:** siempre en una rama `agencyos/estandar-<fecha>` con PR; nunca se escribe en `main`. El merge lo hace Luciano.
- **Crear repositorio** (ficha de proyecto → Repositorios): genera un plan `create_repo` desde una plantilla `tpl-*`; al aprobarlo se crea **privado**, con topics, descripción y PR con README/CLAUDE.md, vinculado al proyecto.
  Limitación de GitHub: con una App instalada en una **cuenta personal**, crear repositorios desde plantilla puede requerir permisos de usuario; si GitHub lo rechaza, la acción queda «Falló» con el motivo y se puede crear a mano con el nombre propuesto (la sincronización lo vincula).
- **Releases:** un release publicado en un repositorio vinculado a un producto propio crea la `own_product_version` y una tarea «Actualizar … en <cliente>» por instalación activa.

## Webhooks

`POST /api/webhooks/github`: verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo, comparación en tiempo constante) → 401 si no coincide. Idempotencia por `X-GitHub-Delivery` (`repo_event.delivery_id` único): una entrega repetida responde 200 sin reprocesar. Máximo 5 MB.

Para reenviar entregas fallidas: GitHub → App → Advanced → Recent deliveries → Redeliver.

## Rotación

1. GitHub → App → «Generate a private key» (y borrar la vieja después de desplegar). Webhook secret: «Edit» → nuevo secreto.
2. Actualizar `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` en el `.env` y Bitwarden; reiniciar web y worker.
3. Ver [`rotar-secretos.md`](rotar-secretos.md).

## Pruebas (sin GitHub)

`GITHUB_FAKE=1` usa un GitHub **simulado** en memoria con fixtures (`packages/modules/src/repos/github-fake.ts`). Solo se activa fuera de producción o con `APP_URL` en `http://localhost` (e2e con `next start`); con un dominio real nunca. No usarlo en el VPS.

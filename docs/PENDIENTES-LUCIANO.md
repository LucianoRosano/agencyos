# Pendientes de Luciano

**Actualizado:** 14/11/2026. Dos listas: lo que tenés que hacer vos (cuentas, compras, datos) y lo que falta del programa para una próxima pasada.

## A. Lo que tenés que hacer vos

### Ahora mismo
0. **Revisar y fusionar la rama** `claude/peaceful-faraday-j13pjv` (ya está subida a GitHub). Si querés, en otra sesión te abro el PR hacia `main`.

### Para publicar (en este orden)
1. **Comprar el VPS** Hostinger KVM 2 (São Paulo, Ubuntu 24.04) — o KVM 1 si preferís menos pago adelantado — y **un dominio**. Todo lo demás ya está preparado: seguí `docs/DEPLOYMENT.md` paso a paso.
2. **Cargar los secrets en GitHub** (Settings → Secrets and variables → Actions): `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (el detalle está en `docs/DEPLOYMENT.md`). Con eso, cada push a `main` despliega solo a staging.
3. **Guardar en Bitwarden** los secretos que genera `infra/scripts/first-setup.sh` (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, contraseñas de la base) y la contraseña de cifrado de los backups.
4. Abrir `https://staging.<tu-dominio>/setup` con el `SETUP_TOKEN`, crear tu cuenta y **activar el 2FA** (guardá los 10 códigos de respaldo en Bitwarden).
5. **Backups:** configurar rclone con tu Google Drive (lucianorosanott@gmail.com) una sola vez (comando en `docs/DEPLOYMENT.md`).
6. **Producción:** cuando staging esté bien, aprobar el tag `v1.0.0` (te lo pido yo; nada va a producción sin tu OK).

### Cuentas y claves (cuando quieras)
- **Brevo** (gratis): crear la cuenta, verificar el remitente (ideal con tu dominio) y cargar `BREVO_API_KEY`. Habilita la recuperación de contraseña por email y el resumen diario por mail. Mientras tanto, la contraseña se restablece en el servidor con `pnpm admin reset-password lucianorosanott@gmail.com`.
- **Claude por MCP:** en Configuración → Integraciones creá un token y pegá en tu PC el comando `claude mcp add …` que te muestra. Desde claude.ai hace falta el dominio con HTTPS.
- **GitHub Student Developer Pack** (education.github.com, con tu constancia de la UNGS): da GitHub Pro gratis → protección de ramas en repos privados (y posible dominio gratis por un año).
- **Renombrar este repo** a `prod-agencyos` (Settings → General → Repository name; GitHub deja redirección). Lo pediste como recordatorio; también se puede hacer en otra sesión con Claude.
- **API key gratuita de Google** (PageSpeed/CrUX) → cargala en SEO → Google (`/seo/google`) para ver Lighthouse y Core Web Vitals.
- **Application Passwords de WordPress** de cada sitio (Usuarios → Perfil → Contraseñas de aplicación en cada WordPress) → cargalas en Activos → Monitoreo para ver versiones y plugins.
- **GitHub App**: con el dominio funcionando, entrá a Repositorios y seguí el asistente "Crear la GitHub App" (guardá en Bitwarden lo que muestra una sola vez). Detalle: `docs/runbooks/github-app.md`.
- **Cuenta de API de Anthropic + tope mensual** (agentes internos, F5).
- **Portal de clientes**: con Brevo configurado, las invitaciones se mandan solas y los clientes pueden entrar con "Recibir enlace por email". Sin Brevo, copiá el enlace de invitación (Configuración → Usuarios) y mandalo por WhatsApp. Para compartir archivos con un cliente, en la ficha del archivo activá "Compartir con el cliente" (el archivo tiene que estar vinculado al cliente o a un proyecto suyo).
- **Passkeys**: después del primer ingreso, agregá la huella o Face ID de tu celular y de tu PC en Configuración → Seguridad.

### Datos para cargar en AGENCYOS
- Revisar la **carga inicial** (`pnpm admin import-inicial` muestra el plan; con `--aplicar` lo ejecuta): clientes y proyectos de tu contexto (A4), proyectos personales y los dos vencimientos (Claude Design 14/12/2026, certificado ARCA 27/10/2028). Ajustá lo que no esté bien desde la app.
- **Cuentas de dinero** con saldo inicial, **suscripciones** (Claude, Hostinger, dominios, VPS) con montos y fechas, y el **catálogo de servicios** con precios (quedan como tareas en tu Bandeja).
- **Materias y fechas** de la facultad.
- Revisar el **texto base de los presupuestos** (Presupuestos → al crear uno; la plantilla base está en la base de datos) y tus datos en Configuración → Agencia (nombre "Luciano Rosano", email y WhatsApp 11 5526-0021 que aparecen en los PDFs).
- ⚠️ **Exportar los diseños de LibreríaOS desde Claude Design antes del 14/12/2026** (también quedó como vencimiento en Hoy).

## B. Lo que falta del programa (próxima pasada)
Todo lo de las fases F1–F6 está construido y probado. Lo que sigue son ajustes finos; ninguno bloquea el uso diario.

### Depende de algo externo (no se puede cerrar sin vos)
- **Medir LCP de Hoy en un celular real** (Lighthouse CI sobre staging) y **tests visuales** con capturas aprobadas: necesita el VPS con dominio.
- **Envío real de emails** (invitaciones, magic link del portal, resumen diario, emails de automatizaciones, presupuestos por email): todo está programado; falta `BREVO_API_KEY`. Nunca se probó contra Brevo real.
- **Lighthouse y Core Web Vitals en SEO**: falta la API key de Google. **Search Console**: no está hecho (requiere OAuth de Google).
- **Agentes de IA**: probados con un cliente simulado; falta la API key de Anthropic para verlos andar de verdad.
- **Repositorios**: probados con GitHub simulado; falta crear la GitHub App con el dominio. Los planes tienen su propia pantalla (no aparecen en `/aprobaciones`).
- **Organización inicial de tus repos** (doc 15 §4): hacerla desde Claude Code en tu PC (ahí está el código suelto y el acceso a Hostinger).

### Mejoras chicas que quedaron afuera
- Biblioteca: **vista previa de la primera página de los PDF** (hoy se abren en otra pestaña) y **mover carpetas** de lugar.
- Finanzas: filtro por etiqueta en Movimientos (la lista está paginada; conviene hacerlo en la consulta) y exportación a PDF de los reportes (CSV y Excel ya están).
- Cerebro: modo 3D (hay 2D con filtros por tipo, espacio, etiqueta y fecha).
- Portal: adjuntar una captura al feedback del cliente; mostrarle al colaborador las notas y archivos internos vinculados a su proyecto (hoy no los ve, por seguridad); permisos editables por módulo (p. ej. dar Finanzas a un colaborador); multi-workspace visible.
- Seguridad fina del portal: la contraseña creada al aceptar una invitación no pasa por el control de contraseñas filtradas, y el magic link saltea el 2FA opcional del cliente.
- Pipeline: al mover una oportunidad de etapa (con etapas configuradas) toma la probabilidad por defecto de la etapa y pisa la que habías puesto a mano.
- Importador de Obsidian: no hace falta (arrancás de cero); queda la exportación compatible como salida de emergencia.

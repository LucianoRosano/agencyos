# Pendientes de Luciano

**Actualizado:** 06/11/2026. Dos listas: lo que tenés que hacer vos (cuentas, compras, datos) y lo que falta del programa para una próxima pasada.

## A. Lo que tenés que hacer vos

### Ahora mismo
0. **Dar acceso de GitHub a Claude** para subir el código: el push de esta sesión a `LucianoRosano/agencyos` fue rechazado (403). Reconectá GitHub en claude.ai (Configuración → Conectores) e instalá la app de Claude en el repo (https://github.com/apps/claude/installations/select_target). Todo está commiteado en la rama `claude/peaceful-faraday-j13pjv`; con el acceso, se sube con un `git push`.

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
- **Passkeys**: después del primer ingreso, agregá la huella o Face ID de tu celular y de tu PC en Configuración → Seguridad.

### Datos para cargar en AGENCYOS
- Revisar la **carga inicial** (`pnpm admin import-inicial` muestra el plan; con `--aplicar` lo ejecuta): clientes y proyectos de tu contexto (A4), proyectos personales y los dos vencimientos (Claude Design 14/12/2026, certificado ARCA 27/10/2028). Ajustá lo que no esté bien desde la app.
- **Cuentas de dinero** con saldo inicial, **suscripciones** (Claude, Hostinger, dominios, VPS) con montos y fechas, y el **catálogo de servicios** con precios (quedan como tareas en tu Bandeja).
- **Materias y fechas** de la facultad.
- Revisar el **texto base de los presupuestos** (Presupuestos → al crear uno; la plantilla base está en la base de datos) y tus datos en Configuración → Agencia (nombre "Luciano Rosano", email y WhatsApp 11 5526-0021 que aparecen en los PDFs).
- ⚠️ **Exportar los diseños de LibreríaOS desde Claude Design antes del 14/12/2026** (también quedó como vencimiento en Hoy).

## B. Lo que falta del programa (próxima pasada)
Ordenado por valor. Ninguno bloquea el uso diario.

### Fase 1 (MVP) — quedó afuera o parcial
- Repositorios: ✅ hecho (falta crear la GitHub App con el dominio). Los planes tienen su propia pantalla; no aparecen en `/aprobaciones`.
- **Organización inicial de tus repos** (doc 15 §4): hacerla desde Claude Code en tu PC (ahí está el código suelto y el acceso a Hostinger).
- **Notificaciones push**: ✅ hechas; solo falta el dominio con HTTPS para activarlas en el celular (Configuración → Notificaciones).
- Etiquetas, comentarios internos, vistas guardadas y "Conectado con": ✅ hechos. Falta: filtro por etiqueta también en Movimientos y Notas, y etiquetas visibles como chips en las tarjetas de las listas.
- Medición real de **LCP de Hoy en un celular** (Lighthouse CI sobre staging) y **tests visuales** con snapshots aprobados.
- Oportunidades: "servicios de interés" (falta la tabla `opportunity_service`).

### F2 · Producción de sitios
- Website Factory: ✅ hecho. Falta: captura de pantalla adjunta en los ítems de revisión y pestaña "Sitios" en la ficha de cliente (hoy: `/sitios?cliente=<id>`).
- Biblioteca (✅ hecha): falta la **vista previa de la primera página de los PDF** (hoy se abren en otra pestaña), adjuntos en **interacciones** del CRM, **mover carpetas** de lugar y la **cuota editable desde Configuración** (hoy se cambia con `workspace.settings.storageQuotaMb`, por defecto 5000 MB).
- Activos técnicos: ✅ hecho. Convertí tus vencimientos sueltos (certificado ARCA, etc.) desde `/activos`.
- Presupuestos con enlace público y aceptación online: ✅ hecho (el envío por email necesita Brevo).

### F3 · Conocimiento y tiempo
- Revisión semanal: ✅ hecha. Plantillas de notas, adjuntos en notas, modo 3D del Cerebro, filtros por etiqueta/fecha en el Cerebro.
- Finanzas completas: exportación XLSX/PDF, rentabilidad con horas y tarifa, comprobantes adjuntos.
- Importador de Obsidian: no hace falta (arrancás de cero), queda la exportación compatible como salida de emergencia.

### F4 · Operación y automatización
- SEO Auditor: ✅ hecho. Falta: Search Console y el agente de SEO (F5).
- Automatizaciones: ✅ hechas (los emails reales necesitan Brevo).
- Monitoreo de sitios: ✅ hecho.
- Passkeys: ✅ hechas. Importar chats de WhatsApp y etapas editables del pipeline: en curso.

### F5 · IA y F6 · Equipo
- Agentes internos con API (Business, PM, Web Architect, Content, SEO, QA, Code Reviewer, Research, Repo) con presupuestos, trazas y evals.
- Colaboradores, portal de clientes, multi-workspace visible, términos y privacidad.

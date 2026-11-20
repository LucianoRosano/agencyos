# Pendientes de Luciano

**Actualizado:** 20/11/2026. Dos listas: lo que tenés que hacer vos (cuentas, compras, datos) y lo que falta del programa para una próxima pasada.

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
- **Instalá AGENCYOS en el celular** (Chrome → "Agregar a pantalla principal"): así aparece en el menú **Compartir** de cualquier app (WhatsApp, Chrome, Instagram) y lo que compartís cae en la Bandeja. El ícono muestra cuántas notificaciones tenés sin leer.

### Para probar cuando tengas un rato (nuevo)
- **Abonos mensuales** (Finanzas → Abonos): cargá los mantenimientos/hostings/SEO que cobrás todos los meses. El cobro se genera solo el día de facturación y Negocio muestra tu ingreso recurrente.
- **Importar CSV** (Configuración → Datos): subí tu planilla de clientes o el extracto del banco; primero ves la vista previa.
- **Fechas escritas**: en `Ctrl+K` o al crear una tarea escribí «Llamar a Sofía mañana 10hs» o «Entregar el viernes».
- **Informe mensual para un cliente**: en la ficha del cliente, menú «…» → «Informe de octubre · PDF». Revisá que el texto y los datos te sirvan para mandarlo.
- **Capacidad**: en Configuración → Agencia cargá tus horas de trabajo por día hábil; en Tareas aparece la carga de la semana (poné estimaciones a las tareas para que sea útil).
- **Automatización «cobro vencido → recordatorio»** (Automatizaciones → plantillas): el email al cliente queda en Aprobaciones.
- **Permisos extra de colaboradores** (Configuración → Usuarios), **un segundo workspace** (selector arriba en la barra lateral) y el **enlace por email** en una cuenta de cliente con 2FA activado.
- **Capacidad de las próximas 6 semanas** (Negocio): poné estimación y fecha a tus tareas y horas incluidas a tus abonos; ahí ves cuánto te queda libre por semana.
- **Presupuesto vs. real** (proyecto → Horas): cargá tu tarifa objetivo (Configuración → Agencia) y vinculá el presupuesto aceptado; avisa cuando un proyecto se pasa.
- **Encuesta de satisfacción**: cuando pases un proyecto a «Terminado», tu cliente ve la encuesta en su portal; el resultado aparece en su ficha y en Negocio.
- **Captura sin conexión**: en el celular, poné modo avión, capturá algo y volvé a conectar: se sube solo a la Bandeja.
- **Ajustar abonos por inflación** (Finanzas → Abonos → «Ajustar montos»): probá con un porcentaje y usá «Deshacer» si querés volver.
- **Automatización «presupuesto sin respuesta → seguimiento»** (Automatizaciones → plantillas): te deja una tarea a los 4 días de enviado.
- **Aviso de dispositivo nuevo**: al entrar desde otro navegador o celular te llega una notificación (y un email cuando configures Brevo). Si no fuiste vos, cerrá esa sesión en Configuración → Seguridad.

### Datos para cargar en AGENCYOS
- Revisar la **carga inicial** (`pnpm admin import-inicial` muestra el plan; con `--aplicar` lo ejecuta): clientes y proyectos de tu contexto (A4), proyectos personales y los dos vencimientos (Claude Design 14/12/2026, certificado ARCA 27/10/2028). Ajustá lo que no esté bien desde la app.
- **Cuentas de dinero** con saldo inicial, **suscripciones** (Claude, Hostinger, dominios, VPS) con montos y fechas, y el **catálogo de servicios** con precios (quedan como tareas en tu Bandeja).
- **Materias y fechas** de la facultad.
- Revisar el **texto base de los presupuestos** (Presupuestos → al crear uno; la plantilla base está en la base de datos) y tus datos en Configuración → Agencia (nombre "Luciano Rosano", email y WhatsApp 11 5526-0021 que aparecen en los PDFs).
- ⚠️ **Exportar los diseños de LibreríaOS desde Claude Design antes del 14/12/2026** (también quedó como vencimiento en Hoy).

## B. Lo que falta del programa y mejoras propuestas
Todo lo de las fases F1–F6 está construido y probado, más una tercera vuelta de mejoras y escalabilidad (ver ESTADO). Lo que sigue: primero lo que depende de algo tuyo, después ideas ordenadas por valor para tu negocio. Ninguna bloquea el uso diario.

### Depende de algo externo (no se puede cerrar sin vos)
- **Medir en el VPS real**: LCP de Hoy en un celular (Lighthouse CI sobre staging), prueba de carga (`pnpm load:test`, ver `docs/SCALING.md`) y tests visuales con capturas aprobadas.
- **Envío real de emails** (invitaciones, enlace del portal, resumen diario, automatizaciones, presupuestos y recordatorios de cobro): todo programado; falta `BREVO_API_KEY`. Nunca se probó contra Brevo real.
- **Lighthouse y Core Web Vitals en SEO**: falta la API key de Google. **Search Console**: no está hecho (requiere OAuth de Google).
- **Agentes de IA**: probados con un cliente simulado; falta la API key de Anthropic.
- **Repositorios**: probados con GitHub simulado; falta crear la GitHub App con el dominio. Los planes tienen su pantalla propia (no aparecen en `/aprobaciones`).
- **Almacenamiento S3 y varias instancias**: listo para activar (`STORAGE_DRIVER=s3`, réplicas en Compose); conviene cuando uses más de un servidor o quieras los archivos fuera del VPS (Cloudflare R2 tiene 10 GB gratis).
- **Organización inicial de tus repos** (doc 15 §4): desde Claude Code en tu PC.

### Ideas para hacer crecer el negocio (propuestas, no hechas)
1. **Cobrar online con Mercado Pago**: link de pago en cada cobro, abono y presupuesto aceptado; el webhook lo marca como cobrado y registra el ingreso. Necesita tu cuenta de Mercado Pago y credenciales de producción.
2. **Factura electrónica de ARCA** (monotributo, Factura C): emitir desde un cobro con CAE y PDF (WSAA + WSFE). Necesita el certificado digital de ARCA (ya tenés uno que vence el 27/10/2028) y definir punto de venta.
3. **Envío automático del informe mensual** a cada cliente el día 1 (el PDF ya existe: falta Brevo y elegir a qué clientes se manda).
4. **Aprobación de diseños con anotaciones** en el portal (el cliente marca sobre la imagen o la página, tipo Markup.io).
5. **WhatsApp Business (Cloud API)**: recordatorios de cobro y avisos de entrega por WhatsApp en lugar de email. Necesita cuenta de Meta Business.
6. **Google Calendar en las dos direcciones** y **Gmail → interacciones del CRM** (OAuth de Google).
7. **Pedido de NPS por email** además del portal (falta Brevo) y recordatorio si no responde en una semana.
8. **Cotización del dólar automática** (oficial, MEP y blue de una API pública como DolarAPI) para convertir abonos y presupuestos en USD y ver Negocio en una sola moneda. Hoy la cotización se carga a mano en cada movimiento.
9. **Ajuste automático por IPC** (INDEC) cada N meses en los abonos que elijas, con aviso al cliente un mes antes (hoy el ajuste es manual y masivo).
10. **Recordatorios fiscales**: recategorización de monotributo (enero y julio), vencimientos mensuales y el certificado de ARCA, como vencimientos recurrentes en Hoy y Calendario.
11. **Búsqueda semántica** en notas y clientes («¿qué le prometí a la librería sobre envíos?») con embeddings en PostgreSQL (pgvector). Necesita API key o un modelo local.

### Mejoras técnicas y de UX propuestas
- **Next.js Cache Components / PPR** en Hoy y Negocio (cache por workspace con invalidación por etiqueta): baja el tiempo de servidor de cada pantalla. Pide una migración cuidadosa por la autenticación.
- **Alertas de seguridad**: falta mostrar la ubicación aproximada de cada sesión (requiere una base de geolocalización por IP).
- **Réplica de lectura de PostgreSQL** para reportes pesados y PgBouncer en modo sesión cuando haya muchas instancias (documentado en `docs/SCALING.md`).
- Biblioteca: miniatura de la primera página del PDF en la grilla (hoy hay vista previa en la ficha).
- Portal: selector de workspace para un cliente que está en dos workspaces.
- **Temporizador global** visible en la barra superior: se dejó para después porque suma JS a todas las pantallas (hoy varias están a 1–2 KB del tope de 170 KB); conviene hacerlo junto con una optimización del JS común.
- Importador de Obsidian: no hace falta (arrancás de cero); queda la exportación compatible como salida de emergencia.

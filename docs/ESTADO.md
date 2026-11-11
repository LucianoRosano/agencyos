# Estado de AGENCYOS

**Actualizado:** 06/11/2026 · versión propuesta **v1.0.0-rc.1** · rama `claude/peaceful-faraday-j13pjv`

Leyenda: ✅ funcionando y probado · 🟡 parcial · ⏳ falta una credencial o compra externa · ⬜ no hecho (fase posterior)

## Hecho

### Núcleo (F0 + F1)
- ✅ Monorepo, esquema completo de datos con migraciones, ADRs 0001–0008, CLAUDE.md.
- ✅ Acceso: `/setup` (dueño, una sola vez; con `SETUP_TOKEN` en producción), login, **2FA TOTP obligatorio** con 10 códigos de respaldo, sesiones listables y revocables, cambio de contraseña, recuperación (por email con Brevo; sin Brevo: `pnpm admin reset-password`).
- ✅ Shell: barra lateral, barra superior (selector de espacio, campana, Modo foco, Capturar), navegación inferior del celular con "+", paleta `Ctrl+K` (buscar, crear, navegar), atajos (`C`, `G`+letra, `?`), claro/oscuro/sistema, PWA instalable con página offline.
- ✅ Espacios (Agencia, Personal, Facultad + propios), papelera 30 días con Deshacer y purga automática, actividad, auditoría inmutable con CSV, notificaciones in-app, exportación total (JSON + Markdown en ZIP), estado del sistema.
- ✅ **Hoy**: foco (3, con sugerencias aceptables con un toque), ponerse al día con acciones inline (hecho, posponer, registrar pago/cobro, definir siguiente acción, bloqueos, aprobaciones), próximos 7 días, dinero del mes con 6 meses, facultad, notas recientes, proyectos activos (frenados atenuados), semana; bloques ocultables y reordenables.
- ✅ **Negocio**: KPIs reales con rango (mes, trimestre, año, personalizado) y comparación; pipeline ponderado; ingresos vs. gastos 12 meses; rentabilidad por cliente; vencimientos; actividad.
- ✅ Bandeja + procesar uno por uno (tarea, nota, proyecto, gasto, descartar, saltear).
- ✅ Proyectos: estados, etapas, siguiente acción obligatoria en curso, bloqueos (aparecen en Hoy), decisiones, entregas, changelog automático y manual, 8 plantillas + asistente de 5 pasos, guardar como plantilla.
- ✅ Tareas: prioridades, fecha/hora, recurrencia, subtareas, checklist, lista/kanban, deslizar en el celular (→ completa, ← pospone), convertir en proyecto, **modo foco** con temporizador 25/50 y registro de tiempo.
- ✅ **CRM**: clientes (fiscales ocultos y auditados), contactos (WhatsApp/tel), interacciones, oportunidades con kanban ponderado, ganada → asistente de proyecto, perdida con motivo, fusionar duplicados, ficha 360°.
- ✅ **Presupuestos**: catálogo de servicios, numeración P-AAAA-NNNN, ítems y descuentos, ARS/USD, plan de cobro, versiones con comparación, estados con vencimiento automático, **PDF** (marca Luciano Rosano, monograma LR), texto para WhatsApp/email, aceptación → proyecto + cobros + oportunidad ganada.
- ✅ **Finanzas**: libros, cuentas con saldo, movimientos y transferencias (con cotización manual), categorías, suscripciones con "registrar pago", por cobrar/pagar con pagos parciales, constancia "no válida como factura", reportes y CSV.
- ✅ **Notas** (CodeMirror, `[[enlaces]]`, menciones `@cliente`/`#proyecto`, backlinks, menciones no enlazadas, frontmatter, nota diaria, versiones, exportación compatible con Obsidian) y **Cerebro** (grafo WebGL con constelaciones, pulso, panel/hoja inferior, grafo local, buscar y volar, filtros, línea de tiempo, vista lista).
- ✅ **Facultad** (materias, evaluaciones, cuenta regresiva, plan de estudio → tareas) y **Calendario** (mes, semana, día, agenda; fuentes ocultables; iCal con token revocable).
- ✅ **Servidor MCP** (`/mcp`) con tokens de alcance limitado, aprobaciones para lo que no tiene permiso, todo auditado.
- ✅ Worker pg-boss: outbox → notificaciones, vencimientos diarios, resumen 8:00 (in-app + email si hay Brevo), purga de papelera.
- ✅ Carga inicial de tus datos reales (`pnpm admin import-inicial`, primero muestra el plan).

### Segunda vuelta (F2)
- ✅ **Colaboración transversal**: **etiquetas** con selector, búsqueda y creación al vuelo, filtro por etiqueta en Proyectos, Tareas y Clientes; **comentarios internos** (nunca visibles para clientes); panel **"Conectado con"** con relaciones implícitas (proyecto → cliente, tarea → proyecto) y enlaces manuales a cualquier elemento vía buscador; **vistas guardadas** por usuario (cualquier combinación de filtros de la URL). En las fichas de cliente, contacto, oportunidad, proyecto, tarea, presupuesto y sitio.
- ✅ **Presupuestos con enlace público** (`/p/<token>`, ADR 0010): generar, copiar, mandar por WhatsApp o email (Brevo), revocar; el cliente ve el presupuesto con la marca Luciano Rosano, descarga el PDF y lo **acepta o rechaza online** (queda "Visto"; aceptar crea proyecto + cobros + oportunidad ganada).
- ✅ **Revisión semanal guiada** (`/revision-semanal`): asistente por pasos que termina en una nota "Revisión S## · AAAA".
- ✅ **Notificaciones push** (Web Push con claves VAPID generadas y guardadas cifradas) por dispositivo + **preferencias por evento** (app / push / email) en Configuración → Notificaciones. ⏳ En el celular requiere el dominio con HTTPS.
- ✅ **Activos técnicos** (`/activos`): dominios (con punycode), hosting, certificados (SSL, ARCA, otros), referencias a credenciales (solo Bitwarden), productos propios con versiones e instalaciones (versión nueva → tareas "Actualizar…" por instalación); vencimientos en Hoy y Calendario; convertir vencimientos sueltos en activos.
- ✅ **Monitoreo de sitios** (`/activos/monitoreo`): uptime cada 5 min (caído con 2 fallos seguidos, aviso de recuperación), SSL leído del certificado real, vencimiento de dominio por RDAP, versiones de WordPress/PHP/plugins vía REST (Application Password cifrada); barras de 24 h y latencia.
- ✅ **SEO Auditor** (`/seo`): rastreador propio con anti-SSRF que respeta robots.txt y sitemap, 55 reglas en 7 categorías, puntaje con fórmula visible, comparación entre auditorías (nuevos/resueltos/persistentes) con aviso de regresión, tareas desde problemas, Lighthouse y Core Web Vitals (⏳ con la API key gratuita de Google), auditorías programadas, informe PDF y CSV.
- ✅ **Centro de automatizaciones** (`/automatizaciones`): reglas por evento o programadas, condiciones Y/O, 6 acciones (tarea, notificación, email con plantilla, cambiar estado, webhook, esperar), 7 plantillas, modo prueba y simulación con el último evento real, reintentos, anti-bucle; **webhooks** entrantes firmados (HMAC + anti-replay) y salientes. Los emails a clientes pasan por Aprobaciones.
- ✅ **Repositorios** (`/repositorios`): conexión con una GitHub App propia (asistente con manifest), inventario con puntaje de salud de 11 checks, vínculos con cliente/proyecto/producto/sitio, **planes de organización con aprobación** (con contraseña; se ejecutan como PR, nunca en `main`, sin borrar ni cambiar visibilidad), webhooks (push, PR, releases → versión de producto), crear repositorio desde un proyecto. ⏳ Requiere crear la App con el dominio.
- ✅ **Passkeys**: entrar con huella, Face ID o llave física (Configuración → Seguridad), además de contraseña + 2FA.
- ✅ **Website Factory** (`/sitios`): alta desde proyecto, briefing por bloques con lista única de preguntas (copiar para WhatsApp, PDF), requerimientos MoSCoW, estructura (6 plantillas, editor, versiones), contenidos por slot, recursos (archivos de la Biblioteca), rondas de revisión, dominio y hosting, checklist de lanzamiento de 17 áreas, documentación viva, monitoreo.
- ✅ **Biblioteca** (`/biblioteca`): subida por arrastrar o elegir (varios, con progreso) con validación por magic bytes, SVG sanitizado, nombres normalizados, máximo 100 MB y cuota por workspace; miniaturas WebP (sharp); cliente → proyecto → carpetas, vistas Logos/Imágenes/Documentos/Últimos, búsqueda y filtros, grilla y lista; ficha con metadatos, etiquetas, **versiones** (descargar y restaurar) y "adjuntado en"; descarga con **URL firmada de 5 min** + sesión; **kit de marca** por cliente (`/biblioteca/marca/<cliente>`); **plantillas** con `{{variables}}` (`/biblioteca/plantillas`); **adjuntos** en tareas, notas, clientes (pestaña Archivos) y comprobantes de movimientos; al purgar de la papelera se borra del almacenamiento (más job diario de huérfanos).

### Infraestructura (lista, falta el VPS)
- ✅ Docker Compose (producción + staging), Caddy con HTTPS automático, imágenes web/worker sin root, CI (lint, typecheck, tests, e2e, gitleaks, auditoría de dependencias), deploy a staging por push y a producción por tag con aprobación, rollback, backups cifrados con rclone + prueba de restauración, hardening del VPS, runbooks. Probado localmente con Docker; ⏳ falta ejecutarlo en el VPS real.

### Calidad (última corrida: 04/11/2026)
- **Unit + integración:** 136 tests en verde contra PostgreSQL 16 y 17 (servicios, aislamiento multi-inquilino, permisos, MCP, worker, seguridad).
- **E2E (Playwright, build de producción):** flujos de docs/09 §3 en mobile-390 y desktop-1440, oscuro y claro, con axe (sin violaciones serias) y control de scroll horizontal.
- **Lint (Biome) y typecheck:** en verde.
- **Revisión de seguridad:** hecha por un agente revisor; los hallazgos altos y medios están corregidos con tests de regresión (`tests/integration/security.test.ts`). Checklist: `docs/SECURITY-CHECKLIST.md`.
- Capturas: `docs/capturas/<proyecto>/*.png`.

## En curso
- Nada a medio hacer en el código. ⏳ El push a GitHub de esta sesión fue rechazado por permisos (ver PENDIENTES-LUCIANO.md).

## Siguiente (fases posteriores)
Ver `docs/PENDIENTES-LUCIANO.md` → "Lo que falta del programa".

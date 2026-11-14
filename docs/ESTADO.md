# Estado de AGENCYOS

**Actualizado:** 14/11/2026 · versión propuesta **v1.0.0-rc.1** · rama `claude/peaceful-faraday-j13pjv`

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

- ✅ **Horas y rentabilidad**: registrar horas a mano o desde el Modo foco (proyecto/tarea, facturable, tarifa); pestaña Horas en proyectos, bloque Tiempo en tareas; **tarifa efectiva por hora** en proyectos y en Negocio, con objetivo editable en Configuración → Agencia.
- ✅ **CRM extra**: **etapas del pipeline editables** (Configuración → CRM), **servicios de interés** en oportunidades (precargan el presupuesto), **importar chats de WhatsApp** (una interacción por día, sin duplicar), **adjuntos en las conversaciones**, pestaña **Sitios** en la ficha de cliente.
- ✅ **Plantillas de notas** con `{{fecha}}`, `{{titulo}}`, `{{cliente}}` (4 de base).
- ✅ **Agentes internos con IA** (`/ia`): 9 agentes (Business, PM, Web Architect, Content, SEO, QA, Code Reviewer, Research, Repo) sobre las herramientas del MCP, con alcances por agente, aprobaciones, **tope mensual** en USD, trazas paso a paso y costos. La API key se guarda cifrada. ⏳ Ocultos hasta cargar la API key de Anthropic.
- ✅ **Finanzas a Excel** (movimientos, resumen mensual y rentabilidad en .xlsx), además de CSV.
- ✅ **Cerebro**: filtro por etiqueta. **Sitios**: capturas adjuntas en los ítems de revisión. **Biblioteca**: cuota editable en Configuración → Agencia.
- ✅ **Términos y privacidad** públicos (`/legal/terminos`, `/legal/privacidad`, Ley 25.326).

### F6 · Colaboradores y portal de clientes
- ✅ **Usuarios e invitaciones** (Configuración → Usuarios, solo dueño/admin): invitar por email como admin, colaborador (con proyectos asignados) o cliente (con su cliente del CRM). Token de 256 bits guardado **hasheado**, vence a los 7 días, un solo uso; copiar el enlace (sin Brevo), generar uno nuevo, reenviar por email (con Brevo) o revocar. `/invitacion/<token>`: el invitado crea su cuenta (contraseña 12+) o acepta con la suya; admins y colaboradores **deben activar 2FA**. Lista con rol, último acceso, 2FA y proyectos; cambiar rol/alcance; **desactivar** (cierra sus sesiones, no borra datos) y reactivar. El dueño no se puede desactivar ni bajar de rol. Las cuentas solo se crean por invitación.
- ✅ **Colaborador** (`member`): solo sus proyectos asignados y lo que cuelga de ellos (tareas, etapas, entregas, decisiones, bloqueos, sitios, comentarios, horas sin tarifa). Filtro centralizado `projectScope/siteScope/assertProjectAccess/assertEntityAccess` (`packages/modules/src/shared/db.ts`). Sin CRM, presupuestos, finanzas, notas, facultad, bandeja, biblioteca, configuración de la agencia, IA ni MCP; la navegación muestra solo Hoy, Proyectos, Tareas y Sitios, y cualquier otra ruta vuelve a Hoy. "Hoy" reducido (sus tareas, entregas y proyectos).
- ✅ **Portal de clientes** (`/portal`, marca Luciano Rosano): sus proyectos con estado, etapa actual y avance; próximas entregas; ficha con etapas, **entregas para aprobar o pedir cambios** (evento + notificación al dueño), **feedback en la ronda de revisión abierta** del sitio, **recursos compartidos** (descarga con URL firmada de 5 min + sesión); **presupuestos** enviados: ver, PDF, aceptar o rechazar con nombre (misma lógica que el enlace público). Login con contraseña o **"Recibir enlace por email"** (magic link, solo para clientes y con Brevo); 2FA opcional. Un cliente que entra a la app interna es redirigido al portal.
- ✅ Ficha de archivo de la Biblioteca: interruptor **"Compartir con el cliente"** (usa la etiqueta reservada `compartido`).

### Infraestructura (lista, falta el VPS)
- ✅ Docker Compose (producción + staging), Caddy con HTTPS automático, imágenes web/worker sin root, CI (lint, typecheck, tests, e2e, gitleaks, auditoría de dependencias), deploy a staging por push y a producción por tag con aprobación, rollback, backups cifrados con rclone + prueba de restauración, hardening del VPS, runbooks. Probado localmente con Docker; ⏳ falta ejecutarlo en el VPS real.

### Calidad (última corrida: 14/11/2026)
- **Unit + integración (Vitest):** 377 tests en verde (41 archivos): servicios de todos los módulos, aislamiento multi-inquilino, permisos por rol (dueño, colaborador, cliente) y por alcance MCP, worker, seguridad.
- **E2E (Playwright, build de producción):** 118 pruebas en verde (17 archivos de flujos) en mobile-390 y desktop-1440, oscuro y claro, con axe (sin violaciones serias) y control de scroll horizontal.
- **Lint (Biome) y typecheck:** en verde en los 7 paquetes.
- **Revisión de seguridad:** hallazgos altos y medios corregidos con tests de regresión (`tests/integration/security.test.ts`). Checklist: `docs/SECURITY-CHECKLIST.md`.
- Capturas: `docs/capturas/<proyecto>/*.png`.

## En curso
- Nada a medio hacer. Todo está subido a GitHub en la rama `claude/peaceful-faraday-j13pjv`.

## Siguiente (fases posteriores)
Ver `docs/PENDIENTES-LUCIANO.md` → "Lo que falta del programa".

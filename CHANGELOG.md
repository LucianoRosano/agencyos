# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · versiones [SemVer](https://semver.org/lang/es/).

## [Sin publicar] — 1.0.0-rc.1
### Agregado
- Fundaciones: monorepo, esquema completo de datos con migraciones, núcleo (dinero, fechas ART, CUIT, permisos, outbox), design system "Centro de mando" oscuro/claro.
- Acceso con Better Auth: configuración inicial, login, 2FA TOTP obligatorio con códigos de respaldo, sesiones, cambio y recuperación de contraseña.
- Shell: barra lateral, barra superior con selector de espacio, navegación inferior del celular con captura, paleta `Ctrl+K` con búsqueda tolerante a tildes y errores, atajos de teclado, PWA instalable.
- Hoy (foco, ponerse al día con acciones inline, próximos 7 días, dinero, facultad, notas, proyectos; bloques personalizables) y Negocio (KPIs reales).
- Bandeja con procesamiento uno por uno; proyectos con 8 plantillas y asistente; tareas con recurrencia, subtareas, checklist, kanban y gestos; modo foco.
- CRM, presupuestos con PDF y versiones, facultad, calendario con iCal.
- Servidor MCP con tokens de alcance limitado; aprobaciones; notificaciones; actividad y auditoría; exportación total; papelera.
- Worker con pg-boss: outbox, vencimientos diarios, resumen 8:00, purga.
- Segunda vuelta (F2–F6):
  - Colaboración: etiquetas, comentarios internos, "Conectado con" y vistas guardadas.
  - Presupuestos con enlace público, PDF y aceptación online (ADR 0010).
  - Revisión semanal guiada; notificaciones push con preferencias por evento; passkeys.
  - Website Factory; Biblioteca de archivos con versiones, kit de marca, plantillas y adjuntos.
  - Activos técnicos y monitoreo de sitios; SEO Auditor; Centro de automatizaciones y webhooks; Repositorios con GitHub App.
  - Registro de horas y rentabilidad por hora; etapas editables del pipeline; servicios de interés; importación de chats de WhatsApp; plantillas de notas.
  - Agentes internos con IA (ocultos hasta configurar la API key), con topes, trazas y aprobaciones.
  - Exportación a Excel en Finanzas; filtro por etiqueta en el Cerebro; términos y privacidad públicos.
- Tercera vuelta (mejoras y escalabilidad):
  - Abonos mensuales con cobro automático, horas incluidas y MRR; importación CSV de clientes y movimientos con vista previa.
  - Fechas en lenguaje natural, compartir desde el celular (Share Target), contador en el ícono de la app, plantilla de recordatorio de cobro vencido.
  - Informe mensual por cliente en PDF, carga de la semana en Tareas, herramientas MCP `listar_abonos` y fechas escritas en `crear_tarea`, probabilidad manual del pipeline guardada (migración 0007).
  - Vista previa de PDF, mover carpetas, etiquetas y filtro en Movimientos, informe PDF de Finanzas, Cerebro 3D.
  - Capturas en el feedback del portal, permisos extra por colaborador, varios workspaces, seguridad del enlace por email e invitaciones.
  - Índices y paginación por cursor, rate limiting en PostgreSQL, almacenamiento S3, observabilidad (OpenTelemetry, logs JSON, health y métricas), workers escalables (ADR 0012, docs/SCALING.md).
  - Esqueletos y errores por sección, navegación y respuestas instantáneas, atajos completos, JS inicial < ~170 KB por pantalla, accesibilidad en todas las rutas.
- Cuarta vuelta:
  - Capacidad de las próximas 6 semanas en Negocio (tareas estimadas + horas de abonos) y presupuesto vs. real por proyecto con tarifa real y aviso.
  - Encuesta de satisfacción (NPS) en el portal al terminar un proyecto, con resultado en la ficha del cliente y KPI en Negocio (migración 0009).
  - Aviso de inicio de sesión desde un dispositivo nuevo (migración 0008) y detalle en las notificaciones.
  - Captura sin conexión con subida automática; Resumen de Finanzas filtrable por etiqueta; botón para volver a la probabilidad de la etapa; página propia al pasar el límite de descargas del portal.
  - Ajuste de abonos por inflación con vista previa y Deshacer; plantilla «presupuesto sin respuesta → seguimiento»; herramienta MCP `ver_capacidad`.
  - Ficha de sitio con pestañas cargadas aparte (JS < 170 KB) y correcciones de accesibilidad.
- Quinta vuelta:
  - App instalable y modo sin conexión con copia en el dispositivo, cola de cambios idempotente y conflictos sin pisar nada (ADR 0013, migración 0010).
  - Cerebro inteligente: índice de notas, documentos (PDF, Word, texto), decisiones y conversaciones; Preguntar con fuentes, Relacionado y MCP `preguntar_cerebro` (ADR 0014, migración 0011).
  - Centro de control: skills (plantillas y exportación para Claude Code) y objetivos con agente supervisado por MCP (ADR 0015, migración 0012).
  - SaaS para comercios: punto de venta, ventas, pedidos, productos y stock, clientes, estadísticas, reporte semanal, usuarios por rol y panel de la agencia (ADR 0016, migración 0013).

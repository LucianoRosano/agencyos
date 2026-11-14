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

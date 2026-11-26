# ADR 0019 · Sistema de avisos (notificaciones)

**Estado:** aceptada (26/11/2026)

## Contexto
Los avisos se creaban en cinco lugares distintos con reglas distintas: algunos sin push (un sitio caído solo aparecía en
la campana), ninguno respetaba un horario de descanso, al tocar un aviso no se marcaba leído y no había forma de
posponer ni archivar.

## Decisión
- **Un solo motor:** `notify()` en `packages/modules/src/notifications/notify.ts`. Todo productor (outbox del worker,
  monitoreo, SEO, automatizaciones, dispositivos nuevos, jobs de resúmenes y recordatorios) avisa por ahí.
  - Preferencias por tipo y canal (app, push, mail) en `notification_preference`.
  - **Prioridad:** `urgent` (sitio caído, acceso desde un dispositivo nuevo: puede saltear el descanso y queda en pantalla),
    `normal`, `low` (solo en la app, nunca suena: cierre del día, presupuesto vencido, oportunidad ganada…).
  - **Horario de descanso** por persona (`user_preference` «notify»: desde/hasta, fines de semana, lo urgente pasa): el
    push queda `deferred` y al terminar se manda **uno solo** («Mientras descansabas: N avisos»).
  - Deduplicación por persona (`dedupeKey`), nunca se avisa a alguien de lo que hizo él mismo.
- **Catálogo** (`catalog.ts`): tipos, nombres y prioridad por defecto; la pantalla de Configuración se arma desde ahí.
- **Centro** (`/notificaciones`): vistas Sin leer / Todas / Pospuestas / Archivadas; posponer (1 h, 3 h, esta tarde,
  mañana, lunes) con vuelta automática (job cada 5 min); archivar; abrir marca leído (`/notificaciones/abrir/[id]`);
  leídos del mismo tipo agrupados; teclado J/K/Enter/E; limpieza a los 120 días (leídos) y 30 (archivados).
- **En vivo** sin WebSockets: con la pestaña visible, consulta cada 45 s y al volver a la pestaña
  (`/api/notificaciones/estado`); actualiza la campana y el ícono de la app y muestra lo nuevo con «Ver». Se carga
  después de hidratar (no suma JS inicial).
- **Push** (Web Push con VAPID propio, gratis): botones «Listo» y «Más tarde» que llaman a
  `/api/notificaciones/[id]/accion` desde el service worker con la sesión; número de no leídas en el ícono.
- **Resúmenes:** del día a la hora que elige cada persona (job cada hora), cierre del día opcional, semanal los lunes.
- **Disparadores nuevos:** el cliente abrió/rechazó un presupuesto, el agente pregunta/propone/pide aprobación/termina,
  vencimientos agendados (N días antes, mañana, hoy), tareas con hora (15 min antes).

## Consecuencias
- Agregar un aviso nuevo = sumar el tipo al catálogo y llamar a `notify()` (o sumarlo al mapa `NOTIFY` del outbox).
- Migración 0018 (columnas nuevas en `notification`, no destructiva).

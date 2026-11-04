# ADR 0004 · pg-boss para jobs y outbox

**Estado:** aceptada · 04/11/2026

Cola sobre PostgreSQL (sin Redis). El worker (`apps/worker`) programa en zona America/Buenos_Aires: despacho del outbox (cada minuto), heartbeat (5 min), vencimientos de cobros/pagos/presupuestos (06:05), resumen diario (08:00), purga de papelera (04:30). Reintentos exponenciales. El estado del sistema lee el último heartbeat de `pgboss.job`.
Cada caso de uso escribe `domain_event` + `activity` en la misma transacción (`recordEvent`); el worker los marca despachados y crea notificaciones.

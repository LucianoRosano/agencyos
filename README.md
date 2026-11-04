# AGENCYOS · Digital Agency OS

El centro de mando de Luciano Rosano: agencia, proyectos, dinero, conocimiento y facultad en un solo lugar, con Claude como equipo de trabajo vía MCP.

> Hacia los clientes (presupuestos, constancias) la marca es **Luciano Rosano**.

## Qué incluye
| Área | Estado |
|---|---|
| Acceso: login + 2FA TOTP obligatorio, sesiones, recuperación | ✅ |
| **Hoy**: foco, ponerse al día, próximos 7 días, dinero, facultad, notas, proyectos | ✅ |
| **Negocio**: KPIs reales con rango y comparación | ✅ |
| Bandeja (captura con `C` / `+`) y procesamiento uno por uno | ✅ |
| Proyectos (8 plantillas, asistente de 5 pasos, etapas, bloqueos, decisiones, entregas, changelog) y tareas (recurrencia, subtareas, checklist, kanban, deslizar en el celular, modo foco) | ✅ |
| CRM: clientes, contactos, interacciones, oportunidades (kanban ponderado), ficha 360° | ✅ |
| Presupuestos: servicios, versiones, descuentos, ARS/USD, plan de cobro, PDF, aceptación → proyecto + cobros | ✅ |
| Finanzas: cuentas, movimientos, suscripciones, por cobrar/pagar, reportes | ver docs/ESTADO.md |
| Notas Markdown con `[[enlaces]]` y Cerebro (grafo WebGL) | ver docs/ESTADO.md |
| Facultad y Calendario (con iCal) | ✅ |
| Servidor MCP con tokens de alcance limitado | ✅ |
| Paleta `Ctrl+K`, búsqueda sin tildes, papelera 30 días, actividad, auditoría, exportación total, PWA | ✅ |

Detalle de lo hecho y lo pendiente: [`docs/ESTADO.md`](docs/ESTADO.md) y [`docs/PENDIENTES-LUCIANO.md`](docs/PENDIENTES-LUCIANO.md).

## Stack
Next.js 16 (App Router, Server Actions) · TypeScript estricto · PostgreSQL 17 + Drizzle · Better Auth · pg-boss · Tailwind 4 + Radix · Sigma.js · Playwright (PDF y e2e) · Vitest · Docker Compose + Caddy.

## Empezar (desarrollo)
Ver [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Resumen:
```bash
pnpm install
cp .env.example apps/web/.env.local   # completar DATABASE_URL y AUTH_SECRET
pnpm db:migrate
pnpm dev                               # http://localhost:3000/setup
```

## Documentación
- Producto y spec: `docs/00-LEEME.md` … `docs/16-preguntas-abiertas.md`, `docs/contexto/`.
- Técnica: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/API.md`](docs/API.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md), decisiones en [`docs/adr/`](docs/adr/).
- Reglas para Claude: [`CLAUDE.md`](CLAUDE.md). Cambios: [`CHANGELOG.md`](CHANGELOG.md).

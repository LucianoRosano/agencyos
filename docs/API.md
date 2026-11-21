# API

La UI no usa una API REST: llama a **Server Actions** (validadas con Zod en el servidor). Endpoints HTTP expuestos:

| Ruta | Método | Auth | Uso |
|---|---|---|---|
| `/api/auth/*` | GET/POST | — | Better Auth (login, 2FA, sesiones, recuperación) |
| `/api/health` | GET | — | Readiness (consulta la base). `?live=1`: liveness sin base |
| `/mcp` | POST/GET/DELETE | `Authorization: Bearer ag_…` | Servidor MCP (Streamable HTTP, sin estado, JSON) |
| `/api/presupuestos/[id]/pdf` | GET | sesión | PDF del presupuesto (`?version=N`) |
| `/api/exportar` | POST | sesión + contraseña | ZIP con todos los datos (JSON) + notas (Markdown) |
| `/api/auditoria.csv` | GET | sesión | Auditoría en CSV |
| `/api/calendario/ical/[token]` | GET | token revocable | Calendario iCal de solo lectura |

## MCP
Conexión desde Claude Code:
```bash
claude mcp add --transport http agencyos https://<dominio>/mcp --header "Authorization: Bearer ag_..."
```
El token se crea en Configuración → Integraciones (pide la contraseña; se muestra una sola vez).

Herramientas: `buscar`, `ver_hoy`, `listar_proyectos`, `ver_proyecto`, `listar_tareas`, `ver_cliente` (sin datos fiscales), `ver_finanzas_resumen`, `listar_abonos` (abonos mensuales, horas usadas e ingreso recurrente), `ver_capacidad` (horas libres por semana: tareas estimadas y horas de abonos contra tu capacidad), `preguntar_cerebro` (pasajes de notas, documentos, decisiones y conversaciones con su fuente), `capturar`, `crear_tarea` (la fecha acepta AAAA-MM-DD o texto: «mañana 10hs», «el viernes»), `actualizar_tarea`, `registrar_decision`, `crear_nota_proyecto`, `registrar_interaccion` (requiere `write:crm`), `eliminar_elemento` (siempre rechazado por MCP), `proponer_cambio` (crea una aprobación), `listar_repositorios` y `proponer_plan_repos`.

Alcances: `read:all`, `write:inbox`, `write:tasks`, `write:notes`, `write:decisions`, `write:crm`, `write:finance`, `propose:*`. Toda llamada queda en `audit_log` (`mcp.tool`, `mcp.denied`, `mcp.error`) y las escrituras en la actividad con el actor "Claude (MCP)".

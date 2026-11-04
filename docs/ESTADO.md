# Estado de AGENCYOS

**Actualizado:** 04/11/2026 · versión propuesta **v1.0.0-rc.1** · rama `claude/peaceful-faraday-j13pjv`

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

### Calidad
- Tests: ver la última corrida en el informe de cierre (unit + integración contra PostgreSQL real; e2e Playwright en 390 y 1440, oscuro y claro, con axe y control de scroll horizontal).
- Capturas: `docs/capturas/<proyecto>/*.png`.

## En curso
- Infraestructura (Docker, Caddy, CI/CD, backups): ver `infra/` y `docs/DEPLOYMENT.md`.

## Siguiente (fases posteriores)
Ver `docs/PENDIENTES-LUCIANO.md` → "Lo que falta del programa".

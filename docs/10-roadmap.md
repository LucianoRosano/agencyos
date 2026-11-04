# 10 · Roadmap de implementación

Cada fase se entrega **completa**: probada (ver `09-testing.md`), desplegada y documentada. No se abre la siguiente con la anterior a medias. Al cerrar cada fase, Claude Code entrega a Luciano:
- capturas en 390 y 1440 px;
- la lista de qué probar;
- `docs/PENDIENTES-LUCIANO.md` actualizado;
- el tag de versión propuesto.

```
F0 Cimientos + orden de repositorios ─► F1 MVP (v1.0) ─► F2 Producción de sitios ─► F3 Conocimiento y tiempo
                                                     ─► F4 Operación y automatización ─► F5 IA ─► F6 Equipo, clientes y venta
```

## F0 · Cimientos y organización de repositorios

**Objetivo:** base técnica sólida y GitHub ordenado antes de construir funcionalidades.

1. **Organización de GitHub** (detallada en `15-repositorios.md` §4, pasos 1 a 6): inventario de repositorios y código suelto → **plan de organización** → aprobación de Luciano → ejecución (renombres, topics, descripciones, archivos estándar, plantillas `tpl-*`, migración de código suelto con escaneo de secretos) → informe final.
2. Repositorio `prod-agencyos`: monorepo, `CLAUDE.md`, docs (este paquete), ADR 0001–0005 (monolito modular, PostgreSQL sin Supabase, Better Auth, pg-boss, VPS + Docker).
3. Tooling: pnpm, Turborepo, Biome, Vitest, Playwright, gitleaks y Dependabot.
4. `packages/ui`: tokens (oscuro y claro), tipografías Geist, componentes base (botón, input, select, tabla, tarjeta, pestañas, hoja inferior, modal, toast, skeleton, estado vacío, badge, chips, kanban base) y página interna `/dev/ui` (solo en desarrollo) para verlos.
5. Shell de la app: barra lateral, barra superior, navegación inferior del celular, paleta (estructura), PWA (manifest, service worker, iconos).
6. Auth: Better Auth + 2FA obligatorio + sesiones + recuperación.
7. `packages/db` + `core`: workspace, membership, space, tag, link, domain_event (outbox), activity, audit_log, approval; helper de scoping; permisos; errores.
8. Worker con pg-boss + dispatcher de outbox + job de prueba.
9. CI completa. **Infra:** `docker-compose`, Caddyfile, scripts de deploy, rollback, backup y verificación de restauración, hardening del VPS.

**Decisión de Luciano:** comprar el VPS KVM 2 y el dominio al cerrar la F0, para tener staging real desde la F1 (recomendado). Si prefiere esperar, la F1 se valida en local y el deploy se hace al cerrar la F1.

**Criterio de salida:**
- GitHub ordenado según el estándar (100 % de repositorios activos en verde o con una excepción documentada).
- Entra con 2FA desde el celular y la PC (en staging o en local).
- La CI está en verde y un push a `main` despliega a staging (si ya hay VPS).

## F1 · MVP (v1.0): definido en `11-mvp.md`

Hitos internos, en orden:
- **M1 · Núcleo productivo:** Espacios, Bandeja, Proyectos (estados, etapas, siguiente acción, bloqueos, decisiones, changelog, entregas), Tareas (recurrencia, subtareas, kanban, deslizar en el celular), plantillas + asistente de arranque, Modo foco, **Hoy** (bloques que ya tienen datos), paleta `Ctrl+K` con búsqueda, papelera/archivo, notificaciones in-app y push.
- **M2 · Comercial:** CRM (clientes, contactos, interacciones, oportunidades, pipeline) + Servicios + **Presupuestos** (versiones, descuentos, ARS/USD, plan de cobro, PDF, estados, aceptación manual → proyecto + cobros).
- **M3 · Dinero:** Finanzas básicas (cuentas, movimientos, categorías, suscripciones, por cobrar, por pagar), "Ponerse al día" completo, pestaña **Negocio** con KPIs reales.
- **M4 · Orden y conexión:** módulo **Repositorios** (GitHub App, sync, checks, planes con aprobación, webhooks), **servidor MCP** con tokens de alcance limitado, Configuración (perfil, workspace, integraciones, módulos, datos, actividad, estado del sistema), **carga de datos reales** de Luciano (script revisado por él), **producción** en el VPS con dominio y tag `v1.0.0`.

**Criterio de salida:** los criterios de aceptación de `11-mvp.md` están cumplidos y Luciano usa AGENCYOS a diario durante 7 días seguidos sin volver a sus `.md` de pendientes.

## F2 · Producción de sitios (v1.1)
- **Website Factory** completo (briefing, requerimientos, blueprint, contenidos, recursos, revisiones, dominio/hosting/certificados, checklist de publicación de 17 áreas, documentación técnica).
- **Biblioteca de recursos** (carpetas, versiones, previsualizaciones, kits de marca, plantillas reutilizables).
- **Activos técnicos:** dominios, hosting, certificados, productos propios e instalaciones.
- Presupuestos: **envío por email (Brevo) + enlace público** con aceptación y registro.

**Salida:** el próximo sitio de cliente (por ejemplo, la plataforma mayorista de Bellezatecnia) se gestiona de punta a punta en Website Factory.

## F3 · Conocimiento y tiempo (v1.2)
- **Notas** (editor CodeMirror, `[[ ]]`, backlinks, frontmatter, plantillas, nota diaria, versiones).
- **Cerebro** (2D WebGL, grafo local, filtros, línea de tiempo, panel lateral, versión celular, lista alternativa; 3D opcional al final de la fase).
- **Importador de Obsidian** con verificación (conteos) y exportación compatible. Obsidian se retira **solo** con la verificación aprobada por Luciano.
- **Calendario** unificado + iCal; **Facultad**; **revisión semanal**; **Finanzas completas** (reportes, rentabilidad, constancias, exportaciones).

**Salida:** Luciano deja de abrir Obsidian.

## F4 · Operación y automatización (v1.3)
- **SEO Auditor** con datos reales (crawler, robots/sitemap, enlaces rotos, PSI, CrUX, informe PDF, comparación, programación).
- **Centro de automatizaciones** configurable (reglas, plantillas, webhooks, registro, modo prueba).
- **Monitoreo de sitios** (uptime, SSL, dominio, versiones vía WordPress REST).
- Passkeys; importación de chats de WhatsApp al CRM; etapas del pipeline editables.

## F5 · IA (v2.0)
- **AI Command Center**: los 9 agentes de `14-agentes-ia.md` con trazabilidad, presupuestos, aprobaciones y evals.
- Google Search Console (OAuth).
- Revisión semanal asistida.
- Generación de blueprint y contenidos (Website Factory) y Code Reviewer sobre PRs.

## F6 · Equipo, clientes y venta (v3.0)
- Colaboradores (rol `member`), **portal de cliente**, multi-workspace visible, planes y módulos por workspace, aviso de privacidad y términos, onboarding de workspace nuevo.
- Evaluación de modelo comercial (si Luciano decide vender).

## Dependencias críticas
- F2 depende del almacenamiento de archivos (se crea en la F2 sobre `StorageAdapter`).
- El Cerebro (F3) depende de `link` (F0) y de las entidades de F1–F2.
- Los agentes (F5) dependen de MCP/herramientas (F1), aprobaciones (F0) y eventos (F0).
- El SEO Auditor (F4) depende de Sitios (F2) para vincular auditorías, aunque puede auditar URLs sueltas.

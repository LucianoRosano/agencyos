# 14 · AI Command Center: arquitectura de agentes

## 1. Principios
1. **Agentes reales, no personajes.** Cada agente es una configuración + un conjunto de **herramientas tipadas** que llaman a los mismos `service.ts` que usa la UI. Sin herramientas no hay agente.
2. **Trazabilidad total.** Cada ejecución (`agent_run`) registra entrada, cada paso (`agent_step`: llamada al modelo, herramienta, aprobación), tokens, costo, modelo usado, duración y error.
3. **Humano en el bucle.** Las herramientas que escriben fuera de lo trivial **no ejecutan**: crean una `approval` con el diff exacto. Luciano aprueba, edita o rechaza.
4. **Sin depender de un proveedor.** **AI SDK** con proveedores intercambiables por agente (Anthropic por defecto; OpenAI, Google y Ollama/compatibles con OpenAI opcionales), con **modelo de respaldo**.
5. **Costo bajo control.** Presupuesto por ejecución y mensual, por agente y por proveedor. Al excederlo, la ejecución corta con estado `budget_exceeded` y avisa.
6. **Datos externos = datos no confiables** (anti inyección de prompts): ver `08-seguridad.md` §7.

## 2. Dos caminos de uso (decisión clave de costo)

| Camino | Cómo funciona | Costo | Fase |
|---|---|---|---|
| **A · MCP (Claude externo)** | Claude Code o claude.ai, con la suscripción de Luciano, se conecta al **servidor MCP de AGENCYOS** y usa sus herramientas. AGENCYOS no llama a ningún modelo | **US$ 0 extra** | **MVP** |
| **B · Agentes internos** | AGENCYOS ejecuta agentes en el worker con API keys propias (on demand, programados o desde automatizaciones) | Pago por uso, con tope | **F5** |

Los dos caminos comparten el **mismo registro de herramientas** (`packages/ai/tools/registry.ts`) y las mismas políticas de permisos y aprobación. Las herramientas MCP **son** las herramientas de los agentes.

## 3. Servidor MCP (MVP)
- **Transporte:** Streamable HTTP en `/mcp`, autenticado con **token de API** (Better Auth `apiKey`), con alcances y vencimiento. Se crea en Configuración → Integraciones → MCP (requiere reautenticación con 2FA).
- **Alcances:** `read:all`, `write:inbox`, `write:tasks`, `write:notes`, `write:decisions`, `propose:*` (crear aprobaciones), `write:crm` (opcional), `write:finance` (opcional, desactivado por defecto).
- **Herramientas del MVP:**

| Herramienta | Tipo | Descripción |
|---|---|---|
| `buscar` | lectura | Búsqueda global con filtros por tipo y espacio |
| `ver_hoy` | lectura | Foco, Ponerse al día y próximos 7 días |
| `ver_proyecto` | lectura | Proyecto completo (etapas, tareas, decisiones, bloqueos, repositorios) |
| `listar_proyectos` | lectura | Filtros por estado, cliente y espacio |
| `ver_cliente` | lectura | Ficha 360° (sin datos fiscales) |
| `ver_finanzas_resumen` | lectura | Resumen del mes y vencimientos |
| `listar_repositorios` | lectura | Con puntaje y checks |
| `capturar` | escritura simple | Ítem en la Bandeja |
| `crear_tarea` / `actualizar_tarea` | escritura simple | En un proyecto o espacio |
| `registrar_decision` | escritura simple | En un proyecto |
| `crear_nota_proyecto` | escritura simple | Nota Markdown vinculada |
| `registrar_interaccion` | escritura (alcance `write:crm`) | Interacción en el CRM |
| `proponer_cambio` | propuesta | Cualquier cambio fuera de los alcances → crea una `approval` |
| `proponer_plan_repos` | propuesta | Plan de organización de repositorios |

- Cada llamada queda en `agent_run` (trigger `mcp`) y en la actividad, con el actor "Claude (MCP)".

## 4. Orquestación de agentes internos (F5)
- **Ejecución:** job de pg-boss en el worker. Bucle de tool calling con el AI SDK, **máximo de pasos** (por defecto 12), **timeout** (por defecto 120 s), cancelación desde la UI.
- **Errores:**

| Tipo | Manejo |
|---|---|
| Transitorio del proveedor (429/5xx/timeout) | Reintento exponencial (3 intentos) y después **modelo de respaldo** |
| Error de herramienta (validación, permiso) | Se devuelve al modelo como resultado de la herramienta para que corrija; 2 errores seguidos de la misma herramienta cortan la ejecución |
| Presupuesto excedido | Corte inmediato, estado `budget_exceeded`, notificación |
| Salida inválida (esquema) | Reintento con el error de validación; si persiste, `failed` con la salida cruda guardada |
| Circuit breaker por proveedor | 5 fallos en 10 minutos → proveedor pausado 15 minutos |

- **Salidas:** siempre a entidades reales (nota, tareas, aprobación, comentario, informe PDF) + `output_md`. Nada queda "solo en el chat".
- **Disparadores:** manual (botón "Pedir a…" en la ficha correspondiente o en la consola del Command Center), programado (cron), automatización (regla) o MCP.
- **Consola del Command Center:**
  - lista de agentes con estado, costo del mes y últimas ejecuciones;
  - detalle de una ejecución como **línea de tiempo de pasos** (entradas y salidas expandibles, tokens, latencia, errores);
  - aprobaciones pendientes;
  - configuración por agente (modelo, respaldo, presupuesto, herramientas, nivel de permiso).
- **Evals:** cada agente tiene casos fijos en `packages/ai/agents/<key>/evals.json` (entrada → expectativas: herramientas llamadas, formato, no-acciones prohibidas, resistencia a inyección). Corren en la CI con modelo simulado y, manualmente, con modelo real antes de cambiar prompt o modelo.

## 5. Catálogo de agentes

Nivel de permiso:
- **read**: solo lee.
- **propose**: crea borradores y aprobaciones.
- **execute_with_approval**: ejecuta tras la aprobación de Luciano.

### 5.1 Business Agent
- **Misión:** asistencia empresarial: estado del negocio, oportunidades, riesgos y prioridades.
- **Herramientas:** `ver_finanzas_resumen`, `kpis_negocio`, `pipeline_crm`, `listar_proyectos`, `presupuestos_pendientes`, `crear_nota`, `proponer_tareas`.
- **Permiso:** propose.
- **Salidas:** "Informe de negocio semanal" (nota) con métricas citadas desde las herramientas (sin números inventados: **toda cifra viene de una herramienta**) y tareas propuestas.
- **Disparadores:** lunes 8:30 (opcional) o manual.

### 5.2 Project Manager Agent
- **Misión:** seguimiento de proyectos: frenados, sin siguiente acción, vencidos y riesgos de plazo.
- **Herramientas:** `listar_proyectos`, `ver_proyecto`, `listar_tareas`, `proponer_tareas`, `proponer_siguiente_accion`, `crear_nota`, `borrador_revision_semanal`.
- **Permiso:** propose (las tareas que crea quedan como sugeridas hasta que se aceptan).
- **Salidas:** borrador de revisión semanal; propuestas de siguiente acción por proyecto.

### 5.3 Web Architect Agent
- **Misión:** proponer la arquitectura de un sitio desde el briefing.
- **Herramientas:** `ver_sitio_briefing`, `ver_requerimientos`, `plantillas_estructura`, `proponer_blueprint` (JSON validado contra el esquema de `site_blueprint`), `proponer_requerimientos`, `crear_nota`.
- **Permiso:** propose (el blueprint queda como versión **borrador**).
- **Salidas:** blueprint v(n+1) borrador + justificación (páginas, secciones, slots y mapa de navegación) + recomendaciones de stack y plugins.

### 5.4 Content Agent
- **Misión:** borradores de textos por slot, títulos y meta descriptions, en el tono del cliente.
- **Herramientas:** `ver_blueprint`, `ver_slot`, `ver_kit_marca`, `ver_briefing`, `escribir_borrador_slot` (estado `draft`, nunca `approved`), `crear_nota`.
- **Permiso:** propose.
- **Reglas:** no inventa datos del cliente (precios, direcciones, garantías): si faltan, deja un marcador `[[FALTA: …]]` y crea una pregunta para el cliente.

### 5.5 SEO Agent
- **Misión:** interpretar auditorías **reales** y priorizar acciones.
- **Herramientas:** `ver_auditoria`, `comparar_auditorias`, `ver_metricas_campo`, `ver_lighthouse`, `proponer_tareas`, `crear_informe_seo` (PDF).
- **Permiso:** propose.
- **Reglas:** cada recomendación cita el problema y las URLs afectadas de la auditoría; si no hay datos de campo (CrUX), lo dice.

### 5.6 QA Agent
- **Misión:** control de calidad de sitios en staging o producción.
- **Herramientas** (ejecutadas en el worker, sobre el entorno de un sitio registrado):
  - `capturas_responsive` (Playwright 390/768/1440);
  - `errores_consola`;
  - `chequeo_enlaces`;
  - `axe_accesibilidad`;
  - `lighthouse_psi`;
  - `verificar_formularios` (solo detecta y valida campos, **no envía**);
  - `checklist_publicacion`;
  - `crear_items_revision`.
- **Permiso:** propose (crea ítems de revisión).
- **Salidas:** informe QA con capturas y una ronda de revisión sugerida.

### 5.7 Code Reviewer Agent
- **Misión:** revisar PRs de los repositorios de Luciano.
- **Herramientas:** `ver_pr` (diff, archivos, checks de CI), `leer_archivo_repo`, `resultado_gitleaks`, `estandar_repo`, `comentar_pr` (**con aprobación**, o automático solo si el PR es de Claude y lo permite la configuración).
- **Permiso:** execute_with_approval.
- **Salidas:** revisión estructurada (seguridad, bugs, convenciones, tests faltantes) con severidad por comentario.

### 5.8 Research Agent
- **Misión:** investigar (mercado, competencia, herramientas, normativa) con fuentes.
- **Herramientas:** `buscar_web` (herramienta de búsqueda del proveedor de IA o API de búsqueda configurable), `leer_url` (vía el fetcher anti-SSRF), `crear_nota_investigacion`.
- **Permiso:** propose.
- **Reglas:** toda afirmación lleva su fuente (URL y fecha de consulta); distingue hechos, análisis y opinión; no copia textos extensos.

### 5.9 Repo Agent (parámetro prioritario de Luciano)
- **Misión:** mantener ordenados los repositorios según `15-repositorios.md`.
- **Herramientas:** `listar_repositorios`, `checks_repo`, `leer_archivo_repo`, `proponer_plan_repos` (acciones: renombrar, topics, descripción, README/CLAUDE.md/.gitignore/CI estándar mediante PR, archivar, activar alertas de seguridad), `redactar_readme` (abre un PR, no hace push a `main`).
- **Permiso:** execute_with_approval (vía `repo_plan`).
- **Disparadores:** semanal (lunes) + webhook de repositorio nuevo.
- **Salidas:** plan de organización con diff legible por repositorio; tras aprobarlo, la ejecución queda registrada en `repo_plan_action` y en `audit_log`.

## 6. Router de modelos
- Configuración por agente: `provider` + `model_id` + `fallback`. **Los IDs de modelo se leen de la configuración, nunca se escriben en el código**: Claude Code debe consultar los modelos vigentes del proveedor al configurar.
- Sugerencia inicial (ajustable):
  - modelo de gama alta de Anthropic para Web Architect, Code Reviewer y Research;
  - modelo de gama media o rápido para PM, Content, SEO, QA, Business y Repo.
- Si Luciano dispone de un equipo propio: Ollama (compatible con OpenAI) para tareas baratas.

## 7. Prompts
- `packages/ai/agents/<key>/prompt.md`, versionados (`system_prompt_version`).
- Estructura: rol y misión · herramientas disponibles y cuándo usarlas · reglas (no inventar cifras, citar fuentes, español rioplatense, formato de salida) · límites de permiso · manejo de contenido no confiable · ejemplos breves.
- Cualquier cambio de prompt corre las evals antes del merge.

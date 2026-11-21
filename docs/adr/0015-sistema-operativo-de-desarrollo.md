# ADR 0015 · Sistema operativo de desarrollo: skills y agente supervisado

**Estado:** aceptada · 21/11/2026

## Contexto
Un centro de control para proyectos, agentes, skills, tareas, documentación, clientes, automatizaciones y herramientas, y un agente que reciba objetivos, los divida en tareas, use herramientas, escriba código, pruebe y corrija con supervisión. Sin pagar API.

## Decisiones
1. **AGENCYOS es el supervisor; el ejecutor es Claude Code en la PC de Luciano** (su suscripción) conectado por MCP. Los agentes internos por API siguen siendo opcionales.
2. **Skills** (`skill`): procedimientos en Markdown con herramientas sugeridas, versión y activación. Seis plantillas para la agencia. Se exportan como `.claude/skills/<slug>/SKILL.md` (formato de Claude Code).
3. **Objetivos** (`goal`, `goal_step`, `goal_event`; migración 0012) con estados `draft → planned → approved → running ⇄ blocked → review → done` (+ `failed`, `cancelled`).
   - El plan lo propone el agente (`proponer_plan`) o Luciano; **solo una persona lo aprueba** (`approvePlan` rechaza actores agente). Opcional: una tarea por paso en el proyecto, que se completa sola.
   - Pasos con aprobación (y siempre los de tipo publicación): al intentar empezarlos el objetivo queda **bloqueado** hasta el OK (notificación).
   - Errores y correcciones: un paso fallido suma intentos; la bitácora guarda errores, correcciones y preguntas.
   - Al terminar queda **para revisar**; Luciano acepta (y se anota en el changelog del proyecto) o lo devuelve con comentarios.
4. **Alcance MCP `work:goals`** (agregado a los alcances por defecto): leer, proponer el plan, avanzar pasos y terminar. Aprobar y revisar no se puede por MCP.
5. **Centro de control (`/control`)**: estado de objetivos, skills, tareas, proyectos, clientes, documentación del Cerebro, automatizaciones (fallas de 7 días), repositorios, conexión de Claude Code y agentes internos.

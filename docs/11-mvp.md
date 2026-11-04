# 11 · Definición del MVP (v1.0)

## 1. Qué problema resuelve el MVP
Con el MVP, Luciano **organiza y ejecuta** todos sus proyectos (de clientes y personales) desde un solo lugar:
- sabe cada día qué hacer y qué se le está pasando;
- vende con presupuestos profesionales;
- controla lo básico del dinero;
- tiene su GitHub ordenado y vigilado;
- puede operar todo desde Claude vía MCP.

## 2. Incluido (todo funcional, sin simulaciones)

| Área | Incluye |
|---|---|
| Núcleo | Login + 2FA obligatorio, sesiones, recuperación · Espacios (Agencia, Personal, Facultad y propios) · Bandeja + procesar · Paleta `Ctrl+K` (buscar, crear, navegar) · Enlaces y "Conectado con" · Etiquetas · Archivo y papelera de 30 días con Deshacer · Actividad y auditoría · Notificaciones in-app + push · Comentarios internos · Vistas guardadas · PWA instalable |
| Hoy | Foco (3 tareas, con sugerencia) · Ponerse al día (tareas, pagos, cobros, presupuestos sin respuesta y vencidos, suscripciones, proyectos sin siguiente acción o frenados, próximas acciones del CRM, repositorios fuera de estándar, Bandeja, aprobaciones) · Próximos 7 días · Dinero del mes · Proyectos activos |
| Negocio | KPIs reales: clientes activos, proyectos por estado, tareas pendientes/vencidas, presupuestos enviados/aceptados/tasa, ingresos/gastos/resultado, por cobrar/por pagar, pipeline ponderado, vencimientos y actividad reciente |
| CRM | Clientes (con titulares fiscales ocultos), contactos, interacciones, oportunidades con pipeline kanban/tabla y próxima acción, ficha 360° |
| Proyectos | Estados, etapas, siguiente acción obligatoria, bloqueos, decisiones, changelog, entregas · 8 plantillas + asistente de arranque · guardar como plantilla |
| Tareas | Prioridades, fechas, recurrencia, subtareas, checklist, kanban/lista, deslizar en el celular · Modo foco |
| Presupuestos | Catálogo de servicios · plantillas · versiones con comparación · descuentos por ítem y globales · ARS/USD · plan de cobro · estados (con vencimiento automático) · **PDF** · aceptación manual → proyecto + cobros |
| Finanzas (básico) | Libros Agencia y Personal · cuentas · movimientos · categorías · suscripciones con aviso · por cobrar · por pagar · resumen del mes |
| Repositorios | GitHub App · sync · vínculos con cliente/proyecto/producto · checks del estándar y puntaje · **planes de organización con aprobación** · eventos (push, PR, release) en actividad |
| IA | **Servidor MCP** con tokens de alcance limitado (lectura general; escritura de Bandeja, tareas y notas de proyecto; el resto como aprobación) |
| Configuración | Perfil, seguridad (2FA, sesiones), workspace, monedas, integraciones (GitHub, Brevo opcional, tokens MCP), módulos, datos (exportación total JSON+MD), actividad, estado del sistema |
| Operación | Producción en el VPS con dominio, staging, CI/CD, backups cifrados con restauración verificada, monitoreo básico |

## 3. Excluido del MVP (con su fase)
- Website Factory, Biblioteca, Activos técnicos, envío por email y enlace público de presupuestos → **F2**
- Notas completas, Cerebro, importación de Obsidian, Calendario, Facultad, Finanzas completas, revisión semanal → **F3**
  - En el MVP, cada proyecto tiene un campo de notas en Markdown y las notas vinculadas que se creen por MCP. Obsidian **sigue en uso** hasta la F3.
- SEO Auditor, automatizaciones configurables, monitoreo de sitios, passkeys → **F4**
- Agentes internos con API → **F5**
- Colaboradores, portal de cliente, multi-workspace → **F6**

## 4. Criterios de aceptación del MVP
1. Todos los flujos e2e de `09-testing.md` §3 están en verde en mobile-390 y desktop-1440, en oscuro y claro.
2. Ninguna pantalla muestra datos de ejemplo; todos los KPIs se calculan con datos reales o muestran un estado vacío.
3. Ningún botón visible deja de hacer algo real.
4. LCP de "Hoy" < 1,5 s en un celular medio (Lighthouse CI, perfil móvil) y JS inicial por ruta dentro del presupuesto.
5. axe sin violaciones serias o críticas en las pantallas del MVP.
6. Los datos reales de Luciano (clientes, proyectos, repositorios) están cargados y revisados por él.
7. GitHub: 100 % de los repositorios activos cumplen el estándar o tienen una excepción documentada.
8. Backup diario funcionando y **una restauración real verificada**.
9. Claude (Claude Code o claude.ai) puede, vía MCP: leer "Hoy", crear una tarea en un proyecto y registrar una decisión. Una acción no permitida queda rechazada y auditada.
10. Luciano lo usa a diario durante 7 días seguidos.

# 01 · Visión del producto

## 1. Problema

Luciano lleva adelante, solo, una agencia digital que hace tiendas WooCommerce, paneles de gestión a medida, facturación automática con ARCA, SEO y automatizaciones. Al mismo tiempo estudia en la UNGS y tiene proyectos personales. Hoy la información está repartida en:
- la memoria de Claude y varios Proyectos de claude.ai;
- archivos `.md` de pendientes;
- Obsidian;
- carpetas locales y el código en distintos lugares;
- planillas;
- su cabeza.

Consecuencias:
- Cuesta **arrancar** proyectos y sostener el foco.
- Las cosas **se pasan**: vencimientos, pendientes que esperan a terceros, cobros.
- Cada cliente nuevo **multiplica el trabajo manual**.
- No hay una visión de negocio: qué se cobró, qué cuesta, qué rinde.
- El código está **desordenado**: repositorios sin convención y código fuera de control de versiones.

## 2. Visión

> **AGENCYOS es el centro de mando donde Luciano dirige su agencia, sus proyectos y su conocimiento, con la IA como equipo de trabajo, de forma que pueda atender a muchos más clientes sin multiplicar su tiempo.**

## 3. Para quién

| Usuario | Hoy | Futuro |
|---|---|---|
| **Luciano** (dueño) | Usuario único, en celular y PC por igual | Sigue siendo el dueño |
| **Claude** (Claude Code, claude.ai y los agentes internos) | Opera AGENCYOS vía MCP con permisos | Agentes internos con presupuesto propio |
| **Colaboradores** | — | Acceso a los proyectos que se les asignen |
| **Clientes** | — | Portal de solo lectura para ver su proyecto, aprobar presupuestos y entregas |
| **Otras agencias** | — | Posible venta como SaaS (multi-workspace) |

## 4. Propuesta de valor

1. **Un solo lugar**: CRM, proyectos, presupuestos, dinero, sitios, repositorios, SEO, recursos, notas y facultad.
2. **"Hoy" responde qué hacer y qué se está pasando**, cruzando todos los módulos.
3. **Producción de sitios estandarizada** (Website Factory): briefing → estructura → contenido → revisión → publicación → documentación, siempre igual y cada vez más automatizada.
4. **IA real con trazabilidad**: agentes con responsabilidades, herramientas y permisos acotados, registro completo y aprobación humana para escribir.
5. **Orden técnico permanente**: repositorios, sitios, dominios y versiones de productos propios inventariados y vigilados.
6. **Los datos son suyos**: autoalojado, exportable y sin dependencia innecesaria de un único proveedor.

## 5. Principios de producto (innegociables)

1. **Nada decorativo**: cada botón hace algo real. Si una función no está lista, no aparece (no hay botones "próximamente").
2. **Nada simulado**: las métricas salen de datos reales. Sin datos, se muestra un estado vacío útil.
3. **Humano en el bucle** para todo lo irreversible o lo que sale hacia afuera (mails a clientes, cambios en GitHub o en sitios, borrados).
4. **Celular y desktop por igual**, con rendimiento extremo.
5. **Modular**: núcleo + módulos activables; agregar un módulo no exige rehacer nada.
6. **Mantenible por IA**: convenciones fijas, documentación viva y tests.
7. **Costo bajo**: infraestructura de hasta US$ 15/mes; preferencia por herramientas gratuitas u open source.

## 6. No objetivos (por ahora)

- Emitir facturas fiscales (se reevalúa cuando Luciano se inscriba).
- Ser un page builder visual de sitios (Website Factory gestiona el proceso; la construcción sigue en WordPress o en código).
- Chat en tiempo real o un helpdesk completo.
- App nativa (se usa una **PWA** instalable).
- Contabilidad formal.

## 7. Métricas de éxito

| Métrica | Meta a 3 meses del MVP |
|---|---|
| Proyectos activos con siguiente acción definida | 100 % |
| Ítems de "Ponerse al día" resueltos en menos de 7 días | ≥ 80 % |
| Tiempo para arrancar un proyecto nuevo con plantilla | < 2 minutos |
| Repositorios que cumplen el estándar (`15-repositorios.md`) | 100 % |
| Vencimientos (dominios, hosting, suscripciones, certificados) que se pasaron sin aviso | 0 |
| Presupuestos generados desde AGENCYOS | 100 % de los nuevos |
| Abre Obsidian | Nunca, una vez terminada la Fase 3 |
| Tiempo de carga de "Hoy" en un celular medio | < 1,5 s (LCP) |

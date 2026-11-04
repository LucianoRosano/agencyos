# 12 · Funcionalidades posteriores (backlog priorizado)

Ordenado por fase y, dentro de cada fase, por valor. Las fases F2–F6 ya están descriptas en `10-roadmap.md`. Acá se listan **además** ideas para después de la F6 o mejoras dentro de cada fase, para que no se pierdan.

## Dentro de las fases (detalle adicional)

**F2**
- Plantillas de estructura de sitio por rubro (librería, editorial, belleza, nutrición).
- Exportar el briefing como formulario para que el cliente lo complete por enlace.
- Comparación visual de revisiones (antes/después con capturas de Playwright).

**F3**
- Vista "Mapa del día" en el Cerebro: lo que se tocó hoy.
- Clips web: guardar una URL como nota con extracto y fuente.
- Tarjetas de estudio (flashcards) generadas desde apuntes de la Facultad.

**F4**
- Auditoría de accesibilidad (axe sobre las páginas del sitio) dentro del SEO Auditor.
- Alertas de vencimiento de dominios leyendo WHOIS/RDAP automáticamente.
- Automatización "pedido completado en WooCommerce → registrar ingreso" (vía webhook del sitio).

**F5**
- Agente de **propuestas comerciales**: arma el borrador del presupuesto desde una conversación del CRM.
- Resumen semanal por cliente (qué se hizo, qué sigue) listo para enviar (con aprobación).
- Modelos locales (Ollama) para tareas baratas si Luciano tiene equipo propio.

**F6**
- Informe mensual automático para clientes en mantenimiento (SEO, uptime, cambios hechos).
- Firma de aceptación de presupuestos con validación por email.

## Después de la F6
1. **Facturación propia** (cuando Luciano se inscriba): reutilizar el motor de LibreríaOS Fiscal (WSFE) para emitir sus facturas desde Finanzas.
2. **Tipo de cambio automático** (dólar oficial/MEP) desde una fuente pública confiable, siempre registrado con su fuente y fecha.
3. **Generación de sitios con IA**: exportador del blueprint a WordPress (páginas y bloques) o a Next.js estático.
4. **Integración con Gmail/Google Calendar** (lectura) para interacciones y agenda.
5. **App de escritorio** (empaquetar la PWA) con atajos globales de captura.
6. **Marketplace interno de plantillas** (proyectos, presupuestos, automatizaciones) exportables e importables entre workspaces.
7. **Modo SaaS**: alta autoservicio, planes, cobro de suscripciones (Mercado Pago/Stripe) y límites por plan.
8. **Gestión de stock de productos propios** como licencias (si vende LibreríaOS a otros comercios).
9. **Panel de tiempo**: análisis de horas vs. rentabilidad por tipo de servicio.
10. **Base de conocimiento de procedimientos** (runbooks por cliente) consultable por los agentes con búsqueda semántica (pgvector).

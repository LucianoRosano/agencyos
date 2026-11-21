/**
 * Rutas principales de la app autenticada (todas las del menú + las pantallas de sistema).
 * Las usan el presupuesto de JS (18-rendimiento) y el recorrido de accesibilidad (19-accesibilidad).
 */
export const MENU_ROUTES = [
  "/hoy",
  "/bandeja",
  "/negocio",
  "/crm/clientes",
  "/crm/contactos",
  "/crm/oportunidades",
  "/proyectos",
  "/tareas",
  "/presupuestos",
  "/presupuestos/servicios",
  "/finanzas",
  "/finanzas/movimientos",
  "/finanzas/reportes",
  "/sitios",
  "/activos",
  "/seo",
  "/repositorios",
  "/biblioteca",
  "/notas",
  "/cerebro",
  "/calendario",
  "/facultad",
  "/revision-semanal",
  "/automatizaciones",
  "/ia",
] as const;

export const SYSTEM_ROUTES = [
  "/configuracion",
  "/configuracion/seguridad",
  "/configuracion/app",
  "/local",
  "/notificaciones",
  "/papelera",
  "/aprobaciones",
  "/espacios",
  "/foco",
] as const;

/** Pantallas de alta y editores (las más pesadas en JS: formularios, editor de notas, constructor de reglas). */
export const EDITOR_ROUTES = [
  "/proyectos/nuevo",
  "/crm/clientes/nuevo",
  "/presupuestos/nuevo",
  "/sitios/nuevo",
  "/notas/nueva",
  "/automatizaciones/nueva",
] as const;

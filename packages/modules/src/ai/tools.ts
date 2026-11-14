/**
 * Herramientas que los agentes internos pueden usar. Son las MISMAS del servidor MCP (mcp/server.ts):
 * el runner las invoca a través de un cliente MCP en memoria, así que validación, permisos y auditoría
 * son idénticos a los de Claude por MCP. Acá solo se declara qué alcance (scope) necesita cada una.
 *
 * `eliminar_elemento` queda fuera a propósito: un agente nunca borra; lo pide con proponer_cambio.
 */
export type ToolKind = "read" | "write" | "propose";

export const AGENT_TOOLS: Record<string, { label: string; scope: string; kind: ToolKind }> = {
  buscar: { label: "Buscar en AGENCYOS", scope: "read:all", kind: "read" },
  ver_hoy: { label: "Ver Hoy", scope: "read:all", kind: "read" },
  listar_proyectos: { label: "Listar proyectos", scope: "read:all", kind: "read" },
  ver_proyecto: { label: "Ver proyecto", scope: "read:all", kind: "read" },
  listar_tareas: { label: "Listar tareas", scope: "read:all", kind: "read" },
  ver_cliente: { label: "Ver cliente (sin datos fiscales)", scope: "read:all", kind: "read" },
  ver_finanzas_resumen: { label: "Resumen de finanzas", scope: "read:all", kind: "read" },
  capturar: { label: "Capturar en la Bandeja", scope: "write:inbox", kind: "write" },
  crear_tarea: { label: "Crear tareas", scope: "write:tasks", kind: "write" },
  actualizar_tarea: { label: "Actualizar tareas", scope: "write:tasks", kind: "write" },
  registrar_decision: { label: "Registrar decisiones", scope: "write:decisions", kind: "write" },
  crear_nota_proyecto: { label: "Crear notas de proyecto", scope: "write:notes", kind: "write" },
  registrar_interaccion: { label: "Registrar interacciones (CRM)", scope: "write:crm", kind: "write" },
  proponer_cambio: { label: "Proponer cambios (aprobación)", scope: "propose:*", kind: "propose" },
};

export const isAgentTool = (name: string) => name in AGENT_TOOLS;

/** Alcances del contexto del agente: la unión de los que piden sus herramientas habilitadas. */
export function scopesForTools(tools: string[]): string[] {
  return [...new Set(tools.filter(isAgentTool).map((t) => AGENT_TOOLS[t]?.scope as string))].sort();
}

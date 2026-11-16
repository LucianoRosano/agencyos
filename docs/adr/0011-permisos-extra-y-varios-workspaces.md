# ADR 0011 · Permisos extra del colaborador y varios espacios de trabajo

**Estado:** aceptada · 16/11/2026

## Permisos extra del colaborador
- Interruptores en Configuración → Usuarios: «Ver finanzas del proyecto», «Ver CRM del cliente de sus proyectos» y «Registrar horas con tarifa». Sin esquema nuevo: se guardan en `user_preference` (`grants:<workspaceId>` → `{ grants: [...] }`); cambiar el rol del usuario los descarta.
- Se cargan en `ctx.grants` (requireCtx y tokens MCP) y se aplican en **un solo lugar**: `can()` de `core/permissions`, con recursos propios (`project_finance`, `project_crm`, `time_rate`). Nunca habilitan el módulo completo (`finance`, `crm`): las lecturas viven en `modules/projects/related` (pestañas Finanzas y Cliente de la ficha del proyecto) y además exigen que el proyecto sea uno asignado.
- Notas y archivos de sus proyectos no son un permiso extra: el colaborador los ve siempre desde la ficha (pestañas Notas y Archivos). Notas: las que pertenecen al proyecto o están vinculadas por `link` (incluye menciones `#Proyecto`); puede editar el cuerpo, no renombrarlas ni moverlas. Archivos: filtro central `fileScope` (`modules/shared/db`) — vinculados al proyecto o a su sitio, o adjuntos al proyecto, sus tareas, su sitio o los ítems de revisión; lo usa también la descarga firmada.

## Varios espacios de trabajo
- El dueño crea workspaces nuevos desde el selector de la barra lateral; cada uno se siembra con `seedStructure` y es un inquilino aislado.
- El workspace activo es una cookie `ag-ws` (HttpOnly, SameSite=Lax). `getMembership`/`requireCtx` la usan solo como preferencia: se valida siempre contra las memberships **activas** del usuario; una cookie vieja o manipulada cae al primer acceso activo. Al cambiar se reinicia el filtro de espacio (`ag-space`).

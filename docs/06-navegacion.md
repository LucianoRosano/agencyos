# 06 · Mapa de navegación

## 1. Barra lateral (desktop)

```
[Isotipo] AGENCYOS
[ Buscar o crear…            Ctrl K ]

  Hoy                                 /hoy            (inicio)
  Bandeja                    (n)      /bandeja

AGENCIA
  Negocio                             /negocio
  CRM                                 /crm/clientes   (sub: Clientes · Contactos · Oportunidades)
  Proyectos                           /proyectos      (sub: Proyectos · Tareas · Plantillas)
  Presupuestos                        /presupuestos   (sub: Presupuestos · Servicios)
  Finanzas                            /finanzas       (sub: Resumen · Movimientos · Por cobrar · Por pagar · Suscripciones · Cuentas · Reportes)
  Sitios                     [F2]     /sitios         (Website Factory)
  SEO                        [F4]     /seo
  Repositorios                        /repositorios
  Biblioteca                 [F2]     /biblioteca

CONOCIMIENTO
  Notas                      [F3]     /notas
  Cerebro                    [F3]     /cerebro
  Calendario                 [F3]     /calendario
  Facultad                   [F3]     /facultad

SISTEMA
  Automatizaciones           [F4]     /automatizaciones
  IA                         [MCP MVP · agentes F5]   /ia
  Configuración                       /configuracion

ESPACIOS
  ● Agencia   ● Personal   ● Facultad   + nuevo

[Avatar] Luciano · Dueño        [tema ◐]
```

- Los módulos no habilitados **no aparecen** (no se muestran deshabilitados ni con "próximamente").
- La barra lateral se colapsa a iconos (`[`); el estado persiste.
- Las secciones con sub-navegación muestran **pestañas** en el encabezado de la página, no submenús anidados.

## 2. Barra superior
Migas de pan · selector de espacio ("Todos los espacios") · botón **Modo foco** · botón **Capturar** (`C`) · campana de notificaciones · ayuda de atajos (`?`).

## 3. Celular
- **Navegación inferior** (5 accesos): **Hoy · Proyectos · ＋ (captura) · Notas · Cerebro**. Antes de la F3, los dos últimos son **CRM** y **Finanzas**.
- **"Más"** (desde el avatar en el encabezado): el resto de los módulos y Configuración.
- Búsqueda en el encabezado (icono) → paleta a pantalla completa.
- Hojas inferiores (bottom sheets) para crear y editar, en lugar de modales centrados.

## 4. Rutas por entidad (patrón)

| Patrón | Uso |
|---|---|
| `/{modulo}` | Lista con vistas guardadas, filtros y búsqueda |
| `/{modulo}/nuevo` | Creación (en el celular, hoja inferior) |
| `/{modulo}/{id}` | Ficha con pestañas |
| `/{modulo}/{id}/{pestaña}` | Pestaña directa (compartible) |

Fichas principales y sus pestañas:
- **Cliente:** Resumen · Contactos · Interacciones · Oportunidades · Proyectos · Presupuestos · Dinero · Sitios · Repositorios · Archivos · Notas · Actividad
- **Proyecto:** Resumen · Tareas (lista/kanban) · Etapas · Entregas · Decisiones · Archivos · Repositorios · Changelog · Actividad
- **Presupuesto:** Vista previa · Editar (versión actual) · Versiones · Actividad
- **Sitio:** Briefing · Requerimientos · Estructura · Contenidos · Recursos · Revisiones · Dominio y hosting · Publicación · Documentación · Monitoreo
- **Repositorio:** Resumen · Estándar (checks) · Actividad · Vínculos
- **Auditoría SEO:** Resumen · Problemas · Páginas · Rendimiento · Comparar · Informe

## 5. Flujos clave (navegación de punta a punta)

1. **Prospecto a proyecto:** CRM → nueva oportunidad → "Crear presupuesto" → PDF → aceptado → "Crear proyecto" (plantilla del servicio) → el proyecto aparece en Hoy con su primera acción.
2. **Arrancar un proyecto personal:** `C` o "+" → "Nuevo proyecto" → asistente de 5 pasos → Hoy.
3. **Ponerse al día:** Hoy → bloque "Ponerse al día" → acción inline → el ítem desaparece con "Deshacer".
4. **Ordenar repositorios:** Repositorios → "Estándar" muestra los desvíos → "Generar plan" → revisar acciones → Aprobar → ejecución con registro.
5. **Sitio para cliente:** Proyecto (plantilla Tienda) → "Crear sitio" → Briefing → preguntas al cliente → Estructura → Contenidos → Revisiones → Publicación → Documentación.
6. **Auditar SEO:** Sitio → "Auditar" → resultados → "Crear tareas" desde los problemas → tiempo después, "Comparar".

## 6. Atajos de teclado (desktop)

| Atajo | Acción |
|---|---|
| `Ctrl/Cmd K` | Paleta de comandos |
| `C` | Capturar |
| `G` luego `H / P / R / F / N / B` | Ir a Hoy / Proyectos / Repositorios / Finanzas / Notas / Cerebro |
| `/` | Buscar en la lista actual |
| `E` | Editar el elemento abierto |
| `X` | Seleccionar fila |
| `Shift + D` | Marcar tarea como hecha |
| `?` | Ver todos los atajos |

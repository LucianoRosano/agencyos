# 07 · Diseño de experiencia de usuario

La identidad base está definida en `contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md` (Parte C) y en las vistas de referencia `contexto/referencias/*.png`, aprobadas por Luciano. Este documento agrega los patrones de UI, la identidad por módulo y las reglas de calidad.

## 1. Concepto: «Escritorio» (ADR 0017, reemplaza «Centro de mando»)
Clásico, cálido y fácil de leer: papel marfil, tinta marrón oscura y un solo acento terracota para lo interactivo. Claro por defecto, con modo oscuro completo en los mismos tonos. Sin degradados, brillos ni neón.

**Tokens:** `packages/ui/src/tokens.css` (todos los pares de texto ≥ 4,5:1).
**Tipografía:** Inter para toda la interfaz y los números (cifras tabulares); Source Serif 4 solo para los títulos de página; monoespaciada del sistema únicamente para código. Etiquetas de sección en seminegrita, sin mayúsculas espaciadas.
**Iconos:** Lucide, 16 px en la UI y 20–22 px en la navegación del celular, trazo 1,75.

## 2. Identidad visual por módulo

Cada módulo tiene un **acento** propio dentro de la paleta. Se usa en el icono de la barra lateral cuando está activo, en el encabezado del módulo (línea superior de 2 px con el acento), en los chips de tipo y en los nodos del Cerebro. El resto de la interfaz es común: **coherencia antes que variedad**.

| Módulo | Acento | Icono (Lucide) |
|---|---|---|
| Hoy / Negocio | Terracota `#A9471F` | `sun` / `chart-no-axes-combined` |
| CRM | Ciruela `#7A4E7E` | `briefcase` |
| Proyectos y tareas | Terracota `#A9471F` | `folder-kanban` |
| Presupuestos | Madera rosada `#9C6B5A` | `file-signature` |
| Finanzas / Comercios | Salvia `#4F7A52` | `wallet` / `store` |
| Sitios (Website Factory) | Rosa viejo `#B4637A` | `layout-template` |
| SEO | Nogal `#8C6A4F` | `radar` |
| Biblioteca | Arcilla `#C2703D` | `library` |
| Facultad | Ocre `#B7791F` | `graduation-cap` |
| Otros | Gris cálido `#857B70` | — |

(El acento del módulo se usa en chips y nodos del Cerebro; los encabezados ya no llevan línea de color.)

## 3. Patrones de componentes (todos en `packages/ui`)

- **Encabezado de página:** título, descripción corta opcional, pestañas, acciones primarias (máximo 1 primaria + 2 secundarias + menú `…`).
- **Tablas (TanStack):**
  - columnas configurables, orden, filtros por chip, búsqueda, selección múltiple con barra de acciones;
  - densidad cómoda/compacta;
  - vistas guardadas;
  - **en el celular se convierten en tarjetas** con los 3 campos principales.
- **Kanban:** columnas por estado, arrastrar y soltar (teclado accesible), contador y suma (por ejemplo, el valor del pipeline).
- **Formularios:**
  - una columna en el celular y dos en desktop solo para campos cortos;
  - etiqueta arriba, ayuda debajo, error inline al salir del campo y resumen de errores al enviar;
  - guardado con `Ctrl+Enter`;
  - **autoguardado** en editores largos;
  - inputs de 16 px o más en el celular;
  - monedas con selector ARS/USD y formato `es-AR` (`$ 1.234,56` / `US$ 1.234,56`).
- **Ficha de entidad:** encabezado con estado editable inline, metadatos clave en una "tarjeta de propiedades" (al estilo Linear), pestañas y panel derecho "Conectado con" + actividad (en el celular, al final).
- **Estados vacíos cuidados:** ilustración lineal mínima (SVG monocromo con el acento del módulo), una frase que explica para qué sirve, **una acción principal** y, si aplica, "Importar". Nunca muestran datos falsos.
- **Skeleton loaders:** con la forma real del contenido. Aparecen después de 150 ms (para no titilar) y tienen un shimmer sutil que se desactiva con `prefers-reduced-motion`.
- **Feedback:**
  - toasts abajo a la derecha en desktop y arriba en el celular: éxito 3 s, error persistente con "Ver detalle", **Deshacer** en acciones destructivas;
  - actualizaciones optimistas con reversión si falla;
  - botones con estado de carga.
- **Confirmaciones:** solo para lo irreversible o lo externo (eliminar definitivamente, enviar al cliente, ejecutar un plan en GitHub). Muestran **qué va a pasar exactamente**.
- **Notificaciones:** campana con lista agrupada por día; marcar leída; enlace a la entidad.
- **Aprobaciones (agentes y planes):** tarjeta con quién propone, qué cambia (diff legible), riesgo, y botones **Aprobar / Rechazar / Editar y aprobar**.
- **Paleta de comandos:** resultados agrupados, previsualización a la derecha en desktop, acciones con atajos visibles.
- **Gráficos:** SVG propios; ejes y leyendas en Inter con cifras tabulares; tooltips accesibles; siempre con tabla alternativa ("Ver datos").

### 3.1 Movimiento (ADR 0018)
Entradas suaves y salidas rápidas con los tokens `--ease-*` y `--dur-*`; hojas que suben y se cierran arrastrando en el
celular; menús desde su botón; barra de progreso al navegar; listas en cascada (`stagger`); tarjetas que se levantan
(`lift`); completar una tarea con tilde que salta. Todo en CSS, sin librerías; con movimiento reducido, instantáneo.

## 4. Pantallas clave (dirección)

- **Hoy:** idéntico en espíritu a `AGENCYOS-vista-hoy-desktop.png` y `-celular.png`.
- **Negocio:** grilla de KPIs (4 por fila en desktop y 2 en el celular), cada uno con valor, delta vs. período anterior y sparkline. Debajo: pipeline del CRM (barras por etapa), ingresos vs. gastos (12 meses), top rentabilidad y vencimientos.
- **CRM:** lista o kanban del pipeline. La ficha de cliente se lee como una "historia": línea de tiempo de interacciones y hitos.
- **Presupuesto:** editor a la izquierda y **vista previa del PDF en vivo** a la derecha (en el celular, alternando pestañas).
- **Finanzas:** resumen con saldos por cuenta, "este mes", próximos vencimientos y botón "Registrar" siempre visible.
- **Repositorios:** tabla con puntaje de salud (anillo 0–100), alcance (`prod`, `cli`, etc.), cliente y última actividad; panel "Estándar" con los checks en verde, amarillo y rojo.
- **Sitio:** la pestaña Estructura muestra el árbol de páginas (izquierda) y las secciones con slots (derecha), con el estado de contenido por color.
- **SEO:** puntaje grande, categorías con conteo por severidad, lista de problemas agrupada y comparación con flechas ▲▼.
- **Cerebro:** como `AGENCYOS-vista-cerebro-*.png`.

## 5. PDFs (presupuestos, constancias, informes, briefings)

- A4, márgenes de 18 mm, Geist, encabezado con la marca (AGENCYOS o, cuando exista, la de la agencia), pie con número de página y fecha.
- **Legibles impresos en blanco y negro**: el color nunca es la única forma de transmitir información.
- Presupuesto: portada simple, resumen, alcance, ítems (tabla), totales destacados, plan de cobro, condiciones, validez y aceptación.

## 6. Accesibilidad y calidad visual (obligatorio)

- WCAG 2.2 AA: contraste, foco visible (anillo terracota de 2 px), navegación completa por teclado, roles ARIA en componentes complejos (kanban, grafo con lista alternativa) y textos alternativos.
- Zonas táctiles de 44 px o más; **sin scroll horizontal** en 360–430 px; sin zoom al enfocar inputs.
- `prefers-reduced-motion` y `prefers-color-scheme` respetados.
- Cada pantalla se verifica con capturas de Playwright en **390 px y 1440 px, modo oscuro y claro**, antes de darla por terminada.

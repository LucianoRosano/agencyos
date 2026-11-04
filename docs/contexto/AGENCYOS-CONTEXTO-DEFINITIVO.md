# AGENCYOS — Contexto definitivo

**Dueño:** Luciano Rosano · lucianorosanott@gmail.com · San Miguel, Buenos Aires (America/Buenos_Aires)
**Versión:** definitiva 1.0, 3 de noviembre de 2026
**Para:** Claude Code (o cualquier modelo) que construya AGENCYOS. Este es **el único documento de referencia**: reemplaza todas las versiones anteriores.
**Referencias visuales que lo acompañan:**
- `AGENCYOS-vista-hoy-desktop.png`
- `AGENCYOS-vista-hoy-celular.png`
- `AGENCYOS-vista-cerebro-desktop.png`
- `AGENCYOS-vista-cerebro-celular.png`

Son vistas ilustrativas con datos de ejemplo. Marcan la **dirección visual** (identidad, jerarquía, densidad), no son un diseño para copiar al píxel.

> **Nota (03/11/2026):** este documento forma parte del paquete `AGENCYOS` para Claude Code. Para **módulos, arquitectura, stack, fases y repositorios** mandan los documentos `00`–`16` del paquete (por ejemplo, la autenticación usa **Better Auth** y el roadmap es el de `10-roadmap.md`). Las Partes A (quién es Luciano) y C (identidad visual y UX) siguen plenamente vigentes.

**Etiquetas:** **[C]** confirmado por Luciano · **[I]** inferido de hechos confirmados · **[R]** recomendación del autor del documento.

---

# PARTE A — Quién es Luciano y cómo trabaja

## A1. Resumen en 10 puntos

1. Estudia **Licenciatura en Sistemas en la UNGS** (empezó en 2026; egresó del secundario en 2025). Completó **Potrero Digital** (Frontend, Backend y Lenguajes Complementarios). Tiene conocimientos **básicos** de Python, HTML y CSS. [C]
2. Igual construye **sistemas reales para negocios reales**: tiendas WooCommerce, paneles de gestión propios, facturación electrónica automática con **ARCA** (ex AFIP) y automatizaciones. [C]
3. **Su modelo de trabajo es dirigir a Claude como equipo de ingeniería**: él define el producto, decide y prueba; Claude escribe, despliega y verifica. Él no sube código a mano. [C] → **AGENCYOS se diseña para ser mantenido por IA.**
4. Tiene una **agencia digital propia**. Clientes: **Librería Uno, Sofía Casa Editorial y ADEH** (negocios familiares), **Bellezatecnia** (negocio de su cuñado) y **Parinama Nutrición** (proyecto terminado). [C]
5. **Todavía no cobró** ningún proyecto y **no está inscripto en ARCA** (es estudiante). [C]
6. Trabaja **solo**; quiere poder sumar colaboradores y, si los clientes entran, que lo que vean sea prolijo. [C]
7. **Ambición muy alta**: quiere escalar mucho y que AGENCYOS sea "la mejor". Por ahora es interno; quizás lo venda después. [C]
8. Espera **calidad visual premium** (Apple, Stripe, Linear, Vercel), **mobile y desktop por igual**, **rendimiento extremo** y **seguridad fuerte**. [C]
9. **Tolerancia cero a lo improvisado o a medias**: todo probado y verificado, nada olvidado en modo prueba. [C]
10. Lo que hoy le cuesta: **cómo arrancar sus proyectos y cómo ser más productivo**. [C]

## A2. Cómo quiere que trabaje Claude [C]

- **Tareas grandes delegadas**: sin narración ni preguntas en el medio; solo el resultado terminado y verificado.
- **Antes de implementar algo que toca producción**: **una sola lista** con todas las preguntas y datos necesarios, y esperar las respuestas.
- **Arquitectura nueva**: se debate antes. Esta parte ya está cerrada en este documento.
- **Al cerrar una sesión de implementación**: un `.md` con lo que tiene que hacer él (instalar, configurar, qué tocar).
- **Lo que Claude no puede resolver solo**: anotarlo en una lista de pendientes y recordárselo.
- Usar todas las herramientas disponibles de forma autónoma y **verificar antes de decir "listo"**.
- **Confirmación humana antes de cualquier acción irreversible** (producción, borrar, cobrar o facturar en serio).
- **No romper lo que funciona** al agregar mejoras. **Mantener todas las funciones** cuando se reestructura algo.
- Comunicación **corta, directa y en español rioplatense**. Corrige rápido y con precisión.
- **Prioriza herramientas gratuitas u open source**, coherentes y mantenibles; no instalar cosas por tenerlas; permisos mínimos.
- **Restricciones reales**: tiempo de estudiante, presupuesto acotado y límites de uso de Claude. Todo trabajo largo tiene que poder **retomarse** donde quedó.

## A3. Preferencias de diseño y UX [C]

- Interfaces **intuitivas, lindas y con dinamismo**, pero **siempre priorizando el rendimiento** (fluidas en una PC vieja y en un celular medio).
- **Mobile first real**: sin scroll horizontal, sin zoom al tocar campos (inputs de 16 px o más), botones grandes, gestos.
- **Modo claro y oscuro**.
- Nada de `backdrop-filter: blur` en elementos repetidos; solo en barras fijas o modales.
- **Sutilezas sociales en la interfaz**: no mostrar etiquetas innecesarias (por ejemplo, "jefe" o "con PIN"); las opciones raras quedan escondidas, no eliminadas; las funciones opcionales se apagan con un interruptor.
- Todo lo imprimible (PDF, listados, presupuestos) tiene que salir prolijo. Sus documentos de estudio se imprimen en blanco y negro, en A4.
- No le gustó cuando Claude armó un prototipo "todo junto" sin su proceso de diseño. Para AGENCYOS **confía en el criterio de Claude** (dijo: "el mismo criterio que Claude Design"). Las vistas de referencia ya fueron mostradas.

## A4. Clientes y proyectos (estado al 03/11/2026)

| Cliente / área | Relación | Proyectos y estado |
|---|---|---|
| **Librería Uno** (librería, papelería, cotillón, juguetería; San Miguel) | Familia | Tienda WooCommerce (sin lanzar; staging en pruebas.libreriauno.com; checklist de lanzamiento de 17 áreas) · **LibreríaOS Panel** (diseñado, sin programar; faltan 2 pantallas del jefe) · **LibreríaOS Fiscal 1.1.0** (facturación por web services de ARCA, probada en staging; espera su orden de "fase final") · **Caja del local** (sistema aparte, dos cuentas fiscales; en definición) · App de gestión de empleadas (en pausa) · Agente de chat del local (idea) |
| **Sofía Casa Editorial** (sofiacasaeditorial.com) | Padre | Sitio WooCommerce en producción · panel propio (PHP independiente) · facturador ARCA (Python + Playwright) · auditoría SEO en curso · dashboard financiero (en diagnóstico) · **clon de LibreríaOS para Sofía** (decidido, sin empezar) |
| **ADEH** (Asociación de Estudios Humanísticos) | Padre | Certificados del IX Congreso de Lengua y Literatura (generación de PDFs por tandas) |
| **Bellezatecnia** (belleza y peluquería, ~1.000 productos) | Cuñado | **Plataforma mayorista** (nueva; se desarrolla en su Hostinger y se transfiere al aprobarse) · rediseño de la minorista (idea) |
| **Parinama Nutrición** (Omnilife, Tandil) | Externo | **Terminado**: panel "Gestión SCE" (PHP independiente), SEO completo y reescritura legal del contenido |
| **Personal** | — | **AGENCYOS** · **SEÑAL** (diario semanal automatizado en PDF) · formación en ciberseguridad (cursos UTN el año que viene) · búsqueda de pasantía (UNGS) · investigación sobre importar desde China · biblioteca de libros-PDF de estudio · personalización de su ecosistema Claude |
| **Facultad** | — | **La configura él desde el panel** (no precargar materias ni fechas) |

**Vencimientos conocidos**: exportar los diseños de LibreríaOS desde Claude Design **antes del 14/12/2026** · certificado de producción de ARCA de Librería Uno **27/10/2028**.

**Patrones que se repiten** [I]:
- "Sacar a la gente de WordPress" con paneles propios para usuarios no técnicos.
- Automatizar la burocracia de ARCA.
- **Construir una vez y replicar** en otro cliente.
- Proyectos que nacen chicos y crecen hasta ser un "OS".
- Checklists y documentación como entregables.

## A5. Herramientas que usa [C]

- **Hosting**: Hostinger **Business Web Hosting** (50 GB SSD, hasta 2 núcleos, 3 GB RAM, LiteSpeed, SSL, backups diarios, SFTP/rsync; admite apps Node.js gestionadas).
- **Sitios**: WordPress + WooCommerce, tema Kadence, LiteSpeed Cache, Rank Math (en Parinama).
- **Pagos y envíos**: Mercado Pago; Correo Argentino y Andreani.
- **Fiscal**: ARCA (WSAA/WSFE, certificados, puntos de venta).
- **Desarrollo y PDFs**: Python, Playwright/Chromium, openpyxl; generación de PDF con Chromium, WeasyPrint y ReportLab; paneles PHP independientes.
- **Ecosistema Claude**: Claude Code; claude.ai con Proyectos y memoria; **royal-mcp** (WordPress/WooCommerce en vivo); **Claude in Chrome** (intermitente: verificar que haya un navegador conectado); acceso a su PC Windows; Claude Design; tareas programadas con aviso al celular.
- **Otros**: Obsidian (**se va a reemplazar por AGENCYOS**); Excel; Meta, Search Console, GA4.
- **GitHub**: tiene cuenta y algunos repositorios, lo usa poco.
- **Contraseñas**: **Bitwarden** (ya lo descargó).
- **Mail transaccional**: **Brevo** (elegido; cuenta todavía no creada).

---

# PARTE B — Qué es AGENCYOS

## B1. Definición

AGENCYOS es **el sistema operativo personal y profesional de Luciano**. Junta en un solo lugar:
- su **agencia** (clientes, proyectos, sitios, productos propios, servicios, dinero);
- sus **proyectos personales**;
- su **facultad**;
- su **conocimiento**: notas y un grafo de todo lo conectado. **Reemplaza por completo a Obsidian.**

Objetivos:
1. **Arrancar proyectos** sin fricción.
2. **Aumentar la productividad**.
3. Mostrar cada día **con qué tiene que ponerse al día** (tareas, pagos, cobros, vencimientos).

Se construye **listo para escalar y, eventualmente, venderse**.

### Principios innegociables
1. Calidad premium: futurista, prolija y rápida.
2. Celular y computadora por igual.
3. Rendimiento extremo.
4. Todo se puede **crear, editar, archivar y eliminar** (con papelera).
5. Organización clara, aunque haya muchísimas cosas.
6. Mantenible por IA.
7. Los datos son de Luciano: **exportables a Markdown/JSON** en cualquier momento.
8. **No guarda contraseñas** de terceros: solo la referencia al ítem de Bitwarden.
9. **No emite facturas fiscales** (Luciano no está inscripto).

## B2. Módulos

Un **módulo** es una "app dentro de la app": una sección con una función propia, que se construye por separado y se puede activar o desactivar. Todos comparten un **núcleo**: usuarios, búsqueda, enlaces entre cosas, etiquetas, papelera, actividad y notificaciones. Gracias al núcleo, cualquier cosa se conecta con cualquier otra y todo aparece en el Cerebro.

| Módulo | Para qué | Fase |
|---|---|---|
| **Hoy** | Inicio: qué hacer, qué está vencido, con qué ponerse al día | 1 |
| **Bandeja** | Capturar cualquier cosa en 2 segundos y ordenarla después | 1 |
| **Espacios** | Agencia · Personal · Facultad (y los que él cree) | 1 |
| **Clientes** | Fichas e historia de cada cliente | 1 |
| **Proyectos** | De clientes y personales, con plantillas de arranque | 1 |
| **Tareas** | Subtareas, prioridades, fechas, recurrencias | 1 |
| **Personas** | Contactos con rol | 1 |
| **Notas** | Markdown con `[[enlaces]]`: el reemplazo de Obsidian | 2 |
| **Cerebro** | Vista gráfica de todo lo conectado | 2 |
| **Finanzas** | Ingresos, gastos, suscripciones, por cobrar, por pagar, presupuestos | 3 |
| **Calendario** | Todas las fechas del sistema en un solo lugar | 3 |
| **Facultad** | Materias, evaluaciones, apuntes (los carga él) | 3 |
| **Activos técnicos** | Sitios, dominios, hosting, certificados, productos propios instalados | 4 |
| **Servicios** | Catálogo y precios de la agencia | 4 |
| **IA / MCP** | Que Claude lea y escriba en AGENCYOS | 5 |
| **Colaboradores y portal de cliente** | Acceso de terceros con permisos | 6 |

## B3. Pantalla "Hoy" (ver `AGENCYOS-vista-hoy-*.png`)

Responde en 10 segundos **"¿qué hago ahora y qué se me está pasando?"**. Bloques, en orden:

1. **Saludo, fecha y línea de estado**, con píldoras: "3 para hoy · 2 vencidas · 1 pago por vencer · 3 en la bandeja".
2. **Foco de hoy**: hasta **3 prioridades** que elige él. Si no elige, el sistema sugiere según vencimiento, prioridad y proyectos frenados. La primera va destacada.
3. **Ponerse al día**: junta tareas vencidas, **pagos por hacer**, **cobros pendientes**, renovaciones y vencimientos, proyectos **sin siguiente acción** o **frenados**, y la Bandeja sin procesar. Cada ítem se resuelve desde ahí (hecho, posponer, registrar pago, abrir).
4. **Próximos 7 días**: entregas, eventos, pagos, renovaciones y evaluaciones.
5. **Dinero del mes**: ingresos, gastos, por cobrar y por pagar, y un gráfico mínimo de 6 meses.
6. **Facultad**: cuenta regresiva a la próxima evaluación y avance por materia (solo si cargó materias).
7. **Notas recientes** con un mini-Cerebro.
8. **Proyectos activos**: avance, siguiente acción y última actividad. Los frenados se ven apagados.

Reglas:
- En el celular los bloques se apilan, "Ponerse al día" muestra 3 ítems más "Ver N más", y hay navegación inferior con un **"+" central de captura**.
- Los bloques se pueden ocultar y reordenar.
- En desktop: botón **Capturar** (atajo `C`) y **Modo foco** en la barra superior.

## B4. Módulos en detalle

### Espacios
Todo pertenece a un espacio: **Agencia, Personal o Facultad**, y se pueden crear más. Un selector global ("Todos los espacios" o uno puntual) filtra todo el sistema. Dentro de cada espacio hay **etiquetas** y, en Notas, **carpetas opcionales**.

### Clientes
- **Ficha**: rubro, estado (**prospecto · activo · en pausa · terminado · archivado**), relación (familia, cuñado, externo), contactos, proyectos, sitios, dinero (cobrado y por cobrar), línea de tiempo, notas, archivos y enlaces.
- **Titulares fiscales del cliente** (dato del cliente): razón social y condición de IVA. Los datos sensibles van ocultos por defecto.
- Acciones: crear, editar, archivar, eliminar (papelera de 30 días) y fusionar duplicados.

### Proyectos
- Tienen espacio y, opcionalmente, cliente.
- **Estado**: idea · planificación · en curso · en pausa · bloqueado · terminado · archivado.
- **Campos**: objetivo en una frase, **siguiente acción** (obligatoria si está en curso), fechas, prioridad, fases, tareas, notas, archivos, enlaces y dinero asociado.
- **Registro de decisiones** (qué, por qué, fecha, quién aprobó).
- **Bloqueos** ("esperando a X", con fecha para volver a revisar).
- **Vistas**: lista, kanban, línea de tiempo y por cliente.

**Plantillas de arranque** (editables; también se puede guardar un proyecto como plantilla):
1. Sitio WooCommerce para cliente: relevamiento → lista única de preguntas → diseño → staging → carga → checklist de lanzamiento → fase final → manual del cliente → mantenimiento.
2. Panel o plugin propio: idea y arquitectura → diseño → desarrollo → staging → fase final con su OK → documentación.
3. Mantenimiento mensual de sitio (checklist recurrente).
4. Proyecto personal de aprendizaje.
5. Materia de la facultad.
6. En blanco.

**Asistente de arranque** (5 pasos, menos de 2 minutos): plantilla → cliente o personal → qué significa "terminado" → fecha objetivo (opcional) → primera acción. Al terminar, el proyecto queda creado y la primera acción aparece en "Hoy".

### Tareas
- Prioridad P1–P4, fecha y hora, **recurrencia**, subtareas, estimación opcional y responsable (Luciano, Claude, cliente, colaborador).
- Vistas: Hoy, Próximas, Por proyecto, Sin fecha, Completadas; lista y kanban.
- En el celular: deslizar para completar o posponer.
- Una tarea se puede convertir en proyecto, y una línea de una nota en tarea.

### Bandeja
Captura desde el "+", desde `Ctrl/Cmd + K` o desde la IA (fase 5). Texto libre, con tipo opcional (tarea, nota, idea, gasto, link). Se procesa en **modo uno por uno**: convertir, asignar, programar o descartar.

### Notas (reemplazo de Obsidian)
- **Markdown** como formato fuente; editor con **vista previa en vivo** al estilo Obsidian.
- **Enlaces**: `[[Nota]]`, `[[Nota|alias]]` y `[[Nota#Sección]]`, más menciones de entidades: `@cliente`, `#proyecto`, `@persona`.
- **Backlinks** y menciones no enlazadas.
- Etiquetas, **frontmatter** YAML, carpetas opcionales, plantillas, **nota diaria**, adjuntos, historial de versiones y búsqueda de texto completo instantánea (tolerante a tildes).
- Vista normal: árbol + lista + nota. En el celular, navegación por pantallas.
- **Importador de Obsidian** desde `C:\Users\Usuario\Documents\Obsidian Vault` (vía la conexión de Claude con su PC o un .zip). Conserva enlaces, adjuntos y frontmatter, y respeta las reglas del `CLAUDE.md` del vault.
- **Migración segura**: Obsidian **no se toca** hasta verificar que la importación está completa (conteo de notas, enlaces y adjuntos). Recién entonces se retira.
- **Exportación** a un vault compatible con Obsidian, como salida de emergencia.

### Cerebro (aprobado por Luciano; ver `AGENCYOS-vista-cerebro-*.png`)

**Nodos**: notas, proyectos, clientes, personas, materias y sitios; las tareas solo con filtro.
**Líneas**: enlaces, menciones, pertenencia y, opcionalmente, etiquetas.

**Identidad visual**
- Fondo de espacio profundo con grilla de puntos sutil.
- Nodos como **puntos luminosos**: el tamaño depende de las conexiones y el color del tipo.
- Cada tipo tiene además su forma: sitio = rombo, persona = anillo.
- **Constelaciones**: cada cliente o espacio tiene un halo difuso de su color y su nombre en mayúsculas mono.

**Pulso de actividad**
- Lo tocado en los últimos días tiene anillos que laten suavemente.
- Lo **frenado o terminado** se ve **apagado**.
- Así, el grafo es también un **mapa de productividad**.

**Interacciones**
- Hover: ilumina el vecindario. Clic: abre un panel lateral con tipo, estado, conexiones, avance, siguiente acción y vecinos directos, más los botones "Grafo local" y "Abrir".
- **Buscar y volar** (`/`): la cámara se anima hasta el nodo.
- **Filtros por tipo** (chips) y por espacio, etiqueta y fecha.
- **Grafo local** de profundidad 1 a 3 dentro de cada nota, proyecto y cliente.
- **Línea de tiempo** (deslizador) para ver cómo creció el cerebro.
- Vistas guardadas, detección de huérfanos y zoom/encuadre.
- **Selector Grafo | Lista** y **2D | 3D**. El 2D es el principal; el 3D es un modo inmersivo opcional.

**Celular**
- Búsqueda arriba, chips de filtro, grafo a pantalla completa y una **hoja inferior** con el nodo seleccionado.
- Pellizcar para zoom; menos etiquetas para mantener la fluidez.

**Rendimiento**
- Render **WebGL**; el layout se calcula en un **Web Worker** y se **guarda** para no recalcularlo.
- Meta: 60 fps con 5.000 nodos en desktop y 30 fps o más con 1.000 nodos en un celular medio.
- Etiquetas con nivel de detalle progresivo y **sin superposiciones**.
- Con `prefers-reduced-motion`: sin pulso ni animaciones.
- Cada vista del grafo tiene su **equivalente en lista**.

### Finanzas (sin facturación fiscal)
- **Libros separados**: Agencia y Personal, más una vista combinada.
- **Cuentas**: efectivo, Mercado Pago, banco y dólares (las crea él).
- **Movimientos**: fecha, monto, **ARS/USD**, tipo de cambio cargado a mano (opcional), categoría, cuenta, cliente o proyecto, comprobante adjunto y nota.
- **Suscripciones y gastos fijos** (Claude, Hostinger, VPS, dominios, Brevo…): frecuencia, próxima fecha, aviso anticipado y vista "cuánto me cuestan mis herramientas por mes".
- **Por cobrar**: pago único, por etapas o **abono mensual**; estado pendiente, parcial, cobrado o vencido.
- **Por pagar**: deudas y compromisos.
- **Ponerse al día**: vencidos y próximos (alimenta "Hoy").
- **Presupuestos**: desde el catálogo de Servicios, con un PDF prolijo con identidad AGENCYOS. Al aceptarse, **crean el proyecto y su plan de cobro**.
- **Constancia de pago interna** en PDF con la leyenda **"Documento no válido como factura"**.
- **Rentabilidad** por proyecto y por cliente. Registro de horas opcional, apagado por defecto.
- **Reportes** por mes, año, categoría y cliente, en ARS y USD.
- [R] Cuando empiece a cobrar de forma regular, conviene consultar con un contador cómo registrarse. El módulo queda preparado para sumar facturación propia reutilizando el motor de LibreríaOS Fiscal.

### Calendario
Día, semana, mes y agenda, con todas las fechas del sistema (tareas, entregas, evaluaciones, pagos, cobros, renovaciones y vencimientos). Cada fuente se puede mostrar u ocultar. Exportación iCal en una fase posterior.

### Facultad
- **Materias**: cuatrimestre, comisión, docentes, horarios, estado y nota.
- **Evaluaciones**: parciales, TPs y finales, con fecha, temas, nota objetivo y nota obtenida.
- **Apuntes** = Notas vinculadas a la materia.
- **Arranca vacío**: lo configura Luciano.

### Personas
Rol (cliente, familia, contador, empleada de un cliente, profesor, colaborador), datos de contacto, vínculos y notas. Lo mínimo necesario.

### Activos técnicos
- **Sitios**: dominio, entorno, cliente, hosting, stack, versiones, SSL, backups y estado.
- **Dominios, hosting y certificados**, con vencimiento y aviso.
- **Productos propios** (LibreríaOS Panel, LibreríaOS Fiscal, Caja, Panel de Sofía) con versiones, changelog e **instalaciones** (qué versión hay en qué cliente).
- **Credenciales**: solo la **referencia a Bitwarden** ("Bitwarden → Librería Uno → Hostinger").
- Más adelante: chequeos automáticos (uptime, SSL, versiones) con aviso.

### Servicios
Catálogo de servicios de la agencia (tienda WooCommerce, panel propio, facturación ARCA, mantenimiento, SEO…) con entregables, precio de referencia ARS/USD y plantilla de proyecto asociada. **Arranca sin precios.**

### IA / MCP
- **Servidor MCP propio**, autenticado con token, con herramientas: `buscar`, `ver_hoy`, `crear_tarea`, `crear_nota`, `registrar_decision`, `estado_proyecto`, `registrar_gasto`, `pendientes`.
- AGENCYOS pasa a ser **la memoria oficial de sus proyectos** para cualquier sesión de Claude.
- Las acciones destructivas por MCP requieren su confirmación.

### Colaboradores y portal de cliente
- **Roles**: dueño, colaborador (solo lo asignado) y cliente (portal de solo lectura de su proyecto: estado, entregables y aprobaciones).
- El portal se ve tan prolijo como el resto.

### Núcleo (transversal)
- **Paleta de comandos** `Ctrl/Cmd + K` y **búsqueda global**.
- Enlaces universales, etiquetas, **papelera** de 30 días y archivo.
- Registro de actividad y **auditoría**.
- Notificaciones dentro de la app, **push** (PWA) y mail (Brevo).
- **Exportación total** y **backups automáticos**.
- Atajos de teclado y gestos.

## B5. Método de productividad incorporado

1. **Capturar** todo en la Bandeja.
2. **Aclarar**: procesar la Bandeja uno por uno.
3. **Elegir el foco del día** (máximo 3).
4. **Ejecutar** en **Modo foco**: una sola tarea en pantalla, temporizador opcional y notas al costado.
5. **Revisión semanal guiada** (sugerida los domingos): vaciar la Bandeja, revisar proyectos sin siguiente acción, Ponerse al día y dinero, y elegir los focos de la semana. Genera una nota de revisión que queda en el Cerebro.

Reglas suaves:
- Todo proyecto en curso tiene siguiente acción.
- Sin movimiento en más de 14 días (configurable) → **frenado**.
- Límite sugerido de proyectos activos a la vez (avisa, no bloquea).

---

# PARTE C — Identidad visual y UX

## C1. Concepto: "Centro de mando"
Futurista y sobrio: el nivel de Linear, Vercel y Raycast, con luz de neón contenida. **El modo oscuro es el principal**; también hay modo claro.

| Token | Oscuro | Claro |
|---|---|---|
| `--bg` | `#06070A` | `#F6F7F9` |
| `--bg-elevated` | `#0B0D12` | `#FFFFFF` |
| `--surface` | `#11141B` | `#FFFFFF` |
| `--surface-2` | `#171B24` | `#F0F2F5` |
| `--border` | `rgba(255,255,255,.075)` | `rgba(10,12,18,.10)` |
| `--text` | `#E8EBF2` | `#0B0D12` |
| `--text-muted` | `#8A93A6` | `#5A6275` |
| `--accent` (Plasma) | `#7C5CFF` | `#5B3DF5` |
| `--accent-2` (Ion) | `#22D3EE` | `#0891B2` |
| `--success` | `#34D399` | `#059669` |
| `--warning` | `#FBBF24` | `#B45309` |
| `--danger` | `#F43F5E` | `#E11D48` |

- **Gradiente de firma** Plasma → Ion, **con moderación**: logo, botón principal, foco activo y barras de avance.
- **Glow** suave solo en elementos activos o seleccionados.
- **Grilla de puntos** muy sutil de fondo.
- Contraste mínimo WCAG AA.

**Tipografía**
- **Geist Sans** para la interfaz.
- **Geist Mono** para números, fechas, etiquetas de sección en mayúsculas espaciadas e IDs (con números tabulares).
- Logo: "AGENCY**OS**" en Geist Mono espaciado, con "OS" en el gradiente, y un isotipo cuadrado con borde cónico Plasma/Ion.

**Forma**
- Radios de 8 px (controles) y 12 px (tarjetas).
- Bordes de 1 px en lugar de sombras pesadas.
- Iconos de línea fina (Lucide).

**Movimiento**
- 150–250 ms, solo opacidad y transformación.
- Se respeta `prefers-reduced-motion`.

**Colores por tipo** (siempre acompañados de un ícono o forma, nunca solo color):

| Tipo | Color |
|---|---|
| Proyecto | `#7C5CFF` |
| Cliente | `#22D3EE` |
| Nota | `#C9D1E0` |
| Persona | `#34D399` |
| Facultad | `#FBBF24` |
| Sitio | `#F472B6` |
| Tarea | `#60A5FA` |

## C2. Reglas de UX
- **Desktop**: barra lateral (Hoy, Bandeja, Proyectos, Tareas, Clientes, Notas, Cerebro, Finanzas, Calendario, Facultad, más la lista de Espacios) y barra superior con selector de espacio, Modo foco y Capturar.
- **Celular**: navegación inferior (Hoy · Proyectos · **+** · Notas · Cerebro) y "Más" en el menú del avatar.
- Sin scroll horizontal; inputs de 16 px o más; zonas táctiles de 44 px o más.
- Tablas → tarjetas en el celular.
- Estados vacíos útiles, guardado automático y **"Deshacer"** tras acciones destructivas (además de pedir confirmación).
- Respuesta percibida < 100 ms (actualización optimista).
- Español rioplatense, fechas `dd/mm/aaaa`, 24 h, zona **America/Buenos_Aires**.
- **Instalable (PWA)** en el celular y en la PC.

---

# PARTE D — Técnica

## D1. Stack (verificar las versiones vigentes al iniciar)

| Capa | Elección |
|---|---|
| Lenguaje | **TypeScript** estricto, en front y back |
| Framework | **Next.js** (App Router) + React, con render del lado del servidor |
| Base de datos | **PostgreSQL** (búsqueda de texto completo en español, JSONB) |
| Datos | **Drizzle ORM** + migraciones versionadas |
| UI | **Tailwind CSS** + componentes accesibles (Radix / shadcn/ui) adaptados a la identidad · Lucide |
| Editor | **CodeMirror 6** con vista previa en vivo de Markdown |
| Grafo | **Sigma.js + graphology** (WebGL), ForceAtlas2 en Web Worker · 3D opcional con three.js |
| Auth | **Better Auth** (biblioteca autoalojada): sesiones seguras, **2FA TOTP obligatorio para el dueño**, rate limiting; passkeys más adelante |
| Jobs | Worker con cola sobre PostgreSQL + cron (avisos, vencimientos, backups, chequeos) |
| Mail | **Brevo** (transaccional) |
| Push | Web Push (PWA) |
| MCP | SDK oficial de MCP en TypeScript, dentro del backend |
| Tests | Unitarios (dinero, permisos, enlaces) + end-to-end con **Playwright** en 390 px y 1440 px |

## D2. Servidor y costos (decisión)

**Presupuesto de Luciano**: hasta **US$ 15/mes** (dispuesto a invertir algo más si se justifica). El **dominio se compra al momento de publicar**.

Su plan actual (Business Web Hosting) **admite apps Node.js**, pero **no conviene para AGENCYOS**:
- Las apps se **apagan después de un rato sin tráfico** y la primera apertura tarda en despertar.
- Ofrece MySQL, no PostgreSQL.
- Comparte CPU y RAM con los sitios de sus clientes.

Se mantiene para los sitios WordPress.

**Opciones** (precios de lista de Hostinger a noviembre de 2026, en USD, **sin los impuestos argentinos** que se suman al pagar servicios del exterior con tarjeta):

| Opción | Recursos | Precio | Veredicto |
|---|---|---|---|
| **Hostinger VPS KVM 2** | 2 vCPU · 8 GB RAM · 100 GB NVMe | **US$ 8,99/mes pagando 24 meses por adelantado** (≈ US$ 216 en un pago); renueva a **US$ 14,99/mes** | **Recomendada**: entra en el presupuesto incluso al renovar; alcanza para producción + staging + base de datos + backups con margen para escalar |
| Hostinger VPS KVM 1 | 1 vCPU · 4 GB RAM · 50 GB NVMe | US$ 6,49/mes pagando 24 meses (≈ US$ 156); renueva a US$ 11,99/mes | Alternativa si el pago adelantado tiene que ser menor; más justa para staging + producción |
| Node.js en su Business actual | Compartido | US$ 0 extra | Solo como último recurso (las desventajas de arriba) |
| Servicios gestionados con capa gratuita (hosting de Next.js + Postgres gestionado) | Variable | US$ 0 al inicio | Plan B sin servidor: cero mantenimiento, pero con límites y más dependencia de terceros |

Notas:
- Los precios bajos de Hostinger son **promocionales y exigen pagar el período completo por adelantado**. Pagando mes a mes, el VPS es bastante más caro.
- **Elegir el datacenter de São Paulo (Brasil)**, el más cercano a Buenos Aires.
- Hetzner y otros VPS europeos se descartan: subieron varias veces sus precios en 2026, tienen disponibilidad irregular y quedan lejos.
- **Momento de compra**: cuando termine la Fase 0 y haya que publicar (junto con el dominio). Hasta entonces, el desarrollo se hace en el entorno de Claude Code.

## D3. Infraestructura
- **VPS Linux** (Ubuntu LTS) con **Docker Compose**: `app` · `worker` · `postgres` · **Caddy** (HTTPS automático).
- Entornos **staging** y **production** en el mismo VPS.
- **GitHub** (repositorio privado) + **GitHub Actions**: tests → build → despliegue con un push. **Luciano nunca sube nada a mano.**
- **Backups**: `pg_dump` diario + adjuntos, copia fuera del servidor, retención de 30 días y **prueba de restauración mensual automatizada**.
- Endurecimiento: firewall, solo SSH con clave, actualizaciones de seguridad automáticas y fail2ban.
- **Dominio**: se compra al publicar. Hace falta para HTTPS, PWA, push y passkeys.

## D4. Repositorio
```
agencyos/
├─ CLAUDE.md
├─ docs/
│  ├─ CONTEXTO.md            ← este documento
│  ├─ referencias/           ← las 4 vistas PNG
│  ├─ ESTADO.md              ← hecho / en curso / siguiente
│  ├─ DECISIONES.md          ← decisiones técnicas con fecha
│  └─ PENDIENTES-LUCIANO.md
├─ src/
│  ├─ app/                   ← rutas y pantallas
│  ├─ modules/<modulo>/      ← dominio, servidor y UI de cada módulo
│  ├─ core/                  ← auth, permisos, enlaces, búsqueda, papelera, auditoría
│  ├─ ui/                    ← design system (tokens, componentes)
│  └─ mcp/
├─ db/migrations/
├─ tests/ (unit, e2e)
└─ infra/ (docker, caddy, backups, ci)
```

## D5. Modelo de datos (núcleo)

Todas las tablas llevan `workspace_id` (multi-inquilino desde el día uno), `created_at`, `updated_at`, `archived_at`, `deleted_at` y `created_by`.

```
Workspace ─┬─ User (owner | collaborator | client) + 2FA
           ├─ Space
           ├─ Client ─ ClientFiscalHolder (razón social, condición IVA; sin secretos)
           ├─ Person ─ PersonLink (rol)
           ├─ Project (space, client?, template, status, goal, next_action, dates)
           │    ├─ Phase · Decision · Blocker
           ├─ Task (project?, space, priority, due, recurrence, assignee, parent?)
           ├─ InboxItem
           ├─ Note (markdown, frontmatter jsonb, folder?) + NoteVersion
           ├─ Link (from_type, from_id, to_type, to_id, kind: wikilink|mention|belongs|tag)
           ├─ Tag + Tagging · Attachment · Template
           ├─ Finance: Account, Transaction, Category, Subscription, Receivable,
           │           Payable, Quote(+QuoteItem), PaymentReceipt
           ├─ Service
           ├─ Course ─ Assessment
           ├─ Asset: Site, Domain, Hosting, Certificate, CredentialRef
           ├─ OwnProduct ─ OwnProductVersion ─ Installation
           ├─ GraphLayout · Notification · ActivityLog · AuditLog · ApiToken
```

**`Link`** es el corazón del Cerebro: cualquier cosa se enlaza con cualquier otra.

## D6. Seguridad
- **2FA obligatorio** para el dueño; recuperación **solo** hacia lucianorosanott@gmail.com.
- Argon2id; cookies `HttpOnly`, `Secure` y `SameSite`; protección CSRF; rate limiting con bloqueo progresivo.
- Cabeceras de seguridad (CSP, HSTS…).
- **Sin credenciales de terceros** (solo referencias a Bitwarden).
- Datos sensibles de clientes ocultos por defecto.
- Tokens de MCP revocables y con alcance limitado.
- Auditoría de login, exportaciones, borrados y permisos.
- Secretos solo en variables de entorno.
- Backups cifrados; revisión de dependencias en la CI.

## D7. Escalabilidad y venta futura
- `workspace_id` en todo.
- **Módulos con interruptor** por workspace (base para planes de venta).
- Textos centralizados (i18n preparado).
- Nada "hardcodeado" de Luciano: todo es dato o configuración.
- Paginación y listas virtualizadas; índices pensados para decenas de miles de notas y tareas.
- API interna documentada (OpenAPI).

## D8. Fases y criterios de "terminado"

Cada fase se entrega **completa, probada en celular y desktop y desplegada** antes de pasar a la siguiente.

| Fase | Contenido | Terminado cuando… |
|---|---|---|
| **0. Cimientos** | Repositorio, `CLAUDE.md`, docs, CI/CD, Docker, design system (tokens, componentes, claro/oscuro), auth con 2FA, layout celular/desktop, PWA | Entra con 2FA desde el celular y la PC; un push despliega a staging; tests verdes |
| **1. Núcleo productivo** | Espacios, Clientes, Personas, Proyectos (plantillas + asistente), Tareas, Bandeja, **Hoy**, `Ctrl+K`, búsqueda, papelera/archivo, carga inicial (D9) | Organiza todos sus proyectos reales y "Hoy" le dice qué hacer |
| **2. Conocimiento** | Notas completas, **Cerebro** (2D, grafo local, filtros, línea de tiempo, panel lateral, versión celular), **importación de Obsidian** verificada, exportación | Todo el vault está adentro con sus enlaces y deja de abrir Obsidian |
| **3. Dinero y tiempo** | Finanzas, Calendario, Facultad (vacía, la carga él), Modo foco, revisión semanal | Ve gastos, suscripciones, por cobrar y por pagar, y "Ponerse al día" incluye el dinero |
| **4. Agencia técnica** | Activos técnicos, productos propios e instalaciones, Servicios, presupuestos en PDF, chequeos automáticos | Cada sitio de cliente está inventariado con vencimientos y avisos |
| **5. IA** | Servidor MCP, captura desde Claude, revisión semanal asistida | Claude lee y escribe en AGENCYOS desde cualquier sesión |
| **6. Equipo y clientes** | Colaboradores, portal de cliente, preparación para la venta | Un tercero entra y ve solo lo suyo, prolijo |

## D9. Datos iniciales (Fase 1)

**Espacios**: Agencia · Personal · Facultad (vacío).

**Clientes y proyectos**: los de la tabla A4.
- Parinama queda como cliente **terminado**.
- El clon de LibreríaOS para Sofía queda **sin siguiente acción** (para que aparezca en "Ponerse al día").

**Proyectos personales**: AGENCYOS · SEÑAL · Ciberseguridad (UTN) · Pasantía UNGS · Importación desde China · Libros-PDF de estudio · Ecosistema Claude.

**Vencimientos**: exportar los diseños de Claude Design antes del 14/12/2026 · certificado de producción de ARCA de Librería Uno el 27/10/2028.

**Suscripciones**: Claude, Hostinger, dominios y VPS cuando se compre. **Los montos y fechas los completa Luciano.**

**Facultad**: no se precarga.

---

# PARTE E — Instrucciones para Claude Code

## E1. Arranque
1. Leer este documento completo y mirar las 4 vistas de referencia.
2. **Antes de escribir código**, pasarle a Luciano **una sola lista** con lo que falte para la Fase 0. Como mínimo:
   - confirmar la cuenta de GitHub para el repositorio privado;
   - confirmar KVM 2 vs. KVM 1 al momento de publicar;
   - cuenta de Brevo (puede quedar para la Fase 3).
3. Crear `CLAUDE.md` (E2) y los docs del repositorio.
4. Construir por fases (D8). Al cerrar cada una, entregar capturas en celular (390 px) y desktop (1440 px), lo que él tiene que probar y `PENDIENTES-LUCIANO.md` actualizado.

## E2. `CLAUDE.md` del repositorio (semilla)
```markdown
# AGENCYOS — reglas para Claude
Dueño: Luciano Rosano (lucianorosanott@gmail.com). Interfaz y docs en español rioplatense.
Luciano es dueño de producto, no mantiene el código: vos sí.

## Cómo trabajar
- Antes de cada fase: una sola lista con todas las preguntas. Esperar respuestas.
- Durante la ejecución autorizada: sin narración. Verificar todo antes de decir "listo".
- Nada irreversible (producción, borrar datos, migraciones destructivas) sin su OK explícito → audit_log.
- Al cerrar cada sesión: actualizar docs/ESTADO.md y docs/PENDIENTES-LUCIANO.md.
- Commits chicos y frecuentes; tareas reanudables (puede quedarse sin uso a mitad de camino).
- No romper funciones existentes. Tests verdes antes de desplegar.
- Nunca commitear secretos. Nada de contraseñas de terceros: solo referencias a Bitwarden.

## Calidad
- Seguir docs/CONTEXTO.md (identidad, tokens, UX) y docs/referencias/*.png.
- Probar cada pantalla con Playwright en 390 px y 1440 px, en modo oscuro y claro, y mirar las capturas.
- Sin scroll horizontal en el celular; inputs ≥ 16 px; zonas táctiles ≥ 44 px.
- Rendimiento: JS inicial mínimo por ruta; sin blur en elementos repetidos; Cerebro en WebGL + Worker.
- Zona horaria America/Buenos_Aires en todas las capas. ARS/USD. Fechas dd/mm/aaaa.

## Stack
Next.js + TypeScript · PostgreSQL + Drizzle · Tailwind + Radix/shadcn · CodeMirror 6 · Sigma.js · Docker Compose + Caddy · GitHub Actions · Brevo · MCP SDK

## Comandos
(completar en la Fase 0: dev, test, e2e, migrate, deploy:staging, deploy:prod)
```

## E3. Lo que no se hace
- Entregar algo "casi listo" o dejar cosas en modo prueba.
- Narrar durante la ejecución o hacer preguntas sueltas de a una.
- Sumar herramientas por moda.
- Diseñar para usuarios técnicos: los colaboradores y los clientes no lo son.
- Suponer datos (montos, fechas, mails, CUIT): siempre preguntar en la lista previa.

---

# Anexo — Lecciones técnicas de sus proyectos (para integraciones futuras)

**ARCA**
- No navegar directo a RCEL (da 403): se entra por el portal, que abre una pestaña nueva con token.
- Las sesiones duran 10–15 minutos.
- Desde el entorno de Claude no se llega a los servidores de ARCA: las pruebas reales se hacen desde staging.
- Emitir la factura **el mismo día** en que se completa el pedido.
- Reintentar en lugar de abortar; mover lo facturado a un registro aparte en vez de borrarlo.

**WordPress / WooCommerce / Hostinger**
- Leer el sitio en vivo antes de construir.
- `wp_update_custom_css` reemplaza toda la hoja de estilos.
- La caché de LiteSpeed puede ocultar meta tags a Google: comparar con una respuesta sin caché.
- Los filtros de categoría que son solo CSS no los ven los buscadores.
- El plugin de Correo Argentino no tiene endpoint REST para etiquetas.
- Purgar la caché después de desplegar CSS.

**Paneles propios**
- Fijar la misma zona horaria en PHP/Node y en la base de datos.
- Los procesos batch tienen que ser idempotentes.
- Rate limiting guardado en la base de datos.
- `navigator.sendBeacon` para eventos detrás de caché.
- Credenciales fuera de las entregas.

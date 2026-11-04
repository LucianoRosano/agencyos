# 02 · Especificación funcional

Convenciones de este documento:
- **[MVP]** forma parte del MVP (ver `11-mvp.md`). **[F2]**, **[F3]**… indican la fase posterior (ver `10-roadmap.md`).
- **Eventos** son los eventos de dominio que emite el módulo. Los consumen las automatizaciones, las notificaciones, la actividad y el Cerebro.
- **Permisos** usa los roles de `08-seguridad.md`: `owner`, `admin`, `member`, `client`.
- En todos los módulos aplican las reglas transversales de la sección N.

---

## N. Núcleo (transversal) [MVP]

### N1. Cuenta y sesión
- Login con email y contraseña + **2FA TOTP obligatorio para el owner**, con códigos de respaldo. Passkeys en la [F4].
- Recuperación de contraseña **solo** hacia el email del owner, con confirmación por 2FA.
- Sesiones listables y revocables ("cerrar las demás sesiones").

### N2. Workspace y Espacios
- Un **Workspace** (la agencia) contiene todo. Multi-workspace está preparado pero oculto hasta la [F6].
- **Espacios**: Agencia, Personal y Facultad vienen creados; el usuario puede crear, renombrar, ordenar y archivar los suyos.
- Todo objeto principal (cliente, proyecto, tarea, nota, movimiento, recurso) pertenece a un espacio.
- Selector global "Todos / un espacio" que filtra listas, Hoy y el Cerebro. La elección persiste por usuario.

### N3. Paleta de comandos (`Ctrl/Cmd + K`) y búsqueda global
- Busca en clientes, contactos, proyectos, tareas, presupuestos, notas, sitios, repositorios y recursos, con resultados agrupados por tipo.
- Desde la paleta se puede **crear** cualquier entidad ("nuevo presupuesto para…"), **navegar** y **ejecutar acciones** (completar tarea, cambiar estado, capturar).
- Búsqueda tolerante a tildes y a errores leves (PostgreSQL FTS en español + `pg_trgm`).
- Respuesta < 150 ms con 50.000 objetos.

### N4. Bandeja (captura rápida)
- Se captura desde el botón "+", la tecla `C`, la paleta o MCP.
- Texto libre y tipo opcional: tarea, nota, idea, gasto o link.
- **Procesar Bandeja**: modo uno por uno, para convertir, asignar espacio/proyecto/cliente, programar o descartar.

### N5. Enlaces universales
- Cualquier entidad se puede vincular con cualquier otra (tabla `link`).
- Las menciones `@cliente`, `#proyecto` y `[[Nota]]` en textos Markdown generan enlaces automáticamente.
- Cada ficha muestra **"Conectado con"** (enlaces + backlinks).

### N6. Etiquetas
- Etiquetas compartidas por workspace, con color de una paleta fija. Filtrables en todas las listas.

### N7. Archivo y papelera
- **Archivar** saca el objeto de las vistas normales sin borrarlo.
- **Eliminar** lo manda a la papelera 30 días; restaurable. Pasado ese plazo, un job lo purga.
- Eliminar un cliente con proyectos pide decidir: archivar todo o reasignar.
- Toda eliminación muestra **"Deshacer"** durante 8 segundos y además pide confirmación.

### N8. Actividad y auditoría
- **Actividad**: línea de tiempo por entidad y global (quién hizo qué y cuándo, incluidos los agentes).
- **Auditoría**: registro inmutable de acciones sensibles (ver `08-seguridad.md`).

### N9. Notificaciones
- Canales: dentro de la app (campana), **Web Push** (PWA) y email (Brevo).
- Preferencias por tipo de evento y canal.
- Resumen diario opcional (por defecto a las 8:00 ART).

### N10. Comentarios internos
- Hilo de comentarios en proyectos, tareas, presupuestos, sitios y recursos, con menciones a usuarios.

### N11. Vistas guardadas
- Toda lista con filtros y orden permite **guardar la vista**, que aparece como acceso directo.

---

## M01. Dashboard: "Hoy" y "Negocio" [MVP]

**Objetivo:** responder en 10 segundos "qué hago ahora, qué se me está pasando y cómo va el negocio".

### Pestaña "Hoy" (por defecto)
La diseñó y aprobó Luciano; ver `contexto/referencias/AGENCYOS-vista-hoy-*.png`. Bloques:

1. **Saludo, fecha y píldoras de estado**: para hoy · vencidas · pagos por vencer · en la Bandeja.
2. **Foco de hoy**: hasta 3 tareas elegidas. Si no hay ninguna elegida, el sistema sugiere 3 en este orden:
   1. tareas vencidas P1/P2;
   2. tareas que vencen hoy, por prioridad;
   3. la siguiente acción de los proyectos en curso con la fecha objetivo más cercana.

   Las sugerencias se muestran como tales y se aceptan con un toque.
3. **Ponerse al día** (feed unificado y priorizado):
   - tareas vencidas;
   - pagos por hacer (vencidos o en los próximos 7 días);
   - cobros pendientes vencidos;
   - presupuestos enviados sin respuesta hace más de 7 días;
   - renovaciones (dominio, hosting, suscripción, certificado) en los próximos 30 días;
   - proyectos en curso **sin siguiente acción** o **sin actividad hace más de 14 días**;
   - oportunidades del CRM con la próxima acción vencida;
   - sitios caídos o auditorías con regresión;
   - repositorios fuera de estándar;
   - Bandeja sin procesar;
   - propuestas de agentes esperando aprobación.

   Cada ítem tiene una **acción primaria inline** (Hecho, Posponer, Registrar pago, Definir, Aprobar…).
4. **Próximos 7 días**: agenda unificada.
5. **Dinero del mes** (resumen; el detalle está en Negocio).
6. **Facultad**: próxima evaluación y avance por materia. Solo aparece si hay materias cargadas.
7. **Notas recientes** + mini-Cerebro.
8. **Proyectos activos** (los frenados se ven atenuados).

Los bloques se pueden ocultar y reordenar.

### Pestaña "Negocio"
KPIs calculados **solo con datos reales**, con rango seleccionable (mes, trimestre, año, personalizado) y comparación contra el período anterior:
- Clientes activos · proyectos en curso (por estado) · tareas pendientes y vencidas.
- Presupuestos enviados, aceptados y rechazados; **tasa de aceptación**; monto aceptado (ARS/USD).
- Ingresos y gastos; resultado; por cobrar; por pagar.
- **Pipeline del CRM**: valor ponderado por etapa.
- Rentabilidad top 5 por cliente y por proyecto.
- Próximos vencimientos (30 días).
- Actividad reciente (últimos 20 eventos).
- Costo de IA del mes (desde la [F5]).

**Reglas:** sin datos suficientes, cada KPI muestra un estado vacío con la acción que lo habilita ("Registrá tu primer ingreso"). Nunca se muestran ceros engañosos ni datos inventados.

---

## M02. CRM [MVP]

**Objetivo:** registrar clientes y prospectos, sus contactos e interacciones, y hacer seguimiento comercial.

### Entidades
- **Cliente/Empresa**: nombre, nombre comercial, rubro, sitio web, ciudad/provincia, relación (familia · referido · externo), estado (**prospecto · activo · en pausa · terminado · archivado**), origen (referido, Instagram, web, etc.), espacio, etiquetas, notas internas (Markdown) y **titulares fiscales del cliente** (razón social, CUIT, condición de IVA; ocultos por defecto).
- **Contacto**: nombre, rol, email, teléfono/WhatsApp, cliente(s) asociados, contacto principal, notas.
- **Interacción** (historial de conversaciones): tipo (WhatsApp, llamada, email, reunión, mensaje, nota), fecha y hora, contacto, resumen en Markdown, adjuntos, próximo paso opcional.
- **Oportunidad**: título, cliente, servicios de interés, valor estimado (ARS/USD), probabilidad, etapa, fecha estimada de cierre, **próxima acción + fecha** y motivo de pérdida.

### Pipeline (etapas fijas en el MVP; editables en la [F3])
`nuevo → contactado → reunión → propuesta enviada → negociación → ganada | perdida`

- Pasar a **propuesta enviada** pide vincular un presupuesto (o crearlo).
- **Ganada** ofrece crear el proyecto (con plantilla) y el plan de cobro desde el presupuesto aceptado.
- **Perdida** exige un motivo (precio, tiempo, eligió otro, sin respuesta, otro).

### Funciones
- Ficha 360° del cliente: contactos, interacciones, oportunidades, proyectos, presupuestos, dinero (cobrado, por cobrar, rentabilidad), sitios, repositorios, recursos, notas y actividad.
- Vista kanban del pipeline y vista tabla.
- Recordatorios: la próxima acción vencida aparece en "Hoy".
- Registro rápido de una interacción desde la ficha o desde la paleta ("registrar llamada con…").
- **[F4]** Importar un chat exportado de WhatsApp (.txt) como interacciones.
- **[F4]** Integración con Gmail para registrar emails.

**Eventos:** `cliente.creado`, `cliente.estado_cambiado`, `interaccion.registrada`, `oportunidad.etapa_cambiada`, `oportunidad.ganada`, `oportunidad.perdida`.

**Validaciones:** nombre obligatorio; email y teléfono con formato válido; CUIT con dígito verificador válido cuando se carga.

**Aceptación:** crear un cliente con contacto y oportunidad, moverla por el pipeline hasta "ganada" y obtener el proyecto creado, todo en menos de 3 minutos y sin salir del flujo.

---

## M03. Proyectos y tareas [MVP]

### Proyecto
- **Campos:** nombre, espacio, cliente (opcional), tipo (sitio web, tienda online, panel/plugin, SEO, mantenimiento, personal, facultad, otro), objetivo en una frase, **definición de terminado**, estado, prioridad, fechas (inicio, objetivo, entrega real), **siguiente acción** (obligatoria si está en curso), responsable, presupuesto vinculado, sitio vinculado, repositorios vinculados y etiquetas.
- **Estados:** `idea · planificación · en curso · en pausa · bloqueado · terminado · archivado`.
- **Etapas (fases):** lista ordenada propia de cada proyecto, que viene de la plantilla. Cada etapa tiene estado y fecha. El progreso del proyecto se calcula con las tareas completadas por etapa, ponderadas por igual.
- **Bloqueos:** "esperando a X" + fecha para volver a revisar; aparecen en "Hoy" en esa fecha.
- **Registro de decisiones:** qué, por qué, fecha, quién aprobó y enlaces.
- **Registro de cambios (changelog):** automático (cambios de estado, etapa, fechas y alcance) y manual (entradas de versión o entrega).
- **Archivos y documentación:** recursos de la Biblioteca vinculados + notas del proyecto.
- **Entregas:** hitos con fecha, contenido, estado (pendiente · entregada · aprobada · con cambios) y aprobación del cliente (manual en el MVP; vía portal en la [F6]).

### Plantillas de proyecto [MVP]
Plantillas editables que generan etapas, tareas (con fechas relativas), checklist, nota inicial con preguntas guía y lista de preguntas al cliente. Iniciales:
1. Sitio institucional (WordPress)
2. Tienda online (WooCommerce)
3. Panel o plugin propio
4. Auditoría y mejora SEO
5. Mantenimiento mensual (recurrente)
6. Proyecto personal de aprendizaje
7. Materia de la facultad
8. En blanco

Un proyecto existente se puede **guardar como plantilla**.

**Asistente de arranque** (5 pasos, menos de 2 minutos): plantilla → cliente o personal → definición de terminado → fecha objetivo → primera acción.

### Tarea
- **Campos:** título, descripción en Markdown, proyecto/etapa (opcional), espacio, prioridad P1–P4, fecha y hora de vencimiento, **recurrencia** (RRULE), subtareas (un nivel), estimación opcional, responsable (usuario, "Claude" o cliente), etiquetas y checklist.
- **Estados:** `por hacer · en curso · esperando · hecha · cancelada`.
- **Vistas:** Hoy, Próximas, Por proyecto, Sin fecha, Completadas; lista, kanban y calendario.
- **Celular:** deslizar a la derecha completa, a la izquierda pospone.
- **Conversiones:** tarea → proyecto; línea de una nota → tarea.
- **Modo foco:** una tarea en pantalla, temporizador opcional (25/50 min), notas al costado y registro del tiempo enfocado.

### Revisión semanal [F3]
Asistente guiado:
1. Vaciar la Bandeja.
2. Revisar proyectos sin siguiente acción.
3. Revisar Ponerse al día.
4. Revisar el dinero.
5. Elegir los focos de la semana.

Genera una nota "Revisión S##".

**Eventos:** `proyecto.creado`, `proyecto.estado_cambiado`, `proyecto.frenado` (job diario), `tarea.creada`, `tarea.completada`, `tarea.vencida` (job), `entrega.aprobada`.

**Aceptación:** con la plantilla "Tienda online", el proyecto se crea con sus etapas y tareas fechadas y la primera acción aparece en "Hoy".

---

## M04. Presupuestos, propuestas y servicios [MVP]

### Catálogo de servicios
- Nombre, descripción (Markdown), entregables, unidad (proyecto, hora, mes, página, producto), precio de referencia en ARS y/o USD, plantilla de proyecto asociada y activo/inactivo.
- **Arranca vacío**: los precios los define Luciano.

### Presupuesto
- **Numeración:** `P-AAAA-NNNN`, correlativa por workspace.
- **Cabecera:** cliente, contacto, oportunidad, título, moneda (**ARS o USD**; una por presupuesto), tipo de cambio de referencia opcional (manual), fecha, **validez** (por defecto 15 días), condiciones de pago y notas.
- **Ítems:** servicio del catálogo o ítem libre, descripción, cantidad, precio unitario y **descuento por ítem** (% o monto).
- **Descuento global** (% o monto). Totales calculados en el servidor. Sin líneas de IVA por defecto (Luciano no está inscripto); el texto aclara "Precios finales".
- **Plan de cobro:** pago único, % por etapas (por ejemplo 50/50) o abono mensual (monto + cantidad de meses o indefinido).
- **Plantillas de presupuesto:** textos de introducción, alcance, exclusiones, plazos, condiciones y cierre; ítems precargados. Editables.
- **Versiones:** cada edición posterior al envío crea una **nueva versión** (v1, v2…). Las anteriores quedan de solo lectura y se pueden comparar (diff de ítems y totales).
- **Estados:** `borrador → enviado → visto → aceptado | rechazado | vencido | anulado`.
  - "Vencido" lo marca un job diario cuando pasa la validez.
  - "Visto" se registra con el enlace público ([F2]).
- **Exportar a PDF** con la identidad de AGENCYOS (en la [F3], con la identidad de la agencia cuando exista), generado en el servidor con Chromium.
- **Enviar:** en el MVP, descargar el PDF y copiar el texto para WhatsApp/email. En la [F2], envío por email (Brevo) con **enlace público** firmado (token, vencimiento) donde el cliente ve, acepta o rechaza; se registra nombre, fecha/hora e IP.
- **Al aceptar:** se ofrece crear el proyecto (plantilla del servicio principal), crear los **cobros pendientes** según el plan y marcar la oportunidad como ganada.

**Validaciones:**
- Al menos 1 ítem; precios ≥ 0; un descuento no puede superar el subtotal.
- Moneda obligatoria; validez ≥ hoy al enviar.
- Un presupuesto enviado no se edita: se versiona.

**Eventos:** `presupuesto.creado`, `presupuesto.enviado`, `presupuesto.visto`, `presupuesto.aceptado`, `presupuesto.rechazado`, `presupuesto.vencido`.

**Aceptación:** armar un presupuesto de 3 ítems con descuento, exportar el PDF prolijo, aceptarlo y obtener el proyecto y los 2 cobros (50/50) creados.

---

## M05. Gestión financiera [MVP básico · F3 completo]

**Sin facturación fiscal.**

### Configuración
- **Monedas:** ARS (por defecto) y USD; otras se pueden activar.
- **Libros:** Agencia y Personal (por espacio), más una vista combinada.

### Entidades
- **Cuenta:** efectivo, banco, Mercado Pago, USD, etc.; con saldo inicial.
- **Movimiento:** ingreso, gasto o transferencia entre cuentas. Fecha, monto, moneda, **tipo de cambio** (manual, opcional; obligatorio para convertir en reportes), categoría, cuenta, cliente, proyecto, comprobante adjunto y nota.
- **Categorías:** jerárquicas, con un set inicial (Ingresos: desarrollo web, tiendas, mantenimiento, SEO, otros; Gastos: hosting, dominios, herramientas/SaaS, IA, hardware, publicidad, formación, otros).
- **Suscripción / gasto recurrente:** proveedor, monto, moneda, frecuencia, próxima fecha, cuenta, aviso N días antes y estado. Al pagar, se registra el movimiento y avanza la fecha.
- **Cobro pendiente (por cobrar):** viene de un presupuesto aceptado o se crea a mano. Cliente, proyecto, concepto, monto, moneda, vencimiento y estado (`pendiente · parcial · cobrado · vencido · anulado`). Registrar el cobro genera el movimiento.
- **Pago pendiente (por pagar):** proveedor/acreedor, concepto, monto, vencimiento y estado.
- **Constancia de pago interna:** PDF con la leyenda **"Documento no válido como factura"**.

### Reportes [F3]
- Mensual: ingresos, gastos y resultado por libro y por categoría.
- Rentabilidad **por proyecto** y **por cliente** (cobrado − gastos asignados; con horas opcionales a una tarifa configurable).
- Evolución de 12 meses.
- Exportación CSV/XLSX y PDF.
- **Conversión:** si la moneda de un movimiento difiere de la del reporte y no tiene tipo de cambio, el reporte lo muestra separado y avisa. Nunca convierte con tasas inventadas.

**MVP incluye:** cuentas, movimientos, categorías, suscripciones, por cobrar/por pagar, "Ponerse al día" y resumen del mes.
**F3 agrega:** reportes completos, rentabilidad, constancias y exportaciones.

**Eventos:** `movimiento.registrado`, `suscripcion.por_vencer`, `cobro.vencido`, `cobro.registrado`, `pago.vencido`.

---

## M06. Website Factory [F2]

**Objetivo:** estandarizar la producción de sitios para clientes, desde el briefing hasta la documentación técnica, y dejarlo preparado para generar sitios con IA más adelante.

### Entidad principal: Sitio (proyecto web)
Vinculado a cliente y proyecto.
- **Tipo:** institucional, landing, tienda WooCommerce, catálogo, mayorista B2B, blog, app/panel a medida.
- **Stack:** WordPress + Kadence, WooCommerce, PHP propio, Next.js u otro.
- **Entornos:** producción y staging (URL, hosting, panel, versión de PHP).

### Pestañas del sitio
1. **Briefing:** formulario estructurado según el tipo de sitio:
   - objetivos;
   - público;
   - competencia y referencias;
   - identidad visual (colores, tipografías, logo; desde la Biblioteca);
   - tono;
   - funcionalidades requeridas;
   - medios de pago y envío;
   - integraciones (ARCA, Correo Argentino, Andreani, Mercado Pago, GA4, Meta);
   - legales (botón de arrepentimiento, Data Fiscal);
   - contenidos que aporta el cliente;
   - plazos.

   Exporta un PDF del briefing y una **lista única de preguntas al cliente**.
2. **Requerimientos:** lista priorizada (MoSCoW) con criterio de aceptación por requerimiento.
3. **Estructura (Blueprint):** árbol de páginas → secciones → **slots de contenido** (título, texto, imagen, CTA, producto, formulario).
   - Se puede generar desde una **plantilla de estructura** según el tipo de sitio.
   - Se guarda como JSON versionado (`site_blueprint`), **independiente de la tecnología**. Esa es la base para generarlo con IA en la [F5+].
4. **Contenidos:** cada slot tiene estado (`pendiente · borrador · en revisión · aprobado · publicado`), responsable (Luciano, cliente, Content Agent), texto en Markdown y recursos vinculados. Vista de progreso por página.
5. **Recursos:** archivos del sitio desde la Biblioteca (logos, fotos, textos del cliente).
6. **Revisiones:** rondas (R1, R2…), cada una con ítems de feedback (página, descripción, captura, prioridad, estado, responsable). Cerrar una ronda exige resolver o posponer cada ítem.
7. **Dominio y hosting:**
   - **Dominio:** registrador, titular, vencimiento, DNS (referencia), renovación automática sí/no.
   - **Hosting:** proveedor, plan, vencimiento, ubicación.
   - **SSL:** emisor y vencimiento (se lee automáticamente con un chequeo TLS).
   - Las credenciales son **solo referencias a Bitwarden**.
8. **Publicación:** checklist de lanzamiento (plantilla basada en el checklist de 17 áreas de Librería Uno: SEO técnico, medición, seguridad, rendimiento, WooCommerce, pagos/ARCA, envíos, diseño, accesibilidad, legales, mails, backups, hosting/dominio, SEO de contenido, marketing, pruebas, mantenimiento). Cada ítem tiene responsable, estado y evidencia. El estado de publicación es `en construcción → staging → listo para publicar → publicado → en mantenimiento`.
9. **Documentación técnica:** nota Markdown viva (stack, plugins, snippets, configuraciones, decisiones, procedimientos de backup/restauración, contactos), versiones de plugins/productos propios instalados (desde Activos), repositorios vinculados y registro de cambios.
10. **Monitoreo [F4]:**
    - uptime (chequeo HTTP cada 5 min);
    - vencimiento de SSL y dominio;
    - versión de WordPress/PHP/plugins (vía REST API del sitio con Application Password, guardada cifrada como token de integración);
    - último backup;
    - alertas a "Hoy" y push.

### Preparación para IA [F5]
El **Web Architect Agent** propone el blueprint a partir del briefing; el **Content Agent** completa slots como borradores; el **QA Agent** valida el staging. Más adelante habrá un exportador del blueprint a WordPress (páginas y bloques) mediante la REST API.

**Eventos:** `sitio.creado`, `sitio.estado_publicacion_cambiado`, `revision.ronda_cerrada`, `dominio.por_vencer`, `ssl.por_vencer`, `sitio.caido`, `sitio.recuperado`.

---

## M07. SEO Auditor [F4]

**Objetivo:** auditar sitios con datos **reales** y comparar auditorías en el tiempo. No se simulan resultados.

### Fuentes
| Fuente | Qué aporta | Requiere |
|---|---|---|
| **Crawler propio** (worker Node) | HTML, estado HTTP, redirecciones, títulos, meta descriptions, encabezados, canonicals, hreflang, `noindex`, enlaces internos/externos, imágenes sin alt, tamaño de página, datos estructurados (JSON-LD), Open Graph | Nada |
| **robots.txt y sitemap.xml** | Validación, URLs del sitemap vs. rastreadas, URLs bloqueadas | Nada |
| **Chequeo de enlaces rotos** | 4xx/5xx de enlaces internos y externos (HEAD con fallback a GET) | Nada |
| **PageSpeed Insights API** | Lighthouse (rendimiento, accesibilidad, buenas prácticas, SEO) en mobile y desktop para URLs elegidas | API key gratuita de Google |
| **CrUX API** | Core Web Vitals de usuarios reales (LCP, INP, CLS) por URL u origen, **solo si hay datos** | La misma API key |
| **Google Search Console API** [F5] | Indexación, consultas, clics, impresiones | OAuth de Google + la propiedad verificada |

### Funciones
- **Nueva auditoría:** URL raíz, límite de páginas (por defecto 300, máximo 2.000), profundidad, respetar robots.txt (siempre), user-agent `AGENCYOS-SEO-Auditor/1.0 (+contacto)`, concurrencia 4 y retardo entre pedidos.
- **Resultados por categoría** (Indexación, Contenido, Enlaces, Rendimiento, Datos estructurados, Social, Seguridad básica: HTTPS y mixed content), con **severidad** (crítico, alto, medio, bajo), URLs afectadas, explicación y cómo corregirlo.
- **Puntaje propio** transparente (fórmula documentada en la auditoría) y puntajes de Lighthouse tal como los devuelve Google.
- **Core Web Vitals:** si CrUX no tiene datos, se dice explícitamente ("sin datos de campo suficientes") y se muestran solo los datos de laboratorio, aclarado como tal.
- **Comparación** entre dos auditorías del mismo sitio: problemas nuevos, resueltos y persistentes, y deltas de puntaje.
- **Informe descargable** en PDF (identidad AGENCYOS o de la agencia) y CSV de problemas.
- **Auditorías programadas** (por ejemplo, mensual por sitio en mantenimiento).
- **Tareas desde problemas:** convertir un problema o grupo en tareas del proyecto del sitio.
- **SEO Agent** [F5]: resume y prioriza a partir de los datos reales.

### Reglas
- Solo dominios públicos con http/https. **Protección SSRF** (ver `08-seguridad.md`).
- Rate limiting por dominio.
- Quotas de las APIs de Google: control y aviso al acercarse al límite.

**Eventos:** `auditoria.iniciada`, `auditoria.completada`, `auditoria.fallida`, `auditoria.regresion_detectada`.

---

## M08. Biblioteca de recursos [F2]

- **Recurso:** archivo (imagen, logo, documento, PDF, video corto, ZIP, fuente) o enlace externo.
  - **Metadatos:** nombre, tipo, tamaño, dimensiones, cliente, proyecto, sitio, carpeta, etiquetas, descripción, versión y origen (subido, generado, importado).
- **Organización:** por cliente → proyecto → carpetas libres; las vistas inteligentes ("Logos", "Plantillas", "Últimos") se arman con filtros.
- **Versiones:** subir una nueva versión conserva el historial.
- **Previsualización:** imágenes (miniaturas WebP generadas en el worker), PDF (primera página) y texto.
- **Kit de marca por cliente:** logos (variantes), paleta (hex), tipografías y manual. Lo consumen Website Factory y la generación de PDFs.
- **Plantillas reutilizables:** documentos, snippets, prompts (por ejemplo, la biblioteca de 41 prompts de Claude Design de Sofía) y checklists.
- **Seguridad:** validación de tipo real (magic bytes), tamaño máximo por archivo (100 MB) y por workspace (configurable), SVG sanitizado y descarga con URL firmada de vencimiento corto.
- **Almacenamiento:** detrás de una interfaz `StorageAdapter` (disco local del VPS en la v1; compatible con S3 más adelante).

**Eventos:** `recurso.subido`, `recurso.version_nueva`.

---

## M09. Centro de automatizaciones [F4 · algunas automáticas desde el MVP]

### Desde el MVP (internas, sin configuración)
Jobs del sistema:
- tareas vencidas;
- proyectos frenados;
- presupuestos vencidos;
- suscripciones, dominios y cobros por vencer;
- resumen diario;
- purga de la papelera;
- backups.

### F4: reglas configurables
- **Disparador:** un evento de dominio (catálogo en `03-arquitectura.md`) o una programación (cron en lenguaje natural: "todos los lunes 9:00").
- **Condiciones:** constructor simple (campo · operador · valor; Y/O).
- **Acciones:**
  - crear tarea;
  - notificar (app/push/email);
  - enviar email con plantilla (a clientes, **siempre con aprobación** salvo que se marque "automático" explícitamente);
  - generar documento (PDF desde plantilla);
  - cambiar estado;
  - ejecutar un agente ([F5]);
  - **webhook saliente** firmado (HMAC);
  - esperar N días.
- **Plantillas de automatización:**
  - "Presupuesto aceptado → crear proyecto + cobros + tarea de kickoff";
  - "Dominio vence en 30 días → tarea + email al cliente (aprobación)";
  - "Release publicado en GitHub → tarea 'subir zip al cliente'";
  - "Auditoría con regresión → tarea en el proyecto del sitio".
- **Ejecución:** cola (pg-boss) con reintentos exponenciales, idempotencia por (regla, evento), **registro de cada ejecución** (entrada, resultado y error), **modo prueba** y activar/pausar.
- **Integraciones externas:**
  - webhooks entrantes con firma;
  - GitHub (App);
  - Brevo;
  - Google (PSI, CrUX, Search Console);
  - WordPress REST;
  - n8n vía webhooks si Luciano lo adopta.

**Eventos:** `automatizacion.ejecutada`, `automatizacion.fallida`.

---

## M10. AI Command Center [MCP en el MVP · agentes en F5]

Especificación completa en `14-agentes-ia.md`. Resumen:
- **MVP:** **servidor MCP** de AGENCYOS, para que Claude (suscripción de Luciano: Claude Code y claude.ai) lea y escriba con permisos, **sin costo de API**.
- **F5:** agentes internos (Business, Project Manager, Web Architect, Content, SEO, QA, Code Reviewer, Research y **Repo Agent**). Cada uno con responsabilidades, herramientas, permisos, presupuesto, trazabilidad completa y aprobación humana para escribir. Proveedor de modelo configurable por agente.

---

## M11. Repositorios [MVP]

Especificación completa en `15-repositorios.md`. Resumen:
- Conexión con GitHub mediante una **GitHub App** propia (permisos mínimos).
- Inventario sincronizado de repositorios, vinculados a cliente, proyecto, sitio y producto propio.
- **Estándar de repositorio** verificado automáticamente: nombre, topics, descripción, README, CLAUDE.md, .gitignore, licencia/privacidad, CI, escaneo de secretos, última actividad. Cada repositorio tiene un **puntaje de salud**.
- **Plan de organización:** propuestas de cambios (renombrar, topics, descripción, archivos estándar, archivar) que se ejecutan **con aprobación**, con registro.
- Actividad de GitHub (push, PR, release) en la actividad del proyecto y como disparadores de automatizaciones.
- **[F5]** El Repo Agent genera las propuestas con IA (README, descripciones, detección de código muerto).

---

## M12. Conocimiento: Notas y Cerebro [F3]

Especificado en `contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md` (Parte B, Notas y Cerebro), que **se mantiene tal cual**. Puntos clave:
- **Notas en Markdown** con `[[enlaces]]`, alias, encabezados, menciones de entidades, backlinks, frontmatter YAML, carpetas opcionales, plantillas, nota diaria, adjuntos, historial y búsqueda.
- **Importador de Obsidian** verificado (conteo de notas, enlaces y adjuntos) antes de retirar Obsidian. **Exportación** a un vault compatible.
- **Cerebro:** grafo WebGL de **todas** las entidades:
  - constelaciones por cliente o espacio;
  - pulso de actividad; lo frenado o terminado, atenuado;
  - panel lateral con el nodo seleccionado;
  - grafo local, filtros y línea de tiempo;
  - 2D principal y 3D opcional;
  - versión celular con hoja inferior;
  - vista en lista equivalente.

  Ver `contexto/referencias/AGENCYOS-vista-cerebro-*.png`.

---

## M12b. Calendario [F3]

Vista unificada (día, semana, mes y agenda) de todo lo que tiene fecha: tareas, etapas y entregas, evaluaciones, cobros y pagos, suscripciones, renovaciones de dominio/hosting/SSL, próximas acciones del CRM y auditorías programadas. Cada fuente se puede mostrar u ocultar. Exportación iCal de solo lectura (URL con token revocable) para verlo en el celular.

---

## M13. Facultad [F3]

- **Materias:** carrera, cuatrimestre, comisión, docentes (contactos), horarios, estado (cursando, regular, aprobada, final pendiente) y nota final.
- **Evaluaciones:** tipo (parcial, TP, final, recuperatorio), fecha, temas, nota objetivo y nota obtenida.
- **Apuntes:** notas vinculadas a la materia.
- **Plan de estudio:** tareas por tema con fechas hacia la evaluación (desde la plantilla "Materia").
- **Arranca vacío.** Luciano lo configura.

---

## M14. Configuración [MVP]

- **Perfil:** nombre, avatar, email, contraseña, 2FA, sesiones, preferencias (tema claro/oscuro/sistema, densidad, módulos visibles en la barra lateral, bloque inicial de "Hoy").
- **Workspace:** nombre, logo, datos de la agencia (para PDFs), moneda por defecto (ARS), monedas activas, **zona horaria fija America/Buenos_Aires**, formato de fecha `dd/mm/aaaa`, numeración de presupuestos.
- **Usuarios** [F6]: invitar, roles, desactivar.
- **Roles y permisos:** matriz visible (solo lectura en el MVP; editable en la [F6]).
- **Integraciones:** GitHub App, Brevo, Google (API key de PSI/CrUX; OAuth de Search Console), proveedores de IA (claves + presupuesto mensual), tokens de MCP (crear, ver alcance, revocar) y webhooks.
- **Módulos:** activar o desactivar por workspace.
- **Registro de actividad y auditoría:** consulta, filtros y exportación.
- **Datos:** exportación total (JSON + Markdown + archivos en ZIP), importación (Obsidian; CSV de clientes y movimientos) y estado de los backups.

---

## M15. Portal de cliente y colaboradores [F6]

- **Colaboradores:** rol `member` con acceso solo a los proyectos asignados; sin Finanzas salvo permiso explícito.
- **Clientes:** rol `client` con un portal de su(s) proyecto(s):
  - estado y etapas;
  - entregas a aprobar;
  - presupuestos (ver, aceptar, rechazar);
  - rondas de revisión (cargar feedback);
  - recursos compartidos.

  Mismo nivel visual que el resto de la app. Acceso con magic link + 2FA opcional.

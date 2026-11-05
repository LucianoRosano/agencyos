/**
 * Catálogo de problemas SEO (docs/02 §M07): categoría, severidad, explicación y cómo corregirlo, en español.
 * El `code` es estable: junto con la URL forma el fingerprint que permite comparar auditorías.
 */
export const SEO_CATEGORIES = ["indexing", "content", "links", "performance", "structured_data", "social", "security"] as const;
export type SeoCategory = (typeof SEO_CATEGORIES)[number];
export const SEO_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type SeoSeverity = (typeof SEO_SEVERITIES)[number];
export const AUDIT_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const SEO_LABELS = {
  category: {
    indexing: "Indexación",
    content: "Contenido",
    links: "Enlaces",
    performance: "Rendimiento",
    structured_data: "Datos estructurados",
    social: "Social",
    security: "Seguridad",
  } satisfies Record<SeoCategory, string>,
  severity: { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo" } satisfies Record<SeoSeverity, string>,
  status: { queued: "En cola", running: "Rastreando", completed: "Completada", failed: "Falló", cancelled: "Cancelada" } satisfies Record<AuditStatus, string>,
  frequency: { weekly: "Semanal", monthly: "Mensual" } as Record<string, string>,
  strategy: { mobile: "Celular", desktop: "Escritorio" } as Record<string, string>,
  formFactor: { PHONE: "Celular", DESKTOP: "Escritorio", ALL: "Todos" } as Record<string, string>,
};

export type IssueDef = { category: SeoCategory; severity: SeoSeverity; title: string; why: string; fix: string };

export const ISSUES = {
  // — Indexación —
  http_5xx: {
    category: "indexing",
    severity: "critical",
    title: "Página con error del servidor (5xx)",
    why: "Google no puede leer la página y, si el error persiste, la saca del índice.",
    fix: "Revisá los logs del servidor o del hosting (PHP, memoria, plugins) y corregí el error hasta que responda 200.",
  },
  http_4xx: {
    category: "indexing",
    severity: "high",
    title: "Página enlazada que no existe (4xx)",
    why: "Los visitantes y los buscadores llegan a un error y se pierde la autoridad de los enlaces que apuntan ahí.",
    fix: "Restaurá la página o creá una redirección 301 a la URL equivalente, y actualizá los enlaces internos.",
  },
  fetch_error: {
    category: "indexing",
    severity: "high",
    title: "Página que no responde",
    why: "El servidor no respondió a tiempo o cortó la conexión: para Google la página no está disponible.",
    fix: "Revisá el rendimiento del hosting, el firewall/WAF y que el servidor no bloquee rastreadores legítimos.",
  },
  robots_blocks_all: {
    category: "indexing",
    severity: "critical",
    title: "robots.txt bloquea todo el sitio",
    why: "Con «Disallow: /» los buscadores no pueden rastrear ninguna página.",
    fix: "Quitá «Disallow: /» del robots.txt de producción (suele quedar del entorno de staging).",
  },
  robots_missing: {
    category: "indexing",
    severity: "low",
    title: "No hay robots.txt",
    why: "No es obligatorio, pero es el lugar estándar para indicar el sitemap y excluir secciones sin valor.",
    fix: "Creá /robots.txt con al menos «User-agent: *», «Allow: /» y la línea «Sitemap:» con la URL del sitemap.",
  },
  robots_invalid: {
    category: "indexing",
    severity: "low",
    title: "robots.txt con líneas inválidas",
    why: "Los buscadores ignoran las líneas mal escritas, así que esas reglas no se aplican.",
    fix: "Corregí las líneas que no siguen el formato «Directiva: valor» dentro de un grupo «User-agent».",
  },
  sitemap_missing: {
    category: "indexing",
    severity: "medium",
    title: "No se encontró sitemap.xml",
    why: "El sitemap ayuda a que Google descubra todas las páginas, sobre todo en sitios nuevos o grandes.",
    fix: "Generá un sitemap (en WordPress lo hace Yoast/Rank Math o el core) y declaralo en robots.txt.",
  },
  sitemap_invalid: {
    category: "indexing",
    severity: "medium",
    title: "sitemap.xml inválido",
    why: "Un sitemap mal formado se descarta completo.",
    fix: "Revisá que sea XML válido con <urlset> y una <loc> absoluta por URL.",
  },
  sitemap_url_error: {
    category: "indexing",
    severity: "medium",
    title: "URL del sitemap que no responde 200",
    why: "El sitemap debe listar solo URLs canónicas que respondan 200; si no, Google confía menos en él.",
    fix: "Sacá del sitemap las URLs con error o redirección, o reemplazalas por su destino final.",
  },
  sitemap_url_noindex: {
    category: "indexing",
    severity: "medium",
    title: "URL del sitemap marcada noindex",
    why: "Es una señal contradictoria: el sitemap pide indexarla y la página pide no hacerlo.",
    fix: "Decidí: si debe indexarse, quitá el noindex; si no, sacala del sitemap.",
  },
  sitemap_url_blocked: {
    category: "indexing",
    severity: "high",
    title: "URL del sitemap bloqueada por robots.txt",
    why: "Google no puede rastrear una URL que el propio sitemap le pide indexar.",
    fix: "Ajustá las reglas Disallow o sacá la URL del sitemap.",
  },
  not_in_sitemap: {
    category: "indexing",
    severity: "low",
    title: "Página indexable que no está en el sitemap",
    why: "Puede tardar más en descubrirse o actualizarse en el índice.",
    fix: "Agregala al sitemap (o revisá por qué el generador la excluye).",
  },
  blocked_by_robots: {
    category: "indexing",
    severity: "low",
    title: "Enlace interno a una URL bloqueada por robots.txt",
    why: "Es normal para áreas privadas, pero si es contenido público no va a aparecer en Google.",
    fix: "Verificá que el bloqueo sea intencional; si no, quitá la regla Disallow que la afecta.",
  },
  noindex: {
    category: "indexing",
    severity: "medium",
    title: "Página excluida con noindex",
    why: "La página no va a aparecer en Google. Si es intencional (carrito, cuenta), está bien.",
    fix: "Si la página debe posicionar, quitá «noindex» de la meta robots o del encabezado X-Robots-Tag.",
  },
  canonical_missing: {
    category: "indexing",
    severity: "low",
    title: "Falta la etiqueta canonical",
    why: "Sin canonical, variantes con parámetros pueden competir entre sí como contenido duplicado.",
    fix: 'Agregá <link rel="canonical" href="URL absoluta"> apuntando a la versión preferida.',
  },
  canonical_multiple: {
    category: "indexing",
    severity: "medium",
    title: "Varias etiquetas canonical",
    why: "Con canonicals distintos Google ignora todos.",
    fix: "Dejá una sola etiqueta canonical (suele duplicarse entre el tema y un plugin SEO).",
  },
  canonical_to_error: {
    category: "indexing",
    severity: "high",
    title: "Canonical que apunta a una URL con error o redirección",
    why: "El canonical debe apuntar a una página que responde 200 e indexable.",
    fix: "Cambiá el canonical a la URL final correcta.",
  },
  hreflang_invalid: {
    category: "indexing",
    severity: "medium",
    title: "Código hreflang inválido",
    why: "Google ignora las anotaciones hreflang con códigos de idioma o región mal escritos.",
    fix: "Usá códigos ISO: idioma (es) y región opcional (es-AR), o x-default.",
  },
  // — Contenido —
  title_missing: {
    category: "content",
    severity: "high",
    title: "Falta el título (<title>)",
    why: "El título es lo que se ve en el resultado de Google y una de las señales más fuertes de relevancia.",
    fix: "Escribí un título único de 30–60 caracteres con la palabra clave principal y la marca.",
  },
  title_duplicate: {
    category: "content",
    severity: "medium",
    title: "Título duplicado",
    why: "Varias páginas con el mismo título compiten entre sí y Google no sabe cuál mostrar.",
    fix: "Hacé que cada título describa lo propio de su página.",
  },
  title_too_long: {
    category: "content",
    severity: "low",
    title: "Título demasiado largo (más de 60 caracteres)",
    why: "Google lo corta en el resultado y se pierde el final.",
    fix: "Acortalo a 60 caracteres o menos, con lo importante al principio.",
  },
  title_too_short: {
    category: "content",
    severity: "low",
    title: "Título demasiado corto (menos de 15 caracteres)",
    why: "Un título muy corto desaprovecha el espacio para describir la página.",
    fix: "Ampliálo con el tema de la página y la marca (30–60 caracteres).",
  },
  meta_description_missing: {
    category: "content",
    severity: "medium",
    title: "Falta la meta description",
    why: "Google arma un fragmento automático que suele ser peor y baja la tasa de clics.",
    fix: "Escribí una descripción única de 70–160 caracteres que invite a hacer clic.",
  },
  meta_description_duplicate: {
    category: "content",
    severity: "low",
    title: "Meta description duplicada",
    why: "Descripciones repetidas no ayudan a diferenciar las páginas en los resultados.",
    fix: "Escribí una descripción propia para cada página.",
  },
  meta_description_length: {
    category: "content",
    severity: "low",
    title: "Meta description muy corta o muy larga",
    why: "Fuera de 70–160 caracteres se corta o queda pobre en el resultado.",
    fix: "Ajustala a 70–160 caracteres.",
  },
  h1_missing: {
    category: "content",
    severity: "medium",
    title: "Falta el encabezado H1",
    why: "El H1 indica el tema principal de la página a visitantes y buscadores.",
    fix: "Agregá un único H1 visible que resuma la página.",
  },
  h1_multiple: {
    category: "content",
    severity: "low",
    title: "Más de un H1",
    why: "No es un error grave, pero diluye cuál es el tema principal.",
    fix: "Dejá un H1 y pasá los demás a H2.",
  },
  thin_content: {
    category: "content",
    severity: "low",
    title: "Poco contenido (menos de 200 palabras)",
    why: "Las páginas con muy poco texto suelen posicionar mal.",
    fix: "Ampliá el contenido con información útil para quien llega a esa página.",
  },
  img_alt_missing: {
    category: "content",
    severity: "medium",
    title: "Imágenes sin atributo alt",
    why: "El alt describe la imagen a lectores de pantalla y a Google Imágenes.",
    fix: 'Agregá un alt descriptivo a cada imagen (alt="" solo para imágenes decorativas).',
  },
  lang_missing: {
    category: "content",
    severity: "low",
    title: "Falta el idioma del documento (<html lang>)",
    why: "Ayuda a buscadores y lectores de pantalla a saber en qué idioma está la página.",
    fix: 'Agregá lang="es-AR" (o el que corresponda) a la etiqueta <html>.',
  },
  viewport_missing: {
    category: "content",
    severity: "medium",
    title: "Falta la meta viewport (no apta para celular)",
    why: "Google indexa la versión para celular; sin viewport la página se ve como de escritorio achicada.",
    fix: 'Agregá <meta name="viewport" content="width=device-width, initial-scale=1">.',
  },
  // — Enlaces —
  broken_internal_link: {
    category: "links",
    severity: "high",
    title: "Enlace interno roto",
    why: "Lleva a visitantes y rastreadores a un error y desperdicia el rastreo.",
    fix: "Corregí el enlace en las páginas de origen o redirigí la URL rota con 301.",
  },
  broken_external_link: {
    category: "links",
    severity: "medium",
    title: "Enlace externo roto",
    why: "Enlazar a páginas que ya no existen empeora la experiencia y la confianza.",
    fix: "Actualizá o quitá el enlace en las páginas de origen.",
  },
  redirect_chain: {
    category: "links",
    severity: "medium",
    title: "Cadena de redirecciones",
    why: "Cada salto suma demora y Google puede dejar de seguir cadenas largas.",
    fix: "Redirigí directamente al destino final con una sola 301.",
  },
  redirect_loop: {
    category: "links",
    severity: "high",
    title: "Bucle o exceso de redirecciones",
    why: "La URL nunca llega a una página: navegadores y buscadores se rinden.",
    fix: "Revisá las reglas de redirección (.htaccess, plugin, CDN) que se pisan entre sí.",
  },
  temporary_redirect: {
    category: "links",
    severity: "low",
    title: "Redirección temporal (302/307) interna",
    why: "Una redirección temporal no transfiere la señal como una permanente.",
    fix: "Si el cambio es definitivo, usá 301 (o 308).",
  },
  internal_link_to_redirect: {
    category: "links",
    severity: "low",
    title: "Enlace interno que pasa por una redirección",
    why: "Suma un salto innecesario en cada visita y en cada rastreo.",
    fix: "Actualizá el enlace para que apunte directamente a la URL final.",
  },
  // — Rendimiento —
  slow_ttfb: {
    category: "performance",
    severity: "medium",
    title: "Respuesta lenta del servidor (TTFB > 800 ms)",
    why: "Un servidor lento retrasa todo lo demás y empeora el LCP.",
    fix: "Activá caché de página (LiteSpeed/WP Rocket), revisá el hosting y las consultas lentas.",
  },
  very_slow_ttfb: {
    category: "performance",
    severity: "high",
    title: "Respuesta muy lenta del servidor (TTFB > 1,8 s)",
    why: "Google lo considera pobre: la página tarda en empezar a mostrarse.",
    fix: "Caché de página, CDN y un hosting con más recursos; revisá plugins pesados.",
  },
  large_html: {
    category: "performance",
    severity: "low",
    title: "HTML muy pesado (más de 500 KB)",
    why: "Más bytes que descargar y procesar antes de mostrar la página.",
    fix: "Quitá CSS/JS en línea innecesario y paginá listados largos.",
  },
  lighthouse_performance_poor: {
    category: "performance",
    severity: "high",
    title: "Rendimiento de Lighthouse bajo (menos de 50)",
    why: "Medido por Google en laboratorio: la página carga lento en condiciones típicas.",
    fix: "Seguí las oportunidades del informe de PageSpeed: imágenes, JS bloqueante, fuentes y caché.",
  },
  lighthouse_performance_average: {
    category: "performance",
    severity: "medium",
    title: "Rendimiento de Lighthouse mejorable (50–89)",
    why: "Medido por Google en laboratorio: hay margen claro de mejora.",
    fix: "Revisá las oportunidades del informe de PageSpeed.",
  },
  cwv_lcp_poor: {
    category: "performance",
    severity: "high",
    title: "LCP pobre en usuarios reales (> 4 s)",
    why: "Dato de campo (CrUX): el contenido principal tarda en aparecer para tus visitantes reales.",
    fix: "Optimizá la imagen principal (tamaño, formato, preload), el servidor y el CSS crítico.",
  },
  cwv_lcp_needs_improvement: {
    category: "performance",
    severity: "medium",
    title: "LCP mejorable en usuarios reales (2,5–4 s)",
    why: "Dato de campo (CrUX): por encima del umbral «bueno» de Google.",
    fix: "Optimizá la imagen principal y el tiempo de respuesta del servidor.",
  },
  cwv_inp_poor: {
    category: "performance",
    severity: "high",
    title: "INP pobre en usuarios reales (> 500 ms)",
    why: "Dato de campo (CrUX): la página tarda en responder a clics y toques.",
    fix: "Reducí el JavaScript pesado y dividí tareas largas.",
  },
  cwv_inp_needs_improvement: {
    category: "performance",
    severity: "medium",
    title: "INP mejorable en usuarios reales (200–500 ms)",
    why: "Dato de campo (CrUX): por encima del umbral «bueno» de Google.",
    fix: "Revisá scripts de terceros y manejadores de eventos costosos.",
  },
  cwv_cls_poor: {
    category: "performance",
    severity: "high",
    title: "CLS pobre en usuarios reales (> 0,25)",
    why: "Dato de campo (CrUX): el contenido salta mientras carga.",
    fix: "Reservá espacio para imágenes, anuncios y banners (width/height o aspect-ratio).",
  },
  cwv_cls_needs_improvement: {
    category: "performance",
    severity: "medium",
    title: "CLS mejorable en usuarios reales (0,1–0,25)",
    why: "Dato de campo (CrUX): por encima del umbral «bueno» de Google.",
    fix: "Definí dimensiones a imágenes y evitá insertar contenido arriba del ya visible.",
  },
  // — Datos estructurados —
  jsonld_invalid: {
    category: "structured_data",
    severity: "medium",
    title: "JSON-LD con error de sintaxis",
    why: "Google descarta el bloque completo si el JSON no es válido.",
    fix: "Validá el bloque en validator.schema.org y corregí comas, comillas o llaves.",
  },
  jsonld_missing_type: {
    category: "structured_data",
    severity: "low",
    title: "JSON-LD sin @type",
    why: "Sin tipo, Google no sabe qué describe el bloque.",
    fix: "Agregá @type (Organization, LocalBusiness, Product, Article…).",
  },
  jsonld_missing_home: {
    category: "structured_data",
    severity: "low",
    title: "La página principal no tiene datos estructurados",
    why: "Organization o LocalBusiness ayudan a Google a entender quién está detrás del sitio.",
    fix: "Agregá JSON-LD de Organization/LocalBusiness con nombre, logo, contacto y redes.",
  },
  // — Social —
  og_missing: {
    category: "social",
    severity: "low",
    title: "Faltan etiquetas Open Graph",
    why: "Al compartir el enlace en WhatsApp, Facebook o LinkedIn se ve sin imagen ni título adecuados.",
    fix: "Agregá og:title, og:description e og:image (1200×630) en cada página.",
  },
  // — Seguridad —
  no_https: {
    category: "security",
    severity: "high",
    title: "El sitio no usa HTTPS",
    why: "Los navegadores lo marcan como «No seguro» y Google prioriza HTTPS.",
    fix: "Instalá un certificado (Let's Encrypt) y redirigí todo el tráfico HTTP a HTTPS con 301.",
  },
  http_not_redirected: {
    category: "security",
    severity: "medium",
    title: "La versión HTTP no redirige a HTTPS",
    why: "Quedan dos versiones del sitio accesibles y la HTTP no es segura.",
    fix: "Configurá una redirección 301 de http:// a https:// en el servidor o el CDN.",
  },
  mixed_content: {
    category: "security",
    severity: "high",
    title: "Contenido mixto (recursos HTTP en una página HTTPS)",
    why: "El navegador bloquea o advierte esos recursos y la página deja de verse como segura.",
    fix: "Cambiá las URLs de imágenes, scripts, estilos y formularios a https:// (o relativas).",
  },
  hsts_missing: {
    category: "security",
    severity: "low",
    title: "Falta el encabezado HSTS",
    why: "Sin Strict-Transport-Security, el primer acceso puede hacerse por HTTP.",
    fix: "Agregá «Strict-Transport-Security: max-age=31536000» en el servidor una vez que todo funcione en HTTPS.",
  },
} as const satisfies Record<string, IssueDef>;

export type IssueCode = keyof typeof ISSUES;
export const isIssueCode = (c: string): c is IssueCode => c in ISSUES;
export function issueDef(code: string): IssueDef {
  return isIssueCode(code)
    ? ISSUES[code]
    : { category: "indexing", severity: "low", title: code, why: "Problema sin descripción en el catálogo.", fix: "Revisá el detalle técnico." };
}

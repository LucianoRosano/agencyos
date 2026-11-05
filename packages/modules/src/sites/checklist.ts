/**
 * Checklist de lanzamiento (docs/02 M06 §8): plantilla de 17 áreas basada en el checklist de Librería Uno.
 * Los ítems marcados como críticos impiden pasar el sitio a «Publicado» sin confirmación.
 */

export type LaunchArea = { key: string; title: string; commerce?: boolean; items: { text: string; critical?: boolean; owner?: "user" | "client" }[] };

export const LAUNCH_AREAS: LaunchArea[] = [
  {
    key: "seo_tecnico",
    title: "SEO técnico",
    items: [
      { text: "Indexación habilitada (sin «Disuadir a los motores de búsqueda»)", critical: true },
      { text: "sitemap.xml generado y enviado a Search Console" },
      { text: "robots.txt revisado" },
      { text: "URLs amigables y redirecciones 301 de URLs viejas" },
      { text: "Etiquetas canonical y sin contenido duplicado" },
      { text: "Datos estructurados (Organization / Product) sin errores" },
    ],
  },
  {
    key: "medicion",
    title: "Medición",
    items: [
      { text: "Google Analytics 4 instalado y recibiendo datos" },
      { text: "Conversiones definidas (compra, formulario, WhatsApp)" },
      { text: "Google Search Console verificado" },
      { text: "Píxel de Meta instalado (si hay pauta)" },
    ],
  },
  {
    key: "seguridad",
    title: "Seguridad",
    items: [
      { text: "HTTPS forzado en todo el sitio y certificado vigente", critical: true },
      { text: "Usuario admin sin nombre por defecto y contraseñas en Bitwarden", critical: true },
      { text: "Plugins, tema y núcleo actualizados" },
      { text: "Protección de login (límite de intentos / 2FA)" },
      { text: "Formularios con antispam (reCAPTCHA o Turnstile)" },
    ],
  },
  {
    key: "rendimiento",
    title: "Rendimiento",
    items: [
      { text: "Caché configurada (LiteSpeed Cache u otra)" },
      { text: "Imágenes optimizadas (WebP y tamaños correctos)" },
      { text: "PageSpeed móvil revisado (LCP < 2,5 s)" },
      { text: "Sin plugins innecesarios" },
    ],
  },
  {
    key: "woocommerce",
    title: "WooCommerce",
    commerce: true,
    items: [
      { text: "Productos cargados con precio, stock, fotos y categoría", critical: true },
      { text: "Compra de prueba completa de punta a punta", critical: true },
      { text: "Moneda, impuestos y formato de precios en es-AR" },
      { text: "Emails de pedido con la marca del cliente" },
      { text: "Estados de pedido y stock bajo configurados" },
    ],
  },
  {
    key: "pagos_arca",
    title: "Pagos y ARCA",
    commerce: true,
    items: [
      { text: "Mercado Pago en modo producción con la cuenta del cliente", critical: true },
      { text: "Pago real de prueba acreditado y reintegrado" },
      { text: "Facturación electrónica ARCA probada (si corresponde)" },
      { text: "Certificado de ARCA vigente y fecha de vencimiento registrada" },
    ],
  },
  {
    key: "envios",
    title: "Envíos",
    commerce: true,
    items: [
      { text: "Zonas y costos de envío configurados", critical: true },
      { text: "Integración con Correo Argentino / Andreani probada" },
      { text: "Retiro en el local configurado (si aplica)" },
      { text: "Envío gratis desde el monto acordado" },
    ],
  },
  {
    key: "diseno",
    title: "Diseño",
    items: [
      { text: "Revisado en celular, tablet y escritorio" },
      { text: "Favicon y logo en alta definición" },
      { text: "Página 404 con diseño y búsqueda" },
      { text: "Sin textos de relleno (lorem ipsum) ni imágenes de ejemplo", critical: true },
    ],
  },
  {
    key: "accesibilidad",
    title: "Accesibilidad",
    items: [
      { text: "Contraste de textos AA" },
      { text: "Textos alternativos en imágenes" },
      { text: "Navegación con teclado y foco visible" },
      { text: "Formularios con etiquetas" },
    ],
  },
  {
    key: "legales",
    title: "Legales",
    items: [
      { text: "Términos y condiciones publicados" },
      { text: "Política de privacidad publicada" },
      { text: "Botón de arrepentimiento visible en el pie (tiendas)", critical: true },
      { text: "Data Fiscal (QR de ARCA) en el pie", owner: "client" },
      { text: "Razón social y CUIT en el pie", owner: "client" },
    ],
  },
  {
    key: "mails",
    title: "Mails",
    items: [
      { text: "Envío por SMTP autenticado (SPF, DKIM y DMARC)", critical: true },
      { text: "Formularios llegan al mail correcto" },
      { text: "Casillas del dominio creadas", owner: "client" },
    ],
  },
  {
    key: "backups",
    title: "Backups",
    items: [{ text: "Backup automático diario configurado", critical: true }, { text: "Copia fuera del hosting" }, { text: "Restauración probada en staging" }],
  },
  {
    key: "hosting_dominio",
    title: "Hosting y dominio",
    items: [
      { text: "Dominio a nombre del cliente y con renovación automática", owner: "client" },
      { text: "DNS apuntando a producción y propagado", critical: true },
      { text: "Versión de PHP soportada (8.2 o más)" },
      { text: "Vencimientos de dominio y hosting cargados en Activos" },
    ],
  },
  {
    key: "seo_contenido",
    title: "SEO de contenido",
    items: [
      { text: "Título y meta descripción en cada página" },
      { text: "Un solo H1 por página y jerarquía de encabezados" },
      { text: "Textos de categorías y productos sin duplicar" },
      { text: "Perfil de Google Business actualizado", owner: "client" },
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    items: [
      { text: "Redes sociales enlazadas" },
      { text: "Botón de WhatsApp con mensaje predefinido" },
      { text: "Imagen para compartir (Open Graph)" },
      { text: "Anuncio del lanzamiento preparado", owner: "client" },
    ],
  },
  {
    key: "pruebas",
    title: "Pruebas",
    items: [
      { text: "Todos los formularios enviados y recibidos", critical: true },
      { text: "Enlaces rotos revisados" },
      { text: "Probado en Chrome, Safari y Firefox" },
      { text: "OK final del cliente sobre staging", critical: true, owner: "client" },
    ],
  },
  {
    key: "mantenimiento",
    title: "Mantenimiento",
    items: [
      { text: "Plan de mantenimiento acordado con el cliente", owner: "client" },
      { text: "Manual de uso entregado" },
      { text: "Documentación técnica completa" },
      { text: "Monitoreo de uptime y vencimientos activado" },
    ],
  },
];

const COMMERCE_KINDS = new Set(["store", "b2b"]);

/** Filas a sembrar al crear el sitio (las áreas de tienda quedan «No aplica» en sitios sin venta online). */
export function launchSeed(kind: string) {
  const commerce = COMMERCE_KINDS.has(kind);
  return LAUNCH_AREAS.flatMap((a, ai) =>
    a.items.map((it, ii) => {
      const na = (a.commerce && !commerce) || (!commerce && it.text.startsWith("Botón de arrepentimiento"));
      return {
        area: a.key,
        item: it.text,
        ownerType: it.owner ?? "user",
        status: na ? "na" : "todo",
        evidenceMd: na ? "No aplica: el sitio no vende online." : null,
        sort: ai * 100 + ii,
      };
    }),
  );
}

const CRITICAL = new Set(LAUNCH_AREAS.flatMap((a) => a.items.filter((i) => i.critical).map((i) => `${a.key}|${i.text}`)));
export const isCriticalCheck = (area: string, item: string) => CRITICAL.has(`${area}|${item}`);
export const areaTitle = (key: string) => LAUNCH_AREAS.find((a) => a.key === key)?.title ?? key;

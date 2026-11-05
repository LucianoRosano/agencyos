/**
 * Briefing estructurado por tipo de sitio (docs/02 M06 §1) y lista única de preguntas al cliente.
 * Puro: sin base de datos. Las respuestas se guardan en `site_brief.answers` (jsonb).
 */
import type { SiteKind } from "./blueprint";

export type BriefFieldKind = "text" | "textarea" | "select" | "multi" | "date";
export type BriefField = {
  key: string;
  label: string;
  kind: BriefFieldKind;
  options?: string[];
  hint?: string;
  placeholder?: string;
  /** Pregunta para el cliente si el campo está vacío. Sin pregunta = dato interno. */
  question?: string;
  /** Tipos de sitio a los que aplica (todos si no se indica). */
  only?: SiteKind[];
};
export type BriefBlock = { key: string; title: string; description?: string; only?: SiteKind[]; fields: BriefField[] };

const COMMERCE: SiteKind[] = ["store", "b2b"];
const PRODUCTS: SiteKind[] = ["store", "catalog", "b2b"];

export const BRIEF_BLOCKS: BriefBlock[] = [
  {
    key: "objetivos",
    title: "Objetivos",
    fields: [
      {
        key: "goal_main",
        label: "Objetivo principal del sitio",
        kind: "textarea",
        question: "¿Cuál es el objetivo principal del sitio? (vender, conseguir consultas, mostrar el catálogo…)",
      },
      {
        key: "goal_metric",
        label: "Cómo medimos el éxito",
        kind: "text",
        placeholder: "Ej.: 20 consultas por mes",
        question: "¿Cómo vamos a saber que el sitio funciona? (ventas, consultas, suscriptores…)",
      },
      {
        key: "primary_cta",
        label: "Acción principal del visitante",
        kind: "text",
        placeholder: "Ej.: escribir por WhatsApp",
        question: "¿Qué es lo primero que querés que haga alguien que entra al sitio?",
      },
      {
        key: "landing_campaign",
        label: "Campaña que lleva tráfico",
        kind: "text",
        only: ["landing"],
        question: "¿Qué campaña o anuncio va a llevar gente a la landing?",
      },
    ],
  },
  {
    key: "publico",
    title: "Público",
    fields: [
      { key: "audience", label: "Quién es el cliente ideal", kind: "textarea", question: "¿Quién es tu cliente ideal? (edad, rubro, qué busca)" },
      {
        key: "audience_area",
        label: "Alcance geográfico",
        kind: "text",
        placeholder: "Ej.: San Miguel y alrededores",
        question: "¿A qué zona vendés o atendés? (local, provincia, todo el país)",
      },
      {
        key: "app_roles",
        label: "Usuarios y roles del panel",
        kind: "textarea",
        only: ["app"],
        question: "¿Quiénes van a usar el sistema y qué puede hacer cada uno?",
      },
    ],
  },
  {
    key: "competencia",
    title: "Competencia y referencias",
    fields: [
      { key: "competitors", label: "Competidores", kind: "textarea", question: "¿Quiénes son tus competidores directos? (nombres o sitios)" },
      {
        key: "references",
        label: "Sitios de referencia",
        kind: "textarea",
        placeholder: "URL y qué te gusta de cada uno",
        question: "¿Qué sitios te gustan como referencia y qué te gusta de cada uno?",
      },
    ],
  },
  {
    key: "identidad",
    title: "Identidad visual",
    description: "Logos, paletas y tipografías se suben a la Biblioteca y aparecen en la pestaña Recursos.",
    fields: [
      {
        key: "logo_status",
        label: "Logo",
        kind: "select",
        options: ["Tiene logo en vector (SVG/AI/PDF)", "Tiene logo solo como imagen", "No tiene logo"],
        question: "¿Tenés el logo en vector (SVG, AI o PDF)? Si no, mandame la mejor versión que tengas.",
      },
      { key: "brand_colors", label: "Colores", kind: "text", placeholder: "Ej.: azul #1E3A8A y amarillo", question: "¿Cuáles son los colores de la marca?" },
      { key: "brand_fonts", label: "Tipografías", kind: "text", question: "¿Usás alguna tipografía en particular? (si no, la propongo yo)" },
    ],
  },
  {
    key: "tono",
    title: "Tono",
    fields: [
      {
        key: "tone",
        label: "Tono de comunicación",
        kind: "select",
        options: ["Cercano", "Profesional", "Formal", "Técnico", "Juvenil"],
        question: "¿Cómo le hablás a tus clientes? (cercano, profesional, formal…)",
      },
      { key: "tone_notes", label: "Palabras a usar o evitar", kind: "text", question: "¿Hay palabras o frases que siempre uses o que prefieras evitar?" },
    ],
  },
  {
    key: "funcionalidades",
    title: "Funcionalidades requeridas",
    fields: [
      {
        key: "features",
        label: "Funcionalidades",
        kind: "multi",
        options: [
          "Formulario de contacto",
          "Botón de WhatsApp",
          "Blog o novedades",
          "Newsletter",
          "Buscador",
          "Turnos o reservas",
          "Área de clientes",
          "Varios idiomas",
          "Filtros de catálogo",
          "Lista de deseos",
        ],
        question: "¿Qué funciones necesitás sí o sí en el sitio? (WhatsApp, formulario, buscador, turnos…)",
      },
      { key: "features_other", label: "Otras funcionalidades", kind: "textarea" },
      {
        key: "product_count",
        label: "Cantidad aproximada de productos",
        kind: "text",
        only: PRODUCTS,
        question: "¿Cuántos productos vas a publicar aproximadamente? ¿Tenés un listado en planilla?",
      },
      {
        key: "b2b_pricing",
        label: "Listas de precios y mínimos",
        kind: "textarea",
        only: ["b2b"],
        question: "¿Cómo son las listas de precios mayoristas y los mínimos de compra?",
      },
      {
        key: "b2b_approval",
        label: "Alta de clientes mayoristas",
        kind: "select",
        options: ["Se aprueban a mano", "Alta automática"],
        only: ["b2b"],
        question: "¿Los clientes mayoristas se aprueban a mano antes de ver precios?",
      },
      {
        key: "blog_frequency",
        label: "Frecuencia de publicación",
        kind: "text",
        only: ["blog"],
        question: "¿Cada cuánto vas a publicar y quién escribe las entradas?",
      },
    ],
  },
  {
    key: "pagos_envios",
    title: "Medios de pago y envío",
    only: COMMERCE,
    fields: [
      {
        key: "payment_methods",
        label: "Medios de pago",
        kind: "multi",
        options: ["Mercado Pago", "Transferencia bancaria", "Efectivo en el local", "Tarjeta con otro procesador", "Cuenta corriente"],
        question: "¿Qué medios de pago querés ofrecer? ¿Tenés cuenta de Mercado Pago a nombre del negocio?",
      },
      {
        key: "shipping_methods",
        label: "Envíos",
        kind: "multi",
        options: ["Correo Argentino", "Andreani", "OCA", "Envío propio / moto", "Retiro en el local"],
        question: "¿Cómo vas a enviar los pedidos? (Correo Argentino, Andreani, envío propio, retiro en el local)",
      },
      {
        key: "shipping_rules",
        label: "Zonas, costos y envío gratis",
        kind: "textarea",
        question: "¿A qué zonas enviás, cuánto cuesta y desde qué monto el envío es gratis?",
      },
    ],
  },
  {
    key: "integraciones",
    title: "Integraciones",
    fields: [
      {
        key: "integrations",
        label: "Integraciones",
        kind: "multi",
        options: [
          "ARCA (factura electrónica)",
          "Correo Argentino",
          "Andreani",
          "Mercado Pago",
          "Google Analytics 4",
          "Meta (píxel y catálogo)",
          "Google Search Console",
          "WhatsApp Business",
        ],
        question: "¿Con qué servicios tiene que conectarse el sitio? (facturación ARCA, Mercado Pago, Andreani, Google Analytics, Meta…)",
      },
      {
        key: "integrations_access",
        label: "Accesos necesarios",
        kind: "textarea",
        hint: "Solo qué accesos faltan: las credenciales van a Bitwarden, nunca acá.",
        question: "¿Me podés dar acceso (o invitarme como usuario) a las cuentas de las integraciones?",
      },
    ],
  },
  {
    key: "legales",
    title: "Legales",
    fields: [
      {
        key: "legal_regret",
        label: "Botón de arrepentimiento",
        kind: "select",
        options: ["Sí, va en el pie", "No aplica"],
        only: COMMERCE,
        question: "El botón de arrepentimiento es obligatorio en tiendas: ¿lo dejamos en el pie con un formulario?",
      },
      {
        key: "legal_data_fiscal",
        label: "Data Fiscal (QR de ARCA)",
        kind: "select",
        options: ["Sí, tenemos el QR", "Hay que tramitarlo", "No aplica"],
        question: "¿Tenés el QR de Data Fiscal de ARCA para poner en el pie del sitio?",
      },
      { key: "legal_business", label: "Razón social y CUIT para el pie", kind: "text", question: "¿Qué razón social y CUIT van en el pie del sitio?" },
      {
        key: "legal_terms",
        label: "Términos y privacidad",
        kind: "select",
        options: ["El cliente los tiene", "Hay que redactarlos"],
        question: "¿Tenés términos y condiciones y política de privacidad, o los redacto yo?",
      },
    ],
  },
  {
    key: "contenidos",
    title: "Contenidos que aporta el cliente",
    fields: [
      {
        key: "client_content",
        label: "El cliente aporta",
        kind: "multi",
        options: ["Textos", "Fotos de productos", "Fotos del local o del equipo", "Logo y marca", "Listado de productos y precios", "Testimonios", "Videos"],
        question: "¿Qué contenidos me vas a pasar vos? (textos, fotos, listado de productos, testimonios…)",
      },
      { key: "content_deadline", label: "Fecha de entrega de contenidos", kind: "date", question: "¿Para qué fecha podés tener los textos y las fotos?" },
      { key: "content_notes", label: "Notas sobre contenidos", kind: "textarea" },
    ],
  },
  {
    key: "plazos",
    title: "Plazos",
    fields: [
      { key: "deadline", label: "Fecha deseada de lanzamiento", kind: "date", question: "¿Para qué fecha te gustaría tener el sitio publicado?" },
      { key: "deadline_reason", label: "Por qué esa fecha", kind: "text", question: "¿Hay algún motivo para esa fecha? (temporada, evento, campaña)" },
      { key: "contact_person", label: "Quién responde y cuándo", kind: "text", question: "¿Quién me responde las consultas y en qué horarios?" },
    ],
  },
];

const applies = (only: SiteKind[] | undefined, kind: string) => !only || only.includes(kind as SiteKind);

/** Bloques y campos visibles para un tipo de sitio. */
export function briefBlocksFor(kind: string): BriefBlock[] {
  return BRIEF_BLOCKS.filter((b) => applies(b.only, kind))
    .map((b) => ({ ...b, fields: b.fields.filter((f) => applies(f.only, kind)) }))
    .filter((b) => b.fields.length);
}

export type BriefAnswers = Record<string, string | string[]>;

export function isAnswered(v: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.trim());
  return typeof v === "string" && v.trim().length > 0;
}

/** Normaliza lo que llega del formulario: solo claves conocidas para el tipo, textos recortados. */
export function normalizeAnswers(kind: string, raw: Record<string, unknown>): BriefAnswers {
  const out: BriefAnswers = {};
  for (const b of briefBlocksFor(kind)) {
    for (const f of b.fields) {
      const v = raw[f.key];
      if (f.kind === "multi") {
        const arr = (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, 200))
          .filter((x) => x && (!f.options || f.options.includes(x)));
        if (arr.length) out[f.key] = [...new Set(arr)];
      } else if (typeof v === "string" && v.trim()) {
        const s = v.trim().slice(0, f.kind === "textarea" ? 5000 : 500);
        if (f.kind === "select" && f.options && !f.options.includes(s)) continue;
        if (f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) continue;
        out[f.key] = s;
      }
    }
  }
  return out;
}

/** Lista única de preguntas al cliente: una por cada dato que falta y que solo el cliente puede responder. */
export function generateQuestions(kind: string, answers: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const b of briefBlocksFor(kind)) for (const f of b.fields) if (f.question && !isAnswered(answers[f.key])) out.push(f.question);
  return out;
}

/** Avance del briefing: campos con pregunta respondidos sobre el total. */
export function briefProgress(kind: string, answers: Record<string, unknown>) {
  const fields = briefBlocksFor(kind).flatMap((b) => b.fields.filter((f) => f.question));
  const done = fields.filter((f) => isAnswered(answers[f.key])).length;
  return { done, total: fields.length };
}

/** Saludo y cierre del mensaje de preguntas (la lista numerada va en el medio). */
export function questionsMessageParts(opts: { clientName?: string | null; siteName: string; brand: string }) {
  const hi = opts.clientName ? `¡Hola, ${opts.clientName}!` : "¡Hola!";
  return {
    intro: `${hi} Para avanzar con «${opts.siteName}» necesito que me respondas estas preguntas. Podés contestar por acá, en el orden que quieras:`,
    outro: `Gracias. ${opts.brand}`,
  };
}

/** Texto listo para pegar en WhatsApp. */
export function questionsMessage(questions: string[], opts: { clientName?: string | null; siteName: string; brand: string }) {
  const { intro, outro } = questionsMessageParts(opts);
  return `${intro}\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n${outro}`;
}

/** Texto plano de una respuesta para la UI y el PDF. */
export function answerText(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(" · ");
  return typeof v === "string" ? v : "";
}

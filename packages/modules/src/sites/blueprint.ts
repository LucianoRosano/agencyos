/**
 * Blueprint del sitio (docs/02 M06 §3): árbol páginas → secciones → slots de contenido.
 * JSON independiente de la tecnología (base para generarlo con IA en la F5+). Puro: sin base de datos.
 */
import { z } from "zod";

export const SITE_KINDS = ["institutional", "landing", "store", "catalog", "b2b", "blog", "app"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];
export const SLOT_KINDS = ["title", "text", "image", "cta", "product", "form"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const zKey = z.string().regex(KEY_RE, "Clave inválida (minúsculas, números y guiones)");
const zTitle = (what: string) => z.string().trim().min(1, `${what} necesita un título`).max(120, "Máximo 120 caracteres");

export const blueprintSlot = z.object({ key: zKey, kind: z.enum(SLOT_KINDS, { error: "Tipo de slot inválido" }), label: zTitle("El slot") });
export const blueprintSection = z.object({ key: zKey, title: zTitle("La sección"), slots: z.array(blueprintSlot).max(40, "Máximo 40 slots por sección") });
export const blueprintPage = z.object({
  key: zKey,
  title: zTitle("La página"),
  path: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[^\s]*$/, "La ruta empieza con / y no lleva espacios")
    .optional(),
  sections: z.array(blueprintSection).max(40, "Máximo 40 secciones por página"),
});

export const blueprintTree = z
  .object({ pages: z.array(blueprintPage).min(1, "El sitio necesita al menos una página").max(80, "Máximo 80 páginas") })
  .superRefine((tree, c) => {
    const pageKeys = new Set<string>();
    tree.pages.forEach((p, i) => {
      if (pageKeys.has(p.key)) c.addIssue({ code: "custom", path: ["pages", i, "key"], message: `Página repetida: «${p.title}»` });
      pageKeys.add(p.key);
      const secKeys = new Set<string>();
      p.sections.forEach((s, j) => {
        if (secKeys.has(s.key)) c.addIssue({ code: "custom", path: ["pages", i, "sections", j, "key"], message: `Sección repetida en «${p.title}»: «${s.title}»` });
        secKeys.add(s.key);
        const slotKeys = new Set<string>();
        s.slots.forEach((sl, k) => {
          if (slotKeys.has(sl.key))
            c.addIssue({ code: "custom", path: ["pages", i, "sections", j, "slots", k, "key"], message: `Slot repetido en «${p.title} › ${s.title}»: «${sl.label}»` });
          slotKeys.add(sl.key);
        });
      });
    });
  });

export type BlueprintTree = z.infer<typeof blueprintTree>;
export type BlueprintPage = z.infer<typeof blueprintPage>;

/** Primer mensaje de error legible de una validación del blueprint. */
export function blueprintError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "La estructura no es válida";
}

/** Clave estable a partir de un texto (sin tildes), única dentro de `taken`. */
export function slugKey(text: string, taken: Iterable<string> = []): string {
  const base =
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

export type FlatSlot = { pageKey: string; sectionKey: string; slotKey: string; kind: SlotKind; label: string; pageTitle: string; sectionTitle: string };

/** Todos los slots del árbol, en orden. */
export function flattenSlots(tree: BlueprintTree): FlatSlot[] {
  return tree.pages.flatMap((p) =>
    p.sections.flatMap((s) =>
      s.slots.map((sl) => ({ pageKey: p.key, sectionKey: s.key, slotKey: sl.key, kind: sl.kind, label: sl.label, pageTitle: p.title, sectionTitle: s.title })),
    ),
  );
}

export const slotId = (s: { pageKey: string; sectionKey: string; slotKey: string }) => `${s.pageKey}/${s.sectionKey}/${s.slotKey}`;

type ExistingSlot = { id: string; pageKey: string; sectionKey: string; slotKey: string; kind: string; archived: boolean };

/**
 * Plan de sincronización de `content_slot` con una nueva versión del árbol:
 * - insert: slots nuevos (quedan «pendiente»);
 * - keep: slots que siguen (se actualiza versión y tipo; se reviven si estaban archivados, conservando el contenido);
 * - archive: slots que ya no están (se archivan, no se borran: si vuelven, recuperan su contenido).
 */
export function planSlotSync(existing: ExistingSlot[], tree: BlueprintTree) {
  const byKey = new Map(existing.map((e) => [slotId(e), e]));
  const wanted = flattenSlots(tree);
  const wantedKeys = new Set(wanted.map(slotId));
  const insert: FlatSlot[] = [];
  const keep: { id: string; kind: SlotKind; revive: boolean }[] = [];
  for (const w of wanted) {
    const e = byKey.get(slotId(w));
    if (e) keep.push({ id: e.id, kind: w.kind, revive: e.archived });
    else insert.push(w);
  }
  const archive = existing.filter((e) => !e.archived && !wantedKeys.has(slotId(e))).map((e) => e.id);
  return { insert, keep, archive };
}

// --- Plantillas de estructura por tipo de sitio ---

type S = [string, [string, SlotKind][]];
const page = (title: string, path: string, sections: S[]): BlueprintPage => {
  const taken: string[] = [];
  return {
    key: path === "/" ? "inicio" : slugKey(path.replace(/\//g, " ")),
    title,
    path,
    sections: sections.map(([st, slots]) => {
      const key = slugKey(st, taken);
      taken.push(key);
      const sk: string[] = [];
      return {
        key,
        title: st,
        slots: slots.map(([label, kind]) => {
          const k = slugKey(label, sk);
          sk.push(k);
          return { key: k, kind, label };
        }),
      };
    }),
  };
};

const hero = (cta = "Botón principal"): S => [
  "Hero",
  [
    ["Título principal", "title"],
    ["Bajada", "text"],
    ["Imagen de portada", "image"],
    [cta, "cta"],
  ],
];
const contactPage = () =>
  page("Contacto", "/contacto", [
    [
      "Datos de contacto",
      [
        ["Título", "title"],
        ["Dirección, horarios y teléfonos", "text"],
        ["Botón de WhatsApp", "cta"],
      ],
    ],
    ["Formulario", [["Formulario de contacto", "form"]]],
    ["Mapa", [["Mapa o foto del local", "image"]]],
  ]);
const legalPages = (store: boolean) => [
  page("Términos y condiciones", "/terminos", [["Texto legal", [["Términos y condiciones", "text"]]]]),
  page("Política de privacidad", "/privacidad", [["Texto legal", [["Política de privacidad", "text"]]]]),
  ...(store
    ? [
        page("Botón de arrepentimiento", "/arrepentimiento", [
          [
            "Revocación de compra",
            [
              ["Explicación", "text"],
              ["Formulario de arrepentimiento", "form"],
            ],
          ],
        ]),
        page("Envíos y devoluciones", "/envios", [
          [
            "Políticas",
            [
              ["Medios y costos de envío", "text"],
              ["Cambios y devoluciones", "text"],
            ],
          ],
        ]),
      ]
    : []),
];
const aboutPage = () =>
  page("Nosotros", "/nosotros", [
    [
      "Historia",
      [
        ["Título", "title"],
        ["Quiénes somos", "text"],
        ["Foto del equipo o del local", "image"],
      ],
    ],
    [
      "Valores",
      [
        ["Valores o diferenciales", "text"],
        ["Imagen de apoyo", "image"],
      ],
    ],
  ]);

export const BLUEPRINT_TEMPLATES: Record<Exclude<SiteKind, "app">, { name: string; build: () => BlueprintTree }> = {
  institutional: {
    name: "Institucional",
    build: () => ({
      pages: [
        page("Inicio", "/", [
          hero("Botón de contacto"),
          [
            "Servicios destacados",
            [
              ["Título de la sección", "title"],
              ["Servicios (3 a 6)", "text"],
              ["Íconos o fotos", "image"],
            ],
          ],
          [
            "Por qué elegirnos",
            [
              ["Diferenciales", "text"],
              ["Imagen", "image"],
            ],
          ],
          [
            "Testimonios",
            [
              ["Testimonios de clientes", "text"],
              ["Fotos o logos", "image"],
            ],
          ],
          [
            "Llamado a la acción",
            [
              ["Frase de cierre", "title"],
              ["Botón de WhatsApp", "cta"],
            ],
          ],
        ]),
        aboutPage(),
        page("Servicios", "/servicios", [
          [
            "Listado",
            [
              ["Título", "title"],
              ["Detalle de cada servicio", "text"],
              ["Imágenes", "image"],
            ],
          ],
          ["Consulta", [["Botón de consulta", "cta"]]],
        ]),
        contactPage(),
        ...legalPages(false),
      ],
    }),
  },
  landing: {
    name: "Landing",
    build: () => ({
      pages: [
        page("Landing", "/", [
          hero("Botón de conversión"),
          [
            "Problema",
            [
              ["Título", "title"],
              ["Dolor del cliente", "text"],
            ],
          ],
          [
            "Solución y beneficios",
            [
              ["Beneficios (3)", "text"],
              ["Imagen o mockup", "image"],
            ],
          ],
          [
            "Prueba social",
            [
              ["Testimonios", "text"],
              ["Logos o fotos", "image"],
            ],
          ],
          [
            "Oferta",
            [
              ["Precio u oferta", "text"],
              ["Botón de conversión", "cta"],
            ],
          ],
          ["Preguntas frecuentes", [["Preguntas y respuestas", "text"]]],
          ["Formulario", [["Formulario de contacto o registro", "form"]]],
        ]),
        page("Gracias", "/gracias", [
          [
            "Confirmación",
            [
              ["Mensaje de gracias", "text"],
              ["Siguiente paso", "cta"],
            ],
          ],
        ]),
        ...legalPages(false).slice(1),
      ],
    }),
  },
  store: {
    name: "Tienda",
    build: () => ({
      pages: [
        page("Inicio", "/", [
          hero("Ver productos"),
          [
            "Categorías destacadas",
            [
              ["Título", "title"],
              ["Imágenes de categorías", "image"],
            ],
          ],
          [
            "Productos destacados",
            [
              ["Título", "title"],
              ["Productos destacados", "product"],
            ],
          ],
          [
            "Beneficios",
            [
              ["Envíos, cuotas y medios de pago", "text"],
              ["Íconos", "image"],
            ],
          ],
          ["Novedades", [["Productos nuevos", "product"]]],
          ["Newsletter", [["Formulario de suscripción", "form"]]],
        ]),
        page("Tienda", "/tienda", [
          [
            "Listado",
            [
              ["Texto de la categoría", "text"],
              ["Grilla de productos", "product"],
            ],
          ],
        ]),
        page("Producto", "/producto", [
          [
            "Ficha",
            [
              ["Fotos del producto", "image"],
              ["Descripción", "text"],
              ["Agregar al carrito", "cta"],
            ],
          ],
          ["Relacionados", [["Productos relacionados", "product"]]],
        ]),
        page("Carrito y checkout", "/checkout", [
          [
            "Compra",
            [
              ["Textos de envío y pago", "text"],
              ["Formulario de checkout", "form"],
            ],
          ],
        ]),
        page("Mi cuenta", "/mi-cuenta", [["Cuenta", [["Textos de la cuenta", "text"]]]]),
        aboutPage(),
        page("Preguntas frecuentes", "/preguntas-frecuentes", [["Preguntas", [["Preguntas y respuestas", "text"]]]]),
        contactPage(),
        ...legalPages(true),
      ],
    }),
  },
  catalog: {
    name: "Catálogo",
    build: () => ({
      pages: [
        page("Inicio", "/", [
          hero("Ver catálogo"),
          [
            "Categorías",
            [
              ["Título", "title"],
              ["Imágenes de categorías", "image"],
            ],
          ],
          ["Destacados", [["Productos destacados", "product"]]],
          [
            "Cómo comprar",
            [
              ["Pasos para consultar o pedir", "text"],
              ["Botón de WhatsApp", "cta"],
            ],
          ],
        ]),
        page("Catálogo", "/catalogo", [
          [
            "Listado",
            [
              ["Texto de la categoría", "text"],
              ["Grilla de productos", "product"],
            ],
          ],
        ]),
        page("Producto", "/producto", [
          [
            "Ficha",
            [
              ["Fotos del producto", "image"],
              ["Descripción y medidas", "text"],
              ["Consultar por WhatsApp", "cta"],
            ],
          ],
        ]),
        aboutPage(),
        contactPage(),
        ...legalPages(false).slice(1),
      ],
    }),
  },
  b2b: {
    name: "Mayorista B2B",
    build: () => ({
      pages: [
        page("Inicio", "/", [
          hero("Quiero ser cliente mayorista"),
          [
            "Condiciones mayoristas",
            [
              ["Mínimos de compra y formas de pago", "text"],
              ["Imagen", "image"],
            ],
          ],
          ["Categorías", [["Imágenes de categorías", "image"]]],
          [
            "Marcas",
            [
              ["Título", "title"],
              ["Logos de marcas", "image"],
            ],
          ],
        ]),
        page("Registro mayorista", "/registro", [
          [
            "Alta de cliente",
            [
              ["Requisitos (CUIT, rubro)", "text"],
              ["Formulario de alta", "form"],
            ],
          ],
        ]),
        page("Catálogo mayorista", "/catalogo", [
          [
            "Listado",
            [
              ["Aviso de precios sin IVA", "text"],
              ["Grilla de productos", "product"],
            ],
          ],
        ]),
        page("Producto", "/producto", [
          [
            "Ficha",
            [
              ["Fotos", "image"],
              ["Descripción, bulto y mínimo", "text"],
              ["Agregar al pedido", "cta"],
            ],
          ],
        ]),
        page("Pedido", "/pedido", [
          [
            "Checkout",
            [
              ["Condiciones de entrega y pago", "text"],
              ["Formulario de pedido", "form"],
            ],
          ],
        ]),
        page("Mi cuenta", "/mi-cuenta", [["Cuenta", [["Pedidos, facturas y listas de precios", "text"]]]]),
        contactPage(),
        ...legalPages(true).slice(0, 3),
      ],
    }),
  },
  blog: {
    name: "Blog",
    build: () => ({
      pages: [
        page("Inicio", "/", [
          hero("Suscribirme"),
          ["Últimas entradas", [["Listado de entradas", "text"]]],
          [
            "Categorías",
            [
              ["Título", "title"],
              ["Categorías", "text"],
            ],
          ],
          ["Newsletter", [["Formulario de suscripción", "form"]]],
        ]),
        page("Entrada", "/entrada", [
          [
            "Artículo",
            [
              ["Título", "title"],
              ["Imagen destacada", "image"],
              ["Cuerpo", "text"],
            ],
          ],
          [
            "Autor",
            [
              ["Bio del autor", "text"],
              ["Foto", "image"],
            ],
          ],
          ["Relacionadas", [["Llamado a otras entradas", "cta"]]],
        ]),
        page("Sobre mí", "/sobre-mi", [
          [
            "Presentación",
            [
              ["Texto", "text"],
              ["Foto", "image"],
            ],
          ],
        ]),
        contactPage(),
        ...legalPages(false).slice(1),
      ],
    }),
  },
};

export const TEMPLATE_KINDS = Object.keys(BLUEPRINT_TEMPLATES) as Exclude<SiteKind, "app">[];

/** Plantilla sugerida para un tipo de sitio (el panel a medida arranca de la institucional). */
export function blueprintTemplate(kind: string): BlueprintTree {
  const k = (kind in BLUEPRINT_TEMPLATES ? kind : "institutional") as Exclude<SiteKind, "app">;
  return BLUEPRINT_TEMPLATES[k].build();
}

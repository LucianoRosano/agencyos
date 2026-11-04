import {
  countWords,
  frontmatterAliases,
  frontmatterTags,
  hasPlainMention,
  linkFirstPlainMention,
  normalizeFolder,
  normName,
  parseFrontmatter,
  parseMentions,
  parseWikilinks,
  renameWikilinks,
  safeFileName,
  slugify,
  stringifyFrontmatter,
} from "@agencyos/modules/notes/parse";
import { describe, expect, it } from "vitest";

describe("wikilinks", () => {
  it("reconoce destino, alias y sección", () => {
    const links = parseWikilinks("Ver [[Nota A]], [[Nota B|la B]] y [[Nota C#Objetivos]] y [[Nota D#Plan|plan]].");
    expect(links.map((l) => [l.target, l.section, l.alias])).toEqual([
      ["Nota A", null, null],
      ["Nota B", null, "la B"],
      ["Nota C", "Objetivos", null],
      ["Nota D", "Plan", "plan"],
    ]);
  });

  it("quita .md y la carpeta, marca embebidas e ignora adjuntos y autoenlaces", () => {
    const links = parseWikilinks("![[Facultad/PSEC/Resumen.md]] ![[foto.png]] [[#Sección local]] [[archivo.pdf]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ target: "Resumen", embed: true });
  });

  it("ignora enlaces dentro de bloques y spans de código", () => {
    const md = "Real [[Uno]]\n\n```md\n[[Dos]]\n```\n\nY `[[Tres]]` en línea";
    expect(parseWikilinks(md).map((l) => l.target)).toEqual(["Uno"]);
  });

  it("acepta \\| escapado (tablas de Obsidian)", () => {
    expect(parseWikilinks("| [[Nota\\|alias]] |")[0]).toMatchObject({ target: "Nota", alias: "alias" });
  });

  it("renombra enlaces conservando sección y alias, sin tocar otros", () => {
    const md = "[[Vieja]] [[vieja#Parte|p]] [[Carpeta/Vieja.md]] [[Otra]]";
    expect(renameWikilinks(md, "Vieja", "Nueva")).toBe("[[Nueva]] [[Nueva#Parte|p]] [[Nueva]] [[Otra]]");
  });
});

describe("menciones", () => {
  it("@cliente y #proyecto con candidatos de varias palabras", () => {
    const m = parseMentions("Hablé con @Librería Uno sobre #AGENCYOS hoy.");
    expect(m[0]?.sigil).toBe("@");
    expect(m[0]?.candidates).toEqual(["Librería Uno sobre", "Librería Uno", "Librería"]);
    expect(m[1]).toMatchObject({ sigil: "#", candidates: ["AGENCYOS hoy", "AGENCYOS"] });
  });

  it("forma con corchetes y puntuación final", () => {
    const m = parseMentions("Ver @[Sofía Casa Editorial]. Y #Tienda.");
    expect(m[0]?.candidates).toEqual(["Sofía Casa Editorial"]);
    expect(m[1]?.candidates).toEqual(["Tienda"]);
  });

  it("descarta emails, URLs, títulos Markdown, wikilinks y código", () => {
    const md = "# Título\n## Sub\nmail a lucas@dominio.com https://x.com/#ancla [[Nota#Sec]] `#codigo` y (@Ana)";
    const m = parseMentions(md);
    expect(m).toHaveLength(1);
    expect(m[0]?.candidates).toEqual(["Ana"]);
  });

  it("normaliza nombres sin tildes ni mayúsculas", () => {
    expect(normName("  Librería   ÚNICA ")).toBe("libreria unica");
    expect(slugify("Int. a la Programación")).toBe("int-a-la-programacion");
    expect(slugify("¿?")).toBe("nota");
  });
});

describe("frontmatter", () => {
  it("parsea clave: valor, listas en línea y en bloque, números y booleanos", () => {
    const md = '---\ntitle: Plan 2026\ntags: [facultad, PSEC]\naliases:\n  - Plan\n  - "Plan anual"\nprioridad: 2\nhecho: false\nvacío:\n---\n# Cuerpo\n';
    const { data, body, hasFrontmatter } = parseFrontmatter(md);
    expect(hasFrontmatter).toBe(true);
    expect(body).toBe("# Cuerpo\n");
    expect(data).toEqual({ title: "Plan 2026", tags: ["facultad", "PSEC"], aliases: ["Plan", "Plan anual"], prioridad: 2, hecho: false, vacío: null });
    expect(frontmatterTags(data)).toEqual(["facultad", "psec"]);
    expect(frontmatterAliases(data)).toEqual(["Plan", "Plan anual"]);
  });

  it("sin bloque devuelve el texto completo", () => {
    expect(parseFrontmatter("hola\n---\nno: es")).toEqual({ data: {}, body: "hola\n---\nno: es", hasFrontmatter: false });
  });

  it("tags como texto separado por comas y con #", () => {
    expect(frontmatterTags({ tags: "#Idea, cliente" })).toEqual(["idea", "cliente"]);
  });

  it("ida y vuelta con stringify", () => {
    const fm = { tags: ["a", "b c"], fecha: "2026-11-04", n: 3, ok: true, raro: "dos: puntos" };
    const out = stringifyFrontmatter(fm);
    expect(out.startsWith("---\n")).toBe(true);
    expect(parseFrontmatter(`${out}cuerpo`).data).toEqual({ ...fm, fecha: "2026-11-04" });
  });
});

describe("utilidades", () => {
  it("cuenta palabras sin frontmatter ni símbolos", () => {
    expect(countWords("---\ntags: [x]\n---\n# Hola mundo\n- uno, dos")).toBe(4);
  });

  it("menciones no enlazadas: palabra completa, fuera de enlaces", () => {
    expect(hasPlainMention("Repasar la tienda online de Librería Uno.", "libreria uno")).toBe(true);
    expect(hasPlainMention("Ver [[Librería Uno]]", "Librería Uno")).toBe(false);
    expect(hasPlainMention("Librerías Unoxx", "Librería Uno")).toBe(false);
  });

  it("enlaza la primera mención en texto plano", () => {
    expect(linkFirstPlainMention("Ver [[Plan]] y el plan nuevo", "Plan")).toBe("Ver [[Plan]] y el [[Plan|plan]] nuevo");
    expect(linkFirstPlainMention("nada que ver", "Plan")).toBeNull();
  });

  it("carpetas y nombres de archivo seguros", () => {
    expect(normalizeFolder("/Facultad//PSEC/../")).toBe("Facultad/PSEC");
    expect(normalizeFolder("  ")).toBeNull();
    expect(safeFileName('Plan: "2026" / Q1?')).toBe("Plan- -2026- - Q1-");
  });
});

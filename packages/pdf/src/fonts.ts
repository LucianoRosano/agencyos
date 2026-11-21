import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FAMILY } from "./font-names";

/**
 * Tipografía de los documentos (ADR 0017): Inter para el texto y las cifras (tabulares) y Source Serif 4 para
 * títulos, marca y totales. Son los mismos archivos que usa la app (licencia OFL), copiados en
 * apps/web/public/fonts para que sobrevivan al build standalone y los encuentre también el worker.
 */
export type DocFont = "sans" | "serif";

const FILES: Record<DocFont, string> = { sans: "Inter-Variable.woff2", serif: "SourceSerif4-Variable.woff2" };

export { FAMILY };

/** Ruta del archivo: se prueba desde apps/web (Next), la raíz del monorepo (tests) y apps/worker. */
export function docFontPath(font: DocFont): string | null {
  const cwd = process.cwd();
  const dirs = [
    path.join(cwd, "public", "fonts"),
    path.join(cwd, "apps", "web", "public", "fonts"),
    path.join(cwd, "..", "web", "public", "fonts"),
    path.join(cwd, "..", "..", "apps", "web", "public", "fonts"),
  ];
  for (const d of dirs) {
    const p = path.join(d, FILES[font]);
    if (existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return null;
}

const bufCache = new Map<DocFont, Buffer | null>();
export function docFontBuffer(font: DocFont): Buffer | null {
  if (!bufCache.has(font)) {
    const p = docFontPath(font);
    bufCache.set(font, p ? readFileSync(/*turbopackIgnore: true*/ p) : null);
  }
  return bufCache.get(font) ?? null;
}

const face = (font: DocFont, src: string) =>
  `@font-face{font-family:"${FAMILY[font]}";src:${src} format("woff2");font-weight:${font === "sans" ? "100 900" : "200 900"};font-style:normal;font-display:block;}`;

let dataCss: string | undefined;
/** @font-face de las dos fuentes embebidas como data URL (para Chromium sin red y páginas aisladas). */
export function docFontCss(): string {
  if (dataCss === undefined) {
    dataCss = (["sans", "serif"] as const)
      .map((f) => {
        const buf = docFontBuffer(f);
        return buf ? face(f, `url(data:font/woff2;base64,${buf.toString("base64")})`) : "";
      })
      .join("");
  }
  return dataCss;
}

/** @font-face que apunta a URLs (vista previa en el navegador, se cachea): `${base}?f=sans` y `${base}?f=serif`. */
export const docFontCssFromUrl = (base: string) => (["sans", "serif"] as const).map((f) => face(f, `url(${JSON.stringify(`${base}?f=${f}`)})`)).join("");

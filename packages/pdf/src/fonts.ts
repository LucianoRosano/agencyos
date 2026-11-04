import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REL = path.join("fonts", "geist-sans", "Geist-Variable.woff2");

/**
 * Ruta del Geist variable del paquete `geist` (dependencia de apps/web).
 * Se resuelve con createRequire desde varias bases porque el proceso puede correr
 * en apps/web (Next), en la raíz del monorepo (tests) o en el worker.
 */
export function geistFontPath(): string | null {
  const cwd = process.cwd();
  const bases = [path.join(cwd, "package.json"), path.join(cwd, "apps", "web", "package.json"), path.join(cwd, "..", "web", "package.json"), path.join(cwd, "..", "..", "apps", "web", "package.json")];
  for (const base of bases) {
    if (!existsSync(/*turbopackIgnore: true*/ base)) continue;
    try {
      const entry = createRequire(base).resolve("geist/font/sans"); // …/geist/dist/sans.js
      const file = path.join(path.dirname(entry), REL);
      if (existsSync(/*turbopackIgnore: true*/ file)) return file;
    } catch {
      // probar la siguiente base
    }
  }
  return null;
}

let fontCache: Buffer | null | undefined;
export function geistFontBuffer(): Buffer | null {
  if (fontCache === undefined) {
    const p = geistFontPath();
    fontCache = p ? readFileSync(/*turbopackIgnore: true*/ p) : null;
  }
  return fontCache;
}

const face = (src: string) => `@font-face{font-family:"Geist";src:${src} format("woff2");font-weight:100 900;font-style:normal;font-display:block;}`;

let dataCss: string | undefined;
/** @font-face con el Geist embebido como data URL (para Chromium sin red). */
export function geistFontCss(): string {
  if (dataCss === undefined) {
    const buf = geistFontBuffer();
    dataCss = buf ? face(`url(data:font/woff2;base64,${buf.toString("base64")})`) : "";
  }
  return dataCss;
}

/** @font-face que apunta a una URL (vista previa en el navegador, se cachea). */
export const geistFontCssFromUrl = (url: string) => face(`url(${JSON.stringify(url)})`);

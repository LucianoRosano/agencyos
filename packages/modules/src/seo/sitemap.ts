import { gunzipSync } from "node:zlib";
import { decodeEntities } from "./html";

/** sitemap.xml: `urlset` (URLs) o `sitemapindex` (otros sitemaps). Valida lo mínimo que exige el protocolo. */
export type Sitemap = { kind: "urlset" | "index" | "invalid"; locs: string[]; error?: string };

export function parseSitemap(xml: string): Sitemap {
  const body = xml.replace(/^﻿/, "").trim();
  if (!body.startsWith("<")) return { kind: "invalid", locs: [], error: "No es XML" };
  const isIndex = /<sitemapindex[\s>]/i.test(body);
  const isSet = /<urlset[\s>]/i.test(body);
  if (!isIndex && !isSet) return { kind: "invalid", locs: [], error: "Falta <urlset> o <sitemapindex>" };
  const locs: string[] = [];
  for (const m of body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi)) {
    const v = decodeEntities((m[1] ?? "").trim());
    if (v) locs.push(v);
  }
  if (!locs.length) return { kind: "invalid", locs: [], error: "No tiene ninguna <loc>" };
  return { kind: isIndex ? "index" : "urlset", locs };
}

/** Descomprime si es .gz (por firma), si no devuelve el texto. */
export function sitemapText(buf: Buffer): string {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return gunzipSync(buf, { maxOutputLength: 50 * 1024 * 1024 }).toString("utf8");
    } catch {
      return "";
    }
  }
  return buf.toString("utf8");
}

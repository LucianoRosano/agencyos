import "server-only";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Markdown → HTML sanitizado (lista blanca). Soporta [[Nota]], [[Nota|alias]] y casillas.
 * `resolveWikilink` devuelve la URL de una nota por título (o null si no existe).
 */
export function renderMarkdown(md: string | null | undefined, resolveWikilink?: (title: string) => string | null): string {
  if (!md) return "";
  const withLinks = md.replace(
    /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
    (_m, title: string, _sec: string | undefined, alias: string | undefined) => {
      const href = resolveWikilink?.(title.trim());
      const text = (alias ?? title).trim();
      return href ? `<a class="wikilink" href="${href}">${escapeHtml(text)}</a>` : `<span class="wikilink" data-missing="1">${escapeHtml(text)}</span>`;
    },
  );
  const html = marked.parse(withLinks, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(html, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "br",
      "hr",
      "strong",
      "em",
      "del",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "input",
      "span",
    ],
    allowedAttributes: { a: ["href", "class", "title"], span: ["class", "data-missing"], input: ["type", "checked", "disabled"], code: ["class"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: "a",
        attribs: attribs.href?.startsWith("/") ? attribs : { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

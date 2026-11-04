"use client";

import { useState } from "react";

const MISSING = "/notas/nueva?titulo=";

function fmValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined) return "—";
  return String(v);
}

/**
 * Vista previa renderizada (HTML sanitizado en el servidor). Un [[enlace]] a una nota que no existe
 * se muestra punteado y, con un clic, crea la nota.
 */
export function NotePreviewPane({
  html,
  frontmatter,
  onCreate,
}: {
  html: string;
  frontmatter: Record<string, unknown>;
  onCreate: (title: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const props = Object.entries(frontmatter);
  return (
    <div className="pt-3">
      {props.length ? (
        <dl
          className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 py-2 text-[13px]"
          aria-label="Propiedades (frontmatter)"
        >
          {props.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-text-faint">{k}</dt>
              <dd className="min-w-0 truncate text-text-muted">{fmValue(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {html ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: delega clics en enlaces del HTML renderizado
        // biome-ignore lint/a11y/useKeyWithClickEvents: los enlaces internos son <a> y responden a Enter igual que al clic
        <div
          className="prose-ag note-preview text-text"
          aria-busy={creating ? true : undefined}
          onClick={async (e) => {
            const a = (e.target as HTMLElement).closest("a");
            const href = a?.getAttribute("href") ?? "";
            if (!href.startsWith(MISSING)) return;
            e.preventDefault();
            const title = decodeURIComponent(href.slice(MISSING.length));
            if (creating) return;
            setCreating(title);
            try {
              await onCreate(title);
            } finally {
              setCreating(null);
            }
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitizado con sanitize-html (lista blanca) en el servidor
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="py-6 text-[14px] text-text-faint">La vista previa aparece cuando escribís. Probá con un título (# …), una lista o un [[enlace]].</p>
      )}
    </div>
  );
}

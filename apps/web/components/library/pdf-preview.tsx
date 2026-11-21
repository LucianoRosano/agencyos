"use client";

import { Button } from "@agencyos/ui";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
type RenderTask = import("pdfjs-dist").RenderTask;

let workerPort: Worker | null = null;

/** pdf.js en diferido (no entra al JS inicial). El worker sale del bundle propio (/_next/static): CSP `worker-src 'self'`. */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerPort) {
    workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    pdfjs.GlobalWorkerOptions.workerPort = workerPort;
  }
  return pdfjs;
}

/**
 * Vista previa de un PDF de la Biblioteca: dibuja la página en un canvas (pdf.js) con el binario
 * de la URL firmada y permite pasar de página. Si algo falla, ofrece abrirlo en una pestaña.
 */
export function PdfPreview({ url, openHref, name }: { url: string; openHref: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loading: { destroy: () => Promise<void> } | null = null;
    setState("loading");
    loadPdfjs()
      .then((pdfjs) => {
        if (cancelled) throw new Error("cancelado");
        const task = pdfjs.getDocument({ url, disableRange: true, disableStream: true, useWasm: false, enableXfa: false });
        loading = task;
        return task.promise;
      })
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      void loading?.destroy();
    };
  }, [url]);

  // ancho disponible (re-dibuja al girar el celular o cambiar el tamaño)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || !width) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc
      .getPage(page)
      .then((p) => {
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const maxH = window.innerHeight * 0.7;
        const scale = Math.min(width / base.width, maxH / base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        task = p.render({ canvas, viewport });
        return task.promise;
      })
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((e: unknown) => {
        if (!cancelled && (e as { name?: string })?.name !== "RenderingCancelledException") setState("error");
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width]);

  const pages = doc?.numPages ?? 0;
  return (
    <div className="flex flex-col items-center gap-3 bg-bg-elevated p-3 md:p-4" data-testid="pdf-preview">
      <div ref={boxRef} className="relative grid min-h-64 w-full place-items-center">
        <canvas
          ref={canvasRef}
          className={state === "ready" ? "max-w-full rounded-sm bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]" : "hidden"}
          role="img"
          aria-label={pages ? `Página ${page} de ${pages} de «${name}»` : `Vista previa de «${name}»`}
          data-page={page}
        />
        {state === "loading" ? (
          <div role="status" aria-label="Cargando la vista previa" className="flex flex-col items-center gap-2 text-text-faint">
            <FileText className="size-8 animate-pulse motion-reduce:animate-none" aria-hidden />
            <span className="font-mono text-[11px] uppercase tracking-[0.04em]">Cargando el PDF…</span>
          </div>
        ) : null}
        {state === "error" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <FileText className="size-8 text-text-faint" aria-hidden />
            <p className="max-w-sm text-[13px] text-text-muted">
              No se pudo mostrar la vista previa (el enlace dura 5 minutos o el PDF está dañado). Abrilo en una pestaña o recargá la página.
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {pages > 1 ? (
          <nav aria-label="Páginas del PDF" className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-20 text-center font-mono text-[12px] text-text-muted tabular-nums" aria-live="polite">
              {page} / {pages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              aria-label="Página siguiente"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </nav>
        ) : null}
        <Button asChild variant="secondary" size="sm" className="h-11 md:h-8">
          <a href={openHref} target="_blank" rel="noopener">
            <ExternalLink className="size-4" /> Abrir el PDF
          </a>
        </Button>
      </div>
    </div>
  );
}

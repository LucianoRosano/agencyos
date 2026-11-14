import Link from "next/link";
import type { ReactNode } from "react";

/** Páginas legales públicas (marca Luciano Rosano hacia clientes). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg px-4 py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] border border-border-strong font-semibold">LR</span>
          <p className="text-[15px] font-medium">Luciano Rosano</p>
        </header>
        <article className="flex flex-col gap-4 text-[15px] leading-relaxed text-text [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_p]:text-text-muted [&_li]:text-text-muted">
          {children}
        </article>
        <footer className="mt-10 flex gap-4 border-t border-border pt-4 text-[13px] text-text-muted">
          <Link href="/legal/terminos" className="hover:text-text">
            Términos
          </Link>
          <Link href="/legal/privacidad" className="hover:text-text">
            Privacidad
          </Link>
        </footer>
      </div>
    </main>
  );
}

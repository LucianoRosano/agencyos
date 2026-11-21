import { Button } from "@agencyos/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = { title: "Página no encontrada" };

/** 404 global (rutas que no existen fuera de la app autenticada): misma identidad que el ingreso. */
export default function NotFound() {
  return (
    <main className="bg-grid relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,0.18),transparent)]" />
      <div className="relative flex w-full max-w-[440px] flex-col items-center text-center">
        <Link href="/hoy" aria-label="AGENCYOS · Hoy" className="mb-10">
          <Logo />
        </Link>
        <p className="font-mono text-[12px] uppercase tracking-[0.04em] text-text-muted">Error 404</p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-text md:text-[32px]">
          Esta página no <span className="text-gradient">existe</span>
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-text-muted">
          Puede que el enlace esté mal escrito o que lo que buscabas se haya movido o eliminado.
        </p>
        <div className="mt-8">
          <Button asChild variant="primary" size="lg">
            <Link href="/hoy">
              <ArrowLeft className="size-4" /> Volver a Hoy
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

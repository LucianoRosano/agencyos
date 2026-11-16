import { Button, Card, EmptyState } from "@agencyos/ui";
import { SearchX } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "No encontrado" };

export default function NotFound() {
  return (
    <Card className="mx-auto mt-4 max-w-xl px-4">
      <p className="pt-8 text-center font-mono text-[12px] uppercase tracking-[0.3em] text-text-muted">Error 404</p>
      <EmptyState
        className="pt-4"
        icon={<SearchX />}
        title="No encontramos lo que buscabas"
        description="Puede que se haya eliminado (mirá la Papelera) o que el enlace esté mal."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="primary">
              <Link href="/hoy">Volver a Hoy</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/papelera">Abrir la Papelera</Link>
            </Button>
          </div>
        }
      />
    </Card>
  );
}

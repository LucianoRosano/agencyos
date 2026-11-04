import { Button, EmptyState } from "@agencyos/ui";
import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="No encontramos lo que buscabas"
      description="Puede que se haya eliminado o que el enlace esté mal."
      action={<Button asChild><Link href="/hoy">Volver a Hoy</Link></Button>}
    />
  );
}

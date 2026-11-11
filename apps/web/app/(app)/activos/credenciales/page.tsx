import { can } from "@agencyos/core";
import { listCredentials } from "@agencyos/modules/assets/queries";
import { Button, Card, EmptyState } from "@agencyos/ui";
import { KeyRound, Lock } from "lucide-react";
import Link from "next/link";
import { CredentialMenu, NewCredentialButton } from "@/components/assets/asset-forms";
import { AssetsHeader } from "@/components/assets/header";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Credenciales · Activos técnicos" };

export default async function CredencialesPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "settings"))
    return (
      <div className="mx-auto max-w-6xl">
        <AssetsHeader active="credenciales" title="Credenciales" />
        <EmptyState
          icon={<Lock />}
          title="No tenés acceso a las credenciales"
          description="Las referencias a Bitwarden las ven solo el dueño y los administradores."
          action={
            <Button asChild>
              <Link href="/activos">Volver a Activos</Link>
            </Button>
          }
        />
      </div>
    );
  const rows = await listCredentials(ctx);
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="credenciales"
        title="Credenciales"
        description="Solo referencias: dónde está cada acceso en Bitwarden. AGENCYOS nunca guarda contraseñas."
        actions={<NewCredentialButton />}
        counts={{ credenciales: rows.length }}
      />
      {rows.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Card className="flex items-start gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-2 text-text-muted [&>svg]:size-[18px]">
                  <KeyRound />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-medium text-text">{c.label}</h3>
                  <p className="mt-0.5 font-mono text-[13px] break-words text-text-muted">{c.itemPath}</p>
                  <p className="mt-1 text-[12px] text-text-faint">
                    Bitwarden · {c.uses ? `usada en ${c.uses} ${c.uses === 1 ? "activo" : "activos"}` : "sin usar todavía"}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </p>
                </div>
                <CredentialMenu d={{ id: c.id, label: c.label, itemPath: c.itemPath, notes: c.notes }} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<KeyRound />}
            title="Sin referencias a Bitwarden"
            description="Anotá dónde está cada acceso (ej.: «Bitwarden → Librería Uno → Hostinger») y vinculalo a sus dominios y hostings."
            action={<NewCredentialButton label="Agregar la primera" />}
          />
        </Card>
      )}
    </div>
  );
}

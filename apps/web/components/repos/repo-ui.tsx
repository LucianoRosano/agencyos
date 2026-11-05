"use client";

import { Badge, Button, Checkbox, Sheet } from "@agencyos/ui";
import { FilePlus2, GitPullRequestCreateArrow, PlugZap, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import {
  approvePlanAction,
  connectFakeAction,
  createRepoPlanAction,
  generatePlanAction,
  previewRepoNameAction,
  rejectPlanAction,
  syncReposAction,
  updateLinksAction,
} from "@/app/(app)/repositorios/actions";

type Opt = { value: string; label: string };

export function SyncButton({ variant = "secondary" }: { variant?: "secondary" | "primary" | "ghost" }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() =>
        exec(() => syncReposAction(), {
          success: "Repositorios sincronizados",
        })
      }
    >
      <RefreshCw className="size-4" /> Sincronizar
    </Button>
  );
}

export function GeneratePlanButton({ repositoryIds, variant = "primary", label = "Generar plan" }: { repositoryIds?: string[]; variant?: "primary" | "secondary"; label?: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() =>
        exec(() => generatePlanAction(repositoryIds), {
          success: "Plan generado: revisalo y aprobalo",
          onDone: (p) => router.push(`/repositorios/planes/${(p as { id: string }).id}`),
        })
      }
    >
      <GitPullRequestCreateArrow className="size-4" /> {label}
    </Button>
  );
}

/** Solo se renderiza en modo simulado (tests). */
export function ConnectFakeButton() {
  const { exec, pending } = useAction();
  return (
    <Button variant="primary" loading={pending} onClick={() => exec(() => connectFakeAction(), { success: "GitHub simulado conectado y sincronizado" })}>
      <PlugZap className="size-4" /> Conectar GitHub simulado
    </Button>
  );
}

export function LinksForm({
  repoId,
  defaults,
  options,
}: {
  repoId: string;
  defaults: { scope: string; clientId: string; projectId: string; productId: string; siteId: string };
  options: { scopes: Opt[]; clients: Opt[]; projects: Opt[]; products: Opt[]; sites: Opt[] };
}) {
  return (
    <ActionForm action={updateLinksAction.bind(null, repoId)} successMessage="Vínculos guardados">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Alcance" name="scope" defaultValue={defaults.scope} placeholder="Sin definir" options={options.scopes} />
        <SelectField label="Cliente" name="clientId" defaultValue={defaults.clientId} placeholder="Sin cliente" options={options.clients} />
        <SelectField label="Proyecto" name="projectId" defaultValue={defaults.projectId} placeholder="Sin proyecto" options={options.projects} />
        <SelectField label="Producto propio" name="productId" defaultValue={defaults.productId} placeholder="Sin producto" options={options.products} />
        <SelectField label="Sitio" name="siteId" defaultValue={defaults.siteId} placeholder="Sin sitio" options={options.sites} />
      </div>
      <div className="flex justify-end">
        <SubmitButton>Guardar vínculos</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Confirmar una sugerencia de la inferencia (cliente, proyecto o producto). */
export function ConfirmSuggestion({
  repoId,
  current,
  field,
  value,
  label,
}: {
  repoId: string;
  current: Record<string, string>;
  field: "clientId" | "projectId" | "productId";
  value: string;
  label: string;
}) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => {
        const fd = new FormData();
        for (const [k, v] of Object.entries({ ...current, [field]: value })) fd.set(k, v);
        exec(() => updateLinksAction(repoId, null, fd), { success: `Vinculado a ${label}` });
      }}
    >
      Confirmar
    </Button>
  );
}

export function ApprovePlanSheet({ planId, actions }: { planId: string; actions: { id: string; label: string; risk: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Aprobar plan"
      description="Elegí qué acciones ejecutar y confirmá tu contraseña. El worker las ejecuta y deja registro."
      wide
      trigger={
        <Button variant="primary">
          <ShieldCheck className="size-4" /> Aprobar
        </Button>
      }
    >
      <ActionForm action={approvePlanAction.bind(null, planId)} successMessage="Plan aprobado: se ejecuta en el próximo minuto" onSuccess={() => setOpen(false)}>
        <fieldset className="flex flex-col">
          <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">Acciones</legend>
          {actions.map((a) => (
            <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border py-1.5 text-[14px] text-text last:border-0">
              <Checkbox name="actionIds" value={a.id} defaultChecked />
              <span className="min-w-0 flex-1 break-words">{a.label}</span>
              {a.risk !== "low" ? <Badge tone={a.risk === "high" ? "danger" : "warning"}>{a.risk === "high" ? "alto" : "medio"}</Badge> : null}
            </label>
          ))}
        </fieldset>
        <TextField label="Tu contraseña" name="password" type="password" autoComplete="current-password" required hint="Reautenticación: las acciones sobre GitHub son críticas." />
        <div className="flex justify-end">
          <SubmitButton>Aprobar y ejecutar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function RejectPlanButton({ planId }: { planId: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() => {
        if (!confirm("¿Rechazar el plan? No se ejecuta ninguna acción.")) return;
        exec(() => rejectPlanAction(planId), { success: "Plan rechazado" });
      }}
    >
      <X className="size-4" /> Rechazar
    </Button>
  );
}

export function CreateRepoSheet({
  projectId,
  projectName,
  hasClient,
  templates,
  types,
  stacks,
}: {
  projectId: string;
  projectName: string;
  hasClient: boolean;
  templates: Opt[];
  types: Opt[];
  stacks: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(hasClient ? "cli" : "int");
  const [tech, setTech] = useState("");
  const [name, setName] = useState(projectName);
  const [preview, setPreview] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void previewRepoNameAction(projectId, { scope, tech, name }).then((r) => setPreview(r.ok ? r.data : null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, projectId, scope, tech, name]);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Crear repositorio"
      description="Se crea privado desde una plantilla tpl-*, con topics, descripción y README/CLAUDE.md (vía PR), vinculado a este proyecto. Necesita tu aprobación."
      wide
      trigger={
        <Button variant="secondary">
          <FilePlus2 className="size-4" /> Crear repositorio
        </Button>
      }
    >
      <ActionForm
        action={createRepoPlanAction.bind(null, projectId)}
        successMessage="Plan de creación listo para aprobar"
        onSuccess={(p) => {
          setOpen(false);
          router.push(`/repositorios/planes/${(p as { id: string }).id}`);
        }}
      >
        <SelectField label="Plantilla" name="templateId" required placeholder="Elegí una plantilla" options={templates} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Alcance"
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { value: "cli", label: "cli · Cliente" },
              { value: "prod", label: "prod · Producto propio" },
              { value: "int", label: "int · Interno" },
              { value: "per", label: "per · Personal" },
              { value: "edu", label: "edu · Facultad" },
            ]}
          />
          <TextField label="Tecnología (opcional)" name="tech" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="wp, php…" maxLength={30} />
        </div>
        <TextField label="Nombre" name="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <p className="-mt-2 font-mono text-[13px] text-text-muted" aria-live="polite">
          {preview ? (
            <>
              Nombre en GitHub: <span className="text-text">{preview}</span>
            </>
          ) : (
            "Nombre en GitHub: —"
          )}
        </p>
        <TextField label="Qué es, en una frase" name="what" required maxLength={200} placeholder="Tienda online con WooCommerce" />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Tipo" name="type" placeholder="Sin definir" options={types} />
          <SelectField label="Stack" name="stack" placeholder="Sin definir" options={stacks} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Preparar plan</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

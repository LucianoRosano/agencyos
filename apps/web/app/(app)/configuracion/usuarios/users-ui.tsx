"use client";

import { L, label } from "@agencyos/core";
import { Button, Checkbox, Input, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Ban, Copy, Link2, Mail, MoreHorizontal, RotateCcw, Shield, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { changeRoleAction, deactivateUserAction, inviteAction, reactivateUserAction, renewInvitationAction, revokeInvitationAction } from "./actions";

type Opt = { id: string; name: string; clientName?: string | null };
export type Options = { clients: Opt[]; projects: Opt[]; emailConfigured: boolean };
type InviteRole = "admin" | "member" | "client";

const ROLE_HINT: Record<InviteRole, string> = {
  admin: "Ve y administra todo salvo borrar el espacio. Debe activar 2FA.",
  member: "Solo los proyectos que elijas (tareas, entregas, sitios). Sin CRM ni finanzas. Debe activar 2FA.",
  client: "Entra al portal: sus proyectos, entregas a aprobar, presupuestos y recursos compartidos.",
};

/** Enlace de invitación recién generado: el token solo se muestra ahora. */
export function InviteLink({ url, emailed }: { url: string; emailed: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar: seleccioná el texto y copialo a mano.");
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-4">
      <p className="text-[13px] text-text-muted">
        {emailed ? "Le mandamos el enlace por email. También podés copiarlo:" : "Brevo no está configurado: copiá el enlace y mandalo por WhatsApp o email."}{" "}
        Vence en 7 días y sirve una sola vez.
      </p>
      <Input
        readOnly
        value={url}
        aria-label="Enlace de invitación"
        data-testid="invite-url"
        className="font-mono text-base md:text-[13px]"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button type="button" variant="primary" onClick={copy} className="self-start">
        <Copy className="size-4" /> Copiar enlace
      </Button>
    </div>
  );
}

function ScopeFields({ role, options, defaults }: { role: InviteRole; options: Options; defaults?: { clientId?: string | null; projectIds?: string[] } }) {
  const projectsError = useFieldError("projectIds");
  if (role === "client")
    return (
      <SelectField
        label="Cliente del CRM"
        name="clientId"
        required
        placeholder="Elegí el cliente"
        defaultValue={defaults?.clientId ?? ""}
        options={options.clients.map((c) => ({ value: c.id, label: c.name }))}
        hint="Va a ver los proyectos y presupuestos de este cliente."
      />
    );
  if (role !== "member") return null;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-[13px] font-medium text-text">Proyectos asignados</legend>
      {options.projects.length ? (
        <div className="max-h-64 overflow-y-auto rounded-[10px] border border-border p-2">
          {options.projects.map((p) => (
            <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-[14px] hover:bg-surface-2">
              <Checkbox name="projectIds" value={p.id} defaultChecked={defaults?.projectIds?.includes(p.id)} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.clientName ? <span className="truncate text-[12px] text-text-faint">{p.clientName}</span> : null}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-text-muted">No hay proyectos activos para asignar.</p>
      )}
      {projectsError ? (
        <p className="text-[12px] text-danger" role="alert">
          {projectsError}
        </p>
      ) : null}
    </fieldset>
  );
}

const roleOptions = (["member", "client", "admin"] as const).map((r) => ({ value: r, label: label(L.role, r) }));

export function InviteSheet({ options }: { options: Options }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteRole>("member");
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
      title="Invitar"
      description="La cuenta se crea solo desde el enlace de invitación."
      trigger={
        <Button variant="primary">
          <UserPlus className="size-4" /> Invitar
        </Button>
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <InviteLink {...result} />
          <Button type="button" variant="ghost" onClick={() => setResult(null)} className="self-start">
            Invitar a otra persona
          </Button>
        </div>
      ) : (
        <ActionForm action={inviteAction} successMessage="Invitación creada" onSuccess={(d) => setResult(d as { url: string; emailed: boolean })}>
          <TextField label="Email" name="email" type="email" autoComplete="off" required />
          <SelectField
            label="Rol"
            name="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value as InviteRole)}
            options={roleOptions}
            hint={ROLE_HINT[role]}
          />
          <ScopeFields role={role} options={options} />
          <SubmitButton className="mt-1">Crear invitación</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function InvitationMenu({ id, email, emailConfigured }: { id: string; email: string; emailConfigured: boolean }) {
  const { exec, pending } = useAction();
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de la invitación a ${email}`} disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Link2 />} onSelect={() => exec(() => renewInvitationAction(id, false), { onDone: (d) => setLink(d) })}>
          Generar enlace nuevo
        </MenuItem>
        {emailConfigured ? (
          <MenuItem
            icon={<Mail />}
            onSelect={() => exec(() => renewInvitationAction(id, true), { success: "Invitación reenviada", onDone: (d) => setLink(d) })}
          >
            Reenviar por email
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<X />}
          onSelect={() => {
            if (confirm(`¿Revocar la invitación a ${email}? El enlace deja de funcionar.`))
              exec(() => revokeInvitationAction(id), { success: "Invitación revocada" });
          }}
        >
          Revocar
        </MenuItem>
      </Menu>
      <Sheet open={Boolean(link)} onOpenChange={(o) => !o && setLink(null)} title="Enlace nuevo" description={`Para ${email}. El enlace anterior ya no sirve.`}>
        {link ? <InviteLink {...link} /> : null}
      </Sheet>
    </>
  );
}

export function UserMenu({
  membershipId,
  name,
  role,
  status,
  clientId,
  projectIds,
  options,
}: {
  membershipId: string;
  name: string;
  role: InviteRole;
  status: string;
  clientId: string | null;
  projectIds: string[];
  options: Options;
}) {
  const { exec, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [nextRole, setNextRole] = useState<InviteRole>(role);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${name}`} disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Shield />} onSelect={() => setEditing(true)}>
          Cambiar rol y acceso
        </MenuItem>
        <MenuSeparator />
        {status === "active" ? (
          <MenuItem
            danger
            icon={<Ban />}
            onSelect={() => {
              if (confirm(`¿Desactivar a ${name}? Se cierran sus sesiones y no podrá entrar. No se borra nada.`))
                exec(() => deactivateUserAction(membershipId), { success: `${name} quedó desactivado`, undo: () => reactivateUserAction(membershipId) });
            }}
          >
            Desactivar
          </MenuItem>
        ) : (
          <MenuItem icon={<RotateCcw />} onSelect={() => exec(() => reactivateUserAction(membershipId), { success: `${name} puede volver a entrar` })}>
            Reactivar
          </MenuItem>
        )}
      </Menu>
      <Sheet open={editing} onOpenChange={setEditing} title={`Rol de ${name}`}>
        <ActionForm action={changeRoleAction.bind(null, membershipId)} successMessage="Acceso actualizado" onSuccess={() => setEditing(false)}>
          <SelectField
            label="Rol"
            name="role"
            required
            value={nextRole}
            onChange={(e) => setNextRole(e.target.value as InviteRole)}
            options={roleOptions}
            hint={ROLE_HINT[nextRole]}
          />
          <ScopeFields role={nextRole} options={options} defaults={{ clientId, projectIds }} />
          <SubmitButton>Guardar</SubmitButton>
        </ActionForm>
      </Sheet>
    </>
  );
}

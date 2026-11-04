"use client";

import { Button, Menu, MenuItem, Sheet } from "@agencyos/ui";
import { Link2, MoreHorizontal, Pencil, Star, Trash2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  createContactAction, deleteContactAction, linkContactAction, relinkContactAction, restoreContactAction, setPrimaryContactAction,
  unlinkContactAction, updateContactAction,
} from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };
type Defaults = Record<string, string | null | undefined>;

function ContactFields({ d = {} }: { d?: Defaults }) {
  const v = (k: string) => d[k] ?? "";
  return (
    <>
      <TextField label="Nombre" name="name" required defaultValue={v("name")} maxLength={160} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Rol" name="role" defaultValue={v("role")} placeholder="Dueña, encargado…" />
        <TextField label="Email" name="email" type="email" inputMode="email" defaultValue={v("email")} autoComplete="off" />
        <TextField label="Teléfono" name="phone" type="tel" inputMode="tel" defaultValue={v("phone")} placeholder="+54 9 341 555-1234" />
        <TextField label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" defaultValue={v("whatsapp")} hint="Si queda vacío se usa el teléfono." />
      </div>
      <TextAreaField label="Notas (Markdown)" name="notesMd" defaultValue={v("notesMd")} rows={3} />
    </>
  );
}

/** Nuevo contacto; con `clientId` queda vinculado a ese cliente. */
export function NewContactSheet({ clientId, clients, trigger, redirect }: { clientId?: string; clients?: Opt[]; trigger: ReactNode; redirect?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Nuevo contacto" wide trigger={trigger}>
      <ActionForm
        action={createContactAction}
        successMessage="Contacto creado"
        onSuccess={() => setOpen(false)}
        redirectTo={redirect ? (c) => `/crm/contactos/${(c as { id: string }).id}` : undefined}
      >
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : clients ? <SelectField label="Cliente" name="clientId" options={clients} placeholder="Sin cliente" /> : null}
        <ContactFields />
        {clientId || clients ? <CheckField label="Contacto principal del cliente" name="isPrimary" /> : null}
        <div className="flex justify-end"><SubmitButton>Crear contacto</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

export function EditContactSheet({ id, defaults }: { id: string; defaults: Defaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Editar contacto" wide trigger={<Button variant="secondary"><Pencil className="size-4" /> Editar</Button>}>
      <ActionForm action={updateContactAction.bind(null, id)} successMessage="Contacto actualizado" onSuccess={() => setOpen(false)}>
        <ContactFields d={defaults} />
        <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

/** Vincular un contacto existente con un cliente (N–N). */
export function LinkContactSheet({ clientId, contacts, trigger }: { clientId: string; contacts: Opt[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Vincular contacto existente"
      description="Un contacto puede estar en varios clientes."
      trigger={trigger ?? <Button variant="ghost"><Link2 className="size-4" /> Vincular existente</Button>}
    >
      <ActionForm action={linkContactAction.bind(null, clientId)} successMessage="Contacto vinculado" onSuccess={() => setOpen(false)}>
        <SelectField label="Contacto" name="contactId" options={contacts} placeholder="Elegí un contacto" required />
        <TextField label="Rol en este cliente" name="roleInClient" placeholder="Opcional" />
        <CheckField label="Contacto principal" name="isPrimary" />
        <div className="flex justify-end"><SubmitButton>Vincular</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

/** Acciones de un contacto dentro de la ficha del cliente. */
export function ClientContactMenu({ clientId, contactId, name, isPrimary, roleInClient }: { clientId: string; contactId: string; name: string; isPrimary: boolean; roleInClient: string | null }) {
  const { exec } = useAction();
  return (
    <Menu trigger={<Button variant="ghost" size="icon" aria-label={`Acciones de ${name}`}><MoreHorizontal className="size-4" /></Button>}>
      {!isPrimary ? (
        <MenuItem icon={<Star />} onSelect={() => exec(() => setPrimaryContactAction(clientId, contactId), { success: `${name} es el contacto principal` })}>Hacer principal</MenuItem>
      ) : null}
      <MenuItem
        icon={<Unlink />}
        onSelect={() => {
          if (!confirm(`¿Desvincular a ${name} de este cliente? El contacto no se borra.`)) return;
          exec(() => unlinkContactAction(clientId, contactId), { success: "Contacto desvinculado", undo: () => relinkContactAction(clientId, contactId, isPrimary, roleInClient) });
        }}
      >
        Desvincular
      </MenuItem>
    </Menu>
  );
}

export function ContactMenu({ id, name }: { id: string; name: string }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar a ${name} a la papelera? Se quita de las listas; las interacciones quedan. Restaurable 30 días.`)) return;
          exec(() => deleteContactAction(id), { success: "Contacto en la papelera", undo: () => restoreContactAction(id), onDone: () => router.push("/crm/contactos") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

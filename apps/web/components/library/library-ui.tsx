"use client";

import { L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { FolderPlus, History, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  renameFolderAction,
  restoreFileAction,
  restoreFolderAction,
  restoreVersionAction,
  setFileSharedAction,
  updateFileAction,
} from "@/app/(app)/biblioteca/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { UploadZone } from "./uploader";

type Opt = { value: string; label: string };

// --- Carpetas ---

export function NewFolderSheet({ parentId, clientId, projectId, where }: { parentId?: string; clientId?: string; projectId?: string; where: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nueva carpeta"
      description={`Se crea en ${where}.`}
      trigger={
        <Button variant="secondary">
          <FolderPlus className="size-4" /> Carpeta
        </Button>
      }
    >
      <ActionForm action={createFolderAction} successMessage="Carpeta creada" onSuccess={() => setOpen(false)} resetOnSuccess>
        {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <TextField label="Nombre" name="name" required maxLength={80} placeholder="Ej.: Fotos de producto" autoFocus />
        <div className="flex justify-end">
          <SubmitButton>Crear carpeta</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function FolderMenu({ id, name, parentHref }: { id: string; name: string; parentHref: string }) {
  const { exec } = useAction();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Acciones de la carpeta">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
          Renombrar
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar la carpeta «${name}» a la papelera? Los archivos no se borran: quedan sueltos en la biblioteca. Restaurable 30 días.`))
              return;
            exec(() => deleteFolderAction(id), {
              success: "Carpeta en la papelera",
              undo: () => restoreFolderAction(id),
              onDone: () => router.push(parentHref),
            });
          }}
        >
          Eliminar carpeta
        </MenuItem>
      </Menu>
      <Sheet open={renaming} onOpenChange={setRenaming} title="Renombrar carpeta">
        <ActionForm action={renameFolderAction.bind(null, id)} successMessage="Carpeta renombrada" onSuccess={() => setRenaming(false)}>
          <TextField label="Nombre" name="name" required defaultValue={name} maxLength={80} />
          <div className="flex justify-end">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}

// --- Archivo ---

export function EditFileSheet({
  id,
  defaults,
  isImage,
  clients,
  projects,
  sites,
  folders,
}: {
  id: string;
  defaults: Record<string, string | null>;
  isImage: boolean;
  clients: Opt[];
  projects: Opt[];
  sites: Opt[];
  folders: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const v = (k: string) => defaults[k] ?? "";
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar archivo"
      description="La extensión no cambia: define el tipo real validado al subir."
      wide
      trigger={
        <Button variant="secondary">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <ActionForm action={updateFileAction.bind(null, id)} successMessage="Archivo actualizado" onSuccess={() => setOpen(false)}>
        <TextField label="Nombre" name="name" required defaultValue={v("name")} maxLength={120} />
        <div className="grid gap-4 md:grid-cols-2">
          {isImage ? (
            <SelectField
              label="Tipo"
              name="kind"
              defaultValue={v("kind")}
              options={[
                { value: "image", label: L.fileKind.image },
                { value: "logo", label: L.fileKind.logo },
              ]}
              hint="Los logos aparecen en la vista «Logos»."
            />
          ) : null}
          <SelectField label="Carpeta" name="folderId" defaultValue={v("folderId")} placeholder="Sin carpeta" options={folders} />
          <SelectField label="Cliente" name="clientId" defaultValue={v("clientId")} placeholder="Sin cliente" options={clients} />
          <SelectField label="Proyecto" name="projectId" defaultValue={v("projectId")} placeholder="Sin proyecto" options={projects} />
          <SelectField label="Sitio" name="siteId" defaultValue={v("siteId")} placeholder="Sin sitio" options={sites} />
          <TextField label="Etiquetas" name="tags" defaultValue={v("tags")} placeholder="logo, versión final" hint="Separadas por coma." />
        </div>
        <TextAreaField label="Descripción" name="description" defaultValue={v("description")} rows={3} maxLength={2000} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NewVersionSheet({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Subir nueva versión"
      description={`Reemplaza el contenido de «${name}». Las versiones anteriores quedan en el historial.`}
      trigger={
        <Button variant="secondary">
          <Upload className="size-4" /> Nueva versión
        </Button>
      }
    >
      <UploadZone
        endpoint={`/api/files/${id}/versions`}
        multiple={false}
        label="Elegir la nueva versión"
        hint="Tiene que ser del mismo tipo."
        onUploaded={() => setOpen(false)}
      />
    </Sheet>
  );
}

export function RestoreVersionButton({ id, version }: { id: string; version: number }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 md:h-8"
      loading={pending}
      onClick={() => {
        if (!confirm(`¿Restaurar la versión ${version}? Se crea una versión nueva con ese contenido; no se pierde nada.`)) return;
        exec(() => restoreVersionAction(id, version), { success: `Versión ${version} restaurada` });
      }}
    >
      <History className="size-4" /> Restaurar
    </Button>
  );
}

export function FileMenu({ id, name }: { id: string; name: string }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${name}» a la papelera? Deja de verse en los adjuntos. Restaurable 30 días; después se borra con todas sus versiones.`))
            return;
          exec(() => deleteFileAction(id), { success: "Archivo en la papelera", undo: () => restoreFileAction(id), onDone: () => router.push("/biblioteca") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

/** Interruptor «Compartir con el cliente»: el archivo aparece en los recursos del portal de su cliente/proyecto. */
export function ShareWithClientSwitch({ id, shared, linked }: { id: string; shared: boolean; linked: boolean }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  const [on, setOn] = useState(shared);
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[14px] font-medium text-text">Compartir con el cliente</span>
        <span className="block text-[12px] text-text-muted">
          {linked ? "Aparece en «Recursos compartidos» del portal del cliente." : "Vinculá el archivo a un cliente o proyecto para poder compartirlo."}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        checked={on}
        disabled={pending || (!linked && !on)}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          exec(() => setFileSharedAction(id, next), {
            success: next ? "Compartido con el cliente" : "Ya no se comparte",
            onDone: () => router.refresh(),
            undo: () => setFileSharedAction(id, !next),
          });
        }}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

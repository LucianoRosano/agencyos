"use client";

import { L, type Result } from "@agencyos/core";
import { Button, Field, Menu, MenuItem, MenuSeparator, Select, Sheet } from "@agencyos/ui";
import { FolderInput, FolderPlus, History, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  moveFileAction,
  moveFolderAction,
  renameFolderAction,
  restoreFileAction,
  restoreFileLocationAction,
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

// --- Mover a… ---

export type MoveTargetOpt = { value: string; label: string; group: string; folderId?: string; parentId?: string | null };
const GROUPS = ["Biblioteca", "Clientes", "Proyectos", "Carpetas"];

/** Carpetas que no pueden ser destino de `id`: ella misma y todas sus descendientes. */
function subtreeOf(id: string, targets: MoveTargetOpt[]) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of targets)
      if (t.folderId && t.parentId && out.has(t.parentId) && !out.has(t.folderId)) {
        out.add(t.folderId);
        grew = true;
      }
  }
  return out;
}

/** Hoja «Mover a…»: elige carpeta o raíz (biblioteca, cliente, proyecto) y mueve con «Deshacer». */
export function MoveSheet({
  open,
  onOpenChange,
  title,
  description,
  targets,
  current,
  excludeFolderId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  targets: MoveTargetOpt[];
  /** destino que corresponde a la ubicación actual (no se ofrece) */
  current: string;
  excludeFolderId?: string;
  onMove: (target: string, label: string) => Promise<boolean>;
}) {
  const blocked = useMemo(() => (excludeFolderId ? subtreeOf(excludeFolderId, targets) : new Set<string>()), [excludeFolderId, targets]);
  const options = targets.filter((t) => t.value !== current && !(t.folderId && blocked.has(t.folderId)));
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = options.find((o) => o.value === value);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chosen) return;
          setBusy(true);
          const ok = await onMove(chosen.value, chosen.group === "Carpetas" ? `«${chosen.label}»` : chosen.label);
          setBusy(false);
          if (ok) {
            setValue("");
            onOpenChange(false);
          }
        }}
      >
        <Field
          label="Destino"
          name="move-target"
          hint={options.length ? "Raíz de la biblioteca, de un cliente o proyecto, o dentro de una carpeta." : undefined}
        >
          <Select id="move-target" value={value} onChange={(e) => setValue(e.target.value)} required className="text-base md:text-sm">
            <option value="" disabled>
              Elegí dónde moverlo…
            </option>
            {GROUPS.map((g) => {
              const items = options.filter((o) => o.group === g);
              return items.length ? (
                <optgroup key={g} label={g}>
                  {items.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!chosen} loading={busy}>
            <FolderInput className="size-4" /> Mover
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function FolderMenu({
  id,
  name,
  parentHref,
  targets = [],
  current = "root",
}: {
  id: string;
  name: string;
  parentHref: string;
  targets?: MoveTargetOpt[];
  current?: string;
}) {
  const { exec } = useAction();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
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
        {targets.length ? (
          <MenuItem icon={<FolderInput />} onSelect={() => setMoving(true)}>
            Mover a…
          </MenuItem>
        ) : null}
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
      {targets.length ? (
        <MoveSheet
          open={moving}
          onOpenChange={setMoving}
          title="Mover carpeta"
          description={`«${name}» se mueve con todas sus subcarpetas y archivos.`}
          targets={targets}
          current={current}
          excludeFolderId={id}
          onMove={(target, label) =>
            runMove(
              () => moveFolderAction(id, target),
              `Carpeta movida a ${label}`,
              () => moveFolderAction(id, current),
              router,
            )
          }
        />
      ) : null}
    </>
  );
}

/** Ejecuta un movimiento con toast y «Deshacer» (8 s). Devuelve si salió bien. */
async function runMove(
  fn: () => Promise<Result<unknown>>,
  success: string,
  undo: () => Promise<Result<unknown>>,
  router: ReturnType<typeof useRouter>,
): Promise<boolean> {
  const r = await fn();
  if (!r.ok) {
    toast.error(r.error.message);
    return false;
  }
  toast.success(success, {
    duration: 8000,
    action: {
      label: "Deshacer",
      onClick: () =>
        void undo().then((u) => {
          if (u.ok) toast.success("Deshecho");
          else toast.error(u.error.message);
          router.refresh();
        }),
    },
  });
  router.refresh();
  return true;
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

type FileLocation = { folderId: string | null; clientId: string | null; projectId: string | null };

export function FileMenu({ id, name, targets = [], location }: { id: string; name: string; targets?: MoveTargetOpt[]; location?: FileLocation }) {
  const { exec } = useAction();
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const loc = location ?? { folderId: null, clientId: null, projectId: null };
  const current = loc.folderId ? `folder:${loc.folderId}` : loc.projectId ? `project:${loc.projectId}` : loc.clientId ? `client:${loc.clientId}` : "root";
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Más acciones">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        {targets.length ? (
          <>
            <MenuItem icon={<FolderInput />} onSelect={() => setMoving(true)}>
              Mover a…
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <FileDeleteItem id={id} name={name} exec={exec} router={router} />
      </Menu>
      {targets.length ? (
        <MoveSheet
          open={moving}
          onOpenChange={setMoving}
          title="Mover archivo"
          description={`Elegí dónde guardar «${name}».`}
          targets={targets}
          current={current}
          onMove={(target, label) =>
            runMove(
              () => moveFileAction(id, target),
              `Archivo movido a ${label}`,
              () => restoreFileLocationAction(id, loc),
              router,
            )
          }
        />
      ) : null}
    </>
  );
}

function FileDeleteItem({
  id,
  name,
  exec,
  router,
}: {
  id: string;
  name: string;
  exec: ReturnType<typeof useAction>["exec"];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <MenuItem
      danger
      icon={<Trash2 />}
      onSelect={() => {
        if (!confirm(`¿Mandar «${name}» a la papelera? Deja de verse en los adjuntos. Restaurable 30 días; después se borra con todas sus versiones.`)) return;
        exec(() => deleteFileAction(id), { success: "Archivo en la papelera", undo: () => restoreFileAction(id), onDone: () => router.push("/biblioteca") });
      }}
    >
      Eliminar
    </MenuItem>
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

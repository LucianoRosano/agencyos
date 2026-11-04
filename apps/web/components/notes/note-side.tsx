"use client";

import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Download, Link2, MoreHorizontal, Pin, PinOff, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteNoteAction, linkMentionAction, restoreNoteAction, setNotePinnedAction, updateNotePropsAction } from "@/app/(app)/notas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };

export function NotePropsSheet({
  id,
  spaces,
  entities,
  folders,
  defaults,
  trigger,
}: {
  id: string;
  spaces: Opt[];
  entities: Opt[];
  folders: string[];
  defaults: { spaceId: string | null; folderPath: string | null; entity: string; aliases: string };
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Propiedades de la nota"
      description="Espacio, carpeta, vínculo y alias. Las etiquetas van en el frontmatter (tags: [a, b])."
      trigger={
        trigger ?? (
          <Button variant="secondary" size="sm" className="h-10 md:h-8">
            <Settings2 className="size-4" /> Propiedades
          </Button>
        )
      }
    >
      <ActionForm action={updateNotePropsAction.bind(null, id)} successMessage="Propiedades guardadas" onSuccess={() => setOpen(false)}>
        <SelectField label="Espacio" name="spaceId" defaultValue={defaults.spaceId ?? ""} placeholder="Sin espacio" options={spaces} />
        <TextField label="Carpeta" name="folderPath" defaultValue={defaults.folderPath ?? ""} placeholder="Ej.: Facultad/PSEC" list="note-folders" hint="Opcional. Usá / para subcarpetas." />
        <datalist id="note-folders">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <SelectField label="Vinculada a" name="entity" defaultValue={defaults.entity} placeholder="Nada" options={entities} hint="La nota aparece en la ficha y en su constelación del Cerebro." />
        <TextField label="Alias" name="aliases" defaultValue={defaults.aliases} placeholder="Separados por coma" hint="Otros nombres con los que [[enlazarla]]." />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NoteMenu({ id, title, pinned }: { id: string; title: string; pinned: boolean }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Más acciones de la nota">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <MenuItem icon={pinned ? <PinOff /> : <Pin />} onSelect={() => exec(() => setNotePinnedAction(id, !pinned), { success: pinned ? "Nota desfijada" : "Nota fijada", onDone: () => router.refresh() })}>
        {pinned ? "Desfijar" : "Fijar arriba"}
      </MenuItem>
      <MenuItem icon={<Download />} onSelect={() => window.location.assign("/notas/exportar")}>
        Exportar notas (ZIP Obsidian)
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${title}» a la papelera? Los enlaces hacia ella quedan como texto. Restaurable 30 días.`)) return;
          exec(() => deleteNoteAction(id), { success: "Nota en la papelera", undo: () => restoreNoteAction(id), onDone: () => router.push("/notas") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

export function UnlinkedMentions({ noteId, items }: { noteId: string; items: { id: string; title: string; excerpt: string }[] }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  if (!items.length) return <p className="text-[13px] text-text-faint">Ninguna otra nota menciona este título sin enlazarlo.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((m) => (
        <li key={m.id} className="rounded-[var(--radius-control)] border border-border bg-bg-elevated p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/notas/${m.id}`} className="min-w-0 truncate text-[14px] font-medium text-text hover:underline">
              {m.title}
            </Link>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              className="h-9 shrink-0 md:h-8"
              onClick={() => exec(() => linkMentionAction(m.id, noteId), { success: `Enlazada desde «${m.title}»`, onDone: () => router.refresh() })}
            >
              <Link2 className="size-3.5" /> Enlazar
            </Button>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] text-text-muted">…{m.excerpt}…</p>
        </li>
      ))}
    </ul>
  );
}

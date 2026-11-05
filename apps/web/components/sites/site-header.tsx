"use client";

import { L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Select } from "@agencyos/ui";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveSiteAction, deleteSiteAction, restoreSiteAction, setPublicationStatusAction, unarchiveSiteAction } from "@/app/(app)/sitios/actions";
import { useAction } from "@/components/use-action";
import { PUB_ORDER } from "./shared";

/** Estado de publicación editable inline. «Publicado» con ítems críticos pendientes pide confirmación explícita. */
export function PublicationStatusSelect({ id, status, className }: { id: string; status: string; className?: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();
  function change(next: string) {
    const prev = value;
    setValue(next);
    start(async () => {
      let r = await setPublicationStatusAction(id, next);
      if (!r.ok && r.error.fields?.status === "critical_pending") {
        if (confirm(`${r.error.message}\n\n¿Publicar igual? Queda registrado en la actividad del sitio.`)) r = await setPublicationStatusAction(id, next, true);
        else {
          setValue(prev);
          return;
        }
      }
      if (!r.ok) {
        setValue(prev);
        toast.error(r.error.message);
        return;
      }
      toast.success(`Estado: ${L.publicationStatus[next as keyof typeof L.publicationStatus].toLowerCase()}`, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () =>
            void setPublicationStatusAction(id, prev, true).then((u) => {
              if (u.ok) {
                setValue(prev);
                toast.success("Deshecho");
              } else toast.error(u.error.message);
              router.refresh();
            }),
        },
      });
      router.refresh();
    });
  }
  return (
    <Select
      aria-label="Estado de publicación"
      value={value}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className={className ?? "w-full md:w-52"}
    >
      {PUB_ORDER.map((s) => (
        <option key={s} value={s}>
          {L.publicationStatus[s]}
        </option>
      ))}
    </Select>
  );
}

export function SiteMenu({ id, name, archived }: { id: string; name: string; archived: boolean }) {
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
        icon={archived ? <ArchiveRestore /> : <Archive />}
        onSelect={() =>
          exec(() => (archived ? unarchiveSiteAction(id) : archiveSiteAction(id)), {
            success: archived ? "Sitio desarchivado" : "Sitio archivado",
            undo: () => (archived ? archiveSiteAction(id) : unarchiveSiteAction(id)),
          })
        }
      >
        {archived ? "Desarchivar" : "Archivar"}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (
            !confirm(
              `¿Mandar «${name}» a la papelera? Desaparece de las listas; el briefing, la estructura y el checklist quedan guardados. Restaurable 30 días.`,
            )
          )
            return;
          exec(() => deleteSiteAction(id), { success: "Sitio en la papelera", undo: () => restoreSiteAction(id), onDone: () => router.push("/sitios") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

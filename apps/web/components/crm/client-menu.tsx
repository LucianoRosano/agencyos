"use client";

import { L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Select, Sheet } from "@agencyos/ui";
import { Archive, ArchiveRestore, GitMerge, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  archiveClientAction, deleteClientAction, mergeClientsAction, restoreClientAction, setClientStatusAction, unarchiveClientAction,
} from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };

/** Estado editable inline en el encabezado de la ficha. */
export function ClientStatusSelect({ id, status }: { id: string; status: string }) {
  const { exec, pending } = useAction();
  const [value, setValue] = useState(status);
  return (
    <div className="w-40 shrink-0">
    <Select
      aria-label="Estado del cliente"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        exec(() => setClientStatusAction(id, next), { success: `Estado: ${L.clientStatus[next as keyof typeof L.clientStatus]}`, undo: () => setClientStatusAction(id, prev) });
      }}
    >
      {Object.entries(L.clientStatus).map(([k, l]) => (
        <option key={k} value={k}>{l}</option>
      ))}
    </Select>
    </div>
  );
}

export function ClientMenu({ id, name, status, projectCount, mergeOptions }: { id: string; name: string; status: string; projectCount: number; mergeOptions: Opt[] }) {
  const { exec } = useAction();
  const router = useRouter();
  const [decide, setDecide] = useState(false);
  const [merge, setMerge] = useState(false);
  const archived = status === "archived";
  const undoRef = useRef<{ previousStatus: string; projectIds: string[] } | null>(null);

  function archiveAll(withProjects: boolean) {
    exec(() => archiveClientAction(id, withProjects), {
      success: withProjects ? `«${name}» y sus proyectos quedaron archivados` : "Cliente archivado",
      onDone: (r) => {
        setDecide(false);
        undoRef.current = r;
      },
      undo: () => unarchiveClientAction(id, undoRef.current?.previousStatus ?? status, undoRef.current?.projectIds ?? []),
    });
  }
  return (
    <>
      <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
        {archived ? (
          <MenuItem icon={<ArchiveRestore />} onSelect={() => exec(() => unarchiveClientAction(id, "active", []), { success: "Cliente desarchivado (activo)" })}>
            Desarchivar
          </MenuItem>
        ) : (
          <MenuItem icon={<Archive />} onSelect={() => archiveAll(false)}>Archivar</MenuItem>
        )}
        <MenuItem icon={<GitMerge />} onSelect={() => setMerge(true)} disabled={!mergeOptions.length}>
          Fusionar duplicado…
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (projectCount > 0) {
              setDecide(true);
              return;
            }
            if (!confirm(`¿Mandar «${name}» a la papelera? Sus contactos quedan; el cliente desaparece de las listas. Restaurable 30 días.`)) return;
            exec(() => deleteClientAction(id), { success: "Cliente en la papelera", undo: () => restoreClientAction(id), onDone: () => router.push("/crm/clientes") });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Sheet open={decide} onOpenChange={setDecide} title={`«${name}» tiene ${projectCount} ${projectCount === 1 ? "proyecto" : "proyectos"}`} description="Un cliente con proyectos no se elimina: se archiva junto con ellos para conservar la historia.">
        <ul className="mb-5 flex flex-col gap-1.5 text-[14px] text-text-muted">
          <li>· El cliente pasa a «Archivado» y sale de las listas.</li>
          <li>· {projectCount === 1 ? "Su proyecto se archiva" : `Sus ${projectCount} proyectos se archivan`} (no se borran tareas ni datos).</li>
          <li>· Podés deshacerlo durante 8 segundos o desarchivar después.</li>
        </ul>
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="ghost" onClick={() => setDecide(false)}>Cancelar</Button>
          <Button variant="danger" onClick={() => archiveAll(true)}>Archivar todo</Button>
        </div>
      </Sheet>

      <Sheet open={merge} onOpenChange={setMerge} title="Fusionar duplicado" description={`«${name}» es el duplicado: todo pasa al cliente que elijas y este va a la papelera.`}>
        <ActionForm
          action={mergeClientsAction.bind(null, id)}
          successMessage="Clientes fusionados"
          onSuccess={(r) => {
            setMerge(false);
            router.push(`/crm/clientes/${(r as { targetId: string }).targetId}`);
          }}
        >
          <SelectField label="Fusionar dentro de" name="targetId" options={mergeOptions} placeholder="Elegí el cliente que queda" required />
          <p className="text-[13px] text-text-muted">Se mueven contactos, titulares fiscales, interacciones, oportunidades, proyectos, presupuestos, cobros y movimientos. Las notas se agregan al final de las del destino.</p>
          <div className="flex justify-end">
            <SubmitButton variant="danger" onClick={(e) => { if (!confirm(`¿Fusionar «${name}»? El duplicado va a la papelera.`)) e.preventDefault(); }}>Fusionar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}

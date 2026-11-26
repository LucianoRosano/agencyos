"use client";

import { Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "@agencyos/ui";
import { Archive, ArchiveRestore, BellOff, Clock, Mail, MailOpen, MoreHorizontal } from "lucide-react";
import { archiveAction, markReadAction, markUnreadAction, snoozeAction, unsnoozeAction } from "@/app/(app)/notificaciones/actions";
import { useAction } from "@/components/use-action";

const SNOOZE: [string, string][] = [
  ["1h", "En 1 hora"],
  ["3h", "En 3 horas"],
  ["tarde", "Esta tarde (18:00)"],
  ["manana", "Mañana a las 9"],
  ["lunes", "El lunes a las 9"],
];

/** Acciones de un aviso: leído/no leído, posponer, archivar (con Deshacer). */
export function NotificationActions({ id, title, read, archived, snoozed }: { id: string; title: string; read: boolean; archived: boolean; snoozed: boolean }) {
  const { exec } = useAction();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Acciones de «${title}»`} className="size-9 shrink-0">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      {archived ? (
        <MenuItem icon={<ArchiveRestore />} onSelect={() => exec(() => archiveAction(id, false), { success: "Aviso restaurado" })}>
          Sacar del archivo
        </MenuItem>
      ) : (
        <>
          {read ? (
            <MenuItem icon={<Mail />} onSelect={() => exec(() => markUnreadAction(id), { success: "Marcado sin leer" })}>
              Marcar sin leer
            </MenuItem>
          ) : (
            <MenuItem icon={<MailOpen />} onSelect={() => exec(() => markReadAction(id))}>
              Marcar leído
            </MenuItem>
          )}
          {snoozed ? (
            <MenuItem icon={<BellOff />} onSelect={() => exec(() => unsnoozeAction(id), { success: "Vuelve ahora" })}>
              Traer ahora
            </MenuItem>
          ) : (
            <>
              <MenuSeparator />
              <MenuLabel>Recordarme</MenuLabel>
              {SNOOZE.map(([k, l]) => (
                <MenuItem
                  key={k}
                  icon={<Clock />}
                  onSelect={() => exec(() => snoozeAction(id, k), { success: `Pospuesto: ${l.toLowerCase()}`, undo: () => unsnoozeAction(id) })}
                >
                  {l}
                </MenuItem>
              ))}
            </>
          )}
          <MenuSeparator />
          <MenuItem icon={<Archive />} onSelect={() => exec(() => archiveAction(id), { success: "Archivado", undo: () => archiveAction(id, false) })}>
            Archivar
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

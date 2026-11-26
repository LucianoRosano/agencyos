"use client";

import type { NotifySettings } from "@agencyos/modules/notifications/settings";
import { saveNotifySettingsAction } from "@/app/(app)/notificaciones/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextField } from "@/components/fields";

const hours = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

export function NotifySettingsForm({ settings: s }: { settings: NotifySettings }) {
  return (
    <ActionForm action={saveNotifySettingsAction} successMessage="Preferencias guardadas">
      <CheckField label="No molestar en mi horario de descanso" name="quietEnabled" defaultChecked={s.quietEnabled} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Desde" name="quietFrom" type="time" defaultValue={s.quietFrom} />
        <TextField label="Hasta" name="quietTo" type="time" defaultValue={s.quietTo} />
      </div>
      <CheckField label="Fines de semana sin avisos (sábado y domingo)" name="quietWeekends" defaultChecked={s.quietWeekends} />
      <CheckField label="Lo urgente pasa igual (sitio caído, acceso desde un dispositivo nuevo)" name="urgentBypass" defaultChecked={s.urgentBypass} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Resumen del día a las" name="digestHour" defaultValue={String(s.digestHour)} options={hours(5, 12)} />
        <SelectField label="Cierre del día a las" name="recapHour" defaultValue={String(s.recapHour)} options={hours(16, 23)} />
      </div>
      <CheckField
        label="Cierre del día: lo que hiciste y lo primero de mañana"
        name="eveningRecap"
        defaultChecked={s.eveningRecap}
        hint="Un aviso tranquilo (no suena) al terminar la jornada."
      />
      <CheckField
        label="Resumen de la semana los lunes"
        name="weeklyDigest"
        defaultChecked={s.weeklyDigest}
        hint="Tareas hechas, vencidas, plata por cobrar y proyectos quietos."
      />
      <div className="flex justify-end">
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}

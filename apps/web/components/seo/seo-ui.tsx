"use client";

import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { CalendarClock, KeyRound, ListPlus, MoreHorizontal, Pause, Play, Radar, RotateCw, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  cancelAuditAction,
  createScheduleAction,
  createTasksAction,
  deleteAuditAction,
  deleteScheduleAction,
  reauditAction,
  removeGoogleKeyAction,
  restoreAuditAction,
  restoreScheduleAction,
  saveGoogleKeyAction,
  setScheduleActiveAction,
  startAuditAction,
} from "@/app/(app)/seo/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };
type SiteOpt = Opt & { url: string };

/** "Auditar": URL raíz o sitio, límites y URLs para Lighthouse. Queda en cola y el worker la toma en menos de un minuto. */
export function NewAuditSheet({ sites, defaultUrl, trigger }: { sites: SiteOpt[]; defaultUrl?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const site = sites.find((s) => s.value === siteId);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nueva auditoría SEO"
      description="Rastrea el sitio respetando robots.txt, con datos reales. Corre en segundo plano."
      wide
      trigger={
        trigger ?? (
          <Button variant="primary">
            <Radar className="size-4" /> Auditar
          </Button>
        )
      }
    >
      <ActionForm
        action={startAuditAction}
        successMessage="Auditoría en cola: arranca en menos de un minuto"
        redirectTo={(a: { id: string }) => `/seo/${a.id}`}
        onSuccess={() => setOpen(false)}
      >
        {sites.length ? (
          <SelectField
            label="Sitio"
            name="siteId"
            placeholder="Otra URL (sin sitio)"
            options={sites}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          />
        ) : null}
        <TextField
          label="URL raíz"
          name="rootUrl"
          type="url"
          inputMode="url"
          placeholder={site?.url ?? "https://ejemplo.com.ar"}
          defaultValue={defaultUrl}
          required={!site}
          hint={site ? "Vacío = la URL de producción del sitio." : "Se audita ese dominio (con y sin www)."}
          autoComplete="url"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Límite de páginas" name="maxPages" type="number" min={1} max={2000} defaultValue={300} hint="Máximo 2.000." />
          <TextField label="Profundidad máxima" name="maxDepth" type="number" min={0} max={50} defaultValue={10} hint="Clics desde la portada." />
        </div>
        <TextAreaField
          label="URLs para Lighthouse (opcional)"
          name="lighthouseUrls"
          rows={3}
          placeholder={"Una por línea, máximo 5.\nVacío = la portada."}
          hint="Solo se miden si cargaste la API key de Google."
        />
        <CheckField label="Chequear enlaces externos" name="checkExternal" defaultChecked hint="HEAD con GET de respaldo; hasta 100 enlaces." />
        <p className="text-[12px] text-text-faint">
          User-agent <span className="font-mono">AGENCYOS-SEO-Auditor/1.0</span> · 4 pedidos en paralelo con retardo · respeta robots.txt siempre.
        </p>
        <div className="flex justify-end">
          <SubmitButton>
            <Radar className="size-4" /> Auditar
          </SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

/** Refresca la página mientras la auditoría está en cola o en curso (progreso visible). */
export function AutoRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}

export function AuditMenu({ id, status, host }: { id: string; status: string; host: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  const live = status === "queued" || status === "running";
  return (
    <>
      {live ? (
        <Button
          variant="danger"
          loading={pending}
          onClick={() => {
            if (!confirm(`¿Cancelar la auditoría de ${host}? Se guarda lo rastreado hasta ahora, sin puntaje.`)) return;
            exec(() => cancelAuditAction(id), { success: "Auditoría cancelada" });
          }}
        >
          <Square className="size-4" /> Cancelar
        </Button>
      ) : (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => exec(() => reauditAction(id), { success: "Nueva auditoría en cola", onDone: (a) => router.push(`/seo/${a.id}`) })}
        >
          <RotateCw className="size-4" /> Volver a auditar
        </Button>
      )}
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Más acciones">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<ListPlus />} onSelect={() => router.push(`/seo/${id}/problemas`)}>
          Crear tareas desde problemas
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          disabled={live}
          onSelect={() => {
            if (!confirm(`¿Mandar la auditoría de ${host} a la papelera? Restaurable 30 días.`)) return;
            exec(() => deleteAuditAction(id), { success: "Auditoría en la papelera", undo: () => restoreAuditAction(id), onDone: () => router.push("/seo") });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
    </>
  );
}

/** Crear tareas desde un grupo de problemas o un problema puntual. */
export function CreateTasksSheet({
  auditId,
  code,
  issueId,
  title,
  count,
  projects,
  siteProject,
  compact,
}: {
  auditId: string;
  code?: string;
  issueId?: string;
  title: string;
  count: number;
  projects: Opt[];
  siteProject: { id: string; name: string } | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={issueId ? "Crear tarea desde el problema" : "Crear tareas desde el grupo"}
      description={title}
      trigger={
        compact ? (
          <Button variant="ghost" size="sm" aria-label={`Crear tarea: ${title}`} className="min-h-11 md:min-h-8">
            <ListPlus className="size-4" />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="min-h-11 md:min-h-8">
            <ListPlus className="size-4" /> Crear tarea
          </Button>
        )
      }
    >
      <ActionForm
        action={createTasksAction}
        successMessage={(r: { created: unknown[] }) =>
          `${r.created.length} tarea${r.created.length === 1 ? "" : "s"} creada${r.created.length === 1 ? "" : "s"}`
        }
        onSuccess={() => setOpen(false)}
      >
        <input type="hidden" name="auditId" value={auditId} />
        {code ? <input type="hidden" name="code" value={code} /> : null}
        {issueId ? <input type="hidden" name="issueId" value={issueId} /> : null}
        <SelectField
          label="Proyecto"
          name="projectId"
          defaultValue={siteProject?.id ?? ""}
          placeholder={siteProject ? `Proyecto del sitio (${siteProject.name})` : "Sin proyecto"}
          options={projects}
          hint={siteProject ? "Por defecto, el proyecto del sitio auditado." : undefined}
        />
        {!issueId && count > 1 ? (
          <SelectField
            label="Cómo crearlas"
            name="mode"
            defaultValue="group"
            options={[
              { value: "group", label: `Una tarea para el grupo (${count} URLs en checklist)` },
              ...(count <= 50 ? [{ value: "each", label: `Una tarea por URL (${count})` }] : []),
            ]}
          />
        ) : null}
        <p className="text-[13px] text-text-muted">La tarea incluye por qué importa, cómo corregirlo, las URLs afectadas y el enlace a esta auditoría.</p>
        <div className="flex justify-end">
          <SubmitButton>Crear</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

/** API key de Google: se carga una vez y nunca se vuelve a mostrar. */
export function GoogleKeyForm({ configured, last4 }: { configured: boolean; last4: string | null }) {
  const { exec, pending } = useAction();
  return (
    <div className="flex flex-col gap-4">
      {configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] text-text">
            <KeyRound className="size-4 text-success" /> Configurada <span className="font-mono text-text-muted">••••{last4}</span>
          </p>
          <Button
            variant="danger"
            size="sm"
            loading={pending}
            className="min-h-11 md:min-h-8"
            onClick={() => {
              if (!confirm("¿Quitar la API key? Las próximas auditorías no van a medir Lighthouse ni Core Web Vitals.")) return;
              exec(() => removeGoogleKeyAction(), { success: "API key eliminada" });
            }}
          >
            Quitar
          </Button>
        </div>
      ) : null}
      <ActionForm action={saveGoogleKeyAction} successMessage="API key guardada (cifrada)" resetOnSuccess>
        <TextField
          label={configured ? "Reemplazar API key" : "API key de Google"}
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="AIza…"
          hint="Se guarda cifrada y no se vuelve a mostrar. Habilitá «PageSpeed Insights API» y «Chrome UX Report API» en Google Cloud."
        />
        <div className="flex justify-end">
          <SubmitButton>
            <KeyRound className="size-4" /> Guardar
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

export function NewScheduleSheet({ sites }: { sites: SiteOpt[] }) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const site = sites.find((s) => s.value === siteId);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Programar auditoría"
      description="Se encola sola en la fecha que toca; si el puntaje baja, te avisa."
      trigger={
        <Button variant="primary">
          <CalendarClock className="size-4" /> Programar
        </Button>
      }
    >
      <ActionForm action={createScheduleAction} successMessage="Auditoría programada" onSuccess={() => setOpen(false)}>
        {sites.length ? (
          <SelectField
            label="Sitio"
            name="siteId"
            placeholder="Otra URL (sin sitio)"
            options={sites}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          />
        ) : null}
        <TextField label="URL raíz" name="rootUrl" type="url" inputMode="url" placeholder={site?.url ?? "https://ejemplo.com.ar"} required={!site} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Frecuencia"
            name="frequency"
            defaultValue="monthly"
            options={[
              { value: "monthly", label: "Mensual" },
              { value: "weekly", label: "Semanal" },
            ]}
          />
          <TextField label="Primera auditoría" name="firstRunOn" type="date" hint="Vacío = hoy." />
          <TextField label="Límite de páginas" name="maxPages" type="number" min={1} max={2000} defaultValue={300} />
          <TextField label="Profundidad máxima" name="maxDepth" type="number" min={0} max={50} defaultValue={10} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Programar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function ScheduleActions({ id, active, host }: { id: string; active: boolean; host: string }) {
  const { exec, pending } = useAction();
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        className="min-h-11 md:min-h-8"
        onClick={() =>
          exec(() => setScheduleActiveAction(id, !active), { success: active ? "Pausada" : "Reanudada", undo: () => setScheduleActiveAction(id, active) })
        }
      >
        {active ? <Pause className="size-4" /> : <Play className="size-4" />}
        {active ? "Pausar" : "Reanudar"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar la programación de ${host}`}
        onClick={() => {
          if (!confirm(`¿Eliminar la auditoría programada de ${host}? Restaurable 30 días desde la papelera.`)) return;
          exec(() => deleteScheduleAction(id), { success: "Programación en la papelera", undo: () => restoreScheduleAction(id) });
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

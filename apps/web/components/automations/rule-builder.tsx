"use client";

import type { Result } from "@agencyos/core";
import type { BuilderMeta } from "@agencyos/modules/automations/queries";
import type { RuleInput } from "@agencyos/modules/automations/validators";
import { Badge, Button, Card, Checkbox, cn, Input, Menu, MenuItem, SectionLabel, Select, Textarea } from "@agencyos/ui";
import { ArrowDown, ArrowUp, Braces, CalendarClock, Plus, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";

type FieldDef = BuilderMeta["events"][number] extends { payload?: (infer F)[] } ? F : never;
type Cond = { field: string; op: string; value?: string };
type Action = { type: string; params: Record<string, unknown> };
type State = {
  name: string;
  triggerKind: "event" | "schedule";
  eventType: string;
  schedule: { preset: string; time: string; weekday: number; monthDay: number };
  source: { kind: string; days: number };
  conditions: { match: "all" | "any"; items: Cond[] };
  actions: Action[];
  testMode: boolean;
  templateKey?: string;
};

const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  create_task: { title: "", description: "", priority: 3, project: "event" },
  notify: { title: "", body: "" },
  send_email: { to: "owner", subject: "", body: "", automatic: false },
  set_status: { target: "task", status: "done" },
  webhook: { endpointId: "" },
  wait: { days: 1 },
};

function initialState(i: RuleInput): State {
  return {
    name: i.name ?? "",
    triggerKind: i.triggerKind === "schedule" ? "schedule" : "event",
    eventType: i.eventType ?? "",
    schedule: {
      preset: i.schedule?.preset ?? "daily",
      time: i.schedule?.time ?? "09:00",
      weekday: Number(i.schedule?.weekday ?? 1),
      monthDay: Number(i.schedule?.monthDay ?? 1),
    },
    source: { kind: i.source?.kind ?? "none", days: Number(i.source?.days ?? 0) },
    conditions: { match: i.conditions?.match === "any" ? "any" : "all", items: (i.conditions?.items ?? []).map((c) => ({ ...c, value: c.value ?? "" })) },
    actions: (i.actions ?? []).map((a) => ({ type: a.type, params: { ...DEFAULT_PARAMS[a.type], ...(a.params as Record<string, unknown>) } })),
    testMode: Boolean(i.testMode),
    templateKey: i.templateKey,
  };
}

/** Estado → entrada de la regla (lo que valida el servidor). */
function toPayload(s: State) {
  const schedule =
    s.triggerKind === "schedule"
      ? {
          preset: s.schedule.preset,
          time: s.schedule.time,
          ...(s.schedule.preset === "weekly" ? { weekday: s.schedule.weekday } : {}),
          ...(s.schedule.preset === "monthly" ? { monthDay: s.schedule.monthDay } : {}),
        }
      : undefined;
  return {
    name: s.name,
    triggerKind: s.triggerKind,
    eventType: s.triggerKind === "event" ? s.eventType || undefined : undefined,
    schedule,
    source: s.triggerKind === "schedule" ? { kind: s.source.kind, days: s.source.days } : undefined,
    conditions: { match: s.conditions.match, items: s.conditions.items.map((c) => ({ field: c.field, op: c.op, value: c.op === "exists" ? undefined : c.value })) },
    actions: s.actions.map((a) => {
      const p = { ...a.params };
      if (a.type === "create_task" && (p.dueInDays === "" || p.dueInDays === undefined || p.dueInDays === null)) delete p.dueInDays;
      if (a.type === "send_email" && !p.automatic) delete p.confirmAutomatic;
      return { type: a.type, params: p };
    }),
    testMode: s.testMode,
    templateKey: s.templateKey,
  };
}

function describeSchedule(s: State["schedule"], weekdays: string[]): string {
  const [h = "9", m = "00"] = s.time.split(":");
  const hhmm = `${Number(h)}:${m}`;
  switch (s.preset) {
    case "daily":
      return `Todos los días a las ${hhmm}`;
    case "weekdays":
      return `De lunes a viernes a las ${hhmm}`;
    case "weekly":
      return `Todos los ${weekdays[s.weekday]}${s.weekday === 0 || s.weekday === 6 ? "s" : ""} a las ${hhmm}`;
    case "monthly":
      return `El día ${s.monthDay} de cada mes a las ${hhmm}`;
    case "hourly":
      return `Cada hora, en el minuto ${Number(m)}`;
    default:
      return "";
  }
}

function useFields(meta: BuilderMeta, s: State): { group: string; fields: FieldDef[] }[] {
  return useMemo(() => {
    let entity = "";
    let payload: FieldDef[] = [];
    if (s.triggerKind === "event") {
      const ev = meta.events.find((e) => e.type === s.eventType);
      entity = ev?.entity ?? "";
      payload = ev?.payload ?? [];
      if (s.eventType === "webhook.recibido") payload = [...payload, { path: "payload.datos.tipo", label: "Dato «tipo» del cuerpo", kind: "text" }];
    } else {
      entity = meta.sources.find((x) => x.key === s.source.kind)?.entity ?? "";
    }
    const out: { group: string; fields: FieldDef[] }[] = [];
    const ek = meta.entityKeys[entity];
    if (ek) {
      for (const k of [ek.key, ...ek.related]) {
        const d = meta.entityFields[k];
        if (d) out.push({ group: d.label, fields: d.fields });
      }
    }
    if (payload.length) out.push({ group: "Datos del evento", fields: payload });
    out.push({ group: s.triggerKind === "event" ? "Evento" : "Programación", fields: s.triggerKind === "event" ? meta.commonFields : meta.commonFields.slice(2) });
    return out;
  }, [meta, s.triggerKind, s.eventType, s.source.kind]);
}

function Err({ path }: { path: string }) {
  const e = useFieldError(path);
  return e ? (
    <p className="text-[13px] text-danger" role="alert">
      {e}
    </p>
  ) : null;
}

function Labeled({ label, htmlFor, children, hint, className }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-text-faint">{hint}</p> : null}
    </div>
  );
}

function Step({ n, title, icon, children, aside }: { n: string; title: string; icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionLabel icon={icon}>
          <span className="text-teal-700 dark:text-[#2DD4BF]">{n}</span> · {title}
        </SectionLabel>
        {aside}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1 sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 rounded-md px-3 text-[13px] font-medium transition-colors sm:flex-none",
            value === o.value ? "bg-surface-3 text-text" : "text-text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RuleBuilder({
  meta,
  initial,
  action,
  submitLabel,
}: {
  meta: BuilderMeta;
  initial: RuleInput;
  action: (prev: Result<{ id: string }> | null, fd: FormData) => Promise<Result<{ id: string }>>;
  submitLabel: string;
}) {
  const [s, setS] = useState<State>(() => initialState(initial));
  const fields = useFields(meta, s);
  const allFields = fields.flatMap((g) => g.fields);
  const patch = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));
  const setCond = (i: number, p: Partial<Cond>) =>
    setS((x) => ({ ...x, conditions: { ...x.conditions, items: x.conditions.items.map((c, j) => (j === i ? { ...c, ...p } : c)) } }));
  const setParams = (i: number, p: Record<string, unknown>) =>
    setS((x) => ({ ...x, actions: x.actions.map((a, j) => (j === i ? { ...a, params: { ...a.params, ...p } } : a)) }));
  const move = (i: number, d: -1 | 1) =>
    setS((x) => {
      const a = [...x.actions];
      const j = i + d;
      if (j < 0 || j >= a.length) return x;
      [a[i], a[j]] = [a[j] as Action, a[i] as Action];
      return { ...x, actions: a };
    });
  const groups = useMemo(() => {
    const m = new Map<string, BuilderMeta["events"]>();
    for (const e of meta.events) m.set(e.group, [...(m.get(e.group) ?? []), e]);
    return [...m.entries()];
  }, [meta.events]);
  const source = meta.sources.find((x) => x.key === s.source.kind);
  const vars = allFields.filter((f) => f.path !== "evento.tipo" && f.path !== "evento.actor");

  return (
    <ActionForm action={action} successMessage="Regla guardada" redirectTo={(d) => `/automatizaciones/${d.id}`} className="gap-5">
      <input type="hidden" name="payload" value={JSON.stringify(toPayload(s))} />
      <Card className="p-4 md:p-5">
        <Labeled label="Nombre de la regla" htmlFor="rule-name">
          <Input id="rule-name" value={s.name} onChange={(e) => patch({ name: e.target.value })} maxLength={120} placeholder="Ej.: Presupuesto aceptado → kickoff" />
        </Labeled>
        <Err path="name" />
      </Card>

      <Step n="01" title="Cuándo" icon={<Zap />}>
        <Segmented
          label="Tipo de disparador"
          value={s.triggerKind}
          onChange={(v) => patch({ triggerKind: v })}
          options={[
            { value: "event", label: "Cuando pasa algo" },
            { value: "schedule", label: "Programada" },
          ]}
        />
        {s.triggerKind === "event" ? (
          <Labeled label="Evento" htmlFor="rule-event">
            <Select id="rule-event" value={s.eventType} onChange={(e) => patch({ eventType: e.target.value })}>
              <option value="">Elegí un evento…</option>
              {groups.map(([g, evs]) => (
                <optgroup key={g} label={g}>
                  {evs.map((e) => (
                    <option key={e.type} value={e.type}>
                      {e.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <Err path="eventType" />
          </Labeled>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Labeled label="Frecuencia" htmlFor="rule-preset">
                <Select id="rule-preset" value={s.schedule.preset} onChange={(e) => patch({ schedule: { ...s.schedule, preset: e.target.value } })}>
                  {meta.presets.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Labeled>
              {s.schedule.preset === "weekly" ? (
                <Labeled label="Día" htmlFor="rule-weekday">
                  <Select id="rule-weekday" value={s.schedule.weekday} onChange={(e) => patch({ schedule: { ...s.schedule, weekday: Number(e.target.value) } })}>
                    {meta.weekdays.map((d, i) => (
                      <option key={d} value={i}>
                        {d[0]?.toUpperCase()}
                        {d.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Labeled>
              ) : null}
              {s.schedule.preset === "monthly" ? (
                <Labeled label="Día del mes" htmlFor="rule-monthday">
                  <Select id="rule-monthday" value={s.schedule.monthDay} onChange={(e) => patch({ schedule: { ...s.schedule, monthDay: Number(e.target.value) } })}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </Labeled>
              ) : null}
              <Labeled label={s.schedule.preset === "hourly" ? "Minuto (hh:mm, se usa el minuto)" : "Hora (Argentina)"} htmlFor="rule-time">
                <Input id="rule-time" type="time" value={s.schedule.time} onChange={(e) => patch({ schedule: { ...s.schedule, time: e.target.value || "09:00" } })} />
              </Labeled>
            </div>
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] text-teal-700 dark:text-[#2DD4BF]">
              <CalendarClock className="size-4" /> {describeSchedule(s.schedule, meta.weekdays)}
            </p>
            <Err path="schedule" />
            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              <Labeled label="Para cada…" htmlFor="rule-source" hint={source?.help}>
                <Select id="rule-source" value={s.source.kind} onChange={(e) => patch({ source: { ...s.source, kind: e.target.value } })}>
                  {meta.sources.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Labeled>
              {source?.daysLabel ? (
                <Labeled label={source.daysLabel} htmlFor="rule-days">
                  <Input
                    id="rule-days"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={365}
                    value={s.source.days}
                    onChange={(e) => patch({ source: { ...s.source, days: Number(e.target.value || 0) } })}
                  />
                </Labeled>
              ) : null}
            </div>
          </>
        )}
      </Step>

      <Step
        n="02"
        title="Si se cumple"
        icon={<Braces />}
        aside={
          s.conditions.items.length > 1 ? (
            <Segmented
              label="Cómo combinar las condiciones"
              value={s.conditions.match}
              onChange={(v) => patch({ conditions: { ...s.conditions, match: v } })}
              options={[
                { value: "all", label: "Todas (Y)" },
                { value: "any", label: "Alguna (O)" },
              ]}
            />
          ) : null
        }
      >
        {s.conditions.items.length ? (
          <ul className="flex flex-col gap-3">
            {s.conditions.items.map((c, i) => {
              const def = allFields.find((f) => f.path === c.field);
              const id = `cond-${i}`;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
                <li key={i} className="rounded-[var(--radius-control)] border border-border bg-bg-elevated/60 p-3">
                  {i > 0 ? <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">{s.conditions.match === "all" ? "y" : "o"}</p> : null}
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] md:items-end">
                    <Labeled label="Campo" htmlFor={`${id}-field`}>
                      <Select id={`${id}-field`} value={c.field} onChange={(e) => setCond(i, { field: e.target.value, value: "" })}>
                        <option value="">Elegí un campo…</option>
                        {fields.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.fields.map((f) => (
                              <option key={f.path} value={f.path}>
                                {g.group} · {f.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {c.field && !def ? <option value={c.field}>{c.field}</option> : null}
                      </Select>
                    </Labeled>
                    <Labeled label="Operador" htmlFor={`${id}-op`}>
                      <Select id={`${id}-op`} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                        {meta.ops
                          .filter((o) => (def?.kind === "number" || def?.kind === "date" ? true : o.key !== "gt" && o.key !== "lt"))
                          .map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                      </Select>
                    </Labeled>
                    {c.op === "exists" ? (
                      <div className="hidden md:block" />
                    ) : (
                      <Labeled label="Valor" htmlFor={`${id}-value`}>
                        {def?.options ? (
                          <Select id={`${id}-value`} value={c.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value })}>
                            <option value="">Elegí…</option>
                            {def.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            id={`${id}-value`}
                            type={def?.kind === "date" ? "date" : def?.kind === "number" ? "number" : "text"}
                            value={c.value ?? ""}
                            onChange={(e) => setCond(i, { value: e.target.value })}
                            maxLength={500}
                          />
                        )}
                      </Labeled>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 justify-self-end md:size-10"
                      aria-label={`Quitar condición ${i + 1}`}
                      onClick={() => patch({ conditions: { ...s.conditions, items: s.conditions.items.filter((_, j) => j !== i) } })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Err path={`conditions.items.${i}.field`} />
                  <Err path={`conditions.items.${i}.value`} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-text-muted">Sin condiciones: la regla corre cada vez que se dispara.</p>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={s.conditions.items.length >= 20}
            onClick={() => patch({ conditions: { ...s.conditions, items: [...s.conditions.items, { field: "", op: "eq", value: "" }] } })}
          >
            <Plus className="size-4" /> Agregar condición
          </Button>
        </div>
      </Step>

      <Step n="03" title="Entonces" icon={<Zap />} aside={<span className="font-mono text-[12px] text-text-faint">{s.actions.length}/20</span>}>
        <Err path="actions" />
        {s.actions.length ? (
          <ol className="flex flex-col gap-3">
            {s.actions.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: el orden es la identidad de la acción
              <li key={i} className="rounded-[var(--radius-control)] border border-border bg-bg-elevated/60 p-3 md:p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#2DD4BF]/15 font-mono text-[12px] text-teal-700 dark:text-[#2DD4BF]">{i + 1}</span>
                  <p className="flex-1 truncate text-[14px] font-medium text-text">{meta.actions.find((x) => x.key === a.type)?.label ?? a.type}</p>
                  <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-9"
                    aria-label="Bajar"
                    disabled={i === s.actions.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-9"
                    aria-label={`Quitar acción ${i + 1}`}
                    onClick={() => patch({ actions: s.actions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <ActionParams i={i} a={a} meta={meta} set={(p) => setParams(i, p)} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-text-muted">Agregá al menos una acción. Se ejecutan en orden.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Menu
            align="start"
            trigger={
              <Button type="button" variant="secondary" disabled={s.actions.length >= 20}>
                <Plus className="size-4" /> Agregar acción
              </Button>
            }
          >
            {meta.actions.map((x) => (
              <MenuItem key={x.key} onSelect={() => patch({ actions: [...s.actions, { type: x.key, params: { ...DEFAULT_PARAMS[x.key] } }] })}>
                {x.label}
              </MenuItem>
            ))}
          </Menu>
        </div>
        {vars.length ? (
          <details className="group rounded-[var(--radius-control)] border border-border px-3 py-2">
            <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-text-muted">
              <Braces className="size-4" /> Variables para los textos <span className="font-mono text-[12px] text-text-faint">{"{{ }}"}</span>
            </summary>
            <div className="flex flex-wrap gap-1.5 pt-2 pb-1">
              {vars.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="min-h-9 rounded-md border border-border bg-bg-elevated px-2 font-mono text-[12px] text-text-muted hover:text-text"
                  title={`Copiar {{${f.path}}}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(`{{${f.path}}}`);
                    toast.success(`Copiado {{${f.path}}}`);
                  }}
                >
                  {`{{${f.path}}}`}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </Step>

      <Card className="p-4 md:p-5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-text">
          <Checkbox checked={s.testMode} onChange={(e) => patch({ testMode: e.target.checked })} className="mt-0.5" />
          <span>
            Modo prueba
            <span className="block text-[12px] text-text-faint">Registra qué haría en cada ejecución, sin crear, enviar ni cambiar nada.</span>
          </span>
        </label>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/automatizaciones">Cancelar</Link>
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ActionParams({ i, a, meta, set }: { i: number; a: Action; meta: BuilderMeta; set: (p: Record<string, unknown>) => void }) {
  const id = `act-${i}`;
  const p = a.params;
  const str = (k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));
  const err = (k: string) => <Err path={`actions.${i}.params.${k}`} />;
  switch (a.type) {
    case "create_task":
      return (
        <div className="flex flex-col gap-3">
          <Labeled label="Título de la tarea" htmlFor={`${id}-title`}>
            <Input id={`${id}-title`} value={str("title")} onChange={(e) => set({ title: e.target.value })} maxLength={300} placeholder="Ej.: Kickoff con {{cliente.nombre}}" />
            {err("title")}
          </Labeled>
          <Labeled label="Descripción (opcional)" htmlFor={`${id}-desc`}>
            <Textarea id={`${id}-desc`} rows={2} value={str("description")} onChange={(e) => set({ description: e.target.value })} maxLength={5000} />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Prioridad" htmlFor={`${id}-prio`}>
              <Select id={`${id}-prio`} value={str("priority") || "3"} onChange={(e) => set({ priority: Number(e.target.value) })}>
                <option value="1">P1 · Urgente</option>
                <option value="2">P2 · Alta</option>
                <option value="3">P3 · Normal</option>
                <option value="4">P4 · Baja</option>
              </Select>
            </Labeled>
            <Labeled label="Vence en (días)" htmlFor={`${id}-due`} hint="Vacío: sin fecha. 0: hoy.">
              <Input
                id={`${id}-due`}
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                value={str("dueInDays")}
                onChange={(e) => set({ dueInDays: e.target.value === "" ? "" : Number(e.target.value) })}
              />
              {err("dueInDays")}
            </Labeled>
            <Labeled label="Proyecto" htmlFor={`${id}-proj`}>
              <Select id={`${id}-proj`} value={str("project") || "event"} onChange={(e) => set({ project: e.target.value })}>
                <option value="event">El del evento (si hay)</option>
                <option value="none">Sin proyecto</option>
              </Select>
            </Labeled>
          </div>
        </div>
      );
    case "notify":
      return (
        <div className="flex flex-col gap-3">
          <Labeled label="Título" htmlFor={`${id}-title`}>
            <Input id={`${id}-title`} value={str("title")} onChange={(e) => set({ title: e.target.value })} maxLength={200} />
            {err("title")}
          </Labeled>
          <Labeled label="Texto (opcional)" htmlFor={`${id}-body`}>
            <Textarea id={`${id}-body`} rows={2} value={str("body")} onChange={(e) => set({ body: e.target.value })} maxLength={2000} />
          </Labeled>
        </div>
      );
    case "send_email":
      return (
        <div className="flex flex-col gap-3">
          <Labeled label="Para" htmlFor={`${id}-to`}>
            <Select id={`${id}-to`} value={str("to") || "owner"} onChange={(e) => set({ to: e.target.value, automatic: false, confirmAutomatic: false })}>
              <option value="owner">A mí</option>
              <option value="client">Al cliente del evento (contacto principal)</option>
            </Select>
          </Labeled>
          <Labeled label="Asunto" htmlFor={`${id}-subject`}>
            <Input id={`${id}-subject`} value={str("subject")} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
            {err("subject")}
          </Labeled>
          <Labeled label="Texto" htmlFor={`${id}-body`}>
            <Textarea id={`${id}-body`} rows={5} value={str("body")} onChange={(e) => set({ body: e.target.value })} maxLength={10000} />
            {err("body")}
          </Labeled>
          {p.to === "client" ? (
            <div className="rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft/40 p-3">
              {!p.automatic ? (
                <p className="mb-2 flex items-center gap-2 text-[13px] text-text-muted">
                  <Badge tone="warning">Con aprobación</Badge> Queda en Aprobaciones hasta que lo revises.
                </p>
              ) : null}
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[13px] text-text">
                <Checkbox checked={Boolean(p.automatic)} onChange={(e) => set({ automatic: e.target.checked, confirmAutomatic: false })} className="mt-0.5" />
                <span>Enviar automático (sin aprobación)</span>
              </label>
              {p.automatic ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[13px] text-text">
                  <Checkbox checked={Boolean(p.confirmAutomatic)} onChange={(e) => set({ confirmAutomatic: e.target.checked })} className="mt-0.5" />
                  <span>Entiendo que este email le llega al cliente sin que yo lo revise.</span>
                </label>
              ) : null}
              {err("confirmAutomatic")}
            </div>
          ) : null}
        </div>
      );
    case "set_status":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Qué" htmlFor={`${id}-target`}>
            <Select id={`${id}-target`} value={str("target") || "task"} onChange={(e) => set({ target: e.target.value, status: e.target.value === "task" ? "done" : "in_progress" })}>
              <option value="task">La tarea del evento</option>
              <option value="project">El proyecto del evento</option>
            </Select>
          </Labeled>
          <Labeled label="Nuevo estado" htmlFor={`${id}-status`}>
            <Select id={`${id}-status`} value={str("status")} onChange={(e) => set({ status: e.target.value })}>
              {(p.target === "project" ? meta.projectStatuses : meta.taskStatuses).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {err("status")}
          </Labeled>
        </div>
      );
    case "webhook":
      return meta.endpoints.length ? (
        <Labeled label="Webhook saliente" htmlFor={`${id}-ep`} hint="POST JSON firmado (X-Agencyos-Signature: t=…,v1=HMAC-SHA256).">
          <Select id={`${id}-ep`} value={str("endpointId")} onChange={(e) => set({ endpointId: e.target.value })}>
            <option value="">Elegí un webhook…</option>
            {meta.endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.active ? "" : " (pausado)"}
              </option>
            ))}
          </Select>
          {err("endpointId")}
        </Labeled>
      ) : (
        <p className="text-[14px] text-text-muted">
          Todavía no tenés webhooks salientes.{" "}
          <Link href="/automatizaciones/webhooks" className="text-accent underline-offset-2 hover:underline">
            Crear uno
          </Link>{" "}
          y volvé a esta regla.
          {err("endpointId")}
        </p>
      );
    case "wait":
      return (
        <Labeled label="Esperar (días)" htmlFor={`${id}-days`} hint="Después sigue con las acciones de abajo.">
          <Input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={str("days")}
            onChange={(e) => set({ days: Number(e.target.value || 1) })}
            className="sm:max-w-40"
          />
          {err("days")}
        </Labeled>
      );
    default:
      return null;
  }
}

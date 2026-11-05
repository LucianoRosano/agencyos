"use client";

import { L } from "@agencyos/core";
import { Button, Input, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { createTemplateAction, deleteTemplateAction, restoreTemplateAction, updateTemplateAction } from "@/app/(app)/biblioteca/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

// Igual que en el servidor (library/service.ts): {{variable}}
const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]{1,40})\s*\}\}/gu;
const extractVars = (body: string) => [...new Set([...body.matchAll(VAR_RE)].map((m) => m[1] ?? ""))].filter(Boolean);
const fill = (body: string, values: Record<string, string>) => body.replace(VAR_RE, (m, k: string) => (values[k]?.length ? values[k] : m));

type Tpl = { id: string; name: string; kind: string; bodyMd: string };
const KIND_OPTS = Object.entries(L.templateKind).map(([value, label]) => ({ value, label }));

export function TemplateSheet({ tpl, trigger, defaultKind }: { tpl?: Tpl; trigger?: ReactNode; defaultKind?: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(tpl?.bodyMd ?? "");
  const vars = extractVars(body);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={tpl ? "Editar plantilla" : "Nueva plantilla"}
      description="Markdown con variables entre llaves dobles: {{cliente}}, {{fecha}}…"
      wide
      trigger={
        trigger ?? (
          <Button variant="primary">
            <Plus className="size-4" /> Nueva plantilla
          </Button>
        )
      }
    >
      <ActionForm
        action={tpl ? updateTemplateAction.bind(null, tpl.id) : createTemplateAction}
        successMessage={tpl ? "Plantilla guardada" : "Plantilla creada"}
        onSuccess={() => {
          setOpen(false);
          if (!tpl) setBody("");
        }}
        resetOnSuccess={!tpl}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <TextField label="Nombre" name="name" required defaultValue={tpl?.name} maxLength={120} placeholder="Ej.: Mail de bienvenida" />
          <SelectField label="Tipo" name="kind" defaultValue={tpl?.kind ?? defaultKind ?? "document"} options={KIND_OPTS} />
        </div>
        <TextAreaField
          label="Contenido (Markdown)"
          name="bodyMd"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono"
          hint={vars.length ? `Variables: ${vars.join(", ")}` : "Sin variables todavía."}
        />
        <div className="flex justify-end">
          <SubmitButton>{tpl ? "Guardar" : "Crear plantilla"}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function UseTemplateSheet({ tpl }: { tpl: Tpl }) {
  const [open, setOpen] = useState(false);
  const vars = useMemo(() => extractVars(tpl.bodyMd), [tpl.bodyMd]);
  const [values, setValues] = useState<Record<string, string>>({});
  const out = fill(tpl.bodyMd, values);
  const missing = vars.filter((v) => !values[v]?.trim());
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={`Usar «${tpl.name}»`}
      description={vars.length ? "Completá las variables y copiá el resultado." : "Copiá el contenido."}
      wide
      trigger={
        <Button variant="secondary" size="sm" className="h-11 md:h-8">
          <Copy className="size-4" /> Usar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {vars.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {vars.map((v) => (
              <label key={v} className="flex flex-col gap-1.5 text-[13px] font-medium text-text-muted">
                <span className="font-mono">{`{{${v}}}`}</span>
                <Input value={values[v] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))} aria-label={`Valor de ${v}`} />
              </label>
            ))}
          </div>
        ) : null}
        <pre
          className="max-h-[40vh] overflow-auto rounded-[10px] border border-border bg-bg-elevated p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-text"
          data-template-output
        >
          {out}
        </pre>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {missing.length ? <span className="text-[12px] text-warning">Faltan: {missing.join(", ")}</span> : null}
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(out);
                toast.success("Copiado al portapapeles");
              } catch {
                toast.error("No se pudo copiar: seleccioná el texto y copialo a mano.");
              }
            }}
          >
            <Copy className="size-4" /> Copiar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function TemplateMenu({ tpl }: { tpl: Tpl }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${tpl.name}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar la plantilla «${tpl.name}» a la papelera? Restaurable 30 días.`)) return;
            exec(() => deleteTemplateAction(tpl.id), { success: "Plantilla en la papelera", undo: () => restoreTemplateAction(tpl.id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? <EditTemplateOpen tpl={tpl} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function EditTemplateOpen({ tpl, onClose }: { tpl: Tpl; onClose: () => void }) {
  const [body, setBody] = useState(tpl.bodyMd);
  const vars = extractVars(body);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Editar plantilla" description="Markdown con variables entre llaves dobles." wide>
      <ActionForm action={updateTemplateAction.bind(null, tpl.id)} successMessage="Plantilla guardada" onSuccess={onClose}>
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <TextField label="Nombre" name="name" required defaultValue={tpl.name} maxLength={120} />
          <SelectField label="Tipo" name="kind" defaultValue={tpl.kind} options={KIND_OPTS} />
        </div>
        <TextAreaField
          label="Contenido (Markdown)"
          name="bodyMd"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono"
          hint={vars.length ? `Variables: ${vars.join(", ")}` : "Sin variables."}
        />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

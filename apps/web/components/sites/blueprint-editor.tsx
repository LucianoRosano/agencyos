"use client";

import { L } from "@agencyos/core";
import { Button, Card, cn, Input, SectionLabel, Select } from "@agencyos/ui";
import { ArrowDown, ArrowUp, FilePlus2, LayoutTemplate, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyTemplateAction, restoreBlueprintAction, saveBlueprintAction } from "@/app/(app)/sitios/actions";
import { useAction } from "@/components/use-action";

type Slot = { key: string; kind: string; label: string };
type Section = { key: string; title: string; slots: Slot[] };
type Page = { key: string; title: string; path?: string; sections: Section[] };
export type Tree = { pages: Page[] };

/** Clave estable (sin tildes) única dentro de su nivel. Se fija al crear: renombrar no la cambia. */
function keyFor(text: string, taken: string[]) {
  const base =
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j] as T, out[i] as T];
  return out;
}

const SLOT_KINDS = Object.entries(L.slotKind);

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="shrink-0">
      {children}
    </Button>
  );
}

/** Editor del blueprint: agregar, quitar y reordenar páginas, secciones y slots. Guardar crea una versión nueva. */
export function BlueprintEditor({ siteId, initial, nextVersion }: { siteId: string; initial: Tree; nextVersion: number }) {
  const [tree, setTree] = useState<Tree>(initial);
  const [sel, setSel] = useState(0);
  const { exec, pending } = useAction();
  const router = useRouter();
  const page = tree.pages[sel];
  const setPages = (pages: Page[]) => setTree({ pages });
  const setPage = (p: Page) => setPages(tree.pages.map((x, i) => (i === sel ? p : x)));
  const setSection = (si: number, s: Section) => page && setPage({ ...page, sections: page.sections.map((x, i) => (i === si ? s : x)) });

  function addPage() {
    const title = `Página ${tree.pages.length + 1}`;
    const key = keyFor(
      title,
      tree.pages.map((p) => p.key),
    );
    setPages([...tree.pages, { key, title, path: `/${key}`, sections: [] }]);
    setSel(tree.pages.length);
  }
  function addSection() {
    if (!page) return;
    const title = `Sección ${page.sections.length + 1}`;
    setPage({
      ...page,
      sections: [
        ...page.sections,
        {
          key: keyFor(
            title,
            page.sections.map((s) => s.key),
          ),
          title,
          slots: [],
        },
      ],
    });
  }
  function addSlot(si: number, kind = "text") {
    const s = page?.sections[si];
    if (!s) return;
    const label = L.slotKind[kind as keyof typeof L.slotKind] ?? "Slot";
    setSection(si, {
      ...s,
      slots: [
        ...s.slots,
        {
          key: keyFor(
            label,
            s.slots.map((x) => x.key),
          ),
          kind,
          label,
        },
      ],
    });
  }

  function save() {
    exec(() => saveBlueprintAction(siteId, JSON.stringify(tree)), {
      success: `Estructura guardada como versión ${nextVersion}`,
      onDone: () => router.push(`/sitios/${siteId}/estructura`),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-text-muted">
          Editando · se guarda como <span className="font-mono text-text">v{nextVersion}</span>. Los slots que quites se archivan con su contenido.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link href={`/sitios/${siteId}/estructura`}>
              <X className="size-4" /> Cancelar
            </Link>
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!tree.pages.length}>
            <Save className="size-4" /> Guardar versión
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-3">
          <SectionLabel className="mb-2 px-1">Páginas</SectionLabel>
          <ol className="flex flex-col gap-1">
            {tree.pages.map((p, i) => (
              <li key={p.key} className={cn("flex items-center gap-1 rounded-[var(--radius-control)]", i === sel && "bg-surface-2")}>
                <button
                  type="button"
                  onClick={() => setSel(i)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center px-2 text-left"
                  aria-current={i === sel}
                >
                  <span className="w-full truncate text-[14px] text-text">{p.title}</span>
                  <span className="w-full truncate font-mono text-[11px] text-text-faint">{p.path ?? `/${p.key}`}</span>
                </button>
                <IconBtn
                  label={`Subir «${p.title}»`}
                  disabled={i === 0}
                  onClick={() => {
                    setPages(move(tree.pages, i, -1));
                    setSel(i - 1);
                  }}
                >
                  <ArrowUp className="size-4" />
                </IconBtn>
                <IconBtn
                  label={`Bajar «${p.title}»`}
                  disabled={i === tree.pages.length - 1}
                  onClick={() => {
                    setPages(move(tree.pages, i, 1));
                    setSel(i + 1);
                  }}
                >
                  <ArrowDown className="size-4" />
                </IconBtn>
              </li>
            ))}
          </ol>
          <Button type="button" variant="secondary" className="mt-2 w-full" onClick={addPage}>
            <FilePlus2 className="size-4" /> Agregar página
          </Button>
        </Card>

        {page ? (
          <div className="flex min-w-0 flex-col gap-3">
            <Card className="grid gap-3 p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-text-muted">Título de la página</span>
                <Input value={page.title} maxLength={120} onChange={(e) => setPage({ ...page, title: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-text-muted">Ruta</span>
                <Input
                  value={page.path ?? ""}
                  maxLength={200}
                  className="font-mono"
                  onChange={(e) => setPage({ ...page, path: e.target.value || undefined })}
                />
              </label>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (!confirm(`¿Quitar la página «${page.title}» de la estructura? Su contenido queda archivado.`)) return;
                  setPages(tree.pages.filter((_, i) => i !== sel));
                  setSel(Math.max(0, sel - 1));
                }}
              >
                <Trash2 className="size-4" /> Quitar página
              </Button>
            </Card>

            {page.sections.map((s, si) => (
              <Card key={s.key} className="p-4">
                <div className="mb-3 flex items-center gap-1">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Título de la sección</span>
                    <Input value={s.title} maxLength={120} onChange={(e) => setSection(si, { ...s, title: e.target.value })} className="font-medium" />
                  </label>
                  <IconBtn label={`Subir sección «${s.title}»`} disabled={si === 0} onClick={() => setPage({ ...page, sections: move(page.sections, si, -1) })}>
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label={`Bajar sección «${s.title}»`}
                    disabled={si === page.sections.length - 1}
                    onClick={() => setPage({ ...page, sections: move(page.sections, si, 1) })}
                  >
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <IconBtn label={`Quitar sección «${s.title}»`} onClick={() => setPage({ ...page, sections: page.sections.filter((_, i) => i !== si) })}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
                <ul className="flex flex-col gap-2">
                  {s.slots.map((sl, k) => (
                    <li
                      key={sl.key}
                      className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-bg-elevated p-2 sm:flex-row sm:items-center"
                    >
                      <Select
                        aria-label="Tipo de slot"
                        value={sl.kind}
                        onChange={(e) => setSection(si, { ...s, slots: s.slots.map((x, i) => (i === k ? { ...x, kind: e.target.value } : x)) })}
                        className="sm:w-36"
                      >
                        {SLOT_KINDS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Nombre del slot</span>
                          <Input
                            value={sl.label}
                            maxLength={120}
                            onChange={(e) => setSection(si, { ...s, slots: s.slots.map((x, i) => (i === k ? { ...x, label: e.target.value } : x)) })}
                          />
                        </label>
                        <IconBtn label={`Subir «${sl.label}»`} disabled={k === 0} onClick={() => setSection(si, { ...s, slots: move(s.slots, k, -1) })}>
                          <ArrowUp className="size-4" />
                        </IconBtn>
                        <IconBtn
                          label={`Bajar «${sl.label}»`}
                          disabled={k === s.slots.length - 1}
                          onClick={() => setSection(si, { ...s, slots: move(s.slots, k, 1) })}
                        >
                          <ArrowDown className="size-4" />
                        </IconBtn>
                        <IconBtn label={`Quitar «${sl.label}»`} onClick={() => setSection(si, { ...s, slots: s.slots.filter((_, i) => i !== k) })}>
                          <Trash2 className="size-4" />
                        </IconBtn>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="ghost" size="sm" className="mt-2 h-10" onClick={() => addSlot(si)}>
                  <Plus className="size-4" /> Agregar slot
                </Button>
              </Card>
            ))}
            <Button type="button" variant="secondary" onClick={addSection}>
              <Plus className="size-4" /> Agregar sección
            </Button>
          </div>
        ) : (
          <Card className="p-6 text-[14px] text-text-muted">Agregá la primera página.</Card>
        )}
      </div>
    </div>
  );
}

/** Generar la estructura desde una plantilla por tipo de sitio. */
export function TemplatePicker({
  siteId,
  kind,
  currentVersion,
  templates,
}: {
  siteId: string;
  kind: string;
  currentVersion: number | null;
  templates: { value: string; label: string }[];
}) {
  const hasTree = currentVersion !== null;
  const [value, setValue] = useState(templates.some((t) => t.value === kind) ? kind : (templates[0]?.value ?? "institutional"));
  const { exec, pending } = useAction();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select aria-label="Plantilla de estructura" value={value} onChange={(e) => setValue(e.target.value)} className="sm:w-48">
        {templates.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Button
        variant={hasTree ? "secondary" : "primary"}
        loading={pending}
        onClick={() => {
          if (
            hasTree &&
            !confirm("Se crea una versión nueva con la plantilla. Los slots que no estén en la plantilla se archivan (con su contenido). ¿Seguir?")
          )
            return;
          exec(() => applyTemplateAction(siteId, value), {
            success: "Estructura generada desde la plantilla",
            undo: currentVersion !== null ? () => restoreBlueprintAction(siteId, currentVersion) : undefined,
          });
        }}
      >
        <LayoutTemplate className="size-4" /> Generar desde plantilla
      </Button>
    </div>
  );
}

export function RestoreVersionButton({ siteId, version }: { siteId: string; version: number }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-10"
      loading={pending}
      onClick={() => {
        if (!confirm(`¿Restaurar la versión ${version}? Se guarda como una versión nueva; la historia no se pierde.`)) return;
        exec(() => restoreBlueprintAction(siteId, version), { success: `Versión ${version} restaurada como versión nueva` });
      }}
    >
      Restaurar
    </Button>
  );
}

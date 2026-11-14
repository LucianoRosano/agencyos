import "server-only";
import { type Ctx, diffDays, formatDate, formatDateTime, L, label, relativeFromDate, todayAR } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { attachmentsForMany } from "@agencyos/modules/library/queries";
import { brandFromSettings } from "@agencyos/modules/quotes/queries";
import { BLUEPRINT_TEMPLATES, TEMPLATE_KINDS } from "@agencyos/modules/sites/blueprint";
import { briefBlocksFor, briefProgress, generateQuestions, questionsMessageParts } from "@agencyos/modules/sites/brief";
import { areaTitle, isCriticalCheck, LAUNCH_AREAS } from "@agencyos/modules/sites/checklist";
import {
  getBlueprint,
  getBrief,
  hostingOptions,
  listEnvironments,
  listLaunchChecks,
  listRequirements,
  listRounds,
  listSlots,
  type SiteSummary,
  siteAssets,
  siteDocs,
  siteFiles,
  siteMonitoring,
} from "@agencyos/modules/sites/queries";
import { Badge, BlockCard, Button, Card, cn, Dot, EmptyState, Progress, SectionLabel } from "@agencyos/ui";
import {
  Activity,
  BookText,
  CalendarClock,
  CircleAlert,
  FileText,
  FolderOpen,
  Globe,
  HeartPulse,
  Image as ImageIcon,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  MessageSquareWarning,
  Package,
  Pencil,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { EntitySide } from "@/components/collab/entity-side";
import { Attachments } from "@/components/library/attachments";
import { AttachmentsBlock } from "@/components/library/attachments-block";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import type { AppCtx } from "@/lib/session";
import { BlueprintEditor, RestoreVersionButton, TemplatePicker, type Tree } from "./blueprint-editor";
import { BriefForm, QuestionsPanel } from "./brief-ui";
import { SlotEditSheet, SlotStatusSelect } from "./content-ui";
import { DeleteEnvironmentButton, EnvironmentSheet } from "./env-ui";
import { EnsureDocsButton, LaunchEditSheet, LaunchStatusToggle, NewLaunchCheckSheet } from "./launch-ui";
import { NewRequirementSheet, RequirementList } from "./requirements-ui";
import { CloseRoundButton, EditItemSheet, ItemStatusSelect, NewItemSheet, OpenRoundButton } from "./revisions-ui";
import { pct, REVISION_TONE, SITES_ACCENT, SLOT_COLOR, SLOT_STATUS_ORDER, SLOT_TONE } from "./shared";
import { PublicationStatusSelect } from "./site-header";

type P = { ctx: Ctx & { workspace: { settings: unknown } }; site: SiteSummary };

const kindLabel = (k: string) => label(L.slotKind, k);

// --- Briefing ---

export async function BriefTab({ ctx, site }: P) {
  const brief = await getBrief(ctx, site.s.id);
  const answers = (brief?.answers ?? {}) as Record<string, string | string[]>;
  const blocks = briefBlocksFor(site.s.kind);
  const prog = briefProgress(site.s.kind, answers);
  const brand = brandFromSettings(ctx.workspace.settings as Parameters<typeof brandFromSettings>[0]);
  const parts = questionsMessageParts({ clientName: site.clientName, siteName: site.s.name, brand: brand.name });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-3">
          <Progress value={pct(prog.done, prog.total)} className="flex-1" label="Avance del briefing" />
          <span className="font-mono text-[12px] text-text-muted">
            {prog.done}/{prog.total} datos
          </span>
        </div>
        <BriefForm siteId={site.s.id} blocks={blocks} answers={answers} version={brief?.version ?? 1} />
      </div>
      <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:h-fit">
        <QuestionsPanel
          siteId={site.s.id}
          questions={brief?.questionsForClient ?? []}
          missing={generateQuestions(site.s.kind, answers).length}
          intro={parts.intro}
          outro={parts.outro}
        />
      </div>
    </div>
  );
}

// --- Requerimientos ---

export async function RequirementsTab({ ctx, site }: P) {
  const reqs = await listRequirements(ctx, site.s.id);
  const by = (m: string) => reqs.filter((r) => r.moscow === m).length;
  const done = reqs.filter((r) => r.status === "done").length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-text-muted">
          {reqs.length
            ? `${done}/${reqs.length} cumplidos · must ${by("must")} · should ${by("should")} · could ${by("could")} · won't ${by("wont")}`
            : "MoSCoW"}
        </p>
        {reqs.length ? <NewRequirementSheet siteId={site.s.id} /> : null}
      </div>
      {reqs.length ? (
        <RequirementList items={reqs.map((r) => ({ ...r, html: renderMarkdown(r.acceptanceMd) }))} />
      ) : (
        <Card>
          <EmptyState
            icon={<ListChecks />}
            title="Sin requerimientos"
            description="Listá qué tiene que hacer el sitio, priorizado con MoSCoW, y cómo se comprueba cada cosa (criterio de aceptación)."
            action={<NewRequirementSheet siteId={site.s.id} label="Agregar el primero" />}
          />
        </Card>
      )}
    </div>
  );
}

// --- Estructura ---

type SlotRow = Awaited<ReturnType<typeof listSlots>>[number];
const slotMap = (slots: SlotRow[]) => new Map(slots.map((s) => [`${s.pageKey}/${s.sectionKey}/${s.slotKey}`, s]));

function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-muted" aria-label="Estados de contenido">
      {SLOT_STATUS_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <Dot color={SLOT_COLOR[s] as string} /> {L.slotStatus[s]}
        </li>
      ))}
    </ul>
  );
}

export async function StructureTab({ ctx, site, page, editing }: P & { page?: string; editing: boolean }) {
  const [bp, slots] = await Promise.all([getBlueprint(ctx, site.s.id), listSlots(ctx, site.s.id)]);
  const templates = TEMPLATE_KINDS.map((k) => ({ value: k, label: BLUEPRINT_TEMPLATES[k].name }));
  const base = `/sitios/${site.s.id}/estructura`;
  const nextVersion = (bp.versions[0]?.version ?? 0) + 1;
  if (editing)
    return (
      <BlueprintEditor
        siteId={site.s.id}
        nextVersion={nextVersion}
        initial={(bp.current?.tree as Tree | undefined) ?? { pages: [{ key: "inicio", title: "Inicio", path: "/", sections: [] }] }}
      />
    );
  if (!bp.current)
    return (
      <Card>
        <EmptyState
          icon={<LayoutTemplate />}
          title="Todavía no hay estructura"
          description="Generala desde la plantilla del tipo de sitio (páginas, secciones y slots de contenido) y después ajustala. Cada guardado queda como versión."
          action={
            <div className="flex flex-col items-center gap-3">
              <TemplatePicker siteId={site.s.id} kind={site.s.kind} currentVersion={null} templates={templates} />
              <Link href={`${base}?editar=1`} className="text-[13px] text-text-muted underline-offset-4 hover:text-text hover:underline">
                o empezar de cero
              </Link>
            </div>
          }
        />
      </Card>
    );
  const tree = bp.current.tree;
  const map = slotMap(slots);
  const current = tree.pages.find((p) => p.key === page) ?? tree.pages[0];
  const pageStats = (key: string) => {
    const list = slots.filter((s) => s.pageKey === key);
    return { done: list.filter((s) => s.status === "approved" || s.status === "published").length, total: list.length, list };
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="accent">v{bp.current.version}</Badge>
          <span className="text-[13px] text-text-muted">
            {tree.pages.length} páginas · {slots.length} slots · {bp.current.source === "template" ? "desde plantilla" : "manual"} ·{" "}
            {formatDate(bp.current.createdAt)}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TemplatePicker siteId={site.s.id} kind={site.s.kind} currentVersion={bp.current.version} templates={templates} />
          <Button asChild variant="primary">
            <Link href={`${base}?editar=1${current ? `&pagina=${current.key}` : ""}`}>
              <Pencil className="size-4" /> Editar estructura
            </Link>
          </Button>
        </div>
      </div>
      <StatusLegend />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          <SectionLabel className="px-2 pt-2 pb-1">Páginas</SectionLabel>
          <nav aria-label="Páginas del sitio">
            <ol className="flex flex-col">
              {tree.pages.map((p) => {
                const st = pageStats(p.key);
                const active = p.key === current?.key;
                return (
                  <li key={p.key}>
                    <Link
                      href={`${base}?pagina=${p.key}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 transition-colors hover:bg-surface-2",
                        active && "bg-surface-2",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-text">{p.title}</span>
                        <span className="flex gap-0.5 pt-1" aria-hidden>
                          {st.list.slice(0, 18).map((s) => (
                            <span key={s.id} className="h-1 w-2.5 rounded-full" style={{ background: SLOT_COLOR[s.status] }} />
                          ))}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-text-faint">
                        {st.done}/{st.total}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </Card>
        {current ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[18px] font-semibold text-text">{current.title}</h2>
              <span className="truncate font-mono text-[12px] text-text-faint">{current.path ?? `/${current.key}`}</span>
            </div>
            {current.sections.length ? (
              current.sections.map((sec) => (
                <Card key={sec.key} className="p-4">
                  <SectionLabel className="mb-3">{sec.title}</SectionLabel>
                  {sec.slots.length ? (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sec.slots.map((sl) => {
                        const row = map.get(`${current.key}/${sec.key}/${sl.key}`);
                        const status = row?.status ?? "pending";
                        return (
                          <li
                            key={sl.key}
                            className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 py-2"
                            style={{ borderLeft: `3px solid ${SLOT_COLOR[status]}` }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] text-text">{sl.label}</span>
                              <span className="font-mono text-[11px] text-text-faint">{kindLabel(sl.kind)}</span>
                            </span>
                            <Badge tone={SLOT_TONE[status]}>{label(L.slotStatus, status)}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-text-faint">Sección sin slots.</p>
                  )}
                </Card>
              ))
            ) : (
              <Card className="p-5 text-[14px] text-text-muted">Esta página no tiene secciones. Editá la estructura para agregarlas.</Card>
            )}
          </div>
        ) : null}
      </div>
      <details className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted">Versiones ({bp.versions.length})</summary>
        <ol className="mt-3 flex flex-col divide-y divide-border">
          {bp.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-1.5 text-[13px]">
              <span className="w-10 font-mono text-text">v{v.version}</span>
              <span className="flex-1 text-text-muted">
                {v.pages} páginas · {v.source === "template" ? "plantilla" : v.source === "agent" ? "agente" : "manual"} · {formatDateTime(v.createdAt)}
              </span>
              {v.isCurrent ? <Badge tone="accent">actual</Badge> : <RestoreVersionButton siteId={site.s.id} version={v.version} />}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

// --- Contenidos ---

export async function ContentTab({ ctx, site, status }: P & { status?: string }) {
  const [bp, slots] = await Promise.all([getBlueprint(ctx, site.s.id), listSlots(ctx, site.s.id)]);
  if (!bp.current)
    return (
      <Card>
        <EmptyState
          icon={<FileText />}
          title="Primero, la estructura"
          description="Los contenidos se organizan por los slots del blueprint (título, texto, imagen, CTA, producto, formulario)."
          action={
            <Button asChild variant="primary">
              <Link href={`/sitios/${site.s.id}/estructura`}>Ir a Estructura</Link>
            </Button>
          }
        />
      </Card>
    );
  const map = slotMap(slots);
  const filter = status && (SLOT_STATUS_ORDER as readonly string[]).includes(status) ? status : undefined;
  const counts = Object.fromEntries(SLOT_STATUS_ORDER.map((s) => [s, slots.filter((x) => x.status === s).length]));
  const base = `/sitios/${site.s.id}/contenidos`;
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por estado">
        <Link
          href={base}
          aria-current={!filter ? "page" : undefined}
          className={cn(
            "flex h-9 items-center gap-2 rounded-full border border-border px-3 text-[13px]",
            !filter ? "bg-surface-2 text-text" : "text-text-muted",
          )}
        >
          Todos <span className="font-mono text-[11px]">{slots.length}</span>
        </Link>
        {SLOT_STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={`${base}?estado=${s}`}
            aria-current={filter === s ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border border-border px-3 text-[13px]",
              filter === s ? "bg-surface-2 text-text" : "text-text-muted",
            )}
          >
            <Dot color={SLOT_COLOR[s] as string} /> {L.slotStatus[s]} <span className="font-mono text-[11px]">{counts[s]}</span>
          </Link>
        ))}
      </nav>
      {bp.current.tree.pages.map((p) => {
        const all = p.sections.flatMap((sec) =>
          sec.slots.map((sl) => ({ sec, sl, row: map.get(`${p.key}/${sec.key}/${sl.key}`) })).filter((x): x is typeof x & { row: SlotRow } => Boolean(x.row)),
        );
        const done = all.filter((x) => x.row.status === "approved" || x.row.status === "published").length;
        const shown = filter ? all.filter((x) => x.row.status === filter) : all;
        if (!shown.length) return null;
        return (
          <Card key={p.key} className="p-4 md:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[16px] font-medium text-text">{p.title}</h2>
              <div className="flex items-center gap-3 sm:w-64">
                <Progress value={pct(done, all.length)} className="flex-1" tone="success" label={`Contenidos aprobados de ${p.title}`} />
                <span className="font-mono text-[12px] text-text-muted">
                  {done}/{all.length}
                </span>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {shown.map(({ sec, sl, row }) => (
                <li key={row.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Dot color={SLOT_COLOR[row.status] as string} className="mt-1.5" />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-text">{sl.label}</p>
                      <p className="truncate font-mono text-[11px] text-text-faint">
                        {sec.title} · {kindLabel(sl.kind)} · {label(L.siteAssignee, row.assigneeType)}
                      </p>
                      {row.bodyMd ? <p className="mt-0.5 line-clamp-1 text-[13px] text-text-muted">{row.bodyMd.replace(/[#*_>`]/g, "")}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pl-[18px] sm:pl-0">
                    <SlotStatusSelect id={row.id} status={row.status} label={sl.label} />
                    <SlotEditSheet
                      id={row.id}
                      title={sl.label}
                      kindLabel={kindLabel(sl.kind)}
                      status={row.status}
                      assigneeType={row.assigneeType}
                      bodyMd={row.bodyMd}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {filter && !slots.some((s) => s.status === filter) ? (
        <p className="text-[14px] text-text-muted">No hay contenidos «{label(L.slotStatus, filter).toLowerCase()}».</p>
      ) : null}
    </div>
  );
}

// --- Recursos ---

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1).replace(".", ",")} MB`);

export async function ResourcesTab({ ctx, site }: P) {
  const files = await siteFiles(ctx, site.s.id);
  const libHref = `/biblioteca?sitio=${site.s.id}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <AttachmentsBlock
          ctx={ctx}
          entityType="site"
          entityId={site.s.id}
          title="Archivos del sitio"
          emptyText="Subí logos, fotos y textos del cliente: quedan en la Biblioteca y adjuntos a este sitio."
        />
        {files.length ? (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>Vinculados en la Biblioteca</SectionLabel>
              <Link href={libHref} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-text-muted hover:text-text">
                <FolderOpen className="size-4" /> Ver todos
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/biblioteca/archivo/${f.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3 hover:border-border-strong"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 font-mono text-[10px] uppercase text-text-muted">
                      {(f.name.split(".").pop() ?? f.kind).slice(0, 4)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-text">{f.name}</span>
                      <span className="font-mono text-[11px] text-text-faint">
                        {bytes(f.size)} · {formatDate(f.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <EntitySide ctx={ctx as AppCtx} type="site" id={site.s.id} />
      </div>
    </div>
  );
}

// --- Revisiones ---

export async function RevisionsTab({ ctx, site }: P) {
  const [rounds, bp] = await Promise.all([listRounds(ctx, site.s.id), getBlueprint(ctx, site.s.id)]);
  const shots = await attachmentsForMany(
    ctx,
    "revision_item",
    rounds.flatMap((r) => r.items.map((i) => i.id)),
  );
  const pages = bp.current?.tree.pages.map((p) => p.title) ?? [];
  const open = rounds.find((r) => r.status === "open");
  const next = (rounds[0]?.number ?? 0) + 1;
  if (!rounds.length)
    return (
      <Card>
        <EmptyState
          icon={<MessageSquareWarning />}
          title="Sin rondas de revisión"
          description="Abrí la ronda R1 cuando el cliente vea el staging y cargá cada cambio que pida: página, descripción, prioridad y responsable."
          action={<OpenRoundButton siteId={site.s.id} next={1} />}
        />
      </Card>
    );
  return (
    <div className="flex flex-col gap-4">
      {!open ? (
        <div className="flex justify-end">
          <OpenRoundButton siteId={site.s.id} next={next} />
        </div>
      ) : null}
      {rounds.map((r) => {
        const pending = r.items.filter((i) => i.status === "open" || i.status === "in_progress").length;
        return (
          <Card key={r.id} className={cn("p-4 md:p-5", r.status === "closed" && "opacity-80")}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[20px] font-semibold text-text">R{r.number}</span>
                <Badge tone={r.status === "open" ? "warning" : "success"}>{r.status === "open" ? "Abierta" : "Cerrada"}</Badge>
                <span className="font-mono text-[12px] text-text-muted">
                  {formatDate(r.openedAt)}
                  {r.closedAt ? ` → ${formatDate(r.closedAt)}` : ""} · {r.items.length} ítems{pending ? ` · ${pending} abiertos` : ""}
                </span>
              </div>
              {r.status === "open" ? (
                <div className="flex flex-wrap gap-2">
                  <NewItemSheet roundId={r.id} number={r.number} pages={pages} />
                  <CloseRoundButton roundId={r.id} number={r.number} />
                </div>
              ) : null}
            </div>
            {r.items.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {r.items.map((it) => (
                  <li key={it.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 font-mono text-[12px] text-text-faint">P{it.priority}</span>
                      <div className="min-w-0">
                        <p className={cn("text-[14px] whitespace-pre-wrap", it.status === "resolved" ? "text-text-muted line-through" : "text-text")}>
                          {it.description}
                        </p>
                        <p className="font-mono text-[11px] text-text-faint">
                          {it.pageRef ?? "Sin página"} · {it.assignee ? label(L.siteAssignee, it.assignee) : "sin responsable"}
                        </p>
                        {r.status === "open" || (shots.get(it.id) ?? []).length ? (
                          <details className="mt-1" open={(shots.get(it.id) ?? []).length > 0}>
                            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[12px] text-text-muted hover:text-text">
                              <ImageIcon className="size-3.5" />{" "}
                              {(shots.get(it.id) ?? []).length ? `Capturas (${(shots.get(it.id) ?? []).length})` : "Agregar captura"}
                            </summary>
                            <div className="mt-2">
                              <Attachments
                                entityType="revision_item"
                                entityId={it.id}
                                initial={shots.get(it.id) ?? []}
                                emptyText="Sin capturas."
                                uploadLabel="Subir captura"
                              />
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                    {r.status === "open" ? (
                      <div className="flex items-center gap-1 pl-8 sm:pl-0">
                        <ItemStatusSelect id={it.id} status={it.status} />
                        <EditItemSheet item={it} pages={pages} />
                      </div>
                    ) : (
                      <Badge tone={REVISION_TONE[it.status]}>{label(L.revisionItemStatus, it.status)}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">Sin ítems. Agregá cada cambio que pida el cliente.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// --- Dominio y hosting ---

function Expiry({ on }: { on: string | null }) {
  if (!on) return <span className="text-text-faint">sin fecha</span>;
  const d = diffDays(on, todayAR());
  return (
    <span className={cn("font-mono", d < 0 ? "text-danger" : d <= 30 ? "text-warning" : "text-text")}>
      {formatDate(on)}
      <span className="text-text-muted"> · {d < 0 ? `vencido hace ${-d} d` : d === 0 ? "vence hoy" : `en ${d} d`}</span>
    </span>
  );
}

export async function HostingTab({ ctx, site }: P) {
  const [assets, envs, hostings] = await Promise.all([
    siteAssets(ctx, { id: site.s.id, clientId: site.s.clientId }),
    listEnvironments(ctx, site.s.id),
    hostingOptions(ctx),
  ]);
  const hostingOpts = hostings.map((h) => ({ value: h.id, label: h.plan ? `${h.provider} · ${h.plan}` : h.provider }));
  const empty = !assets.domains.length && !assets.hostings.length && !assets.certificates.length;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <BlockCard
        icon={<Server />}
        title="Entornos"
        className="lg:col-span-2"
        action={envs.length ? <EnvironmentSheet siteId={site.s.id} hostings={hostingOpts} /> : null}
      >
        {envs.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {envs.map(({ e, hostingProvider, hostingPlan }) => (
              <li key={e.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                <Badge tone={e.kind === "prod" ? "success" : "info"} className="w-fit">
                  {label(L.envKind, e.kind)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block truncate font-mono text-[13px] text-accent-text hover:underline"
                  >
                    {e.url.replace(/^https?:\/\//, "")}
                  </a>
                  <p className="text-[12px] text-text-muted">
                    {hostingProvider ? `${hostingProvider}${hostingPlan ? ` · ${hostingPlan}` : ""}` : "Sin hosting vinculado"} · PHP {e.phpVersion ?? "—"} ·
                    WordPress {e.wpVersion ?? "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <EnvironmentSheet siteId={site.s.id} env={e} hostings={hostingOpts} />
                  <DeleteEnvironmentButton id={e.id} url={e.url} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            title="Sin entornos"
            description="Cargá producción y staging: URL, hosting y versiones de PHP y WordPress."
            action={<EnvironmentSheet siteId={site.s.id} hostings={hostingOpts} />}
          />
        )}
      </BlockCard>

      {empty ? (
        <Card className="lg:col-span-2">
          <EmptyState
            icon={<Globe />}
            title="Sin dominio, hosting ni certificados vinculados"
            description="Se cargan en Activos técnicos (con vencimientos y avisos) y aparecen acá cuando están vinculados a este sitio o a su cliente. Las credenciales son solo referencias a Bitwarden."
            action={
              <Button asChild variant="primary">
                <Link href="/activos">Ir a Activos técnicos</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <BlockCard
            icon={<Globe />}
            title="Dominio"
            action={
              <Link href="/activos" className="text-[13px] text-text-muted hover:text-text">
                activos →
              </Link>
            }
          >
            {assets.domains.length ? (
              <ul className="flex flex-col gap-3">
                {assets.domains.map(({ d, credential, credentialPath }) => (
                  <li key={d.id} className="text-[13px]">
                    <p className="font-mono text-[14px] text-text">{d.name}</p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-muted">
                      <dt>Vence</dt>
                      <dd>
                        <Expiry on={d.expiresOn} />
                      </dd>
                      <dt>Registrador</dt>
                      <dd className="text-text">{d.registrar ?? "—"}</dd>
                      <dt>Titular</dt>
                      <dd className="text-text">{d.holder ?? "—"}</dd>
                      <dt>Renovación</dt>
                      <dd className="text-text">{d.autoRenew ? "Automática" : "Manual"}</dd>
                      <dt>DNS</dt>
                      <dd className="truncate text-text">{d.dnsRef ?? "—"}</dd>
                      {credential ? (
                        <>
                          <dt>Acceso</dt>
                          <dd className="flex items-center gap-1 text-text">
                            <KeyRound className="size-3.5 shrink-0" /> <span className="truncate">{credentialPath ?? credential}</span>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">Sin dominio vinculado.</p>
            )}
          </BlockCard>
          <BlockCard icon={<Server />} title="Hosting">
            {assets.hostings.length ? (
              <ul className="flex flex-col gap-3">
                {assets.hostings.map(({ h, credential, credentialPath }) => (
                  <li key={h.id} className="text-[13px]">
                    <p className="text-[14px] text-text">
                      {h.provider}
                      {h.plan ? <span className="text-text-muted"> · {h.plan}</span> : null}
                    </p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-muted">
                      <dt>Vence</dt>
                      <dd>
                        <Expiry on={h.expiresOn} />
                      </dd>
                      <dt>Ubicación</dt>
                      <dd className="text-text">{h.location ?? "—"}</dd>
                      {credential ? (
                        <>
                          <dt>Acceso</dt>
                          <dd className="flex items-center gap-1 text-text">
                            <KeyRound className="size-3.5 shrink-0" /> <span className="truncate">{credentialPath ?? credential}</span>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">Sin hosting vinculado.</p>
            )}
          </BlockCard>
          <BlockCard icon={<ShieldCheck />} title="Certificados" className="lg:col-span-2">
            {assets.certificates.length || envs.some(({ e }) => e.sslExpiresOn) ? (
              <ul className="flex flex-col gap-2 text-[13px]">
                {envs
                  .filter(({ e }) => e.sslExpiresOn)
                  .map(({ e }) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-2">
                      <span className="text-text">
                        SSL · {e.url.replace(/^https?:\/\//, "")} {e.sslIssuer ? <span className="text-text-muted">({e.sslIssuer})</span> : null}
                      </span>
                      <Expiry on={e.sslExpiresOn} />
                    </li>
                  ))}
                {assets.certificates.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-text">
                      {c.kind === "arca" ? "ARCA" : c.kind === "ssl" ? "SSL" : "Otro"} · {c.subject}
                    </span>
                    <Expiry on={c.expiresOn} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">Sin certificados registrados.</p>
            )}
          </BlockCard>
        </>
      )}
    </div>
  );
}

// --- Publicación ---

export async function LaunchTab({ ctx, site }: P) {
  const checks = await listLaunchChecks(ctx, site.s.id);
  const critical = checks.filter((c) => c.status === "todo" && isCriticalCheck(c.area, c.item));
  const done = checks.filter((c) => c.status !== "todo").length;
  return (
    <div className="flex flex-col gap-4">
      <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center md:p-5">
        <div className="min-w-0">
          <SectionLabel icon={<Rocket />} className="mb-2">
            Estado de publicación
          </SectionLabel>
          <div className="flex items-center gap-3">
            <Progress value={pct(done, checks.length)} tone="success" className="flex-1" label="Checklist de lanzamiento" />
            <span className="font-mono text-[12px] text-text-muted">
              {done}/{checks.length}
            </span>
          </div>
          <p className={cn("mt-2 flex items-center gap-1.5 text-[13px]", critical.length ? "text-warning" : "text-success")}>
            {critical.length ? <CircleAlert className="size-4 shrink-0" /> : <ShieldCheck className="size-4 shrink-0" />}
            {critical.length
              ? `${critical.length} ${critical.length === 1 ? "ítem crítico pendiente" : "ítems críticos pendientes"}: para publicar vas a tener que confirmar.`
              : "Sin ítems críticos pendientes."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <PublicationStatusSelect id={site.s.id} status={site.s.publicationStatus} />
          <NewLaunchCheckSheet siteId={site.s.id} areas={LAUNCH_AREAS.map((a) => ({ value: a.key, label: a.title }))} />
        </div>
      </Card>
      {LAUNCH_AREAS.map((a, i) => {
        const items = checks.filter((c) => c.area === a.key);
        if (!items.length) return null;
        const ok = items.filter((c) => c.status !== "todo").length;
        const allNa = items.every((c) => c.status === "na");
        return (
          <details key={a.key} className="group rounded-[var(--radius-card)] border border-border bg-surface" open={ok < items.length}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2">
              <span className="font-mono text-[12px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-[15px] text-text">{areaTitle(a.key)}</span>
              {allNa ? <Badge>No aplica</Badge> : null}
              <span className={cn("font-mono text-[12px]", ok === items.length ? "text-success" : "text-text-muted")}>
                {ok}/{items.length}
              </span>
            </summary>
            <ul className="flex flex-col divide-y divide-border border-t border-border px-4">
              {items.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn("text-[14px]", c.status === "done" ? "text-text-muted line-through" : c.status === "na" ? "text-text-faint" : "text-text")}
                    >
                      {c.item}
                      {isCriticalCheck(c.area, c.item) ? (
                        <Badge tone="danger" className="ml-2 h-5 align-middle">
                          crítico
                        </Badge>
                      ) : null}
                    </p>
                    <p className="font-mono text-[11px] text-text-faint">
                      {label(L.siteAssignee, c.ownerType)}
                      {c.evidenceMd ? ` · evidencia: ${c.evidenceMd.slice(0, 80)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <LaunchStatusToggle id={c.id} status={c.status} item={c.item} />
                    <LaunchEditSheet id={c.id} item={c.item} status={c.status} ownerType={c.ownerType} evidenceMd={c.evidenceMd} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

// --- Documentación ---

export async function DocsTab({ ctx, site }: P) {
  const [docs, activity] = await Promise.all([siteDocs(ctx, site.s), listActivity(ctx, { entityType: "site", entityId: site.s.id, limit: 40 })]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {docs.note ? (
          <BlockCard
            icon={<BookText />}
            title="Documentación técnica"
            action={
              <Button asChild variant="secondary" size="sm" className="h-10">
                <Link href={`/notas/${docs.note.id}`}>
                  <Pencil className="size-4" /> Editar en Notas
                </Link>
              </Button>
            }
          >
            <p className="mb-3 font-mono text-[11px] text-text-faint">actualizada {relativeFromDate(docs.note.updatedAt)}</p>
            <MarkdownView html={renderMarkdown(docs.note.bodyMd)} empty="La nota está vacía." className="text-[14px]" />
          </BlockCard>
        ) : (
          <Card>
            <EmptyState
              icon={<BookText />}
              title="Sin documentación técnica"
              description="La nota viva del sitio (stack, plugins, snippets, decisiones, backups y contactos) se mandó a la papelera o no existe."
              action={<EnsureDocsButton siteId={site.s.id} />}
            />
          </Card>
        )}
        {site.s.notesMd ? (
          <BlockCard icon={<FileText />} title="Notas internas">
            <MarkdownView html={renderMarkdown(site.s.notesMd)} className="text-[14px]" />
          </BlockCard>
        ) : null}
      </div>
      <div className="flex flex-col gap-5">
        <BlockCard icon={<Package />} title="Productos propios instalados">
          {docs.installs.length ? (
            <ul className="flex flex-col gap-2 text-[13px]">
              {docs.installs.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-text">{i.productName}</span>
                  <span className="font-mono text-text-muted">{i.version ? `v${i.version}` : "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-faint">
              Ninguno. Las instalaciones se registran en{" "}
              <Link href="/activos" className="underline underline-offset-4 hover:text-text">
                Activos técnicos
              </Link>
              .
            </p>
          )}
        </BlockCard>
        <BlockCard icon={<Activity />} title="Registro de cambios">
          <ActivityList rows={activity} />
        </BlockCard>
      </div>
    </div>
  );
}

// --- Monitoreo ---

export async function MonitoringTab({ ctx, site }: P) {
  const { envs, checks } = await siteMonitoring(ctx, site.s.id);
  if (!checks.length && !envs.some(({ e }) => e.lastCheckedAt))
    return (
      <Card>
        <EmptyState
          icon={<HeartPulse />}
          title="El monitoreo todavía no está activo"
          description="El chequeo de uptime cada 5 minutos, el vencimiento de SSL y dominio y las versiones se activan en Activos técnicos para cada entorno. Cuando haya datos, aparecen acá."
          action={
            <Button asChild variant="primary">
              <Link href="/activos">Ir a Activos técnicos</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {envs.map(({ e }) => {
        const list = checks.filter((c) => c.siteEnvironmentId === e.id);
        const last = list[0];
        const okCount = list.filter((c) => c.ok).length;
        const lat = list.filter((c) => c.latencyMs !== null).map((c) => c.latencyMs as number);
        const up = last ? last.ok : e.lastStatus === "up";
        return (
          <BlockCard
            key={e.id}
            icon={<HeartPulse />}
            title={`${label(L.envKind, e.kind)} · ${e.url.replace(/^https?:\/\//, "")}`}
            action={
              <Badge tone={last || e.lastStatus ? (up ? "success" : "danger") : "neutral"}>
                {last || e.lastStatus ? (up ? "En línea" : "Caído") : "Sin datos"}
              </Badge>
            }
          >
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-text-muted">Disponibilidad</dt>
                <dd className="font-mono text-[18px] text-text">{list.length ? `${Math.round((okCount / list.length) * 1000) / 10}%` : "—"}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Latencia media</dt>
                <dd className="font-mono text-[18px] text-text">{lat.length ? `${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)} ms` : "—"}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Último chequeo</dt>
                <dd className="text-text">{last ? relativeFromDate(last.checkedAt) : e.lastCheckedAt ? relativeFromDate(e.lastCheckedAt) : "—"}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-text-muted">
                  <CalendarClock className="size-3.5" /> SSL
                </dt>
                <dd>
                  <Expiry on={e.sslExpiresOn} />
                </dd>
              </div>
            </dl>
            {list.length ? (
              <div className="mt-4 flex h-6 items-end gap-px" role="img" aria-label={`Últimos ${Math.min(list.length, 60)} chequeos: ${okCount} correctos`}>
                {list
                  .slice(0, 60)
                  .reverse()
                  .map((c) => (
                    <span
                      key={c.id}
                      className={cn("w-full rounded-sm", c.ok ? "h-full bg-success/70" : "h-full bg-danger")}
                      title={`${formatDateTime(c.checkedAt)} · ${c.ok ? "ok" : (c.error ?? c.statusCode)}`}
                    />
                  ))}
              </div>
            ) : null}
          </BlockCard>
        );
      })}
      <p className="text-[12px] text-text-faint md:col-span-2">
        Se configura en{" "}
        <Link href="/activos" className="underline underline-offset-4 hover:text-text">
          Activos técnicos
        </Link>
        . <Dot color={SITES_ACCENT} className="ml-1" />
      </p>
    </div>
  );
}

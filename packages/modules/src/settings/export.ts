import { assertCan, type Ctx } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import JSZip from "jszip";
import { getDb } from "../shared/db";

/** Tablas del workspace que se exportan (todo lo que es del usuario). */
const TABLES: Record<string, PgTable & { workspaceId: unknown }> = {
  spaces: schema.space,
  tags: schema.tag,
  taggings: schema.tagging,
  links: schema.link,
  comments: schema.comment,
  inbox: schema.inboxItem,
  reminders: schema.reminder,
  approvals: schema.approval,
  activity: schema.activity,
  clients: schema.client,
  client_fiscal_holders: schema.clientFiscalHolder,
  contacts: schema.contact,
  client_contacts: schema.clientContact,
  interactions: schema.interaction,
  opportunities: schema.opportunity,
  projects: schema.project,
  project_phases: schema.projectPhase,
  tasks: schema.task,
  task_checklist: schema.taskChecklistItem,
  blockers: schema.blocker,
  decisions: schema.decision,
  deliverables: schema.deliverable,
  changelog: schema.changelogEntry,
  project_templates: schema.projectTemplate,
  services: schema.service,
  quotes: schema.quote,
  quote_versions: schema.quoteVersion,
  quote_items: schema.quoteItem,
  quote_templates: schema.quoteTemplate,
  ledgers: schema.ledger,
  accounts: schema.moneyAccount,
  categories: schema.category,
  transactions: schema.transaction,
  subscriptions: schema.subscription,
  receivables: schema.receivable,
  payables: schema.payable,
  notes: schema.note,
  note_versions: schema.noteVersion,
  courses: schema.course,
  assessments: schema.assessment,
};

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "sin-titulo";

/** Exportación total: JSON por tabla + notas en Markdown (compatibles con Obsidian). Sin secretos. */
export async function exportWorkspace(ctx: Ctx): Promise<Buffer> {
  assertCan(ctx, "read", "export");
  const db = getDb();
  const zip = new JSZip();
  const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  zip.file("workspace.json", JSON.stringify(ws, null, 2));
  for (const [name, table] of Object.entries(TABLES)) {
    // biome-ignore lint/suspicious/noExplicitAny: acceso genérico a la columna workspace_id
    const rows = await db
      .select()
      .from(table)
      .where(eq((table as any).workspaceId, ctx.workspaceId));
    zip.file(`datos/${name}.json`, JSON.stringify(rows, null, 2));
  }
  const notes = await db.select().from(schema.note).where(eq(schema.note.workspaceId, ctx.workspaceId));
  const used = new Set<string>();
  for (const n of notes) {
    if (n.deletedAt) continue;
    const folder = n.folderPath ? `${n.folderPath.split("/").map(safeName).join("/")}/` : "";
    let file = `notas/${folder}${safeName(n.title)}.md`;
    let k = 2;
    while (used.has(file)) file = `notas/${folder}${safeName(n.title)} (${k++}).md`;
    used.add(file);
    const fm =
      Object.keys(n.frontmatter ?? {}).length || n.aliases.length
        ? `---\n${Object.entries({ ...n.frontmatter, ...(n.aliases.length ? { aliases: n.aliases } : {}) })
            .map(([k2, v]) => `${k2}: ${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}`)
            .join("\n")}\n---\n\n`
        : "";
    zip.file(file, fm + n.bodyMd);
  }
  zip.file(
    "LEEME.txt",
    `Exportación de AGENCYOS · ${new Date().toISOString()}\n\n- datos/*.json: una tabla por archivo.\n- notas/: notas en Markdown, abribles con Obsidian.\n- No incluye contraseñas, tokens ni secretos.\n`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await audit(db, ctx, { action: "export.full", targetType: "workspace", targetId: ctx.workspaceId, after: { bytes: buf.length } });
  return buf;
}

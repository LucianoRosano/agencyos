import { assertCan, type Ctx, L, label, validation } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { CLIENT_STATUSES, createClient, newClientInput } from "../crm/service";
import { listCategories } from "../finance/queries";
import { createTransaction } from "../finance/service";
import { scoped } from "../shared/db";
import { columnIndex, parseAmount, parseCsv, parseDateCell } from "./csv";

/**
 * Importación CSV (docs/02 M14 «Datos»): clientes y movimientos. Siempre en dos pasos: vista previa (qué se crea,
 * qué se saltea y por qué) y aplicar (vuelve a validar todo del lado del servidor). Nada se pisa: los duplicados se saltean.
 */
export const MAX_ROWS = 2000;
const MAX_BYTES = 1.5 * 1024 * 1024;

export type PreviewRow = { line: number; status: "ok" | "duplicate" | "error"; summary: string; message?: string };
export type Preview = { columns: string[]; rows: PreviewRow[]; ok: number; duplicates: number; errors: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function table(csv: string) {
  if (!csv || csv.length > MAX_BYTES) throw validation("El archivo está vacío o supera 1,5 MB.");
  const rows = parseCsv(csv);
  const [headers, ...body] = rows;
  if (!headers || !body.length) throw validation("El CSV necesita una fila de encabezados y al menos una fila de datos.");
  if (body.length > MAX_ROWS) throw validation(`Máximo ${MAX_ROWS} filas por importación (este tiene ${body.length}).`);
  return { headers, body };
}

// ---------- Clientes ----------

const CLIENT_COLS = {
  name: ["nombre", "cliente", "razon social", "name", "empresa"],
  tradeName: ["nombre de fantasia", "fantasia", "marca", "trade name"],
  industry: ["rubro", "industria", "industry", "sector"],
  website: ["web", "sitio", "sitio web", "website", "url"],
  city: ["ciudad", "localidad", "city"],
  province: ["provincia", "province", "estado/provincia"],
  status: ["estado", "status"],
  source: ["origen", "fuente", "source", "como llego"],
  notesMd: ["notas", "observaciones", "notes", "comentarios"],
  contactName: ["contacto", "nombre del contacto", "contact"],
  contactEmail: ["email", "correo", "mail", "e-mail"],
  contactPhone: ["telefono", "whatsapp", "celular", "tel", "phone"],
} as const;

const STATUS_BY_LABEL = new Map<string, string>([
  ...CLIENT_STATUSES.map((s) => [norm(s), s] as [string, string]),
  ...Object.entries(L.clientStatus).map(([k, v]) => [norm(v), k] as [string, string]),
  ["cliente", "active"],
  ["potencial", "prospect"],
]);

type ClientDraft = Record<string, string | undefined>;

async function clientDrafts(ctx: Ctx, csv: string) {
  const { headers, body } = table(csv);
  const idx = Object.fromEntries(Object.entries(CLIENT_COLS).map(([k, aliases]) => [k, columnIndex(headers, [...aliases])])) as Record<
    keyof typeof CLIENT_COLS,
    number
  >;
  if (idx.name < 0) throw validation("Falta la columna «Nombre» (o «Cliente»).");
  const existing = await getDb()
    .select({ name: schema.client.name })
    .from(schema.client)
    .where(scoped(schema.client, ctx, { withArchived: true }));
  const seen = new Set(existing.map((c) => norm(c.name)));
  const drafts: { line: number; draft?: ClientDraft; row: PreviewRow }[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (k: keyof typeof CLIENT_COLS) => (idx[k] >= 0 ? cells[idx[k]]?.trim() || undefined : undefined);
    const name = get("name");
    if (!name) {
      drafts.push({ line, row: { line, status: "error", summary: "(sin nombre)", message: "Falta el nombre" } });
      return;
    }
    const key = norm(name);
    if (seen.has(key)) {
      drafts.push({ line, row: { line, status: "duplicate", summary: name, message: "Ya existe un cliente con ese nombre" } });
      return;
    }
    seen.add(key);
    const statusRaw = get("status");
    const status = statusRaw ? STATUS_BY_LABEL.get(norm(statusRaw)) : undefined;
    if (statusRaw && !status) {
      drafts.push({ line, row: { line, status: "error", summary: name, message: `Estado desconocido «${statusRaw}»` } });
      return;
    }
    const website = get("website");
    const draft: ClientDraft = {
      name,
      tradeName: get("tradeName"),
      industry: get("industry"),
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      city: get("city"),
      province: get("province"),
      status: status ?? "active",
      source: get("source") ?? "Importación CSV",
      notesMd: get("notesMd"),
      // Si viene email o teléfono sin nombre de contacto, el contacto principal lleva el nombre del cliente.
      contactName: get("contactName") ?? (get("contactEmail") || get("contactPhone") ? name : undefined),
      contactEmail: get("contactEmail"),
      contactPhone: get("contactPhone"),
    };
    const check = newClientInput.safeParse(draft);
    if (!check.success) {
      const issue = check.error.issues[0];
      drafts.push({ line, row: { line, status: "error", summary: name, message: `${String(issue?.path[0] ?? "")}: ${issue?.message ?? "dato inválido"}` } });
      return;
    }
    const extra = [draft.industry, draft.city, draft.contactName].filter(Boolean).join(" · ");
    drafts.push({ line, draft, row: { line, status: "ok", summary: extra ? `${name} — ${extra}` : name } });
  });
  return { headers, drafts };
}

function summarize(columns: string[], rows: PreviewRow[]): Preview {
  return {
    columns,
    rows,
    ok: rows.filter((r) => r.status === "ok").length,
    duplicates: rows.filter((r) => r.status === "duplicate").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}

export async function previewClientsImport(ctx: Ctx, csv: string): Promise<Preview> {
  assertCan(ctx, "create", "crm");
  const { headers, drafts } = await clientDrafts(ctx, csv);
  return summarize(
    headers,
    drafts.map((d) => d.row),
  );
}

export async function applyClientsImport(ctx: Ctx, csv: string) {
  assertCan(ctx, "create", "crm");
  const { headers, drafts } = await clientDrafts(ctx, csv);
  const rows: PreviewRow[] = [];
  let created = 0;
  for (const d of drafts) {
    if (!d.draft) {
      rows.push(d.row);
      continue;
    }
    try {
      await createClient(ctx, d.draft);
      created++;
      rows.push(d.row);
    } catch (e) {
      rows.push({ ...d.row, status: "error", message: e instanceof Error ? e.message : "No se pudo crear" });
    }
  }
  await getDb().transaction((t) => audit(t, ctx, { action: "import.clients", targetType: "workspace", targetId: ctx.workspaceId, after: { created } }));
  return { created, ...summarize(headers, rows) };
}

// ---------- Movimientos ----------

const TX_COLS = {
  date: ["fecha", "date", "dia", "fecha de operacion", "fecha operacion"],
  description: ["descripcion", "concepto", "detalle", "description", "movimiento"],
  amount: ["monto", "importe", "amount", "valor", "total"],
  credit: ["credito", "ingreso", "haber", "entrada"],
  debit: ["debito", "egreso", "gasto", "debe", "salida"],
  kind: ["tipo", "kind", "clase"],
  category: ["categoria", "category", "rubro"],
  client: ["cliente", "client"],
  counterpart: ["contraparte", "proveedor", "destinatario", "origen", "counterpart"],
} as const;

type TxDraft = { kind: "income" | "expense"; date: string; amount: string; description?: string; categoryId?: string; clientId?: string; counterpart?: string };

async function txDrafts(ctx: Ctx, csv: string, accountId: string) {
  const { headers, body } = table(csv);
  const idx = Object.fromEntries(Object.entries(TX_COLS).map(([k, aliases]) => [k, columnIndex(headers, [...aliases])])) as Record<
    keyof typeof TX_COLS,
    number
  >;
  if (idx.date < 0) throw validation("Falta la columna «Fecha».");
  if (idx.amount < 0 && idx.credit < 0 && idx.debit < 0) throw validation("Falta la columna «Monto» (o «Crédito»/«Débito»).");
  const db = getDb();
  const [account] = await db
    .select({ id: schema.moneyAccount.id, name: schema.moneyAccount.name, currency: schema.moneyAccount.currency })
    .from(schema.moneyAccount)
    .where(and(eq(schema.moneyAccount.id, accountId), scoped(schema.moneyAccount, ctx)));
  if (!account) throw validation("Elegí una cuenta válida.");
  const [cats, clients, existing] = await Promise.all([
    listCategories(ctx),
    db.select({ id: schema.client.id, name: schema.client.name }).from(schema.client).where(scoped(schema.client, ctx)),
    db
      .select({ date: schema.transaction.date, amount: schema.transaction.amount, description: schema.transaction.description, kind: schema.transaction.kind })
      .from(schema.transaction)
      .where(and(eq(schema.transaction.accountId, accountId), scoped(schema.transaction, ctx))),
  ]);
  const catBy = new Map(cats.map((c) => [`${c.kind}:${norm(c.name)}`, c.id]));
  const clientBy = new Map(clients.map((c) => [norm(c.name), c.id]));
  const seen = new Set(existing.map((e) => `${e.date}|${e.kind}|${Number(e.amount).toFixed(2)}|${norm(e.description ?? "")}`));
  const out: { line: number; draft?: TxDraft; row: PreviewRow }[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (k: keyof typeof TX_COLS) => (idx[k] >= 0 ? cells[idx[k]]?.trim() || undefined : undefined);
    const description = get("description");
    const date = parseDateCell(get("date") ?? "");
    const fail = (message: string) => out.push({ line, row: { line, status: "error", summary: description ?? "(sin descripción)", message } });
    if (!date) return void fail(`Fecha inválida «${get("date") ?? ""}»`);
    let amount: ReturnType<typeof parseAmount> = null;
    let kind: "income" | "expense" | null = null;
    const credit = get("credit") ? parseAmount(get("credit") ?? "") : null;
    const debit = get("debit") ? parseAmount(get("debit") ?? "") : null;
    if (credit && Number(credit.value) > 0) {
      amount = credit;
      kind = "income";
    } else if (debit && Number(debit.value) > 0) {
      amount = debit;
      kind = "expense";
    } else if (get("amount")) {
      amount = parseAmount(get("amount") ?? "");
      if (amount) kind = amount.negative ? "expense" : "income";
    }
    const kindRaw = norm(get("kind") ?? "");
    if (kindRaw) {
      if (/^(ingreso|income|entrada|cobro|credito)/.test(kindRaw)) kind = "income";
      else if (/^(gasto|egreso|expense|salida|pago|debito)/.test(kindRaw)) kind = "expense";
      else return void fail(`Tipo desconocido «${get("kind")}»`);
    }
    if (!amount || !kind || Number(amount.value) <= 0) return void fail(`Monto inválido «${get("amount") ?? get("credit") ?? get("debit") ?? ""}»`);
    const key = `${date}|${kind}|${Number(amount.value).toFixed(2)}|${norm(description ?? "")}`;
    if (seen.has(key)) {
      out.push({ line, row: { line, status: "duplicate", summary: description ?? "", message: "Ya está en la cuenta (misma fecha, monto y descripción)" } });
      return;
    }
    seen.add(key);
    const catName = get("category");
    const categoryId = catName ? catBy.get(`${kind}:${norm(catName)}`) : undefined;
    const clientName = get("client");
    const clientId = clientName ? clientBy.get(norm(clientName)) : undefined;
    const notes = [
      catName && !categoryId ? `categoría «${catName}» no existe (queda sin categoría)` : "",
      clientName && !clientId ? `cliente «${clientName}» no encontrado` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({
      line,
      draft: { kind, date, amount: amount.value, description, categoryId, clientId, counterpart: get("counterpart") },
      row: {
        line,
        status: "ok",
        summary: `${date} · ${label(L.txKind, kind)} ${account.currency} ${amount.value}${description ? ` · ${description}` : ""}`,
        message: notes || undefined,
      },
    });
  });
  return { headers, out };
}

export async function previewTransactionsImport(ctx: Ctx, csv: string, accountId: string): Promise<Preview> {
  assertCan(ctx, "create", "finance");
  const { headers, out } = await txDrafts(ctx, csv, accountId);
  return summarize(
    headers,
    out.map((d) => d.row),
  );
}

export async function applyTransactionsImport(ctx: Ctx, csv: string, accountId: string) {
  assertCan(ctx, "create", "finance");
  const { headers, out } = await txDrafts(ctx, csv, accountId);
  const rows: PreviewRow[] = [];
  let created = 0;
  for (const d of out) {
    if (!d.draft) {
      rows.push(d.row);
      continue;
    }
    try {
      await createTransaction(ctx, { ...d.draft, accountId });
      created++;
      rows.push(d.row);
    } catch (e) {
      rows.push({ ...d.row, status: "error", message: e instanceof Error ? e.message : "No se pudo crear" });
    }
  }
  await getDb().transaction((t) => audit(t, ctx, { action: "import.transactions", targetType: "account", targetId: accountId, after: { created } }));
  return { created, ...summarize(headers, rows) };
}

/** Encabezados sugeridos (para el texto de ayuda y las plantillas descargables). */
export const CLIENT_TEMPLATE = "Nombre;Rubro;Ciudad;Provincia;Web;Contacto;Email;Teléfono;Estado;Notas";
export const TX_TEMPLATE = "Fecha;Descripción;Monto;Categoría;Cliente;Contraparte";

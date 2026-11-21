import { getDb, schema } from "@agencyos/db";
import { extractText } from "@agencyos/modules/brain/extract";
import { askBrain, bestSentences, chunkText, indexPending, queryTerms, relatedTo } from "@agencyos/modules/brain/knowledge";
import { createClient, logInteraction } from "@agencyos/modules/crm/service";
import { createNote } from "@agencyos/modules/notes/service";
import { addDecision, createProject } from "@agencyos/modules/projects/service";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

/** PDF mínimo válido con una línea de texto (sin dependencias). */
function tinyPdf(text: string) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("Cerebro inteligente: texto y fragmentos", () => {
  it("extrae texto de PDF y fragmenta con solapamiento", async () => {
    expect(await extractText(tinyPdf("Decidimos usar Andreani para los envios"), "application/pdf", "a.pdf")).toContain("Andreani");
    expect(await extractText(Buffer.from("<p>Hola <b>mundo</b></p>"), "text/html")).toContain("Hola mundo");
    const long = Array.from({ length: 30 }, (_, i) => `Párrafo ${i} con bastante texto para llenar el fragmento de prueba.`).join("\n\n");
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1300)).toBe(true);
    expect(queryTerms("¿Qué le prometí a la librería sobre los envíos?")).toEqual(["prometi", "libreria", "envios"]);
    expect(bestSentences("Primero hablamos del logo. Después definimos los envíos con Andreani. Fin.", ["envios"])).toEqual([
      "Después definimos los envíos con Andreani.",
    ]);
  });
});

describe("Cerebro inteligente: indexar, preguntar y relacionar", () => {
  it("encuentra decisiones, conversaciones y notas con su fuente; respeta la papelera y el aislamiento", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Librería Uno" });
    const p = await createProject(ws, { name: "Tienda Librería", clientId: c.id });
    await addDecision(ws, p.id, { title: "Envíos con Andreani a todo el país", rationaleMd: "Más barato que Correo Argentino para paquetes chicos." });
    await logInteraction(ws, { clientId: c.id, kind: "whatsapp", summaryMd: "Le prometí que los envíos a San Miguel salen en 24 horas." });
    const n = await createNote(ws, { title: "Ideas de catálogo", bodyMd: "Cargar útiles escolares por marca y temporada." });
    expect(await indexPending({ workspaceId: ws.workspaceId })).toBeGreaterThanOrEqual(4);

    const a = await askBrain(ws, "¿Qué decidimos sobre los envíos?");
    expect(a.hits[0]?.sourceType).toBe("decision");
    expect(a.lead?.text).toMatch(/Andreani/);
    expect(a.hits.some((h) => h.sourceType === "interaction" && h.excerpts.some((e) => e.includes("24 horas")))).toBe(true);
    expect(a.hits[0]?.href).toBe(`/proyectos/${p.id}/decisiones`);
    // sin acentos ni mayúsculas
    expect((await askBrain(ws, "UTILES ESCOLARES")).hits[0]?.title).toBe("Ideas de catálogo");
    // relacionado
    const rel = await relatedTo(ws, "interaction", (await getDb().select().from(schema.interaction).where(eq(schema.interaction.clientId, c.id)))[0]?.id ?? "");
    expect(rel.some((h) => h.sourceType === "decision")).toBe(true);
    // la papelera saca la nota del Cerebro
    await moveToTrash(ws, "note", n.id);
    await indexPending({ workspaceId: ws.workspaceId });
    expect((await askBrain(ws, "útiles escolares")).hits).toEqual([]);
    const left = await getDb()
      .select()
      .from(schema.knowledgeChunk)
      .where(and(eq(schema.knowledgeChunk.sourceType, "note"), eq(schema.knowledgeChunk.sourceId, n.id)));
    expect(left).toEqual([]);
    // otro workspace no ve nada; un colaborador no puede preguntar
    const other = await makeWorkspace("B");
    expect((await askBrain(other, "envíos Andreani")).hits).toEqual([]);
    await expect(askBrain({ ...ws, role: "member" }, "envíos")).rejects.toThrow();
  });
});

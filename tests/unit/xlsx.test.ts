import { buildXlsx } from "@agencyos/modules/shared/xlsx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

describe("buildXlsx", () => {
  it("arma un libro válido con números, texto escapado y varias hojas", async () => {
    const buf = await buildXlsx([
      {
        name: "Movimientos",
        rows: [
          ["Fecha", "Monto", "Descripción"],
          ["2026-11-01", { n: "-1500.50" }, "=HACK() & <script>"],
        ],
      },
      { name: "Resumen: mensual", rows: [["Mes"], ["2026-11"]] },
    ]);
    const zip = await JSZip.loadAsync(buf);
    const wb = await zip.file("xl/workbook.xml")?.async("string");
    expect(wb).toContain('name="Movimientos"');
    expect(wb).toContain('name="Resumen  mensual"');
    const s1 = (await zip.file("xl/worksheets/sheet1.xml")?.async("string")) ?? "";
    expect(s1).toContain("<v>-1500.50</v>");
    expect(s1).toContain("=HACK() &amp; &lt;script&gt;");
    expect(s1).toContain('t="inlineStr"');
    expect(s1).not.toContain("<f>");
  });

  it("descarta valores numéricos inválidos", async () => {
    const buf = await buildXlsx([{ name: "x", rows: [["a"], [{ n: "1e9; DROP" }]] }]);
    const s = (await (await JSZip.loadAsync(buf)).file("xl/worksheets/sheet1.xml")?.async("string")) ?? "";
    expect(s).not.toContain("DROP");
  });
});

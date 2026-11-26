import { describe, expect, it } from "vitest";
import { emailHtml } from "../../packages/modules/src/shared/email";

describe("mails con la estética de la marca", () => {
  it("escapa el contenido, convierte enlaces y usa el último como botón", () => {
    const html = emailHtml("AGENCYOS · Cobro <vencido>", "Hola\n\nVer en https://ejemplo.com/a y <b>no</b> HTML\n\nAbrí: https://ejemplo.com/hoy");
    expect(html).toContain("Cobro &lt;vencido&gt;");
    expect(html).not.toContain("<b>no</b>");
    expect(html).toContain('<a href="https://ejemplo.com/a"');
    expect(html).toMatch(/href="https:\/\/ejemplo\.com\/hoy"[^>]*>Abrir<\/a>/);
    expect(html).toMatch(/<h1[^>]*>Cobro &lt;vencido&gt;<\/h1>/);
  });
  it("sin enlaces no hay botón", () => {
    expect(emailHtml("Hola", "Solo texto")).not.toContain(">Abrir<");
  });
});

import { TEMPLATES } from "@agencyos/modules/automations/templates";
import { ruleInput } from "@agencyos/modules/automations/validators";
import { describe, expect, it } from "vitest";

describe("plantillas de automatizaciones", () => {
  it("todas pasan la validación de reglas y tienen clave única", () => {
    const keys = new Set<string>();
    for (const t of TEMPLATES) {
      const r = ruleInput.safeParse(t.rule);
      expect(r.success, `${t.key}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
    }
    expect(keys.has("cobro-vencido-recordatorio")).toBe(true);
  });
  it("los emails a clientes nunca salen solos desde una plantilla", () => {
    for (const t of TEMPLATES)
      for (const a of t.rule.actions) if (a.type === "send_email" && a.params.to === "client") expect(a.params.automatic, t.key).toBe(false);
  });
});

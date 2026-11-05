import { BLUEPRINT_TEMPLATES, blueprintTemplate, blueprintTree, flattenSlots, planSlotSync, slugKey, TEMPLATE_KINDS } from "@agencyos/modules/sites/blueprint";
import { briefBlocksFor, briefProgress, generateQuestions, normalizeAnswers, questionsMessage } from "@agencyos/modules/sites/brief";
import { isCriticalCheck, LAUNCH_AREAS, launchSeed } from "@agencyos/modules/sites/checklist";
import { describe, expect, it } from "vitest";

const small = () => ({
  pages: [
    {
      key: "inicio",
      title: "Inicio",
      path: "/",
      sections: [
        {
          key: "hero",
          title: "Hero",
          slots: [
            { key: "titulo", kind: "title", label: "Título" },
            { key: "boton", kind: "cta", label: "Botón" },
          ],
        },
      ],
    },
  ],
});

describe("blueprint: validación", () => {
  it("acepta un árbol válido", () => {
    expect(blueprintTree.safeParse(small()).success).toBe(true);
  });

  it("rechaza claves repetidas, tipos de slot desconocidos y árboles vacíos", () => {
    const dupPage = small();
    dupPage.pages.push({ ...dupPage.pages[0], title: "Otra" } as never);
    const r1 = blueprintTree.safeParse(dupPage);
    expect(r1.success).toBe(false);
    expect(r1.error?.issues[0]?.message).toMatch(/Página repetida/);

    const dupSlot = small();
    dupSlot.pages[0]?.sections[0]?.slots.push({ key: "titulo", kind: "text", label: "Otro" });
    expect(blueprintTree.safeParse(dupSlot).error?.issues[0]?.message).toMatch(/Slot repetido/);

    const badKind = small();
    (badKind.pages[0]?.sections[0]?.slots[0] as { kind: string }).kind = "video";
    expect(blueprintTree.safeParse(badKind).success).toBe(false);

    expect(blueprintTree.safeParse({ pages: [] }).success).toBe(false);
    const badKey = small();
    (badKey.pages[0] as { key: string }).key = "Con Espacios";
    expect(blueprintTree.safeParse(badKey).success).toBe(false);
  });

  it("las 6 plantillas de estructura son válidas y tienen slots", () => {
    expect(TEMPLATE_KINDS.sort()).toEqual(["b2b", "blog", "catalog", "institutional", "landing", "store"]);
    for (const k of TEMPLATE_KINDS) {
      const tree = BLUEPRINT_TEMPLATES[k].build();
      const r = blueprintTree.safeParse(tree);
      expect(r.success, `${k}: ${r.error?.issues[0]?.message}`).toBe(true);
      expect(flattenSlots(tree).length).toBeGreaterThan(5);
    }
    // La tienda trae producto, checkout y botón de arrepentimiento
    const store = blueprintTemplate("store");
    expect(store.pages.map((p) => p.key)).toEqual(expect.arrayContaining(["inicio", "producto", "checkout", "arrepentimiento"]));
    expect(flattenSlots(store).some((s) => s.kind === "product")).toBe(true);
    // El panel a medida arranca de la institucional
    expect(blueprintTemplate("app").pages[0]?.title).toBe("Inicio");
  });

  it("slugKey genera claves sin tildes y únicas", () => {
    expect(slugKey("Políticas de envío")).toBe("politicas-de-envio");
    expect(slugKey("Hero", ["hero", "hero-2"])).toBe("hero-3");
    expect(slugKey("¿¿??")).toBe("item");
  });
});

describe("blueprint: sincronización de slots", () => {
  it("inserta nuevos, conserva los que siguen, archiva los que salen y revive los que vuelven", () => {
    const tree = small();
    const existing = [
      { id: "a", pageKey: "inicio", sectionKey: "hero", slotKey: "titulo", kind: "title", archived: false },
      { id: "b", pageKey: "inicio", sectionKey: "hero", slotKey: "viejo", kind: "text", archived: false },
      { id: "c", pageKey: "inicio", sectionKey: "hero", slotKey: "boton", kind: "text", archived: true },
    ];
    const plan = planSlotSync(existing, blueprintTree.parse(tree));
    expect(plan.insert).toEqual([]);
    expect(plan.keep).toEqual([
      { id: "a", kind: "title", revive: false },
      { id: "c", kind: "cta", revive: true },
    ]);
    expect(plan.archive).toEqual(["b"]);

    const fresh = planSlotSync([], blueprintTree.parse(tree));
    expect(fresh.insert.map((s) => s.slotKey)).toEqual(["titulo", "boton"]);
  });
});

describe("briefing: preguntas al cliente", () => {
  it("genera una pregunta por cada dato faltante y omite lo respondido", () => {
    const all = generateQuestions("store", {});
    expect(all.length).toBeGreaterThan(15);
    expect(all.some((q) => /medios de pago/i.test(q))).toBe(true);
    const some = generateQuestions("store", { goal_main: "Vender online", payment_methods: ["Mercado Pago"] });
    expect(some.length).toBe(all.length - 2);
    expect(some.some((q) => /objetivo principal/i.test(q))).toBe(false);
  });

  it("las preguntas dependen del tipo de sitio", () => {
    const inst = generateQuestions("institutional", {});
    expect(inst.some((q) => /medios de pago/i.test(q))).toBe(false);
    expect(inst.some((q) => /arrepentimiento/i.test(q))).toBe(false);
    expect(generateQuestions("b2b", {}).some((q) => /mayoristas/i.test(q))).toBe(true);
    expect(briefBlocksFor("landing").flatMap((b) => b.fields.map((f) => f.key))).toContain("landing_campaign");
  });

  it("normaliza respuestas: descarta claves desconocidas, opciones inválidas y fechas mal formadas", () => {
    const a = normalizeAnswers("store", {
      goal_main: "  Vender  ",
      hack: "x",
      tone: "Inventado",
      payment_methods: ["Mercado Pago", "Bitcoin"],
      deadline: "31/12/2026",
      features: "Buscador",
    });
    expect(a).toEqual({ goal_main: "Vender", payment_methods: ["Mercado Pago"], features: ["Buscador"] });
    expect(normalizeAnswers("institutional", { payment_methods: ["Mercado Pago"] })).toEqual({});
    expect(briefProgress("store", a).done).toBe(3);
  });

  it("arma el mensaje para WhatsApp numerado", () => {
    const m = questionsMessage(["¿Uno?", "¿Dos?"], { clientName: "Librería Uno", siteName: "Tienda", brand: "Luciano Rosano" });
    expect(m).toContain("¡Hola, Librería Uno!");
    expect(m).toContain("1. ¿Uno?\n2. ¿Dos?");
    expect(m).toContain("Luciano Rosano");
  });
});

describe("checklist de lanzamiento", () => {
  it("tiene 17 áreas con ítems y críticos", () => {
    expect(LAUNCH_AREAS).toHaveLength(17);
    for (const a of LAUNCH_AREAS) expect(a.items.length).toBeGreaterThan(0);
    expect(isCriticalCheck("pruebas", "OK final del cliente sobre staging")).toBe(true);
    expect(isCriticalCheck("pruebas", "Enlaces rotos revisados")).toBe(false);
  });

  it("en sitios sin venta online las áreas de tienda quedan «No aplica»", () => {
    const inst = launchSeed("institutional");
    expect(new Set(inst.map((c) => c.area)).size).toBe(17);
    expect(inst.filter((c) => c.area === "woocommerce").every((c) => c.status === "na")).toBe(true);
    expect(
      launchSeed("store")
        .filter((c) => c.area === "woocommerce")
        .every((c) => c.status === "todo"),
    ).toBe(true);
  });
});

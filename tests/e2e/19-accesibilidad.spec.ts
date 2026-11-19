import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, settleAnimations } from "./helpers";
import { MENU_ROUTES, SYSTEM_ROUTES } from "./routes";

/**
 * Recorrido @a11y: axe (WCAG 2.0/2.1 A y AA) en todas las rutas del menú y de sistema, en desktop y celular.
 * Más exigente que expectAccessible(): falla también con violaciones «moderate» (docs/07 §6, docs/AUDITORIA-UX.md).
 */
test.describe.configure({ mode: "serial" });

test("@a11y recorrido axe por todas las rutas del menú (moderate o más)", async ({ page }, info) => {
  test.skip(!info.project.name.endsWith("-dark"), "el contraste del tema claro se cubre en los @visual");
  test.setTimeout(240_000);
  await login(page);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const problems: string[] = [];
  for (const route of [...MENU_ROUTES, ...SYSTEM_ROUTES]) {
    await page.goto(route);
    await page.locator("main").first().waitFor();
    await settleAnimations(page);
    await expectNoHorizontalScroll(page);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // El lienzo WebGL del Cerebro no es DOM accesible: tiene lista alternativa (Lista) y se audita aparte.
      .exclude("canvas")
      .analyze();
    for (const v of r.violations.filter((x) => x.impact === "moderate" || x.impact === "serious" || x.impact === "critical")) {
      problems.push(
        `${route} · ${v.impact} · ${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
      );
    }
  }
  expect(problems).toEqual([]);
});

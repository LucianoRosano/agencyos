import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";
import { EDITOR_ROUTES, MENU_ROUTES, SYSTEM_ROUTES } from "./routes";

/**
 * Rendimiento (docs/07, CLAUDE.md «Presupuesto»):
 * 1) JS inicial < 170 KB gzip por ruta: suma de los <script src> que trae el HTML de cada pantalla (lo que el navegador
 *    descarga y ejecuta antes de hidratar). Los import() diferidos (CodeMirror, Sigma) no cuentan: llegan después.
 * 2) LCP de Hoy en el celular con CPU 4× más lenta y red «Fast 3G» de Chrome DevTools.
 *    Objetivo de producto: < 1,5 s. Umbral del test: LCP_MAX_MS (2.500 ms por defecto = «bueno» de Web Vitals) porque las
 *    máquinas de CI varían mucho; el valor medido queda en test-results/perf-*.json y en docs/AUDITORIA-UX.md.
 */
const JS_BUDGET_KB = 170;
const LCP_MAX_MS = Number(process.env.LCP_MAX_MS ?? 2500);

test.describe.configure({ mode: "serial" });

const kb = (n: number) => Math.round((n / 1024) * 10) / 10;

async function initialScripts(page: Page, path: string) {
  const res = await page.request.get(path);
  expect(res.ok(), `${path} respondió ${res.status()}`).toBeTruthy();
  const html = await res.text();
  // Los polyfills van con noModule: los navegadores actuales ni los descargan, así que no cuentan.
  const tags = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].filter((m) => !/nomodule/i.test(m[0]));
  return [...new Set(tags.map((m) => m[1] as string))].filter((s) => s.startsWith("/_next/"));
}

test("@perf presupuesto de JS inicial por ruta (< 170 KB gzip)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440-dark", "el JS es el mismo en todos los proyectos");
  test.setTimeout(180_000);
  await login(page);
  // Rutas con id: la nota diaria (editor CodeMirror) y la primera ficha de cada listado, si hay datos.
  await page.goto("/notas/diaria");
  await page.waitForURL(/\/notas\/[0-9a-f-]{36}/);
  const dynamic = [new URL(page.url()).pathname];
  for (const [list, re] of [
    ["/proyectos", /^\/proyectos\/[0-9a-f-]{36}$/],
    ["/crm/clientes", /^\/crm\/clientes\/[0-9a-f-]{36}$/],
    ["/presupuestos", /^\/presupuestos\/[0-9a-f-]{36}$/],
    ["/sitios", /^\/sitios\/[0-9a-f-]{36}$/],
  ] as const) {
    await page.goto(list);
    const hrefs = await page.locator("main a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const hit = hrefs.find((h) => re.test(h));
    if (hit) dynamic.push(hit);
  }

  const sizes = new Map<string, number>();
  const report: { route: string; kb: number; scripts: number; chunks: [string, number][] }[] = [];
  for (const route of [...MENU_ROUTES, ...SYSTEM_ROUTES, ...EDITOR_ROUTES, ...dynamic]) {
    const scripts = await initialScripts(page, route);
    let total = 0;
    for (const src of scripts) {
      if (!sizes.has(src)) {
        const body = await (await page.request.get(src)).body();
        sizes.set(src, gzipSync(body, { level: 9 }).length);
      }
      total += sizes.get(src) ?? 0;
    }
    report.push({ route, kb: kb(total), scripts: scripts.length, chunks: scripts.map((s) => [s.split("/").pop() ?? s, kb(sizes.get(s) ?? 0)]) });
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/perf-js.json", JSON.stringify(report, null, 2));
  console.log(report.map((r) => `${r.route.padEnd(42)} ${String(r.kb).padStart(6)} KB  (${r.scripts} scripts)`).join("\n"));
  const over = report.filter((r) => r.kb >= JS_BUDGET_KB);
  expect(over, `rutas sobre ${JS_BUDGET_KB} KB gzip`).toEqual([]);
});

test("@perf LCP de Hoy en el celular (CPU 4×, Fast 3G)", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile-390-dark", "se mide en el celular");
  test.setTimeout(120_000);
  await login(page);
  // Primera visita para calentar la caché HTTP de los estáticos (uso diario real: la PWA ya los tiene).
  await page.goto("/hoy");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // Preset «Fast 3G» de Chrome DevTools: 562,5 ms de latencia, ~1,44 Mbps de bajada, ~675 kbps de subida.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 562.5,
    downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8,
    uploadThroughput: (750 * 1024 * 0.9) / 8,
  });
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto("/hoy", { waitUntil: "load" });
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let last = 0;
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) last = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => resolve(last), 1500);
        }),
    );
    samples.push(Math.round(lcp));
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const median = [...samples].sort((a, b) => a - b)[1] ?? 0;
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/perf-lcp.json", JSON.stringify({ route: "/hoy", samples, median, thresholdMs: LCP_MAX_MS }, null, 2));
  console.log(`LCP /hoy (celular, CPU 4×, Fast 3G, caché caliente): ${samples.join(" / ")} ms · mediana ${median} ms`);
  expect(median).toBeGreaterThan(0);
  expect(median, `LCP de Hoy ${median} ms`).toBeLessThan(LCP_MAX_MS);
});

import { existsSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const IDLE_MS = 60_000;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = 0;

function executablePath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(LOCAL_CHROMIUM)) return LOCAL_CHROMIUM;
  return undefined;
}

/** Un navegador por proceso (singleton); se cierra solo tras un minuto sin uso. */
async function getBrowser(): Promise<Browser> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!browserPromise) {
    browserPromise = chromium.launch({ executablePath: executablePath(), args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] });
    browserPromise
      .then((b) => b.on("disconnected", () => {
        browserPromise = null;
      }))
      .catch(() => {
        browserPromise = null;
      });
  }
  return browserPromise;
}

function scheduleClose() {
  if (inFlight > 0) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), IDLE_MS);
  idleTimer.unref?.();
}

export async function closeBrowser() {
  const p = browserPromise;
  browserPromise = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (p) await p.then((b) => b.close()).catch(() => undefined);
}

export type PdfOptions = { headerTemplate?: string; footerTemplate?: string };

/** HTML → PDF A4 con márgenes de 18 mm, fondo impreso y JavaScript desactivado. */
export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  inFlight++;
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready).catch(() => undefined);
      const withHF = Boolean(opts.headerTemplate || opts.footerTemplate);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: "18mm", right: "18mm", bottom: "18mm", left: "18mm" },
        displayHeaderFooter: withHF,
        headerTemplate: opts.headerTemplate ?? "<span></span>",
        footerTemplate: opts.footerTemplate ?? "<span></span>",
      });
      return pdf;
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    inFlight--;
    scheduleClose();
  }
}

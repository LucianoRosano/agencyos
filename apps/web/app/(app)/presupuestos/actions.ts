"use server";

import type { Result } from "@agencyos/core";
import { previewDocument } from "@agencyos/modules/quotes/queries";
import * as svc from "@agencyos/modules/quotes/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { geistFontCssFromUrl } from "@agencyos/pdf/fonts";
import { renderQuoteHtml } from "@agencyos/pdf/quote-html";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// --- Servicios ---
export const createServiceAction = async (_: S, fd: FormData) => run((ctx) => svc.createService(ctx, obj(fd)));
export const updateServiceAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateService(ctx, id, obj(fd)));
export const setServiceActiveAction = async (id: string, active: boolean) => run((ctx) => svc.setServiceActive(ctx, id, active));
export const deleteServiceAction = async (id: string) => run((ctx) => moveToTrash(ctx, "service", id));
export const restoreServiceAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "service", id));

// --- Presupuestos (el editor manda el borrador como objeto) ---
export const createQuoteAction = async (payload: unknown) => run(async (ctx) => ({ id: (await svc.createQuote(ctx, payload)).id }));
export const updateQuoteAction = async (id: string, payload: unknown) => run(async (ctx) => ({ id: (await svc.updateQuote(ctx, id, payload))?.id ?? id }));
export const newVersionAction = async (id: string) => run(async (ctx) => ({ version: (await svc.createNewVersion(ctx, id)).version.version }));
export const markSentAction = async (id: string) => run(async (ctx) => (await svc.markSent(ctx, id))?.status);
export const markViewedAction = async (id: string) => run(async (ctx) => (await svc.markViewed(ctx, id))?.status);
export const acceptQuoteAction = async (id: string, _: S, fd: FormData) =>
  run(async (ctx) => {
    const r = await svc.acceptQuote(ctx, id, obj(fd));
    return { projectId: r.projectId, receivables: r.receivables.length };
  });
export const rejectQuoteAction = async (id: string, _: S, fd: FormData) =>
  run(async (ctx) => (await svc.rejectQuote(ctx, id, String(fd.get("reason") ?? "")))?.status);
export const voidQuoteAction = async (id: string) => run(async (ctx) => (await svc.voidQuote(ctx, id))?.status);
export const deleteQuoteAction = async (id: string) => run((ctx) => moveToTrash(ctx, "quote", id));
export const restoreQuoteAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "quote", id));

/** Vista previa en vivo: el mismo HTML del PDF (sin Chromium) + totales calculados en el servidor. */
export const previewQuoteAction = async (payload: unknown, meta: { number?: string; version?: number } = {}) =>
  run(
    async (ctx) => {
      const doc = await previewDocument(ctx, payload, meta);
      return {
        html: renderQuoteHtml(doc, { fontCss: geistFontCssFromUrl("/presupuestos/fuente"), preview: true }),
        totals: {
          lines: doc.calc.lines.map((l) => l.lineTotal),
          subtotal: doc.calc.subtotal,
          itemsDiscount: doc.calc.itemsDiscount,
          globalDiscount: doc.calc.globalDiscount,
          total: doc.calc.total,
        },
        issues: doc.calc.issues,
      };
    },
    { revalidate: false },
  );

export async function createPublicLinkAction(id: string, days = 30) {
  const { createPublicLink } = await import("@agencyos/modules/quotes/public");
  return run(async (ctx) => {
    const r = await createPublicLink(ctx, id, days);
    const base = process.env.APP_URL ?? "http://localhost:3000";
    return { url: `${base}/p/${r.token}`, expiresAt: r.expiresAt.toISOString() };
  });
}

export async function revokePublicLinkAction(id: string) {
  const { revokePublicLink } = await import("@agencyos/modules/quotes/public");
  return run((ctx) => revokePublicLink(ctx, id));
}

/** Envía el enlace por email al contacto (solo si Brevo está configurado; lo dispara Luciano). */
export async function emailPublicLinkAction(id: string, url: string, to: string) {
  const { sendEmail, emailConfigured } = await import("@agencyos/modules/shared/email");
  const { z } = await import("zod");
  return run(async (ctx) => {
    if (!emailConfigured()) throw new Error("El email (Brevo) todavía no está configurado.");
    const email = z.string().email("Email inválido").parse(to);
    if (!url.startsWith(process.env.APP_URL ?? "http")) throw new Error("Enlace inválido");
    const name = ctx.workspace.settings.agencyName ?? "Luciano Rosano";
    const sent = await sendEmail({
      to: email,
      subject: `Presupuesto de ${name}`,
      text: `Hola,\n\nTe comparto el presupuesto. Podés verlo, descargarlo y aceptarlo desde este enlace:\n${url}\n\nCualquier duda, respondé este mail.\n\n${name}`,
    });
    if (!sent) throw new Error("No se pudo enviar el email.");
    const { audit } = await import("@agencyos/core/events");
    const { getDb } = await import("@agencyos/db");
    await audit(getDb(), ctx, { action: "quote.sent_by_email", targetType: "quote", targetId: id, after: { to: email } });
    return true;
  });
}

import { assertCan, type Ctx, notFound, validation } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

/** Servicios de interés de una oportunidad (opportunity_service, N–N con el catálogo). */

export const opportunityServicesInput = z.object({
  serviceIds: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.string().uuid("Servicio inválido")).max(30, "Máximo 30 servicios"),
  ),
});

export async function setOpportunityServices(ctx: Ctx, opportunityId: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const { serviceIds } = opportunityServicesInput.parse(raw);
  const ids = [...new Set(serviceIds)];
  return getDb().transaction(async (t) => {
    const [o] = await t
      .select({ id: schema.opportunity.id, title: schema.opportunity.title, clientId: schema.opportunity.clientId })
      .from(schema.opportunity)
      .where(and(eq(schema.opportunity.id, opportunityId), scoped(schema.opportunity, ctx)));
    if (!o) throw notFound("La oportunidad");
    const services = ids.length
      ? await t
          .select({ id: schema.service.id, name: schema.service.name })
          .from(schema.service)
          .where(and(inArray(schema.service.id, ids), scoped(schema.service, ctx, { withArchived: true })))
      : [];
    if (services.length !== ids.length) throw validation("Hay un servicio que no existe", { serviceIds: "Revisá los servicios elegidos" });
    await t
      .delete(schema.opportunityService)
      .where(and(eq(schema.opportunityService.workspaceId, ctx.workspaceId), eq(schema.opportunityService.opportunityId, o.id)));
    if (ids.length)
      await t.insert(schema.opportunityService).values(ids.map((serviceId) => ({ workspaceId: ctx.workspaceId, opportunityId: o.id, serviceId })));
    await recordEvent(t, ctx, {
      type: "oportunidad.servicios",
      entityType: "opportunity",
      entityId: o.id,
      summary: ids.length
        ? `Marcó ${ids.length === 1 ? "el servicio" : "los servicios"} ${services.map((s) => `«${s.name}»`).join(", ")} en «${o.title}»`
        : `Quitó los servicios de interés de «${o.title}»`,
      payload: { clientId: o.clientId, serviceIds: ids },
    });
    return { opportunityId: o.id, serviceIds: ids };
  });
}

/** Servicios elegidos de una oportunidad (con datos del catálogo para chips y para precargar presupuestos). */
export async function opportunityServices(ctx: Ctx, opportunityId: string) {
  return getDb()
    .select({
      id: schema.service.id,
      name: schema.service.name,
      unit: schema.service.unit,
      priceArs: schema.service.priceArs,
      priceUsd: schema.service.priceUsd,
      descriptionMd: schema.service.descriptionMd,
      active: schema.service.active,
    })
    .from(schema.opportunityService)
    .innerJoin(schema.service, eq(schema.service.id, schema.opportunityService.serviceId))
    .where(
      and(
        eq(schema.opportunityService.workspaceId, ctx.workspaceId),
        eq(schema.opportunityService.opportunityId, opportunityId),
        scoped(schema.service, ctx, { withArchived: true }),
      ),
    )
    .orderBy(asc(schema.service.name));
}

/** Catálogo activo para elegir. */
export async function serviceCatalog(ctx: Ctx) {
  return getDb()
    .select({ id: schema.service.id, name: schema.service.name, unit: schema.service.unit })
    .from(schema.service)
    .where(and(scoped(schema.service, ctx), eq(schema.service.active, true)))
    .orderBy(asc(schema.service.name));
}

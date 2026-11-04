import { formatMoney, L, label } from "@agencyos/core";
import { listTemplates } from "@agencyos/modules/projects/queries";
import { listServices } from "@agencyos/modules/quotes/queries";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { FileSignature, LayoutTemplate, Package, Plus } from "lucide-react";
import Link from "next/link";
import { NewServiceSheet, ServiceActions } from "@/components/quotes/service-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Servicios" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const all = sp.ver === "todos";
  const [rows, templates, everything] = await Promise.all([
    listServices(ctx, { includeInactive: all, q: sp.q?.trim() || undefined }),
    listTemplates(ctx),
    listServices(ctx, { includeInactive: true }),
  ]);
  const tplOpts = templates.map((t) => ({ value: t.id, label: t.name }));
  const inactive = everything.filter((r) => !r.s.active).length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Presupuestos y servicios"
        title="Servicios"
        description="El catálogo que usás para armar presupuestos. Los precios son de referencia: se pueden ajustar en cada presupuesto."
        accent="#A78BFA"
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/presupuestos">
                <FileSignature className="size-4" /> Presupuestos
              </Link>
            </Button>
            <NewServiceSheet templates={tplOpts} />
          </>
        }
      />
      {everything.length ? (
        <>
          <Tabs
            active={all ? "todos" : "activos"}
            items={[
              { key: "activos", label: "Activos", href: "/presupuestos/servicios", count: everything.length - inactive },
              { key: "todos", label: "Todos", href: "/presupuestos/servicios?ver=todos", count: everything.length },
            ]}
          />
          <form className="mb-5" action="/presupuestos/servicios" role="search">
            {all ? <input type="hidden" name="ver" value="todos" /> : null}
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Buscar servicios…"
              aria-label="Buscar servicios"
              className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
            />
          </form>
        </>
      ) : null}
      {rows.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ s, templateName }) => (
            <li key={s.id}>
              <Card className={`flex h-full flex-col gap-3 p-5 ${s.active ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Por {label(L.serviceUnit, s.unit).toLowerCase()}</p>
                    <h2 className="mt-1 text-[16px] font-medium text-text">{s.name}</h2>
                  </div>
                  <ServiceActions
                    id={s.id}
                    templates={tplOpts}
                    d={{
                      name: s.name,
                      unit: s.unit,
                      priceArs: s.priceArs,
                      priceUsd: s.priceUsd,
                      projectTemplateId: s.projectTemplateId,
                      descriptionMd: s.descriptionMd,
                      deliverablesMd: s.deliverablesMd,
                      active: s.active,
                    }}
                  />
                </div>
                {s.descriptionMd ? <p className="line-clamp-3 text-[13px] text-text-muted">{s.descriptionMd}</p> : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {s.priceArs ? <span className="font-mono text-[14px] text-text">{formatMoney(s.priceArs, "ARS")}</span> : null}
                  {s.priceUsd ? <span className="font-mono text-[14px] text-text">{formatMoney(s.priceUsd, "USD")}</span> : null}
                  {!s.priceArs && !s.priceUsd ? <span className="text-[13px] text-text-faint">Sin precio de referencia</span> : null}
                  {!s.active ? <Badge>Inactivo</Badge> : null}
                </div>
                {templateName ? (
                  <p className="flex items-center gap-1.5 text-[12px] text-text-muted">
                    <LayoutTemplate className="size-3.5" /> Plantilla: {templateName}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Package />}
          title={everything.length ? "No hay servicios con ese filtro" : "El catálogo está vacío"}
          description={
            everything.length
              ? "Probá con otra búsqueda o mirá también los inactivos."
              : "Cargá los servicios que vendés (sitio web, tienda, mantenimiento…) con su unidad y precio de referencia. Después los elegís al armar un presupuesto."
          }
          action={
            everything.length ? undefined : (
              <NewServiceSheet
                templates={tplOpts}
                trigger={
                  <Button variant="primary">
                    <Plus className="size-4" /> Cargar el primer servicio
                  </Button>
                }
              />
            )
          }
        />
      )}
    </div>
  );
}

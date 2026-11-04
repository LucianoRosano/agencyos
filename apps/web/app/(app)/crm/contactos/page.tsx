import { listContacts } from "@agencyos/modules/crm/queries";
import { Button, EmptyState, PageHeader } from "@agencyos/ui";
import { Star, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { ContactLinks } from "@/components/crm/contact-links";
import { NewContactSheet } from "@/components/crm/contact-forms";
import { CrmNav, SearchBox } from "@/components/crm/crm-nav";
import { CRM_ACCENT } from "@/components/crm/shared";
import { clientOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Contactos" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [rows, clients] = await Promise.all([listContacts(ctx, { q: sp.q }), clientOpts(ctx)]);
  const newBtn = <NewContactSheet clients={clients} redirect trigger={<Button variant="primary"><UserPlus className="size-4" /> Nuevo contacto</Button>} />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="CRM" title="Contactos" accent={CRM_ACCENT} actions={newBtn} />
      <CrmNav active="contactos" />
      <SearchBox action="/crm/contactos" q={sp.q} placeholder="Buscar por nombre, email o rol…" />
      {rows.length ? (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                  <th className="px-4 py-3 font-normal">Contacto</th>
                  <th className="px-3 py-3 font-normal">Clientes</th>
                  <th className="px-3 py-3 font-normal">Email</th>
                  <th className="px-3 py-3 font-normal">Teléfono</th>
                  <th className="px-4 py-3 text-right font-normal"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ct, clients: cs }) => (
                  <tr key={ct.id} className="group border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="max-w-[240px] px-4 py-2.5">
                      <Link href={`/crm/contactos/${ct.id}`} className="block truncate font-medium text-text group-hover:underline">{ct.name}</Link>
                      <span className="block truncate text-[12px] text-text-muted">{ct.role ?? "—"}</span>
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[13px]">
                        {cs.length ? cs.map((c) => (
                          <Link key={c.id} href={`/crm/clientes/${c.id}`} className="inline-flex items-center gap-1 text-text-muted hover:text-text">{c.name}{c.isPrimary ? <Star className="size-3 fill-current text-warning" aria-label="principal" /> : null}</Link>
                        )) : <span className="text-text-faint">—</span>}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-text-muted">{ct.email ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[13px] whitespace-nowrap text-text-muted">{ct.whatsapp ?? ct.phone ?? "—"}</td>
                    <td className="px-4 py-2"><ContactLinks name={ct.name} email={ct.email} phone={ct.phone} whatsapp={ct.whatsapp} className="justify-end" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2.5 md:hidden">
            {rows.map(({ ct, clients: cs }) => (
              <li key={ct.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <Link href={`/crm/contactos/${ct.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-text">{ct.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-text-muted">{[ct.role, cs.map((c) => c.name).join(", ")].filter(Boolean).join(" · ") || "Sin cliente"}</p>
                </Link>
                <ContactLinks name={ct.name} email={null} phone={ct.phone} whatsapp={ct.whatsapp} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          icon={<Users />}
          title={sp.q ? `Sin resultados para «${sp.q}»` : "Todavía no hay contactos"}
          description="Las personas con las que hablás en cada cliente. Un contacto puede estar en varios clientes."
          action={newBtn}
        />
      )}
    </div>
  );
}

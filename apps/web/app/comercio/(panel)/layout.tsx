import { shopMemberships } from "@agencyos/modules/shop/service";
import type { Metadata } from "next";
import Link from "next/link";
import { LazyNavProgress } from "@/components/shell/nav-progress-lazy";
import { ShopNav, ShopSignOut, ShopSwitcher } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Comercio", template: "%s · Gestión" }, robots: { index: false, follow: false } };

/** Sistema de gestión para comercios (SaaS): marca del comercio, «por Luciano Rosano». */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const sc = await requireShopCtx();
  const shops = (await shopMemberships(sc.userId)).map((r) => ({ id: r.s.id, name: r.s.name }));
  const initials = sc.shopName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="bg-grid flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-6">
          <Link href="/comercio" className="flex min-w-0 items-center gap-3" aria-label={`Inicio de ${sc.shopName}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border-strong font-semibold" aria-hidden>
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium leading-tight">{sc.shopName}</span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.04em] text-text-faint">Gestión · por Luciano Rosano</span>
            </span>
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <ShopSwitcher shops={shops} current={sc.shopId} />
            <span className="hidden text-[13px] text-text-muted md:block">{sc.user.name}</span>
            <ShopSignOut />
          </span>
          <div className="w-full">
            <ShopNav admin={sc.role !== "seller"} />
          </div>
        </div>
      </header>
      <LazyNavProgress />
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-6 md:pt-8">
        {children}
      </main>
    </div>
  );
}

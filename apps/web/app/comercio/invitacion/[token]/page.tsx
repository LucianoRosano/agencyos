import { hitRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import { openShopInvitation, SHOP_ROLE_LABEL } from "@agencyos/modules/shop/service";
import { Card, EmptyState } from "@agencyos/ui";
import { CircleAlert } from "lucide-react";
import { getSession, requestIp } from "@/lib/session";
import { AcceptAsUser, AcceptNewUser } from "./forms";

export const metadata = { title: "Invitación", robots: { index: false, follow: false } };

export default async function ShopInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rl = await hitRateLimit(`shopinv:${await requestIp()}`, RATE_RULES.invitationView);
  const inv = rl.ok && /^[A-Za-z0-9_-]{20,80}$/.test(token) ? await openShopInvitation(token) : null;
  const s = await getSession();
  return (
    <main id="contenido" className="bg-grid grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md p-6">
        {!inv ? (
          <EmptyState
            icon={<CircleAlert />}
            title="Invitación no válida"
            description="Venció, ya se usó o fue reemplazada. Pedile un enlace nuevo a quien te invitó."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">Gestión · por Luciano Rosano</p>
              <h1 className="mt-1 text-[22px] font-semibold">{inv.shopName}</h1>
              <p className="text-[14px] text-text-muted">
                Te invitaron como {SHOP_ROLE_LABEL[inv.role].toLowerCase()} ({inv.email}).
              </p>
            </div>
            {inv.hasAccount ? (
              s && s.user.email.toLowerCase() === inv.email.toLowerCase() ? (
                <AcceptAsUser token={token} />
              ) : (
                <p className="text-[14px]">
                  Ya tenés una cuenta con ese email:{" "}
                  <a className="text-accent-text underline" href={`/login?next=${encodeURIComponent(`/comercio/invitacion/${token}`)}`}>
                    iniciá sesión
                  </a>{" "}
                  para aceptar.
                </p>
              )
            ) : (
              <AcceptNewUser token={token} name={inv.name} email={inv.email} />
            )}
          </div>
        )}
      </Card>
    </main>
  );
}

import { formatDate, L, label } from "@agencyos/core";
import { openInvitation } from "@agencyos/modules/users/service";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";
import { AcceptExisting, NewAccountForm, SignOutButton } from "./invite-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitación", robots: { index: false, follow: false } };

function Shell({ children, brand }: { children: React.ReactNode; brand: "agencyos" | "lr" }) {
  return (
    <main className="bg-grid relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,0.18),transparent)]" />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          {brand === "lr" ? (
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[10px] border border-border-strong font-semibold">LR</span>
              <span className="text-[15px] font-medium">Luciano Rosano</span>
            </span>
          ) : (
            <Logo />
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-pop)] md:p-8">{children}</div>
      </div>
    </main>
  );
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await openInvitation(token);
  if (!inv) {
    return (
      <Shell brand="agencyos">
        <h1 className="text-xl font-semibold">La invitación venció o ya se usó</h1>
        <p className="text-sm text-text-muted">Pedile a Luciano Rosano un enlace nuevo.</p>
        <Link href="/login" className="text-[13px] text-text-muted underline-offset-2 hover:underline">
          Ir a ingresar
        </Link>
      </Shell>
    );
  }
  const s = await getSession();
  const isClient = inv.role === "client";
  const sameUser = s && s.user.email.toLowerCase() === inv.email.toLowerCase();
  return (
    <Shell brand={isClient ? "lr" : "agencyos"}>
      <div>
        <h1 className="text-xl font-semibold">{isClient ? "Tu acceso al portal" : `Te invitaron a ${inv.workspaceName}`}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Como <strong className="text-text">{label(L.role, inv.role).toLowerCase()}</strong> · para {inv.email} · vence el {formatDate(inv.expiresAt)}.
          {isClient ? "" : " Después de crear la cuenta vas a activar la verificación en dos pasos (obligatoria)."}
        </p>
      </div>
      {inv.hasAccount ? (
        sameUser ? (
          <AcceptExisting token={token} />
        ) : s ? (
          <>
            <p className="text-sm text-text-muted">
              Ingresaste como {s.user.email}. Esta invitación es para {inv.email}: cerrá sesión y entrá con esa cuenta.
            </p>
            <SignOutButton />
          </>
        ) : (
          <>
            <p className="text-sm text-text-muted">Ya tenés una cuenta con ese email. Iniciá sesión para aceptar.</p>
            <Link
              href={`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`}
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[image:var(--gradient)] px-4 text-sm font-medium text-white"
            >
              Iniciar sesión
            </Link>
          </>
        )
      ) : (
        <NewAccountForm token={token} email={inv.email} />
      )}
    </Shell>
  );
}

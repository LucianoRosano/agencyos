import { can, formatDateTime } from "@agencyos/core";
import { getGoogleKeyStatus } from "@agencyos/modules/seo/queries";
import { Card, SectionLabel } from "@agencyos/ui";
import { KeyRound } from "lucide-react";
import { SeoHeader } from "@/components/seo/header";
import { GoogleKeyForm } from "@/components/seo/seo-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "API de Google · SEO" };

const n = (v: number) => v.toLocaleString("es-AR");

export default async function GooglePage() {
  const ctx = await requireCtx();
  const st = await getGoogleKeyStatus(ctx);
  const canManage = can(ctx, "manage", "settings");
  return (
    <div className="mx-auto max-w-6xl">
      <SeoHeader active="google" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <SectionLabel icon={<KeyRound />} className="mb-4">
            PageSpeed Insights y CrUX
          </SectionLabel>
          <p className="mb-4 max-w-2xl text-[14px] text-text-muted">
            Con una API key gratuita de Google, cada auditoría suma los puntajes de Lighthouse (celular y escritorio, tal como los devuelve Google) y los Core
            Web Vitals de usuarios reales (CrUX) cuando Google tiene datos suficientes.
          </p>
          {canManage ? (
            <GoogleKeyForm configured={st.configured} last4={st.last4} />
          ) : (
            <p className="text-[14px] text-text-muted">Solo el dueño o un admin pueden cargar la API key.</p>
          )}
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-4">Uso de hoy</SectionLabel>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-[14px]">
            <dt className="text-text-muted">PageSpeed Insights</dt>
            <dd className="font-mono">
              {n(st.usage.psi)} / {n(st.quota.psi)}
            </dd>
            <dt className="text-text-muted">CrUX</dt>
            <dd className="font-mono">
              {n(st.usage.crux)} / {n(st.quota.crux)}
            </dd>
            <dt className="text-text-muted">Último uso correcto</dt>
            <dd className="font-mono text-[13px]">{st.lastOkAt ? formatDateTime(st.lastOkAt) : "—"}</dd>
          </dl>
          {st.nearQuota ? <p className="mt-4 text-[13px] text-warning">Cerca del límite diario de la cuota gratuita de Google.</p> : null}
          {st.lastError ? <p className="mt-4 text-[13px] text-danger">Último error: {st.lastError}</p> : null}
        </Card>
      </div>
    </div>
  );
}

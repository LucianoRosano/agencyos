import { getDb, schema } from "@agencyos/db";
import { listPushDevices } from "@agencyos/modules/push/service";
import { Card, SectionLabel } from "@agencyos/ui";
import { eq } from "drizzle-orm";
import { requireCtx } from "@/lib/session";
import { PreferencesTable, PushToggle } from "./push-ui";

/** Tipos de evento que generan notificaciones (worker → dispatchOutbox / resumen diario). */
const EVENTS = [
  { type: "resumen.diario", label: "Resumen diario (8:00)" },
  { type: "aprobacion.solicitada", label: "Claude propone un cambio" },
  { type: "presupuesto.aceptado", label: "Presupuesto aceptado" },
  { type: "presupuesto.visto", label: "El cliente abrió un presupuesto" },
  { type: "presupuesto.vencido", label: "Presupuesto vencido" },
  { type: "cobro.vencido", label: "Cobro vencido" },
  { type: "pago.vencido", label: "Pago vencido" },
  { type: "sitio.caido", label: "Sitio caído / recuperado" },
  { type: "auditoria.regresion_detectada", label: "Regresión en una auditoría SEO" },
  { type: "agente.actividad", label: "Lo que hace Claude por MCP" },
];

export default async function NotificationSettingsPage() {
  const ctx = await requireCtx();
  const [devices, prefs] = await Promise.all([
    listPushDevices(ctx),
    getDb().select().from(schema.notificationPreference).where(eq(schema.notificationPreference.userId, ctx.user.id)),
  ]);
  const map = Object.fromEntries(prefs.map((p) => [p.eventType, { inApp: p.inApp, push: p.push, email: p.email }]));
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel className="mb-3">Este dispositivo</SectionLabel>
        <PushToggle devices={devices.length} />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Qué te avisa y por dónde</SectionLabel>
        <PreferencesTable events={EVENTS} prefs={map} emailEnabled={Boolean(process.env.BREVO_API_KEY)} />
      </Card>
    </div>
  );
}

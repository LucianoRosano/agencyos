import { getDb, schema } from "@agencyos/db";
import { NOTIFY_EVENTS } from "@agencyos/modules/notifications/catalog";
import { getNotifySettings } from "@agencyos/modules/notifications/settings";
import { listPushDevices } from "@agencyos/modules/push/service";
import { Card, SectionLabel } from "@agencyos/ui";
import { eq } from "drizzle-orm";
import { BellRing, Moon, Sun } from "lucide-react";
import { requireCtx } from "@/lib/session";
import { PreferencesTable, PushToggle } from "./push-ui";
import { NotifySettingsForm } from "./settings-form";

export const metadata = { title: "Notificaciones · Configuración" };

export default async function NotificationSettingsPage() {
  const ctx = await requireCtx();
  const [devices, prefs, settings] = await Promise.all([
    listPushDevices(ctx),
    getDb().select().from(schema.notificationPreference).where(eq(schema.notificationPreference.userId, ctx.user.id)),
    getNotifySettings(ctx.user.id),
  ]);
  const map = Object.fromEntries(prefs.map((p) => [p.eventType, { inApp: p.inApp, push: p.push, email: p.email }]));
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel icon={<BellRing />} className="mb-3">
          Este dispositivo
        </SectionLabel>
        <PushToggle devices={devices.length} />
      </Card>
      <Card className="p-5">
        <SectionLabel icon={<Moon />} className="mb-1">
          Descanso y resúmenes
        </SectionLabel>
        <p className="mb-4 text-[14px] text-text-muted">
          En tu horario de descanso los avisos no suenan: se juntan y te llega uno solo al terminar. Lo urgente (un sitio caído, un acceso desde un dispositivo
          nuevo) puede pasar igual.
        </p>
        <NotifySettingsForm settings={settings} />
      </Card>
      <Card className="p-5">
        <SectionLabel icon={<Sun />} className="mb-3">
          Qué te avisa y por dónde
        </SectionLabel>
        <PreferencesTable
          events={NOTIFY_EVENTS.map((e) => ({ type: e.type, label: e.label, group: e.group, low: e.priority === "low" }))}
          prefs={map}
          emailEnabled={Boolean(process.env.BREVO_API_KEY)}
        />
        <p className="mt-3 text-[13px] text-text-faint">
          Los marcados como «solo en la app» son avisos tranquilos: aparecen en la campana pero no suenan. «Mail» se habilita cuando configures Brevo.
        </p>
      </Card>
    </div>
  );
}

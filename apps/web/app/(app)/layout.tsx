import { getDb, schema } from "@agencyos/db";
import { pendingCount } from "@agencyos/modules/inbox/service";
import { unreadCount } from "@agencyos/modules/notifications/service";
import { scoped } from "@agencyos/modules/shared/db";
import { listSpacesWithCounts } from "@agencyos/modules/spaces/service";
import { and, count, inArray, notInArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { CaptureDialog } from "@/components/shell/capture-dialog";
import { CommandPalette } from "@/components/shell/command-palette";
import { BottomNav, MobileHeader } from "@/components/shell/mobile";
import { Shortcuts } from "@/components/shell/shortcuts";
import { type ShellData, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const db = getDb();
  const [spaces, inbox, [projects], [clients], selectedSpace, theme, unread] = await Promise.all([
    listSpacesWithCounts(ctx),
    pendingCount(ctx),
    db.select({ n: count() }).from(schema.project).where(and(scoped(schema.project, ctx), notInArray(schema.project.status, ["done", "archived"]))),
    db.select({ n: count() }).from(schema.client).where(and(scoped(schema.client, ctx), inArray(schema.client.status, ["active", "prospect", "paused"]))),
    getSelectedSpace(),
    cookies().then((c) => c.get("ag-theme")?.value ?? "dark"),
    unreadCount(ctx),
  ]);
  const data: ShellData = {
    user: { name: ctx.user.name, email: ctx.user.email },
    role: ctx.role,
    enabledModules: ctx.workspace.enabledModules,
    counts: { inbox, projects: projects?.n ?? 0, clients: clients?.n ?? 0, notifications: unread },
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, color: s.color, projects: s.projects })),
    selectedSpace,
    theme,
  };
  return (
    <div className="flex min-h-dvh">
      <Sidebar data={data} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader data={data} />
        <Topbar data={data} />
        <main id="contenido" className="bg-grid flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
          {children}
        </main>
      </div>
      <BottomNav data={data} />
      <CommandPalette enabledModules={data.enabledModules} />
      <CaptureDialog />
      <Shortcuts />
    </div>
  );
}

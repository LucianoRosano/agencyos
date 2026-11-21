import { getDb, schema } from "@agencyos/db";
import { pendingCount } from "@agencyos/modules/inbox/service";
import { unreadCount } from "@agencyos/modules/notifications/service";
import { projectScope, scoped } from "@agencyos/modules/shared/db";
import { listSpacesWithCounts } from "@agencyos/modules/spaces/service";
import { listMyWorkspaces } from "@agencyos/modules/workspaces/service";
import { and, count, inArray, notInArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { OfflineSync } from "@/components/offline/offline-sync";
import { LazyOverlays } from "@/components/shell/lazy-overlays";
import { BottomNav, MobileHeader } from "@/components/shell/mobile";
import { RouteTransition } from "@/components/shell/route-transition";
import { Shortcuts } from "@/components/shell/shortcuts";
import { type ShellData, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const db = getDb();
  const limited = ctx.role === "member";
  const [spaces, inbox, [projects], [clients], selectedSpace, theme, unread, workspaces] = await Promise.all([
    limited ? Promise.resolve([]) : listSpacesWithCounts(ctx),
    limited ? Promise.resolve(0) : pendingCount(ctx),
    db
      .select({ n: count() })
      .from(schema.project)
      .where(and(scoped(schema.project, ctx), notInArray(schema.project.status, ["done", "archived"]), projectScope(ctx))),
    limited
      ? Promise.resolve([{ n: 0 }])
      : db
          .select({ n: count() })
          .from(schema.client)
          .where(and(scoped(schema.client, ctx), inArray(schema.client.status, ["active", "prospect", "paused"]))),
    getSelectedSpace(),
    cookies().then((c) => c.get("ag-theme")?.value ?? "light"),
    unreadCount(ctx),
    listMyWorkspaces(ctx.userId ?? ""),
  ]);
  const data: ShellData = {
    user: { name: ctx.user.name, email: ctx.user.email },
    role: ctx.role,
    limited,
    // Colaborador: solo los módulos de trabajo de proyectos.
    enabledModules: limited ? ctx.workspace.enabledModules.filter((m) => m === "projects" || m === "sites") : ctx.workspace.enabledModules,
    counts: { inbox, projects: projects?.n ?? 0, clients: clients?.n ?? 0, notifications: unread },
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, color: s.color, projects: s.projects })),
    selectedSpace: limited ? undefined : selectedSpace,
    theme,
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
    canCreateWorkspace: ctx.role === "owner",
  };
  return (
    <div className="flex min-h-dvh">
      <Sidebar data={data} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader data={data} />
        <Topbar data={data} />
        <main id="contenido" className="bg-grid flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>
      <BottomNav data={data} />
      <LazyOverlays enabledModules={data.enabledModules} role={ctx.role} capture={!limited} />
      <Shortcuts limited={limited} enabledModules={data.enabledModules} role={ctx.role} />
      <OfflineSync userId={ctx.userId ?? ""} workspaceId={ctx.workspaceId} />
    </div>
  );
}

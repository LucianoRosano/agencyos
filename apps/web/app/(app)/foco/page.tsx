import { listTasks } from "@agencyos/modules/tasks/queries";
import { getToday } from "@agencyos/modules/today/queries";
import { focusMinutesToday } from "@agencyos/modules/today/service";
import { requireCtx } from "@/lib/session";
import { FocusMode } from "./focus-mode";

export const metadata = { title: "Modo foco" };

export default async function FocusPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [today, open, minutes] = await Promise.all([
    getToday(ctx, { userId: ctx.user.id }),
    listTasks(ctx, { view: "hoy", limit: 30 }),
    focusMinutesToday(ctx),
  ]);
  const options = [
    ...today.focus.map((f) => ({ id: f.task.id, title: f.task.title, project: f.task.projectName })),
    ...open.map((r) => ({ id: r.t.id, title: r.t.title, project: r.projectName })),
  ].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
  return <FocusMode tasks={options} initialTaskId={sp.tarea ?? options[0]?.id} minutesToday={minutes} />;
}

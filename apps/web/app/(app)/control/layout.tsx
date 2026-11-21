import { can } from "@agencyos/core";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/session";

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "agent")) redirect("/hoy");
  return <div className="mx-auto max-w-6xl">{children}</div>;
}

import { formatDate, L, label, relativeFromDate } from "@agencyos/core";
import { listInvitations, listUsers, userFormOptions } from "@agencyos/modules/users/service";
import { Badge, Card, EmptyState, SectionLabel } from "@agencyos/ui";
import { MailPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/session";
import { InvitationMenu, InviteSheet, UserMenu } from "./users-ui";

export const metadata = { title: "Usuarios" };

const ROLE_TONE = { owner: "accent", admin: "info", member: "neutral", client: "success" } as const;

export default async function UsersPage() {
  const ctx = await requireCtx();
  if (ctx.role !== "owner" && ctx.role !== "admin") notFound();
  const [users, invitations, options] = await Promise.all([listUsers(ctx), listInvitations(ctx), userFormOptions(ctx)]);
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Usuarios</SectionLabel>
          <InviteSheet options={options} />
        </div>
        <ul className="flex flex-col divide-y divide-border" data-testid="users-list">
          {users.map((u) => (
            <li key={u.membershipId} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                  <span className="truncate">{u.name}</span>
                  <Badge tone={ROLE_TONE[u.role]}>{label(L.role, u.role)}</Badge>
                  {u.status !== "active" ? <Badge tone="danger">{label(L.membershipStatus, u.status)}</Badge> : null}
                  {u.isMe ? <span className="text-[12px] text-text-faint">vos</span> : null}
                </p>
                <p className="truncate text-[13px] text-text-muted">{u.email}</p>
                <p className="mt-1 text-[12px] text-text-faint">
                  {u.lastAccess ? `Último acceso ${relativeFromDate(u.lastAccess)}` : "Todavía no entró"}
                  {u.role !== "client" ? ` · 2FA ${u.twoFactor ? "activo" : "pendiente"}` : ""}
                </p>
                {u.role === "member" ? (
                  <p className="mt-1 text-[13px] text-text-muted">
                    {u.projects.length ? u.projects.map((p) => p.name).join(" · ") : "Sin proyectos asignados"}
                  </p>
                ) : null}
                {u.role === "client" ? <p className="mt-1 text-[13px] text-text-muted">Cliente: {u.clientName ?? "sin cliente asignado"}</p> : null}
              </div>
              {u.role !== "owner" && !u.isMe ? (
                <UserMenu
                  membershipId={u.membershipId}
                  name={u.name}
                  role={u.role}
                  status={u.status}
                  clientId={u.clientId}
                  projectIds={u.projects.map((p) => p.id)}
                  options={options}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Invitaciones pendientes</SectionLabel>
        {invitations.length ? (
          <ul className="flex flex-col divide-y divide-border" data-testid="invitations-list">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="truncate">{i.email}</span>
                    <Badge tone={ROLE_TONE[i.role]}>{label(L.role, i.role)}</Badge>
                    {i.expired ? <Badge tone="warning">Vencida</Badge> : null}
                  </p>
                  <p className="text-[12px] text-text-faint">
                    {i.role === "client" && i.clientName ? `${i.clientName} · ` : ""}
                    {i.role === "member" ? `${i.projectCount} ${i.projectCount === 1 ? "proyecto" : "proyectos"} · ` : ""}
                    {i.expired ? "Venció" : "Vence"} el {formatDate(i.expiresAt)}
                  </p>
                </div>
                <InvitationMenu id={i.id} email={i.email} emailConfigured={options.emailConfigured} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<MailPlus />}
            title="No hay invitaciones pendientes"
            description="Invitá a un colaborador para un proyecto o a un cliente para que use el portal."
          />
        )}
      </Card>
    </div>
  );
}

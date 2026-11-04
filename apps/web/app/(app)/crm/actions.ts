"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/crm/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Clientes
export const createClientAction = async (_: S, fd: FormData) => run((ctx) => svc.createClient(ctx, obj(fd)));
export const updateClientAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateClient(ctx, id, obj(fd)));
export const setClientStatusAction = async (id: string, status: string) => run((ctx) => svc.setClientStatus(ctx, id, status));
export const deleteClientAction = async (id: string) => run((ctx) => svc.deleteClient(ctx, id));
export const restoreClientAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "client", id));
export const archiveClientAction = async (id: string, withProjects: boolean) => run((ctx) => svc.archiveClient(ctx, id, { withProjects }));
export const unarchiveClientAction = async (id: string, previousStatus: string, projectIds: string[]) =>
  run((ctx) => svc.unarchiveClient(ctx, id, previousStatus, projectIds));
export const mergeClientsAction = async (duplicateId: string, _: S, fd: FormData) =>
  run((ctx) => svc.mergeClients(ctx, duplicateId, String(fd.get("targetId") ?? "")));

// Datos fiscales (revelar no revalida: no cambia nada visible para otros)
export const revealFiscalAction = async (clientId: string) => run((ctx) => svc.revealFiscalHolders(ctx, clientId), { revalidate: false });
export const addFiscalAction = async (clientId: string, _: S, fd: FormData) => run((ctx) => svc.addFiscalHolder(ctx, clientId, obj(fd)));
export const removeFiscalAction = async (holderId: string) => run((ctx) => svc.removeFiscalHolder(ctx, holderId));

// Contactos
export const createContactAction = async (_: S, fd: FormData) => run((ctx) => svc.createContact(ctx, obj(fd)));
export const updateContactAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateContact(ctx, id, obj(fd)));
export const linkContactAction = async (clientId: string, _: S, fd: FormData) => run((ctx) => svc.linkContact(ctx, clientId, obj(fd)));
export const relinkContactAction = async (clientId: string, contactId: string, isPrimary: boolean, roleInClient: string | null) =>
  run((ctx) => svc.linkContact(ctx, clientId, { contactId, isPrimary: isPrimary ? "true" : "", roleInClient: roleInClient ?? "" }));
export const unlinkContactAction = async (clientId: string, contactId: string) => run((ctx) => svc.unlinkContact(ctx, clientId, contactId));
export const setPrimaryContactAction = async (clientId: string, contactId: string) => run((ctx) => svc.setPrimaryContact(ctx, clientId, contactId));
export const deleteContactAction = async (id: string) => run((ctx) => moveToTrash(ctx, "contact", id));
export const restoreContactAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "contact", id));

// Interacciones
export const logInteractionAction = async (_: S, fd: FormData) => run((ctx) => svc.logInteraction(ctx, obj(fd)));
export const completeNextStepAction = async (id: string) => run((ctx) => svc.completeNextStep(ctx, id));
export const restoreNextStepAction = async (id: string, nextStep: string | null, nextStepDue: string | null) =>
  run((ctx) => svc.restoreNextStep(ctx, id, nextStep, nextStepDue));
export const deleteInteractionAction = async (id: string) => run((ctx) => moveToTrash(ctx, "interaction", id));
export const restoreInteractionAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "interaction", id));

// Oportunidades
export const createOpportunityAction = async (_: S, fd: FormData) => run((ctx) => svc.createOpportunity(ctx, obj(fd)));
export const updateOpportunityAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateOpportunity(ctx, id, obj(fd)));
export const moveOpportunityAction = async (id: string, input: { stage: string; quoteId?: string; lostReason?: string }) =>
  run((ctx) => svc.moveOpportunity(ctx, id, input));
export const unlinkQuoteAction = async (opportunityId: string, quoteId: string) => run((ctx) => svc.unlinkQuote(ctx, opportunityId, quoteId));
export const deleteOpportunityAction = async (id: string) => run((ctx) => moveToTrash(ctx, "opportunity", id));
export const restoreOpportunityAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "opportunity", id));

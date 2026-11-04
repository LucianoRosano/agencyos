"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/finance/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Cuentas
export const createAccountAction = async (_: S, fd: FormData) => run((ctx) => svc.createAccount(ctx, obj(fd)));
export const updateAccountAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateAccount(ctx, id, obj(fd)));
export const deleteAccountAction = async (id: string) => run((ctx) => moveToTrash(ctx, "account", id));
export const restoreAccountAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "account", id));

// Categorías
export const createCategoryAction = async (_: S, fd: FormData) => run((ctx) => svc.createCategory(ctx, obj(fd)));
export const renameCategoryAction = async (id: string, name: string) => run((ctx) => svc.renameCategory(ctx, id, name));
export const deleteCategoryAction = async (id: string) => run((ctx) => svc.trashCategory(ctx, id));
export const restoreCategoryAction = async (id: string) => run((ctx) => svc.trashCategory(ctx, id, true));

// Movimientos
export const createTransactionAction = async (_: S, fd: FormData) => run((ctx) => svc.createTransaction(ctx, obj(fd)));
export const updateTransactionAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateTransaction(ctx, id, obj(fd)));
export const createTransferAction = async (_: S, fd: FormData) => run((ctx) => svc.createTransfer(ctx, obj(fd)));
export const deleteTransactionAction = async (id: string) => run((ctx) => svc.deleteTransaction(ctx, id));
export const restoreTransactionAction = async (id: string) => run((ctx) => svc.deleteTransaction(ctx, id, true));

// Suscripciones
export const createSubscriptionAction = async (_: S, fd: FormData) => run((ctx) => svc.createSubscription(ctx, obj(fd)));
export const updateSubscriptionAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateSubscription(ctx, id, obj(fd)));
export const setSubscriptionStatusAction = async (id: string, status: (typeof svc.SUB_STATUSES)[number]) =>
  run((ctx) => svc.setSubscriptionStatus(ctx, id, status));
export const paySubscriptionAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.registerSubscriptionPayment(ctx, id, obj(fd)));
export const undoSubscriptionPaymentAction = async (id: string, txId: string, previousDue: string) =>
  run((ctx) => svc.undoSubscriptionPayment(ctx, id, txId, previousDue));
export const deleteSubscriptionAction = async (id: string) => run((ctx) => moveToTrash(ctx, "subscription", id));
export const restoreSubscriptionAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "subscription", id));

// Por cobrar
export const createReceivableAction = async (_: S, fd: FormData) => run((ctx) => svc.createReceivable(ctx, obj(fd)));
export const updateReceivableAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateReceivable(ctx, id, obj(fd)));
export const collectReceivableAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.registerCollection(ctx, id, obj(fd)));
export const voidReceivableAction = async (id: string, undo = false) => run((ctx) => svc.voidReceivable(ctx, id, undo));
export const deleteReceivableAction = async (id: string) => run((ctx) => moveToTrash(ctx, "receivable", id));
export const restoreReceivableAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "receivable", id));

// Por pagar
export const createPayableAction = async (_: S, fd: FormData) => run((ctx) => svc.createPayable(ctx, obj(fd)));
export const updatePayableAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updatePayable(ctx, id, obj(fd)));
export const payPayableAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.registerPayablePayment(ctx, id, obj(fd)));
export const voidPayableAction = async (id: string, undo = false) => run((ctx) => svc.voidPayable(ctx, id, undo));
export const deletePayableAction = async (id: string) => run((ctx) => moveToTrash(ctx, "payable", id));
export const restorePayableAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "payable", id));

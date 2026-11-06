"use server";

import { type Result, validation } from "@agencyos/core";
import * as svc from "@agencyos/modules/assets/service";
import * as mon from "@agencyos/modules/monitoring/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

/** Tipos de Activos que se pueden mandar a la papelera desde estas pantallas. */
const TRASHABLE = ["domain", "hosting", "certificate", "credential_ref", "own_product", "installation", "site_environment"] as const;
type Trashable = (typeof TRASHABLE)[number];
const checkType = (t: string): Trashable => {
  if (!(TRASHABLE as readonly string[]).includes(t)) throw validation("Tipo inválido");
  return t as Trashable;
};

export const trashAssetAction = async (type: string, id: string) => run((ctx) => moveToTrash(ctx, checkType(type), id));
export const restoreAssetAction = async (type: string, id: string) => run((ctx) => restoreFromTrash(ctx, checkType(type), id));

export const createDomainAction = async (_: S, fd: FormData) => run((ctx) => svc.createDomain(ctx, obj(fd)));
export const updateDomainAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateDomain(ctx, id, obj(fd)));
export const createHostingAction = async (_: S, fd: FormData) => run((ctx) => svc.createHosting(ctx, obj(fd)));
export const updateHostingAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateHosting(ctx, id, obj(fd)));
export const createCertificateAction = async (_: S, fd: FormData) => run((ctx) => svc.createCertificate(ctx, obj(fd)));
export const updateCertificateAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateCertificate(ctx, id, obj(fd)));
export const createCredentialAction = async (_: S, fd: FormData) => run((ctx) => svc.createCredential(ctx, obj(fd)));
export const updateCredentialAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateCredential(ctx, id, obj(fd)));
export const convertReminderAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.convertReminder(ctx, id, obj(fd)));

export const createProductAction = async (_: S, fd: FormData) => run((ctx) => svc.createProduct(ctx, obj(fd)));
export const updateProductAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateProduct(ctx, id, obj(fd)));
export const addVersionAction = async (productId: string, _: S, fd: FormData) => run((ctx) => svc.addVersion(ctx, productId, obj(fd)));
export const deleteVersionAction = async (id: string) => run((ctx) => svc.deleteVersion(ctx, id));
export const restoreVersionAction = async (id: string) => run((ctx) => svc.restoreVersion(ctx, id));
export const createInstallationAction = async (productId: string, _: S, fd: FormData) => run((ctx) => svc.createInstallation(ctx, productId, obj(fd)));
export const updateInstallationAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateInstallation(ctx, id, obj(fd)));

export const createEnvironmentAction = async (_: S, fd: FormData) => run((ctx) => mon.createMonitoredEnvironment(ctx, obj(fd)));
export const updateEnvironmentAction = async (id: string, _: S, fd: FormData) => run((ctx) => mon.updateEnvironment(ctx, id, obj(fd)));
export const setSiteMonitoringAction = async (siteId: string, enabled: boolean) => run((ctx) => mon.setSiteMonitoring(ctx, siteId, enabled));
/** La contraseña entra por el formulario y no se devuelve: la respuesta solo trae el usuario. */
export const saveWordpressAction = async (envId: string, _: S, fd: FormData) => run((ctx) => mon.saveWordpressAccess(ctx, envId, obj(fd)));
export const removeWordpressAction = async (envId: string) => run((ctx) => mon.removeWordpressAccess(ctx, envId));
export const checkNowAction = async (envId: string) => run((ctx) => mon.checkNow(ctx, envId));

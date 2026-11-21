"use server";

import type { Result } from "@agencyos/core";
import * as shop from "@agencyos/modules/shop/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
export const createShopAction = async (_: S, fd: FormData) => run((ctx) => shop.createShop(ctx, Object.fromEntries(fd)));
export const setShopStatusAction = async (id: string, status: "active" | "suspended") => run((ctx) => shop.setShopStatus(ctx, id, status));
export const reinviteOwnerAction = async (id: string, _: S, fd: FormData) => run((ctx) => shop.reinviteShopOwner(ctx, id, Object.fromEntries(fd)));

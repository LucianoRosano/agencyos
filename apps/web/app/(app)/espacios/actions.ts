"use server";

import type { Result } from "@agencyos/core";
import { createSpace, moveSpace, updateSpace } from "@agencyos/modules/spaces/service";
import { archive } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

export const createSpaceAction = async (_: Result<unknown> | null, fd: FormData) => run((ctx) => createSpace(ctx, Object.fromEntries(fd)));
export const updateSpaceAction = async (id: string, _: Result<unknown> | null, fd: FormData) => run((ctx) => updateSpace(ctx, id, Object.fromEntries(fd)));
export const moveSpaceAction = async (id: string, dir: -1 | 1) => run((ctx) => moveSpace(ctx, id, dir));
export const archiveSpaceAction = async (id: string) => run((ctx) => archive(ctx, "space", id));

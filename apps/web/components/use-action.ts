"use client";

import type { Result } from "@agencyos/core";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

/** Ejecuta una Server Action desde un botón, con toast y "Deshacer" opcional (8 s). */
export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  function exec<T>(
    fn: () => Promise<Result<T>>,
    opts: { success?: string; undo?: () => Promise<Result<unknown>>; onDone?: (data: T) => void; redirectTo?: string } = {},
  ) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      opts.onDone?.(r.data);
      if (opts.success) {
        const undo = opts.undo;
        toast.success(
          opts.success,
          undo ? { duration: 8000, action: { label: "Deshacer", onClick: () => void undo().then(() => router.refresh()) } } : undefined,
        );
      }
      if (opts.redirectTo) router.push(opts.redirectTo);
    });
  }
  return { pending, exec };
}

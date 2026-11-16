"use client";

import type { Result } from "@agencyos/core";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/lib/toast";

/**
 * Ejecuta una Server Action desde un botón, con toast y "Deshacer" opcional (8 s).
 * `optimistic` corre dentro de la transición antes de llamar al servidor: usalo con el setter de `useOptimistic`
 * para que la UI cambie al instante y vuelva sola al valor real si la acción falla.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  function exec<T>(
    fn: () => Promise<Result<T>>,
    opts: {
      success?: string;
      undo?: () => Promise<Result<unknown>>;
      onDone?: (data: T) => void;
      redirectTo?: string;
      optimistic?: () => void;
    } = {},
  ) {
    start(async () => {
      opts.optimistic?.();
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
          undo
            ? {
                duration: 8000,
                action: {
                  label: "Deshacer",
                  onClick: () =>
                    void undo().then((u) => {
                      if (u.ok) toast.success("Deshecho");
                      else toast.error(u.error.message);
                      router.refresh();
                    }),
                },
              }
            : undefined,
        );
      }
      if (opts.redirectTo) router.push(opts.redirectTo);
    });
  }
  return { pending, exec };
}

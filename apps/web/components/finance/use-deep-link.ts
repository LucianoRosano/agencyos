"use client";

import type { Result } from "@agencyos/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

/** Quita un parámetro de la URL (p. ej. `?pagar=`) al cerrar el diálogo abierto por deep link. */
export function useClearParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (...keys: string[]) => {
      if (!keys.some((k) => sp.has(k))) return;
      const p = new URLSearchParams(sp.toString());
      for (const k of keys) p.delete(k);
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );
}

/** Toast de éxito con "Deshacer" (8 s) para formularios. */
export function useUndoToast() {
  const router = useRouter();
  return useCallback(
    (message: string, undo: () => Promise<Result<unknown>>) => {
      toast.success(message, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () =>
            void undo().then((r) => {
              if (!r.ok) toast.error(r.error.message);
              else toast.success("Deshecho");
              router.refresh();
            }),
        },
      });
    },
    [router],
  );
}

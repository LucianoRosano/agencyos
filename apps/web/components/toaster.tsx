"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";

/**
 * Toasts (docs/07 §3): abajo a la derecha en desktop y arriba en el celular, para no tapar la barra inferior ni el
 * botón de captura. Debajo del notch gracias al offset con safe-area.
 */
export function Toaster({ theme }: { theme: "dark" | "light" }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    <Sonner
      theme={theme}
      position={mobile ? "top-center" : "bottom-right"}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      toastOptions={{ className: "!bg-surface !text-text !border-border", style: { fontFamily: "var(--font-sans)" } }}
    />
  );
}

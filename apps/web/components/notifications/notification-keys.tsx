"use client";

import { useEffect } from "react";

/** Teclado en el centro de avisos: J/K o flechas para moverse, Enter para abrir, E para abrir el menú (archivar, posponer). */
export function NotificationKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if ((el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-notification-link]")].filter((a) => a.offsetParent !== null);
      if (!links.length) return;
      const i = links.indexOf(document.activeElement as HTMLAnchorElement);
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        links[Math.min(links.length - 1, i + 1)]?.focus();
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        links[Math.max(0, i - 1)]?.focus();
      } else if (k === "e" && i >= 0) {
        e.preventDefault();
        links[i]?.closest("[data-notification]")?.querySelector<HTMLButtonElement>("button[aria-label^='Acciones']")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <p className="mb-3 hidden text-[12px] text-text-faint md:block">
      Teclado: <kbd className="font-code">J</kbd>/<kbd className="font-code">K</kbd> para moverte, <kbd className="font-code">Enter</kbd> abre,{" "}
      <kbd className="font-code">E</kbd> acciones.
    </p>
  );
}

"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { setThemeAction } from "@/app/actions/shell";

/** Cambia el tema con un fundido corto de toda la pantalla (View Transitions); sin soporte o con movimiento reducido, al instante. */
export function switchTheme(next: "light" | "dark") {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = next;
  };
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (!vt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
  root.classList.add("theme-fade");
  vt.call(document, apply).finished.finally(() => root.classList.remove("theme-fade"));
}

export function ThemeToggle({ current }: { current: string }) {
  const router = useRouter();
  const isDark = current !== "light";
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={async () => {
        const next = isDark ? "light" : "dark";
        switchTheme(next);
        await setThemeAction(next);
        router.refresh();
      }}
    >
      {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}

"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { setThemeAction } from "@/app/actions/shell";

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
        document.documentElement.dataset.theme = next;
        await setThemeAction(next);
        router.refresh();
      }}
    >
      {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}

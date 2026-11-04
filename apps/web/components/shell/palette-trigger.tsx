"use client";

import { Search } from "lucide-react";

export const openPalette = () => window.dispatchEvent(new CustomEvent("ag:palette"));
export const openCapture = () => window.dispatchEvent(new CustomEvent("ag:capture"));

export function OpenPaletteButton() {
  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-10 w-full items-center gap-2.5 rounded-[9px] border border-border bg-surface px-3 text-[14px] text-text-muted transition-colors hover:border-border-strong"
    >
      <Search className="size-4" />
      <span className="flex-1 text-left">Buscar o crear…</span>
      <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-faint">Ctrl K</kbd>
    </button>
  );
}

export function SearchIconButton() {
  return (
    <button type="button" onClick={openPalette} aria-label="Buscar" className="grid size-11 place-items-center rounded-xl border border-border bg-surface text-text">
      <Search className="size-5" />
    </button>
  );
}

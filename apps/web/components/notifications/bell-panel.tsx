"use client";

import { relativeFromDate } from "@agencyos/core";
import { cn } from "@agencyos/ui";
import { Check, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markReadAction, snoozeAction } from "@/app/(app)/notificaciones/actions";
import { toast } from "@/lib/toast";
import { notificationKind } from "./kind";

type Item = { id: string; type: string; title: string; priority: string; createdAt: string; href: string };

/** Vista rápida desde la campana (desktop): lo último sin leer, con «Listo» y «Más tarde» sin salir de la pantalla. */
export function BellPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/notificaciones/estado?lista=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [], unread: 0 }))
      .then((d: { items: Item[]; unread: number }) => {
        if (!alive) return;
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => alive && setItems([]));
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !(e.target as Element).closest?.("[data-bell]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const done = (id: string, how: "read" | "snooze") => {
    setItems((l) => l?.filter((x) => x.id !== id) ?? null);
    const next = Math.max(0, unread - 1);
    setUnread(next);
    window.dispatchEvent(new CustomEvent("ag:unread", { detail: next }));
    void (how === "read" ? markReadAction(id) : snoozeAction(id, "3h")).then((r) => {
      if (!r.ok) toast.error(r.error.message);
      else if (how === "snooze") toast.success("Te lo recuerdo en 3 horas");
    });
  };

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-label="Avisos sin leer"
      className="ag-menu absolute top-12 right-0 z-50 w-[380px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-pop)] outline-none"
      data-state="open"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-serif text-[16px] font-semibold">Sin leer{unread ? ` · ${unread}` : ""}</span>
        <Link href="/notificaciones" onClick={onClose} className="text-[13px] text-accent-text hover:underline">
          Ver todas
        </Link>
      </div>
      {items === null ? (
        <p className="px-4 py-6 text-center text-[14px] text-text-muted">Cargando…</p>
      ) : items.length ? (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {items.map((n) => {
            const k = notificationKind(n.type);
            return (
              <li key={n.id} className="rise group flex items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full [&>svg]:size-4", k.tone)} aria-hidden>
                  {k.icon}
                </span>
                <Link href={n.href} prefetch={false} onClick={onClose} className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[14px] leading-snug text-text">
                    {n.priority === "urgent" ? <span className="mr-1 font-semibold text-danger">Urgente ·</span> : null}
                    {n.title}
                  </span>
                  <span className="text-[12px] text-text-faint">
                    {k.label} · {relativeFromDate(new Date(n.createdAt))}
                  </span>
                </Link>
                <span className="flex shrink-0 gap-0.5 opacity-70 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => done(n.id, "snooze")}
                    aria-label={`Recordarme más tarde: ${n.title}`}
                    title="Más tarde (3 h)"
                    className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text"
                  >
                    <Clock className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => done(n.id, "read")}
                    aria-label={`Marcar leído: ${n.title}`}
                    title="Listo"
                    className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text"
                  >
                    <Check className="size-4" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-[14px] text-text-muted">Estás al día. 🙌</p>
      )}
    </div>
  );
}

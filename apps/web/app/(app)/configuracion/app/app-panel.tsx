"use client";

import { relativeFromDate } from "@agencyos/core";
import { Button, Card, SectionLabel } from "@agencyos/ui";
import { CloudOff, Download, MonitorSmartphone, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

type Stats = { tasks: number; notes: number; inbox: number; projects: number; clients: number; pending: number; lastSync?: string; usage?: number };
type Platform = "ios" | "android" | "desktop" | "other";

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "other";
}

const INSTRUCTIONS: Record<Platform, string> = {
  ios: "En el iPhone o iPad: abrí AGENCYOS en Safari, tocá Compartir (el cuadrado con la flecha) y elegí «Agregar a inicio».",
  android: "En Android: en Chrome, tocá el menú ⋮ y elegí «Instalar app» (o «Agregar a la pantalla principal»).",
  desktop: "En la PC o la Mac: en Chrome o Edge, tocá el ícono de instalar en la barra de direcciones (o el menú ⋮ → «Instalar AGENCYOS»).",
  other: "Abrí el menú del navegador y buscá «Instalar app» o «Agregar a la pantalla de inicio».",
};

/** Instalar la app en este dispositivo y manejar la copia para usarla sin conexión. Todo gratis, sin tiendas. */
export function AppPanel() {
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [plat, setPlat] = useState<Platform>("other");
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const eng = await import("@/lib/offline/engine");
    setEnabled(eng.offlineEnabled());
    const [tasks, notes, inbox, projects, clients, meta, pending] = await Promise.all([
      eng.getAll("tasks"),
      eng.getAll("notes"),
      eng.getAll("inbox"),
      eng.getAll("projects"),
      eng.getAll("clients"),
      eng.getMeta(),
      eng.pendingCount(),
    ]);
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    setStats({
      tasks: tasks.length,
      notes: notes.length,
      inbox: inbox.length,
      projects: projects.length,
      clients: clients.length,
      pending,
      lastSync: meta.lastSync,
      usage: est?.usage,
    });
  }, []);

  useEffect(() => {
    setPlat(platform());
    setInstalled(matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const upd = () => setCanPrompt(Boolean(window.__agInstall));
    upd();
    window.addEventListener("ag:installable", upd);
    window.addEventListener("ag:offline", load);
    void load();
    return () => {
      window.removeEventListener("ag:installable", upd);
      window.removeEventListener("ag:offline", load);
    };
  }, [load]);

  async function install() {
    const ev = window.__agInstall;
    if (!ev) return;
    await ev.prompt();
    const r = await ev.userChoice;
    if (r.outcome === "accepted") toast.success("AGENCYOS quedó instalada en este dispositivo");
    window.__agInstall = null;
    setCanPrompt(false);
  }

  async function sync(full = false) {
    setBusy(true);
    const eng = await import("@/lib/offline/engine");
    const ok = await eng.syncNow({ full });
    setBusy(false);
    if (ok) toast.success("Copia actualizada");
    else toast.error(navigator.onLine ? "No se pudo sincronizar. Probá de nuevo en un rato." : "Sin conexión: se sincroniza sola cuando vuelva.");
    void load();
  }

  async function toggle(on: boolean) {
    const eng = await import("@/lib/offline/engine");
    localStorage.setItem(eng.OFFLINE_PREF, on ? "on" : "off");
    setEnabled(on);
    if (on) await sync(true);
    else {
      if ((await eng.pendingCount()) && !confirm("Hay cambios sin subir en este dispositivo. Si desactivás, se pierden. ¿Seguir?")) {
        localStorage.setItem(eng.OFFLINE_PREF, "on");
        setEnabled(true);
        return;
      }
      await eng.wipe();
      toast.success("Copia borrada de este dispositivo");
      void load();
    }
  }

  async function wipeCopy() {
    const eng = await import("@/lib/offline/engine");
    const pending = await eng.pendingCount();
    if (
      !confirm(
        pending
          ? `Hay ${pending} cambios sin subir que se van a perder. ¿Borrar la copia de este dispositivo?`
          : "¿Borrar la copia guardada en este dispositivo?",
      )
    )
      return;
    await eng.wipe();
    toast.success("Copia borrada. Se vuelve a descargar la próxima vez que abras la app con conexión.");
    void load();
  }

  const mb = stats?.usage ? `${(stats.usage / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : null;
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel icon={<MonitorSmartphone />} className="mb-3">
          Instalar la app
        </SectionLabel>
        {installed ? (
          <p className="text-[14px] text-success">Estás usando AGENCYOS instalada en este dispositivo.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-text-muted">
              AGENCYOS se instala como una app más (con ícono, ventana propia y notificaciones) en la PC, la Mac, Android y el iPhone. Es gratis y no pasa por
              ninguna tienda.
            </p>
            {canPrompt ? (
              <Button variant="primary" onClick={() => void install()} className="self-start">
                <Download className="size-4" /> Instalar en este dispositivo
              </Button>
            ) : (
              <p className="text-[14px]" data-testid="install-instructions">
                {INSTRUCTIONS[plat]}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionLabel icon={<CloudOff />} className="mb-3">
          Usar sin conexión
        </SectionLabel>
        <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 text-[14px]">
          <input type="checkbox" checked={enabled} onChange={(e) => void toggle(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Guardar una copia en este dispositivo (tareas, Bandeja, notas, proyectos y clientes)
        </label>
        <p className="mb-4 text-[13px] text-text-muted">
          Sin internet, AGENCYOS abre la versión sin conexión: ves tu día, completás y creás tareas, capturás en la Bandeja y escribís notas. Al volver la
          conexión todo se sube solo; si una nota cambió en otro dispositivo, tu versión se guarda aparte (no se pisa nada). En una computadora compartida,
          desactivalo: la copia se borra.
        </p>
        {enabled && stats ? (
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]" data-testid="offline-stats">
            <dt className="text-text-muted">Última copia</dt>
            <dd>{stats.lastSync ? relativeFromDate(new Date(stats.lastSync)) : "todavía no"}</dd>
            <dt className="text-text-muted">Guardado</dt>
            <dd>
              {stats.tasks} tareas · {stats.notes} notas · {stats.projects} proyectos · {stats.clients} clientes
              {mb ? ` · ${mb}` : ""}
            </dd>
            <dt className="text-text-muted">Por subir</dt>
            <dd className={stats.pending ? "text-warning" : undefined}>{stats.pending ? `${stats.pending} cambios` : "nada"}</dd>
          </dl>
        ) : null}
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void sync(true)} loading={busy}>
              <RefreshCw className="size-4" /> Sincronizar ahora
            </Button>
            <Button asChild variant="ghost">
              <a href="/local">Abrir la versión sin conexión</a>
            </Button>
            <Button variant="ghost" onClick={() => void wipeCopy()}>
              <Trash2 className="size-4" /> Borrar la copia
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

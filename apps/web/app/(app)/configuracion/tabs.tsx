"use client";

import { Tabs } from "@agencyos/ui";
import { usePathname } from "next/navigation";

const ITEMS = [
  { key: "perfil", label: "Perfil", href: "/configuracion" },
  { key: "seguridad", label: "Seguridad", href: "/configuracion/seguridad" },
  { key: "notificaciones", label: "Notificaciones", href: "/configuracion/notificaciones" },
  { key: "workspace", label: "Agencia", href: "/configuracion/workspace" },
  { key: "modulos", label: "Módulos", href: "/configuracion/modulos" },
  { key: "crm", label: "CRM", href: "/configuracion/crm" },
  { key: "integraciones", label: "Integraciones", href: "/configuracion/integraciones" },
  { key: "datos", label: "Datos", href: "/configuracion/datos" },
  { key: "actividad", label: "Actividad", href: "/configuracion/actividad" },
  { key: "estado", label: "Estado", href: "/configuracion/estado" },
];

export function SettingsTabs() {
  const path = usePathname();
  const active =
    ITEMS.slice()
      .reverse()
      .find((i) => path.startsWith(i.href))?.key ?? "perfil";
  return <Tabs items={ITEMS} active={active} />;
}

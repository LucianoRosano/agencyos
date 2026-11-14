"use client";

import { Tabs } from "@agencyos/ui";
import { usePathname } from "next/navigation";

type Item = { key: string; label: string; href: string; admin?: boolean };
const ITEMS: Item[] = [
  { key: "perfil", label: "Perfil", href: "/configuracion" },
  { key: "seguridad", label: "Seguridad", href: "/configuracion/seguridad" },
  { key: "notificaciones", label: "Notificaciones", href: "/configuracion/notificaciones" },
  { key: "usuarios", label: "Usuarios", href: "/configuracion/usuarios", admin: true },
  { key: "workspace", label: "Agencia", href: "/configuracion/workspace", admin: true },
  { key: "modulos", label: "Módulos", href: "/configuracion/modulos", admin: true },
  { key: "integraciones", label: "Integraciones", href: "/configuracion/integraciones", admin: true },
  { key: "datos", label: "Datos", href: "/configuracion/datos", admin: true },
  { key: "actividad", label: "Actividad", href: "/configuracion/actividad", admin: true },
  { key: "estado", label: "Estado", href: "/configuracion/estado", admin: true },
];

/** Pestañas de Configuración. Un colaborador solo ve las personales (perfil, seguridad, notificaciones). */
export function SettingsTabs({ full }: { full: boolean }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => full || !i.admin);
  const active =
    items
      .slice()
      .reverse()
      .find((i) => path.startsWith(i.href))?.key ?? "perfil";
  return <Tabs items={items} active={active} />;
}

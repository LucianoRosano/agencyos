"use client";

import { type ComponentProps, cloneElement, createContext, isValidElement, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react";

type Impl = typeof import("./dialog-radix");
type TriggerProps = {
  onClick?: (e: React.MouseEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
};

let loaded: Impl | null = null;
let loading: Promise<Impl> | null = null;
function load() {
  loading ??= import("./dialog-radix").then((m) => {
    loaded = m;
    return m;
  });
  return loading;
}

const ImplCtx = createContext<Impl | null>(null);

/**
 * Modal en desktop, hoja inferior (bottom sheet) en el celular (docs/06 §3).
 * Radix Dialog se descarga al pasar el mouse/enfocar el disparador o al abrir (≈ 11 KB gzip fuera del JS inicial de cada
 * pantalla). Acepta `open` controlado o maneja su propio estado; la primera apertura no se pierde.
 */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  ...rest
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const [impl, setImpl] = useState<Impl | null>(loaded);
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (o: boolean) => {
    if (open === undefined) setInner(o);
    onOpenChange?.(o);
  };
  const warm = () => void load().then((m) => setImpl(() => m));
  // Abierto desde afuera (atajo, botón propio) antes de cargar: cargar ya.
  useEffect(() => {
    if (isOpen && !impl) void load().then((m) => setImpl(() => m));
  }, [isOpen, impl]);

  if (impl) {
    return (
      <ImplCtx.Provider value={impl}>
        <impl.RadixSheet {...rest} trigger={trigger} open={isOpen} onOpenChange={setOpen} />
      </ImplCtx.Provider>
    );
  }
  if (!trigger || !isValidElement(trigger)) return (trigger as ReactNode) ?? null;
  const el = trigger as ReactElement<TriggerProps & Record<string, unknown>>;
  return cloneElement(el, {
    "aria-haspopup": "dialog",
    "aria-expanded": false,
    onPointerEnter: (e: React.PointerEvent) => {
      el.props.onPointerEnter?.(e);
      warm();
    },
    onFocus: (e: React.FocusEvent) => {
      el.props.onFocus?.(e);
      warm();
    },
    onClick: (e: React.MouseEvent) => {
      el.props.onClick?.(e);
      if (!e.defaultPrevented) setOpen(true);
    },
  });
}

/** Botón que cierra el Sheet (solo dentro de su contenido). */
export function SheetClose(props: ComponentProps<Impl["RadixSheetClose"]>) {
  const impl = useContext(ImplCtx);
  return impl ? <impl.RadixSheetClose {...props} /> : null;
}

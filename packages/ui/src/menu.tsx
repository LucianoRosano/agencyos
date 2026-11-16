"use client";

import { cloneElement, createContext, isValidElement, type ReactElement, type ReactNode, useContext, useState } from "react";

type Impl = typeof import("./menu-radix");
type TriggerProps = {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
};

let loaded: Impl | null = null;
let loading: Promise<Impl> | null = null;
function load() {
  loading ??= import("./menu-radix").then((m) => {
    loaded = m;
    return m;
  });
  return loading;
}

const ImplCtx = createContext<Impl | null>(null);

/**
 * Menú desplegable. Radix (≈ 18 KB gzip con el posicionamiento) se descarga recién al pasar el mouse, enfocar o tocar
 * el disparador, para que no pese en el JS inicial de cada pantalla (presupuesto < 170 KB por ruta). La primera
 * apertura no se pierde: el estado `open` es nuestro y se le pasa a Radix cuando termina de cargar.
 */
export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center" }) {
  const [impl, setImpl] = useState<Impl | null>(loaded);
  const [open, setOpen] = useState(false);
  if (impl) {
    return (
      <ImplCtx.Provider value={impl}>
        <impl.RadixMenu trigger={trigger} align={align} open={open} onOpenChange={setOpen}>
          {children}
        </impl.RadixMenu>
      </ImplCtx.Provider>
    );
  }
  if (!isValidElement(trigger)) return trigger;
  const el = trigger as ReactElement<TriggerProps & Record<string, unknown>>;
  const warm = () => void load().then((m) => setImpl(() => m));
  const openNow = () => {
    setOpen(true);
    warm();
  };
  return cloneElement(el, {
    "aria-haspopup": "menu",
    "aria-expanded": false,
    onPointerEnter: (e: React.PointerEvent) => {
      el.props.onPointerEnter?.(e);
      warm();
    },
    onFocus: (e: React.FocusEvent) => {
      el.props.onFocus?.(e);
      warm();
    },
    onPointerDown: (e: React.PointerEvent) => {
      el.props.onPointerDown?.(e);
      if (e.button === 0 && !e.ctrlKey) {
        e.preventDefault();
        openNow();
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      el.props.onKeyDown?.(e);
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openNow();
      }
    },
  });
}

export function MenuItem(props: { children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }) {
  const impl = useContext(ImplCtx);
  return impl ? <impl.RadixMenuItem {...props} /> : null;
}

export function MenuSeparator() {
  const impl = useContext(ImplCtx);
  return impl ? <impl.RadixMenuSeparator /> : null;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  const impl = useContext(ImplCtx);
  return impl ? <impl.RadixMenuLabel>{children}</impl.RadixMenuLabel> : null;
}

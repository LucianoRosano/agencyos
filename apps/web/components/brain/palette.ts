"use client";

import { useEffect, useState } from "react";
import { type BrainNodeType, TYPE_COLOR } from "./model";

/**
 * Paleta del Cerebro según el tema (ADR 0017): un atlas sobre papel en el tema claro y sobre tinta cálida en el
 * oscuro. Sin neón ni resplandores: puntos planos con borde, territorios con línea punteada y nombres en serif.
 */
export type BrainTheme = "light" | "dark";
export type BrainPalette = {
  theme: BrainTheme;
  bg: string;
  ink: string;
  label: string;
  labelStrong: string;
  labelDim: string;
  edge: string;
  edgeDim: string;
  edgeFaint: string;
  ring: string;
  type: Record<BrainNodeType, string>;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}
export function mixHex(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const m = x.map((v, i) => Math.round(v * (1 - t) + (y[i] ?? 0) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

const lighten = (c: Record<BrainNodeType, string>, t: number) =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, mixHex(v, "#ffffff", t)])) as Record<BrainNodeType, string>;

export function brainPalette(theme: BrainTheme): BrainPalette {
  if (theme === "dark") {
    return {
      theme,
      bg: "#171411",
      ink: "#eee7dd",
      label: "#b9afa2",
      labelStrong: "#eee7dd",
      labelDim: "#6f665c",
      edge: "rgba(238,231,221,0.13)",
      edgeDim: "rgba(238,231,221,0.06)",
      edgeFaint: "rgba(238,231,221,0.035)",
      ring: "#eee7dd",
      type: lighten(TYPE_COLOR, 0.3),
    };
  }
  return {
    theme,
    bg: "#f7f4ee",
    ink: "#1f1a15",
    label: "#5f574d",
    labelStrong: "#1f1a15",
    labelDim: "#a89e92",
    edge: "rgba(41,32,22,0.16)",
    edgeDim: "rgba(41,32,22,0.07)",
    edgeFaint: "rgba(41,32,22,0.04)",
    ring: "#1f1a15",
    type: TYPE_COLOR,
  };
}

const read = (): BrainTheme => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Tema actual de la app (atributo data-theme del <html>), reactivo al cambiarlo desde el menú. */
export function useBrainTheme(): BrainTheme {
  const [theme, setTheme] = useState<BrainTheme>("light");
  useEffect(() => {
    setTheme(read());
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

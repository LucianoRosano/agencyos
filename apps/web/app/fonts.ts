import localFont from "next/font/local";

/**
 * Tipografía (ADR 0017): Inter para la interfaz y los números (cifras tabulares, alta legibilidad en tamaños chicos)
 * y Source Serif 4 para los títulos de página. Archivos propios (licencia OFL, de @fontsource-variable), servidos
 * desde el sitio: sin pedidos a terceros y compatibles con la CSP.
 */
export const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial"],
});

export const serif = localFont({
  src: "./fonts/source-serif-latin.woff2",
  variable: "--font-serif-display",
  weight: "200 900",
  display: "swap",
  // Solo títulos: no se precarga para no competir con Inter en la primera pantalla.
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

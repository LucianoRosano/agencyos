import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AGENCYOS",
    short_name: "AGENCYOS",
    description: "Centro de mando de la agencia, los proyectos y el conocimiento.",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#06070A",
    theme_color: "#06070A",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoy", url: "/hoy" },
      { name: "Bandeja", url: "/bandeja" },
      { name: "Nueva tarea", url: "/tareas?nueva=1" },
    ],
  };
}

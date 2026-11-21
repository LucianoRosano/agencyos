import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/hoy",
    name: "AGENCYOS",
    short_name: "AGENCYOS",
    description: "Centro de mando de la agencia, los proyectos y el conocimiento.",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    // En la PC: ventana propia como un programa; si ya está abierta, la reusa en vez de abrir otra.
    display_override: ["standalone", "minimal-ui"],
    launch_handler: { client_mode: ["focus-existing", "auto"] },
    categories: ["business", "productivity"],
    background_color: "#F7F4EE",
    theme_color: "#F7F4EE",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Compartir desde otras apps del celular (Android/Chrome): llega a /compartir y se guarda en la Bandeja.
    share_target: { action: "/compartir", method: "GET", params: { title: "title", text: "text", url: "url" } },
    shortcuts: [
      { name: "Hoy", url: "/hoy" },
      { name: "Bandeja", url: "/bandeja" },
      { name: "Nueva tarea", url: "/tareas?nueva=1" },
      { name: "Capturar", url: "/compartir" },
      { name: "Sin conexión", short_name: "Offline", url: "/local" },
    ],
  };
}

import { LocalApp } from "./local-app";

export const metadata = { title: "Sin conexión" };

/**
 * Modo sin conexión: la app de uso diario sobre la copia guardada en este dispositivo (IndexedDB).
 * No lee nada del servidor al renderizar: el service worker la guarda y la sirve cuando no hay internet.
 */
export default function LocalPage() {
  return <LocalApp />;
}

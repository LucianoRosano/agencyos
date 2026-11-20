/**
 * Capturas sin conexión: si no hay señal, lo que anotás queda en este dispositivo (localStorage) y se sube solo a la
 * Bandeja cuando vuelve la conexión. La página offline.html escribe en la misma clave.
 */
const KEY = "agencyos:capturas-pendientes";
export type PendingCapture = { text: string; suggestedType?: string; at: string };

function read(): PendingCapture[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.text === "string" && x.text.trim()) : [];
  } catch {
    return [];
  }
}

export function queueCapture(fd: FormData) {
  const text = String(fd.get("text") ?? "").trim();
  if (!text) return;
  const suggestedType = String(fd.get("suggestedType") ?? "") || undefined;
  const list = read();
  list.push({ text: text.slice(0, 5000), suggestedType, at: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
}

export const pendingCount = () => read().length;

/** Sube las pendientes en orden; deja las que fallen para el próximo intento. Devuelve cuántas subió. */
export async function flushCaptures(send: (fd: FormData) => Promise<{ ok: boolean }>): Promise<number> {
  const list = read();
  if (!list.length || !navigator.onLine) return 0;
  const left: PendingCapture[] = [];
  let sent = 0;
  for (const c of list) {
    const fd = new FormData();
    fd.set("text", c.text);
    if (c.suggestedType) fd.set("suggestedType", c.suggestedType);
    try {
      const r = await send(fd);
      if (r.ok) sent++;
      else left.push(c);
    } catch {
      left.push(c);
    }
  }
  // Puede haber entrado otra mientras se subían: se conservan las nuevas.
  const added = read().slice(list.length);
  localStorage.setItem(KEY, JSON.stringify([...left, ...added]));
  return sent;
}

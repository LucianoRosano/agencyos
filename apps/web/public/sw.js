/*
 * AGENCYOS · service worker: estáticos cacheados, modo sin conexión (/local) y página offline.
 * Los datos van siempre por la red; sin conexión, las pantallas de la app abren /local (la copia del dispositivo).
 */
const VERSION = "agencyos-v6";
const LOCAL_CACHE = "agencyos-local";
const OFFLINE = "/offline.html";
const LOCAL = "/local";
// Pantallas que sin conexión van al modo local (no: login, portal, enlaces públicos, invitaciones, legales).
const PUBLIC_PREFIXES = ["/login", "/setup", "/seguridad", "/portal", "/p/", "/invitacion", "/legal", "/api", "/mcp", "/recuperar"];
let lastRefresh = 0;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll([OFFLINE, "/icons/icon.svg", "/fonts/Inter-Variable.woff2"]))
      .then(() => refreshLocal(true))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== LOCAL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Guarda /local y todos sus archivos (JS y CSS) para abrirla sin internet. Se llama al instalar, cuando la app
 * avisa (versión nueva, sesión iniciada) y como mucho cada 30 minutos al navegar con conexión.
 */
async function refreshLocal(force) {
  if (!force && Date.now() - lastRefresh < 30 * 60 * 1000) return;
  lastRefresh = Date.now();
  try {
    const res = await fetch(LOCAL, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok || res.redirected) return;
    const html = await res.clone().text();
    // <script src> / <link href> y los chunks que el árbol de componentes pide después (aparecen en el payload).
    const assets = [
      ...[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")),
      ...[...html.matchAll(/static\/(?:chunks|css|media)\/[A-Za-z0-9._~-]+\.(?:js|css|woff2)/g)].map((m) => `/_next/${m[0]}`),
    ];
    const cache = await caches.open(LOCAL_CACHE);
    await Promise.all(
      [...new Set(assets)].map((a) =>
        caches.match(a).then((hit) => hit || fetch(a).then((r) => (r.ok ? caches.open(VERSION).then((c) => c.put(a, r)) : undefined))),
      ),
    ).catch(() => undefined);
    await cache.put(LOCAL, res);
  } catch {
    /* sin conexión: queda la copia anterior */
  }
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "refresh-local") e.waitUntil(refreshLocal(true));
});

const isAppPage = (path) => !PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p);

async function offlineNavigation(url) {
  const local = await caches.match(LOCAL, { cacheName: LOCAL_CACHE });
  if (url.pathname === LOCAL) return local || caches.match(OFFLINE);
  if (local && isAppPage(url.pathname)) {
    const sec = { "/tareas": "tareas", "/bandeja": "bandeja", "/notas": "notas", "/proyectos": "proyectos", "/crm": "clientes" };
    const hit = Object.keys(sec).find((k) => url.pathname.startsWith(k));
    return Response.redirect(`${LOCAL}${hit ? `?ver=${sec[hit]}` : ""}`, 302);
  }
  return caches.match(OFFLINE);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // Servidor caído (502/503/504 del proxy): igual que sin conexión.
          if (res.status >= 502 && res.status <= 504) return offlineNavigation(url);
          if (res.ok && url.pathname === LOCAL) {
            const copy = res.clone();
            caches.open(LOCAL_CACHE).then((c) => c.put(LOCAL, copy));
          } else if (res.ok && isAppPage(url.pathname)) e.waitUntil(refreshLocal(false));
          return res;
        })
        .catch(() => offlineNavigation(url)),
    );
  }
});

/* Web Push: muestra la notificación y al tocarla abre la entidad. */
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: e.data ? e.data.text() : "AGENCYOS" };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "AGENCYOS", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/hoy" },
      lang: "es-AR",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/hoy", self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url.href);
          return w.focus();
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});

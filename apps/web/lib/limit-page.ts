/**
 * Página 429 propia (para descargas que se abren en otra pestaña): texto claro, cuánto esperar y un enlace de vuelta,
 * con los colores del sistema en modo claro/oscuro. Sin JS ni recursos externos (pasa la CSP).
 */
export function rateLimitedPage(retryAfterSec: number, back: { href: string; label: string }) {
  const min = Math.max(1, Math.ceil(retryAfterSec / 60));
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Esperá un momento</title>
<style>
:root{color-scheme:light dark;--bg:#171411;--fg:#eee7dd;--muted:#aba194;--line:#342d26;--accent:#e89470}
@media (prefers-color-scheme:light){:root{--bg:#f7f4ee;--fg:#1f1a15;--muted:#5f574d;--line:#e9e3d8;--accent:#9a3f1b}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:28rem;padding:2rem;border:1px solid var(--line);border-radius:14px;margin:1rem}
h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0 0 1rem;color:var(--muted)}
a{color:var(--accent);display:inline-block;min-height:44px;line-height:44px}
</style></head><body><main><h1>Demasiadas descargas seguidas</h1>
<p>Para cuidar el servicio, esperá ${min} minuto${min === 1 ? "" : "s"} y volvé a intentar.</p>
<a href="${esc(back.href)}">${esc(back.label)}</a></main></body></html>`;
  return new Response(html, {
    status: 429,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" },
  });
}

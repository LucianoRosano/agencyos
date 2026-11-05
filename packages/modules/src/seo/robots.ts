/**
 * robots.txt según RFC 9309: grupos por user-agent, Allow/Disallow con comodines `*` y `$`,
 * la regla más específica (más larga) gana y, a igual longitud, gana Allow.
 */
export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelay: number | null };
export type Robots = { groups: RobotsGroup[]; sitemaps: string[]; invalidLines: number };

export function parseRobots(txt: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let invalidLines = 0;
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) {
      invalidLines++;
      continue;
    }
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) {
      if (key === "allow" || key === "disallow") invalidLines++;
      continue;
    }
    if (key === "allow" || key === "disallow") {
      // "Disallow:" vacío = permitir todo (no agrega regla)
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    } else if (!["host", "clean-param", "request-rate", "visit-time", "noindex"].includes(key)) {
      invalidLines++;
    }
  }
  return { groups, sitemaps, invalidLines };
}

/** Grupo que aplica a un user-agent: el token más específico que coincide; si no, `*`. Varios grupos iguales se combinan. */
export function groupFor(robots: Robots, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  const product = ua.split(/[/\s]/)[0] ?? ua;
  let best: { len: number; groups: RobotsGroup[] } = { len: -1, groups: [] };
  for (const g of robots.groups) {
    for (const a of g.agents) {
      const len = a === "*" ? 0 : product.includes(a) || ua.includes(a) ? a.length : -1;
      if (len < 0) continue;
      if (len > best.len) best = { len, groups: [g] };
      else if (len === best.len && !best.groups.includes(g)) best.groups.push(g);
    }
  }
  if (!best.groups.length) return null;
  const delays = best.groups.map((g) => g.crawlDelay).filter((x): x is number => x !== null);
  return { agents: best.groups.flatMap((g) => g.agents), rules: best.groups.flatMap((g) => g.rules), crawlDelay: delays.length ? Math.max(...delays) : null };
}

function patternToRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function normalizePath(p: string) {
  // Comparar con %XX en mayúsculas y sin decodificar "/" codificadas.
  return p.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

/** ¿Se puede rastrear esta ruta (path + query)? Sin grupo aplicable → sí. `/robots.txt` siempre se permite. */
export function isAllowed(group: RobotsGroup | null, pathWithQuery: string): boolean {
  if (!group || pathWithQuery === "/robots.txt") return true;
  const target = normalizePath(pathWithQuery || "/");
  let best: { len: number; allow: boolean } | null = null;
  for (const r of group.rules) {
    if (!patternToRegex(normalizePath(r.path)).test(target)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

/** ¿El robots.txt bloquea todo el sitio para este agente? */
export function blocksEverything(group: RobotsGroup | null): boolean {
  return !isAllowed(group, "/");
}

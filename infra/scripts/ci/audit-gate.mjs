// AGENCYOS · compuerta de `pnpm audit` para la CI (docs/08 §5).
// Uso: pnpm audit --audit-level=high --json | node infra/scripts/ci/audit-gate.mjs
//
// Política:
//  - Falla (exit 1) si hay advisories HIGH/CRITICAL con versión parcheada publicada
//    ("hay fix": hay que actualizar o forzar con pnpm.overrides).
//  - Si no hay fix publicado (patched_versions "<0.0.0"), solo avisa (no bloquea).
//  - Excepciones explícitas: infra/scripts/ci/audit-allowlist.json
//    [{ "id": 123, "reason": "…", "until": "AAAA-MM-DD" }]  (vencida = vuelve a bloquear)
//  - Si el registro no responde o la salida no es JSON, avisa y no bloquea (no es culpa del PR).
import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const notice = (m) => console.log(`::notice title=pnpm audit::${m}`);
const warn = (m) => console.log(`::warning title=pnpm audit::${m}`);

let report;
try {
  report = JSON.parse(input);
} catch {
  warn("pnpm audit no devolvió JSON (¿registro caído?). No bloquea; revisar a mano.");
  process.exit(0);
}

let allow = [];
try {
  allow = JSON.parse(readFileSync(new URL("./audit-allowlist.json", import.meta.url), "utf8"));
} catch {
  allow = [];
}
const today = new Date().toISOString().slice(0, 10);
const allowed = new Map(allow.filter((a) => !a.until || a.until >= today).map((a) => [String(a.id), a]));

const advisories = Object.values(report.advisories ?? {});
const serious = advisories.filter((a) => a.severity === "high" || a.severity === "critical");
let blocking = 0;
for (const a of serious) {
  const id = String(a.id ?? a.github_advisory_id ?? "?");
  const fixable = a.patched_versions && a.patched_versions !== "<0.0.0";
  const paths = (a.findings ?? [])
    .flatMap((f) => f.paths ?? [])
    .slice(0, 3)
    .join(" · ");
  const desc = `${a.severity.toUpperCase()} ${a.module_name} ${a.vulnerable_versions} — ${a.title} (${a.url ?? id}) [${paths}]`;
  if (allowed.has(id)) notice(`Excepción vigente (${allowed.get(id).reason}): ${desc}`);
  else if (fixable) {
    console.log(`::error title=pnpm audit::Con fix (${a.patched_versions}): ${desc}`);
    blocking++;
  } else warn(`Sin fix publicado (no bloquea): ${desc}`);
}

const meta = report.metadata?.vulnerabilities ?? {};
console.log(`Resumen: ${JSON.stringify(meta)} · high/critical: ${serious.length} · bloqueantes: ${blocking}`);
process.exit(blocking > 0 ? 1 : 0);

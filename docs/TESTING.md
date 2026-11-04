# Testing: cómo correr cada nivel

Estrategia y reglas: [`09-testing.md`](09-testing.md). Esto es el "cómo".

## Requisitos locales

- Node 22 y pnpm 10 (`corepack enable` o `npm i -g pnpm@10.28.0`), `pnpm install`.
- PostgreSQL 16+ en `127.0.0.1:5432` con usuario/clave `agencyos` y bases `agencyos`, `agencyos_test`, `agencyos_e2e` (la CI usa **PostgreSQL 17**, igual que producción).

```bash
# Docker como alternativa a un Postgres instalado:
docker run -d --name agencyos-pg -p 127.0.0.1:5432:5432 -e POSTGRES_USER=agencyos -e POSTGRES_PASSWORD=agencyos -e POSTGRES_DB=agencyos postgres:17
docker exec agencyos-pg createdb -U agencyos agencyos_test
docker exec agencyos-pg createdb -U agencyos agencyos_e2e
```

## Niveles

| Nivel | Comando | Base | Notas |
|---|---|---|---|
| Lint + formato | `pnpm lint` (`pnpm format` para formatear) | — | Biome 2.6 (`biome.json`) |
| Tipos | `pnpm typecheck` | — | `tsc` en cada paquete |
| Unit + integración | `pnpm test` | `TEST_DATABASE_URL` (por defecto `agencyos_test`) | `tests/integration/global-setup.ts` **borra el esquema y migra** en cada corrida |
| Un archivo | `pnpm vitest run tests/integration/projects.test.ts` | idem | |
| E2E | `pnpm e2e` | `E2E_DATABASE_URL` (por defecto `agencyos_e2e`) | Hace `next build` + `next start` en `E2E_PORT` (3100); la base se recrea en cada corrida |
| E2E de un proyecto | `pnpm e2e --project desktop-1440-dark --project mobile-390-dark` | idem | Los proyectos `*-light` solo corren pruebas `@visual` |
| E2E contra staging | `E2E_BASE_URL=https://staging.<dominio> pnpm e2e …` | la de staging | No resetea nada (global-setup se saltea) |

Variables útiles:

```bash
export TEST_DATABASE_URL=postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_test
export E2E_DATABASE_URL=postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e E2E_PORT=3100
export SETUP_TOKEN=e2e-setup-token-solo-ci   # /setup lo exige en producción (next start)
```

Cada agente/rama paralela usa **su propia base** (`agencyos_test_<modulo>`, `agencyos_e2e_<modulo>`) y su propio puerto para no pisarse.

## Capturas

- `shot(page, nombre, proyecto)` (tests/e2e/helpers.ts) guarda PNG de página completa en `docs/capturas/<proyecto>/<nombre>.png`.
- Revisarlas a mano (390 y 1440 px, oscuro/claro): alineación, desbordes, contraste, sin scroll horizontal.
- **En la CI:** cada corrida sube dos artifacts (Actions → run → "Artifacts"): `playwright-report` (reporte HTML; abrir `index.html`) y `capturas-e2e` (`docs/capturas/` + `test-results/` con trazas de los fallos). Una traza se abre con `pnpm exec playwright show-trace <archivo>.zip`.

## CI (`.github/workflows/ci.yml`)

En cada PR y push a `main`, en paralelo:

1. **Lint y typecheck.**
2. **Unit + integración** con un servicio `postgres:17` (`TEST_DATABASE_URL`).
3. **E2E** con `postgres:17` (`E2E_DATABASE_URL`), Chromium de Playwright (`pnpm exec playwright install --with-deps chromium`, con caché), proyectos `desktop-1440-dark` y `mobile-390-dark`, 1 reintento en CI.
4. **gitleaks** (acción oficial; configuración en `.gitleaks.toml`).
5. **pnpm audit** — política en la sección siguiente.

### Política de `pnpm audit` (no bloqueante si no hay fix)

`pnpm audit --audit-level=high --json | node infra/scripts/ci/audit-gate.mjs`:

- **Bloquea** si hay vulnerabilidades HIGH/CRITICAL **con versión parcheada publicada** → actualizar la dependencia o forzarla con `pnpm.overrides`.
- **Solo avisa** (warning en el resumen del run) si no hay fix publicado: no tiene sentido frenar todos los PR por algo que nadie puede arreglar todavía. Dependabot abre el PR apenas aparezca el fix.
- Excepciones temporales justificadas: `infra/scripts/ci/audit-allowlist.json` (`[{ "id": 123, "reason": "…", "until": "AAAA-MM-DD" }]`); al vencer vuelve a bloquear.
- Si el registro de npm no responde, avisa y no bloquea.

## Lint: decisiones de Biome

`biome.json` usa las reglas recomendadas con estas excepciones (JSON no admite comentarios, por eso se justifican acá):

| Regla | Nivel | Por qué |
|---|---|---|
| `a11y/useSemanticElements` | off | Los controles propios (`TaskCheck`, selector "Para quién") son `<button role="checkbox|radio" aria-checked>`: patrón ARIA válido que conserva foco, teclado y zonas táctiles de 44 px. axe los revisa en los e2e. |
| `a11y/noAutofocus` | off | `autoFocus` solo se usa en diálogos/hojas de captura rápida que abre el usuario, donde mover el foco es lo esperado. |
| `a11y/noLabelWithoutControl` | error, con `inputComponents` | `<Checkbox>`, `<Input>`, `<Select>`, `<Textarea>` de `@agencyos/ui` renderizan el control real. |
| `complexity/useMathMinMax` | off | Falso positivo con fechas `"YYYY-MM-DD"` (strings): `Math.min/max` no aplica. |
| `complexity/noImportantStyles` (solo CSS) | off | `prefers-reduced-motion` necesita `!important` para anular animaciones. |
| `style/useTemplate`, `correctness/noUnusedFunctionParameters`, `suspicious/noArrayIndexKey`, `suspicious/noAssignInExpressions`, `a11y/useAriaPropsSupportedByRole` | warn | Se ven en el lint pero no frenan la CI; se corrigen al tocar cada archivo. |

Formatter: 2 espacios, `lineWidth` 160, comillas dobles, `;` y comas finales. Se ignoran `.claude/`, `.next`, `node_modules`, `migrations/meta`, `docs`, `*.md`, `test-results`, `playwright-report`.

## Backups (prueba de restauración)

```bash
infra/scripts/restore-test.sh prod           # en el VPS: último backup de Drive → Postgres efímero → cuenta filas
infra/scripts/restore-test.sh prod --local   # con el último backup local
```

Corre solo el día 1 de cada mes (cron del VPS) y el 15 (workflow `backup-verify.yml`, que además falla si el último backup tiene más de 26 h).

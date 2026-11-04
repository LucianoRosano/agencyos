## Qué cambia

<!-- Resumen en 1–3 líneas. Enlazá la issue o la sección de la spec (docs/0X §Y). -->

## Cómo se probó

- [ ] `pnpm lint` y `pnpm typecheck`
- [ ] `pnpm test` (unit + integración)
- [ ] `pnpm e2e` (desktop-1440 y mobile-390; capturas revisadas en `docs/capturas/`)
- [ ] Probado en staging (si aplica)

<!-- Contá qué probaste a mano y con qué datos. -->

## Riesgos

<!-- Migraciones (¿compatibles con la versión anterior?), datos, permisos, seguridad, rendimiento, rollback. -->

- Migraciones: no / sí (detalle)
- Rollback: `infra/scripts/rollback.sh <entorno>` alcanza / requiere restaurar backup

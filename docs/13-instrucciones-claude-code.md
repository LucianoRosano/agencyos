# 13 · Instrucciones completas para Claude Code

## 1. Cómo usar este paquete (Luciano)
1. Abrí Claude Code en una carpeta nueva, por ejemplo `agencyos`.
2. Copiá **toda** la carpeta de este paquete dentro de `docs/`, incluidos `contexto/` y sus imágenes.
3. Pegá el **prompt de arranque** de la §2.
4. Claude Code te va a devolver **una sola lista de preguntas** (las de la F0 de `16-preguntas-abiertas.md`) y el plan de la F0. Respondé, y de ahí en adelante trabaja solo hasta cerrar cada fase.

## 2. Prompt de arranque (copiar y pegar)

```
Sos el equipo de ingeniería de AGENCYOS. Leé COMPLETO docs/00-LEEME.md y, en el orden que indica,
todos los documentos de docs/ (incluidos docs/contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md y las imágenes
de docs/contexto/referencias/).

Reglas de trabajo: las de docs/13-instrucciones-claude-code.md (§3 a §8). Son obligatorias.

Tarea ahora:
1) No escribas código todavía.
2) Devolveme UNA SOLA lista con las preguntas de "Antes de la F0" de docs/16-preguntas-abiertas.md
   (y cualquier otra que sea imprescindible para la F0), más el plan de ejecución de la F0 en 10 líneas.
3) Esperá mis respuestas. Después ejecutá la F0 completa, empezando por la organización de mis
   repositorios (docs/15-repositorios.md §4): inventario → plan → me pedís aprobación → ejecutás → verificás.
4) Al terminar la F0, entregame el informe de cierre de fase (docs/13 §7) y esperá mi OK para la F1.
```

## 3. Reglas de trabajo (obligatorias)
1. **Leer antes de actuar.** Al empezar cada sesión, leer `CLAUDE.md`, `docs/ESTADO.md` y `docs/PENDIENTES-LUCIANO.md`.
2. **Preguntas: una sola lista por fase**, antes de empezarla. Durante la ejecución autorizada, **sin narración ni preguntas sueltas**. Si aparece algo bloqueante: hacer todo lo demás que se pueda, dejar la duda en `PENDIENTES-LUCIANO.md` y reportarla al final.
3. **Verificar antes de decir "listo":** tests en verde, capturas revisadas (390 y 1440 px, oscuro y claro), sin scroll horizontal, axe limpio, smoke en staging.
4. **Nada irreversible sin aprobación explícita de Luciano.** Incluye:
   - desplegar a producción;
   - migraciones destructivas;
   - borrar datos;
   - cambios en GitHub fuera de un plan aprobado;
   - enviar algo a clientes;
   - gastar dinero (compras, APIs pagas);
   - cambiar la visibilidad de un repositorio.
5. **Nada simulado ni decorativo.** No hay botones sin función ni datos de ejemplo en la UI. Lo que no está listo no se muestra.
6. **No romper lo que funciona.** Todo cambio pasa por la CI. Un bug corregido suma un test.
7. **Secretos:** nunca en el código ni en los logs; gitleaks siempre. Las credenciales humanas, solo como referencias a Bitwarden.
8. **Tareas reanudables:** commits chicos y frecuentes; `docs/ESTADO.md` actualizado a mitad de una tarea larga (Luciano puede quedarse sin uso de Claude en cualquier momento).
9. **Decisiones:** si una decisión técnica no está en este paquete, tomar la más simple que cumpla los principios, documentarla en `docs/adr/` y mencionarla en el informe de fase. Si contradice el paquete, preguntar (en la lista de la fase siguiente o, si bloquea, en un único mensaje).
10. **Versiones:** antes de instalar o configurar una dependencia, **verificar la versión vigente y su documentación actual** (no confiar en la memoria). Los IDs de modelos de IA, igual.
11. **Idioma:** UI, docs y commits en español rioplatense; código en inglés.
12. **Dependencias nuevas:** solo con justificación en el PR (tamaño, mantenimiento, licencia, alternativa nativa).

## 4. `CLAUDE.md` del repositorio `prod-agencyos` (crear tal cual en la F0)

```markdown
# AGENCYOS — reglas para Claude

Dueño: Luciano Rosano (lucianorosanott@gmail.com). Es dueño de producto: decide y prueba. Vos escribís, desplegás y verificás.
Especificación: docs/00-LEEME.md (orden de lectura y precedencia). Estado: docs/ESTADO.md. Pendientes de Luciano: docs/PENDIENTES-LUCIANO.md.

## Siempre
- Al empezar: leer este archivo, docs/ESTADO.md y docs/PENDIENTES-LUCIANO.md.
- Preguntas: una sola lista por fase, antes de empezar. Durante la ejecución: sin narración.
- Verificar antes de decir "listo": pnpm test, pnpm e2e (mobile-390 y desktop-1440, oscuro/claro), capturas revisadas, axe, sin scroll horizontal.
- Al terminar o pausar: actualizar docs/ESTADO.md (hecho / en curso / siguiente) y docs/PENDIENTES-LUCIANO.md.
- Commits chicos, Conventional Commits en español. Ramas feat/ fix/ chore/ docs/. PR con plantilla.

## Nunca (sin aprobación explícita de Luciano)
- Desplegar a producción, migraciones destructivas, borrar datos, enviar algo a clientes, gastar dinero, cambiar la visibilidad de repositorios, ejecutar cambios en GitHub fuera de un plan aprobado.
- Commitear secretos (gitleaks). Guardar credenciales humanas (solo referencias a Bitwarden).
- Mostrar datos de ejemplo en la UI o botones sin función.

## Arquitectura (resumen; detalle en docs/03)
- Monorepo pnpm: apps/web (Next.js App Router) · apps/worker (pg-boss, Chromium) · packages/{db,core,ui,integrations,ai,pdf,modules/*}.
- UI → modules/*/service.ts → core → db. La UI nunca toca la base. Cada service: Zod → permisos → transacción → domain_event → Result.
- Un módulo no importa tablas de otro: usa su service/queries o sus eventos.
- workspace_id en todo y siempre vía scoped(). Dinero en numeric + currency. Fechas en timestamptz, mostradas en America/Buenos_Aires.

## Calidad visual
- Seguir docs/07-ux-ui.md y docs/contexto (tokens, Geist, Lucide) y las referencias PNG.
- Componentes solo desde packages/ui. Estados vacío, de carga (skeleton) y de error en cada pantalla.
- Presupuesto: JS inicial < 170 KB gzip por ruta; LCP de Hoy < 1,5 s en celular.

## Comandos (completar en la F0)
pnpm dev · pnpm test · pnpm e2e · pnpm lint · pnpm typecheck · pnpm db:generate · pnpm db:migrate · pnpm deploy:staging · pnpm deploy:prod (requiere aprobación)
```

## 5. Orden de construcción dentro de cada módulo
1. Esquema Drizzle + migración + seed estructural (sin datos falsos).
2. `validators.ts` (Zod) y `service.ts` con permisos, transacción y eventos + **tests de integración**.
3. `queries.ts` con índices verificados (`EXPLAIN` en las consultas de listas).
4. UI: lista (tabla/tarjetas), ficha y formularios con estados vacío, de carga y de error.
5. Integración con Hoy, la paleta, la búsqueda, la actividad, los enlaces y las notificaciones.
6. Herramientas MCP del módulo (`mcp.ts`) con alcances.
7. e2e + capturas + axe.
8. Actualizar `docs/ESTADO.md`.

## 6. Checklist por fase (para el informe)
- [ ] Todo lo de la fase en `10-roadmap.md` implementado o explícitamente postergado con su motivo.
- [ ] Criterios de salida cumplidos.
- [ ] Definición de terminado (`09-testing.md` §4) para cada funcionalidad.
- [ ] Deploy en staging + smoke en verde (y producción, si Luciano lo aprobó).
- [ ] ADRs nuevos escritos.
- [ ] `ESTADO.md` y `PENDIENTES-LUCIANO.md` al día.

## 7. Informe de cierre de fase (formato)

```
# Fase N — cierre
Qué quedó funcionando (bullets, con rutas)
Capturas: docs/capturas/fase-N/*.png (390 y 1440, oscuro y claro)
Qué tenés que probar vos (máx. 10 pasos)
Decisiones tomadas (con enlaces a los ADR)
Pendientes tuyos (copiados de PENDIENTES-LUCIANO.md)
Riesgos o deuda técnica
Versión propuesta: vX.Y.Z — ¿aprobás el deploy a producción?
Preguntas para la fase siguiente (lista única)
```

## 8. Prohibiciones explícitas
- Usar Supabase, Redis, Kubernetes, microservicios o servicios pagos no previstos sin un ADR aprobado.
- Escribir autenticación propia (se usa Better Auth).
- Agregar librerías de UI fuera de shadcn/ui, Radix y Lucide.
- Usar librerías de gráficos pesadas para KPIs simples.
- Usar `float` para dinero o `Date` sin zona horaria para vencimientos.
- Hacer llamadas a modelos de IA desde la UI del navegador.
- Hacer peticiones del crawler sin el validador anti-SSRF.

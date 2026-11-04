# 09 · Estrategia de testing

Luciano no audita el código línea por línea. **Los tests son su garantía.** Ninguna funcionalidad se da por terminada sin sus pruebas en verde.

## 1. Pirámide y herramientas

| Nivel | Herramienta | Qué cubre | Dónde corre |
|---|---|---|---|
| Unitario | **Vitest** | Funciones puras: dinero, fechas (TZ Argentina), cálculos de presupuestos (descuentos, versiones), RRULE, puntaje de salud de repositorios, puntaje SEO, validadores (CUIT), políticas de permisos | Cada commit / PR |
| Integración | **Vitest + PostgreSQL real** (servicio de Docker en la CI) | `service.ts` de cada módulo con transacciones, eventos outbox, permisos, aislamiento multi-inquilino, migraciones | PR |
| Contrato de integraciones | Vitest + **respuestas grabadas** (MSW) | Clientes de GitHub, Brevo, PSI/CrUX y WordPress: casos OK, 4xx, 5xx, rate limit y timeouts | PR |
| End-to-end | **Playwright** | Flujos completos en navegador, proyectos **mobile-390** (Chromium en modo móvil) y **desktop-1440**, en tema oscuro y claro | PR (subset) y merge a `main` (completo) |
| Accesibilidad | **@axe-core/playwright** | Cada pantalla principal sin violaciones serias o críticas | Con los e2e |
| Visual | Capturas de Playwright (`toHaveScreenshot`) | Pantallas clave: Hoy, Negocio, ficha de cliente, presupuesto, PDF, Repositorios, Cerebro | Merge a `main` |
| Rendimiento | Lighthouse CI sobre staging | LCP, TBT y JS por ruta contra el presupuesto (`03-arquitectura.md` §5) | Deploy a staging |
| Agentes de IA [F5] | **Evals** con casos fijos (`agent_eval_case`) + modelo simulado en la CI y modelo real en una corrida manual semanal | Uso correcto de herramientas, respeto de permisos, formato de salida, resistencia a inyección | CI (simulado) y manual |
| Smoke post-deploy | Playwright (5 pruebas) | Login con 2FA de prueba, Hoy carga, crear tarea, buscar, health | Después de cada deploy |
| Backups | Script de restauración en un contenedor efímero | Restaurar el último dump y contar filas clave | Mensual (cron) |

## 2. Reglas
- **Cobertura mínima** (líneas) en `packages/core` y `packages/modules/*/service.ts`: **85 %**. En la UI se mide por flujos e2e, no por porcentaje.
- **Todo bug corregido agrega una prueba** que lo reproduce.
- **Aislamiento multi-inquilino:** cada servicio tiene un test generado que crea dos workspaces y verifica que A no ve, edita ni borra datos de B.
- **Permisos:** matriz rol × acción testeada por tabla (`it.each`).
- **Datos de prueba:** *factories* tipadas en `tests/fixtures` y **solo** en test y desarrollo. Nunca en producción ni en staging compartido con datos reales.
- **Fechas:** los tests fijan el reloj (`vi.setSystemTime`) y la TZ `America/Buenos_Aires`, incluidos cambios de mes y de año.
- **Determinismo:** sin dependencias de red real en la CI (todo grabado), salvo una corrida *nightly* opcional contra servicios reales con cuentas de prueba.
- **Flaky = bug:** una prueba inestable se arregla o se pone en cuarentena con una issue, nunca se ignora.

## 3. Flujos e2e obligatorios del MVP
1. Login + 2FA + cierre de sesión; recuperación de contraseña.
2. Capturar en la Bandeja → procesar → tarea con fecha → aparece en Hoy → completarla (deslizar en el celular).
3. Asistente de arranque con la plantilla "Tienda online" → etapas y tareas creadas → primera acción en Hoy.
4. CRM: cliente + contacto + interacción + oportunidad → pipeline → ganada.
5. Presupuesto: 3 ítems, descuento por ítem y global, ARS → PDF generado (se verifica texto y totales en el PDF) → enviado → nueva versión → aceptado → proyecto + 2 cobros creados.
6. Finanzas: suscripción que vence en 3 días aparece en "Ponerse al día" → "Registrar pago" → movimiento creado y fecha avanzada.
7. Repositorios (GitHub simulado con fixtures): sincronizar → checks → generar plan → aprobar → acciones ejecutadas contra el mock → registro de auditoría.
8. MCP: con un token de alcance limitado, `crear_tarea` funciona y `eliminar_cliente` es rechazado.
9. Paleta `Ctrl+K`: buscar con y sin tildes, crear desde la paleta.
10. Papelera: eliminar → deshacer; eliminar → restaurar desde la papelera.
11. Sin scroll horizontal en 390 px en todas las pantallas del MVP (test automático que compara `scrollWidth` con `clientWidth`).

## 4. Definición de terminado (por funcionalidad)
- [ ] Especificación cumplida (este paquete) y criterios de aceptación verificados.
- [ ] Unit + integración + e2e en verde; axe sin violaciones serias.
- [ ] Capturas revisadas en 390 y 1440 px, oscuro y claro.
- [ ] Estados vacío, de carga y de error implementados.
- [ ] Permisos y aislamiento testeados.
- [ ] Eventos emitidos y actividad registrada.
- [ ] Sin datos falsos en la UI.
- [ ] Documentación actualizada (`docs/ESTADO.md`, ADR si hubo decisión, runbook si aplica).
- [ ] Desplegado en staging y smoke OK.

# ADR 0018 · Movimiento y comodidad visual

**Estado:** aceptada (22/11/2026) · **Contexto:** Luciano pidió una interfaz fluida, suave y que no canse la vista.

## Decisión
- **Sin librerías de animación.** Todo es CSS (keyframes + transiciones) y View Transitions del navegador. No suma JS inicial
  (presupuesto < 170 KB por pantalla).
- **Tokens** en `packages/ui/src/tokens.css`: `--ease-out` (entradas), `--ease-in` (salidas), `--ease-in-out`, `--ease-spring`
  (solo elementos chicos: tildes, íconos), `--dur-1/2/3` (120/200/320 ms). Las salidas son más cortas que las entradas.
- **Por defecto**, todo lo interactivo (enlaces, botones, campos, opciones) cambia color, borde y sombra en 160 ms
  (`@layer base` en `globals.css`); las utilidades de Tailwind lo pisan cuando hace falta.
- **Patrones** (clases en `globals.css`):
  - `ag-overlay` / `ag-sheet`: hojas y modales con entrada y salida (Radix espera la animación de salida). En el celular
    la hoja sube desde abajo y se cierra arrastrándola hacia abajo; en desktop aparece con un zoom leve.
  - `ag-menu`: menús que crecen desde su botón; `ag-palette`: paleta Ctrl+K.
  - `ag-progress`: barra fina al navegar, solo si la pantalla tarda más de 120 ms (`components/shell/nav-progress.tsx`).
  - `stagger` (listas y grillas: los primeros 8 en cascada), `rise` (un elemento), `lift` (tarjetas que se pueden abrir,
    solo con mouse), `bar-in` / `bar-up` (barras y gráficos), `check-pop` / `check-ring` (completar), `grow-y`, `tab-pop`.
  - Cambio de tema con fundido de la página (`switchTheme`, View Transitions).
- **Descanso visual:** superficies apenas cálidas en el tema claro (`#fffdf9`, no blanco puro), texto del tema oscuro un
  punto menos brillante (`#e6ded2`, 13,8:1), fondo de los modales más liviano, pulso de carga lento y de poca amplitud,
  barras de scroll finas en tonos de la paleta.
- **Accesibilidad:** con `prefers-reduced-motion` todo queda instantáneo (incluida la barra de progreso y el levante de
  tarjetas). Ninguna animación transmite información por sí sola.

## Reglas para lo nuevo
- Usar las clases y tokens de arriba; no inventar duraciones sueltas. Nada que se mueva más de ~8 px ni dure más de
  ~400 ms (salvo barras que crecen). Nada que rebote en elementos grandes.
- Animar `opacity` y `transform` (no `width`/`height`/`top`): no reacomodan la página.
- Las listas largas no se animan enteras: `stagger` solo escalona los primeros 8.

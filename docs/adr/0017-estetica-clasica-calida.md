# ADR 0017 · Estética clásica y cálida («Escritorio»)

**Estado:** aceptada · 21/11/2026 · reemplaza la paleta «Centro de mando» (violeta/celeste neón, Geist y Geist Mono).

## Contexto
Luciano pidió una estética menos futurista, más clásica, fácil de entender y sin el azul ni el verde neón; también mejorar letras y números.

## Investigación (resumen)
- Para interfaces con muchos datos, la recomendación más consistente es una sans de pantalla con **cifras tabulares** (las columnas no se mueven al cambiar un valor) y reservar la monoespaciada para código; Inter es la más citada (x-height alto, cifras tabulares, cero con barra opcional). Fuentes: Datawrapper («Which fonts to use for your charts and tables»), Yellowfin («Dashboard design: typography»), madegooddesigns.com, fontalternatives.com.
- Paletas cálidas accesibles: lienzo claro, texto marrón muy oscuro y un acento cálido usado con moderación (botones y estados activos), no como color de texto largo; estados con un tono propio (p. ej. salvia para lo positivo); verificar cada par con WCAG (4,5:1 texto, 3:1 componentes).

## Decisiones
1. **Tipografía:** Inter (variable, latín, 48 KB) para toda la interfaz y los números, con `tnum` global y `cv11`/`ss03`; **Source Serif 4** (51 KB, sin precarga) solo para los títulos de página. `font-mono` pasa a ser Inter tabular; el código real usa la monoespaciada del sistema (`--font-code`). Archivos propios (licencia OFL) servidos con `next/font/local`.
2. **Paleta:** papel marfil `#F7F4EE`, superficies blancas, tinta `#1F1A15`, gris cálido para lo secundario, **acento terracota** `#A9471F` (texto `#9A3F1B`), salvia `#3F6B45`, ocre `#85570C`, ladrillo `#A8321F`. Modo oscuro con los mismos tonos (carbón cálido `#171411`, terracota `#D9784F` con texto oscuro sobre el botón). Todos los pares de texto ≥ 4,5:1 (calculado).
3. **Menos ruido:** sin degradados (el «gradiente» es el acento plano), sin brillos ni grilla de puntos, sin barra de color en los encabezados; etiquetas de sección en seminegrita normal (no mayúsculas espaciadas en mono); el espaciado entre letras de las etiquetas en mayúsculas bajó a 0,04em.
4. **Tema claro por defecto** (el oscuro sigue disponible en Configuración).
5. Los colores de módulos, entidades, etiquetas y espacios pasan a una familia terrosa (terracota, ciruela, salvia, ocre, rosa viejo, nogal, arcilla, ladrillo, gris cálido); migración 0014 mapea los guardados.

## Consecuencias
- Los PDF para clientes usan el mismo acento; su fuente sigue siendo Geist (documentos ya aprobados).

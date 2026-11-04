# ADR 0006 · Formularios nativos + Server Actions; listas sin TanStack Table

**Estado:** aceptada · 04/11/2026

**Diferencia con docs/03:** en vez de React Hook Form + TanStack Table:
- Formularios: `<form action>` con Server Actions y `useActionState` (`components/action-form.tsx`). Los **mismos esquemas Zod** validan en el servidor y los errores vuelven por campo. Menos JavaScript en el cliente (presupuesto de 170 KB por ruta) y funciona antes de hidratar.
- Listas: tablas/tarjetas propias con filtros por query string (compartibles) y paginación en el servidor. TanStack Table se puede sumar si aparece una lista que lo justifique (columnas configurables, selección múltiple masiva).

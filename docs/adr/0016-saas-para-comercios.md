# ADR 0016 · SaaS de gestión para comercios

**Estado:** aceptada · 21/11/2026

## Contexto
Un sistema para comercios (clientes de la agencia) que gestione clientes, ventas, stock, estadísticas, pedidos y usuarios, con panel de administración y reportes automáticos. Sin costo extra de infraestructura.

## Decisiones
1. **Mismo despliegue, inquilinos aislados.** Tablas `shop_*` (migración 0013) con `shop_id` en todas; los casos de uso (`modules/shop`) filtran siempre por el comercio de la sesión (`requireShopCtx`, cookie `ag-shop` solo para elegir entre los propios). Un comercio suspendido no deja entrar a nadie.
2. **La agencia administra:** `/comercios` (dueño/admin de AGENCYOS) crea el comercio (opcionalmente vinculado a un cliente del CRM) con una invitación para el dueño, ve su actividad del mes, reenvía el acceso y suspende.
3. **Usuarios del comercio:** dueño, administrador y vendedor, por invitación (token de 256 bits hasheado, 7 días, un uso) con la misma creación de cuentas que el resto (contraseña 12+, control de filtradas). 2FA opcional. Al entrar, quien solo tiene comercio va a `/comercio`.
4. **Ventas:** numeración por comercio serializada con un lock de la fila del comercio; productos bloqueados en orden para descontar stock sin carreras; el vendedor no cambia precios; anular devuelve el stock. Todo movimiento de stock queda en `shop_stock_move` con el stock resultante. Pedidos: no tocan stock hasta entregarse (ahí se registra la venta).
5. **Estadísticas y reportes:** ventas del día y del mes con comparación, ticket promedio, ganancia (si hay costos), 30 días, más vendidos, mejores clientes, stock bajo. Reporte semanal automático (lunes 7:10, `shop-weekly-reports`) guardado y enviado por email al dueño y administradores si hay Brevo.

## Consecuencias
- Dominio propio por comercio, facturación electrónica (ARCA), cobro con Mercado Pago y tienda online quedan como mejoras futuras.

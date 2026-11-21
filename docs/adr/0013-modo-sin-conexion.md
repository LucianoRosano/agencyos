# ADR 0013 · Modo sin conexión y app instalable

**Estado:** aceptada · 21/11/2026

## Contexto
Luciano quiere usar AGENCYOS como app en la PC y en el celular (Android y iPhone), también sin internet, sin pagar tiendas ni certificados. El servidor (VPS) sigue siendo la fuente de verdad.

## Decisiones
1. **PWA en todas las plataformas, sin tiendas.** Se instala desde Chrome/Edge (PC, Mac, Android) y desde Safari (iPhone: «Agregar a inicio»). Manifiesto con `id`, `display_override`, `launch_handler` (reusar la ventana abierta) y accesos directos. Configuración → «App y sin conexión» muestra el botón de instalar (`beforeinstallprompt`) o las instrucciones de cada plataforma. Un instalador nativo (Tauri) o las tiendas quedan como opción futura y paga (certificados, cuentas de desarrollador).
2. **Copia local en IndexedDB** (sin dependencias) de lo de uso diario: tareas abiertas y cerradas hace ≤ 14 días, Bandeja pendiente, notas recientes (≤ 400, cuerpo ≤ 200.000 caracteres), proyectos, clientes con su contacto principal y espacios. Respeta permisos (un colaborador no recibe notas ni clientes). Se borra al cerrar sesión, al cambiar de usuario o de workspace, o desde Configuración.
3. **Sincronización `GET/POST /api/sync`.** Primero se sube la cola y después se baja lo cambiado desde `serverTime − 5 s` (completo una vez por día; los borrados y archivados llegan en `removed`). Un solo proceso entre pestañas (Web Locks). Se dispara al abrir la app, al volver la conexión, al volver a la pestaña y cada 5 minutos.
4. **Cola de cambios idempotente.** Cada cambio tiene un id generado en el dispositivo; la tabla `sync_mutation` (migración 0010) garantiza que se aplica una sola vez aunque se reenvíe, y guarda el resultado. Los cambios pasan por los services de siempre (permisos, validación, actividad). Tipos: crear tarea (con id del dispositivo), cambiar estado y editar tarea, capturar en la Bandeja, crear y editar nota.
5. **Conflictos sin pisar nada.** Si una nota cambió en otro dispositivo después de la copia editada sin conexión, la versión offline se guarda como nota nueva «(conflicto …)» y se avisa. Título repetido → «(2)». Nota borrada → «(recuperada …)». En tareas gana el último cambio.
6. **`/local`**: la versión sin conexión (Hoy, Tareas, Bandeja, Notas, Proyectos y Clientes) sobre la copia del dispositivo. El service worker guarda `/local` y todos sus archivos (los `<script>` y los chunks que aparecen en el payload), y sin conexión (o con el servidor caído, 502–504) redirige las pantallas de la app a `/local?ver=…`. La respuesta guardada conserva el encabezado CSP con su nonce, así la página sigue cumpliendo la política.

## Consecuencias
- Sin conexión no se procesa la Bandeja ni se tocan finanzas, presupuestos o clientes: evita cobros o envíos duplicados.
- iPhone no tiene sincronización en segundo plano: sube al abrir la app con señal.

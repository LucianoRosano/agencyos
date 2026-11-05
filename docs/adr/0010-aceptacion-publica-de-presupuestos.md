# ADR 0010 · Aceptación pública de presupuestos

**Estado:** aceptada · 05/11/2026

- El enlace público usa un token aleatorio de 256 bits; en la base se guarda solo su hash SHA-256, con vencimiento (30 días por defecto) y revocación. Generar uno nuevo invalida el anterior.
- Abrirlo marca el presupuesto como "visto". Se admite **una sola respuesta**; se registran nombre, comentario, fecha, IP y navegador (`quote_decision`) y queda en la auditoría.
- **Aceptar desde el enlace** hace lo mismo que aceptar a mano con todas las casillas: crea el proyecto (plantilla del servicio principal), los cobros según el plan y marca la oportunidad como ganada. Motivo: el cliente no puede "ofrecer" nada; Luciano recibe la notificación y ajusta si hace falta.
- El envío por email solo aparece con Brevo configurado y siempre lo dispara Luciano (con confirmación).

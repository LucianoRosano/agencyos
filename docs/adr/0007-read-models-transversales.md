# ADR 0007 · Read-models transversales (Hoy, Negocio, Calendario, búsqueda)

**Estado:** aceptada · 04/11/2026

La regla "un módulo no importa tablas de otro" se aplica a las **escrituras**. Las pantallas que cruzan todo (Hoy, Negocio, Calendario, búsqueda global, Cerebro, exportación) son **read-models**: leen varias tablas en pocas consultas para cumplir el LCP < 1,5 s, nunca escriben y las acciones van a los services de cada módulo.
Excepciones de escritura documentadas: aceptar un presupuesto crea cobros (`receivable`) en la misma transacción; procesar la Bandeja crea una nota; ambas son atómicas a propósito.

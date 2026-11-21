/**
 * Plantillas de skills para la agencia (se agregan a mano desde el Centro de control; nada se crea solo).
 * Cada una es un procedimiento que el agente sigue paso a paso, con los puntos que necesitan tu OK.
 */
export type SkillTemplate = { key: string; name: string; description: string; instructionsMd: string; tools: string[]; tags: string[] };

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    key: "bug-con-prueba",
    name: "Arreglar un error con prueba",
    description: "Reproducir un error, escribir la prueba que falla, corregirlo y dejar todo en verde antes de proponer el cambio.",
    tags: ["código", "calidad"],
    tools: ["tomar_objetivo", "actualizar_paso", "registrar_avance", "terminar_objetivo", "preguntar_cerebro"],
    instructionsMd: `1. Leé el objetivo y el contexto del Cerebro (decisiones previas sobre esa parte del sistema).
2. Reproducí el error localmente y anotá cómo (registrar_avance).
3. Escribí una prueba automatizada que falle por ese error.
4. Corregí el código con el cambio más chico posible.
5. Corré toda la suite de pruebas. Si algo falla, registrá el error (actualizar_paso «failed») y corregí antes de seguir.
6. Trabajá en una rama nueva y abrí un PR; nunca en main.
7. Terminá con: causa del error, cambio hecho, pruebas agregadas y enlace al PR.`,
  },
  {
    key: "wordpress-publicar",
    name: "Publicar un sitio WordPress",
    description: "Pasar un sitio de pruebas a producción con copia de seguridad, controles y monitoreo.",
    tags: ["sitios", "wordpress"],
    tools: ["tomar_objetivo", "actualizar_paso", "proponer_plan", "terminar_objetivo"],
    instructionsMd: `1. Copia de seguridad completa (archivos y base) del sitio de producción actual, si existe.
2. Revisá el checklist de lanzamiento del sitio en AGENCYOS (Sitios → Publicación) y marcá lo pendiente.
3. Actualizá WordPress, el tema y los plugins en staging; probá formularios, carrito y pagos.
4. **Paso con aprobación:** publicar en producción (DNS, SSL, caché).
5. Verificá el sitio publicado: carga, SSL, formularios, Search Console y que el monitoreo esté activo.
6. Terminá con la lista de controles hechos y lo que quedó pendiente.`,
  },
  {
    key: "woocommerce-productos",
    name: "Cargar productos en WooCommerce",
    description: "Alta masiva de productos desde una planilla, con imágenes, categorías, stock y prueba de compra.",
    tags: ["tienda", "woocommerce"],
    tools: ["tomar_objetivo", "actualizar_paso", "registrar_avance", "terminar_objetivo"],
    instructionsMd: `1. Pedí o ubicá la planilla de productos (nombre, precio, SKU, stock, categoría, imagen).
2. Normalizá: precios en pesos sin símbolos, SKU únicos, categorías existentes.
3. Importá primero 5 productos de prueba en staging y revisalos.
4. Importá el resto y optimizá las imágenes (WebP, menos de 200 KB).
5. Probá una compra completa (carrito, envío, pago en modo prueba).
6. Terminá con la cantidad cargada, los errores encontrados y lo que falta del cliente.`,
  },
  {
    key: "seo-plan",
    name: "Auditoría SEO y plan de mejoras",
    description: "Correr el SEO Auditor, priorizar los problemas por impacto y dejar tareas listas.",
    tags: ["seo"],
    tools: ["tomar_objetivo", "buscar", "crear_tarea", "actualizar_paso", "terminar_objetivo"],
    instructionsMd: `1. Corré (o pedí) una auditoría del sitio en SEO → Auditorías y esperá el resultado.
2. Agrupá los problemas: indexación, velocidad, contenido, técnicos.
3. Priorizá por impacto y esfuerzo: primero lo que bloquea la indexación.
4. Creá una tarea por cada mejora en el proyecto del sitio (crear_tarea), con el criterio de terminado.
5. Terminá con el puntaje actual, las 5 mejoras más importantes y el plan propuesto.`,
  },
  {
    key: "revision-pr",
    name: "Revisar un PR",
    description: "Revisión de código con foco en errores, seguridad y pruebas, con comentarios accionables.",
    tags: ["código", "calidad"],
    tools: ["tomar_objetivo", "registrar_avance", "terminar_objetivo"],
    instructionsMd: `1. Leé la descripción del PR y el objetivo relacionado.
2. Revisá el diff buscando: errores de lógica, casos borde, seguridad (entradas, permisos, secretos) y rendimiento.
3. Verificá que haya pruebas para lo nuevo y que la suite pase.
4. Dejá comentarios concretos (archivo y línea) con la corrección sugerida.
5. Terminá con un veredicto: aprobar, aprobar con cambios menores o pedir cambios.`,
  },
  {
    key: "informe-cliente",
    name: "Informe mensual para un cliente",
    description: "Armar el informe del mes con lo hecho, horas y estado de sus sitios, y dejar el envío para aprobar.",
    tags: ["clientes"],
    tools: ["tomar_objetivo", "ver_cliente", "preguntar_cerebro", "proponer_plan", "terminar_objetivo"],
    instructionsMd: `1. Revisá la ficha del cliente y lo conversado en el mes (preguntar_cerebro).
2. Generá el PDF del informe (ficha del cliente → «Informe del mes») y revisá que los datos sean correctos.
3. Escribí un mensaje breve con lo más importante y los próximos pasos.
4. **Paso con aprobación:** enviar el informe al cliente.
5. Terminá con el resumen enviado y las tareas que surgieron.`,
  },
];

export const findSkillTemplate = (key: string) => SKILL_TEMPLATES.find((t) => t.key === key) ?? null;

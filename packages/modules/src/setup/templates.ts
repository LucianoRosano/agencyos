import type { TemplateDefinition } from "@agencyos/db/schema";

type Tpl = { key: string; name: string; kind: string; description: string; definition: TemplateDefinition };

/** Plantillas iniciales de proyecto (docs/02 M03 + contexto B4). Editables por el usuario. */
export const PROJECT_TEMPLATES: Tpl[] = [
  {
    key: "sitio-institucional",
    name: "Sitio institucional (WordPress)",
    kind: "website",
    description: "Sitio de presentación en WordPress + Kadence, del relevamiento a la publicación.",
    definition: {
      phases: [
        {
          name: "Relevamiento",
          tasks: [
            { title: "Reunión de relevamiento con el cliente", offsetDays: 0, priority: 2 },
            { title: "Enviar la lista única de preguntas", offsetDays: 1, priority: 2 },
          ],
        },
        {
          name: "Estructura y diseño",
          tasks: [
            { title: "Definir mapa del sitio y secciones", offsetDays: 4 },
            { title: "Diseño de la home y una página interna", offsetDays: 8 },
          ],
        },
        {
          name: "Desarrollo en staging",
          tasks: [
            { title: "Instalar WordPress + Kadence en staging", offsetDays: 9 },
            { title: "Cargar contenidos del cliente", offsetDays: 14 },
          ],
        },
        { name: "Revisión", tasks: [{ title: "Ronda de revisión R1 con el cliente", offsetDays: 17 }] },
        {
          name: "Publicación",
          tasks: [
            { title: "Checklist de lanzamiento", offsetDays: 20, priority: 2 },
            { title: "Publicar y verificar en producción", offsetDays: 21, priority: 1 },
          ],
        },
        { name: "Documentación", tasks: [{ title: "Manual del cliente y documentación técnica", offsetDays: 23 }] },
      ],
      checklist: ["SSL activo", "Formulario de contacto probado", "Google Analytics / Search Console", "Backups configurados"],
      clientQuestions: [
        "¿Cuál es el objetivo principal del sitio?",
        "¿Quién es tu público?",
        "¿Tenés logo, colores y tipografías?",
        "¿Qué secciones necesitás?",
        "¿Tenés dominio y hosting?",
        "¿Qué sitios te gustan como referencia?",
      ],
      initialNote: "## Objetivo\n\n## Público\n\n## Referencias\n\n## Pendientes del cliente\n",
    },
  },
  {
    key: "tienda-online",
    name: "Tienda online (WooCommerce)",
    kind: "store",
    description: "Relevamiento → preguntas → diseño → staging → carga → checklist de lanzamiento → fase final → manual → mantenimiento.",
    definition: {
      phases: [
        { name: "Relevamiento", tasks: [{ title: "Reunión de relevamiento (catálogo, pagos, envíos)", offsetDays: 0, priority: 2 }] },
        {
          name: "Lista única de preguntas",
          tasks: [
            { title: "Enviar la lista única de preguntas al cliente", offsetDays: 1, priority: 2 },
            { title: "Recibir respuestas y materiales", offsetDays: 5 },
          ],
        },
        { name: "Diseño", tasks: [{ title: "Diseño de home, categoría y producto", offsetDays: 8 }] },
        {
          name: "Staging",
          tasks: [
            { title: "Instalar WooCommerce + Kadence en staging", offsetDays: 9 },
            { title: "Configurar Mercado Pago y envíos (Correo Argentino / Andreani)", offsetDays: 12 },
          ],
        },
        {
          name: "Carga",
          tasks: [
            { title: "Importar productos (plantilla Excel)", offsetDays: 15 },
            { title: "Revisar fotos, precios y stock", offsetDays: 17 },
          ],
        },
        { name: "Checklist de lanzamiento", tasks: [{ title: "Recorrer el checklist de 17 áreas", offsetDays: 20, priority: 2 }] },
        { name: "Fase final", tasks: [{ title: "Publicar con el OK del cliente", offsetDays: 22, priority: 1 }] },
        { name: "Manual del cliente", tasks: [{ title: "Escribir el manual de uso de la tienda", offsetDays: 24 }] },
        { name: "Mantenimiento", tasks: [{ title: "Acordar el plan de mantenimiento mensual", offsetDays: 30 }] },
      ],
      checklist: [
        "SEO técnico",
        "Medición",
        "Seguridad",
        "Rendimiento",
        "WooCommerce",
        "Pagos",
        "Envíos",
        "Diseño",
        "Accesibilidad",
        "Legales (botón de arrepentimiento)",
        "Mails",
        "Backups",
        "Hosting y dominio",
        "SEO de contenido",
        "Marketing",
        "Pruebas",
        "Mantenimiento",
      ],
      clientQuestions: [
        "¿Cuántos productos y categorías?",
        "¿Medios de pago?",
        "¿Zonas y métodos de envío?",
        "¿Necesitás facturación ARCA automática?",
        "¿Quién carga y actualiza los productos?",
        "¿Tenés fotos de producto?",
      ],
      initialNote: "## Catálogo\n\n## Pagos y envíos\n\n## Legales\n\n## Pendientes del cliente\n",
    },
  },
  {
    key: "panel-plugin",
    name: "Panel o plugin propio",
    kind: "panel",
    description: "Idea y arquitectura → diseño → desarrollo → staging → fase final con OK → documentación.",
    definition: {
      phases: [
        {
          name: "Idea y arquitectura",
          tasks: [
            { title: "Definir problema, usuarios y alcance", offsetDays: 0, priority: 2 },
            { title: "Decidir arquitectura y stack", offsetDays: 3 },
          ],
        },
        { name: "Diseño", tasks: [{ title: "Diseñar pantallas clave", offsetDays: 7 }] },
        {
          name: "Desarrollo",
          tasks: [
            { title: "Desarrollar el núcleo", offsetDays: 14 },
            { title: "Tests de los flujos principales", offsetDays: 18 },
          ],
        },
        { name: "Staging", tasks: [{ title: "Instalar en staging y probar con datos reales", offsetDays: 21 }] },
        { name: "Fase final", tasks: [{ title: "Pasar a producción con el OK del cliente", offsetDays: 25, priority: 1 }] },
        { name: "Documentación", tasks: [{ title: "README, CHANGELOG y manual de uso", offsetDays: 27 }] },
      ],
      clientQuestions: ["¿Qué tarea manual querés eliminar?", "¿Quién lo va a usar y desde qué dispositivo?", "¿Con qué sistemas tiene que conectarse?"],
      initialNote: "## Problema\n\n## Usuarios\n\n## Decisiones de arquitectura\n",
    },
  },
  {
    key: "auditoria-seo",
    name: "Auditoría y mejora SEO",
    kind: "seo",
    description: "Auditoría técnica y de contenido, plan de mejoras y seguimiento.",
    definition: {
      phases: [
        {
          name: "Auditoría",
          tasks: [
            { title: "Rastrear el sitio y relevar problemas técnicos", offsetDays: 0, priority: 2 },
            { title: "Revisar Search Console y PageSpeed", offsetDays: 2 },
          ],
        },
        { name: "Plan", tasks: [{ title: "Priorizar mejoras (impacto × esfuerzo)", offsetDays: 4 }] },
        {
          name: "Implementación",
          tasks: [
            { title: "Corregir problemas críticos", offsetDays: 8, priority: 2 },
            { title: "Optimizar títulos y meta descriptions", offsetDays: 12 },
          ],
        },
        { name: "Seguimiento", tasks: [{ title: "Comparar resultados a 30 días", offsetDays: 40 }] },
      ],
      initialNote: "## Hallazgos\n\n## Prioridades\n",
    },
  },
  {
    key: "mantenimiento-mensual",
    name: "Mantenimiento mensual (recurrente)",
    kind: "maintenance",
    description: "Checklist mensual de mantenimiento de un sitio.",
    definition: {
      phases: [
        {
          name: "Mantenimiento",
          tasks: [
            { title: "Actualizar WordPress, plugins y tema (con backup previo)", offsetDays: 0 },
            { title: "Verificar backups y restauración", offsetDays: 0 },
            { title: "Revisar formularios, pagos y mails", offsetDays: 1 },
            { title: "Revisar velocidad y errores", offsetDays: 2 },
            { title: "Informe mensual al cliente", offsetDays: 3 },
          ],
        },
      ],
      checklist: ["Backup previo", "Actualizaciones", "Formularios", "Pagos", "Velocidad", "Seguridad"],
    },
  },
  {
    key: "aprendizaje",
    name: "Proyecto personal de aprendizaje",
    kind: "personal",
    description: "Objetivo, recursos, práctica y cierre.",
    definition: {
      phases: [
        { name: "Objetivo", tasks: [{ title: "Definir qué quiero poder hacer al terminar", offsetDays: 0 }] },
        { name: "Recursos", tasks: [{ title: "Elegir cursos, libros o documentación", offsetDays: 2 }] },
        { name: "Práctica", tasks: [{ title: "Primer proyecto práctico", offsetDays: 14 }] },
        { name: "Cierre", tasks: [{ title: "Escribir lo aprendido en una nota", offsetDays: 30 }] },
      ],
      initialNote: "## Qué quiero aprender\n\n## Recursos\n\n## Aprendizajes\n",
    },
  },
  {
    key: "materia",
    name: "Materia de la facultad",
    kind: "study",
    description: "Cursada, apuntes y plan de estudio hacia las evaluaciones.",
    definition: {
      phases: [
        { name: "Inicio de cursada", tasks: [{ title: "Cargar horarios, docentes y fechas de evaluación", offsetDays: 0 }] },
        { name: "Cursada", tasks: [{ title: "Armar apuntes por unidad", offsetDays: 14 }] },
        { name: "Evaluaciones", tasks: [{ title: "Plan de estudio para el primer parcial", offsetDays: 30, priority: 2 }] },
      ],
      initialNote: "## Programa\n\n## Fechas\n\n## Apuntes\n",
    },
  },
  {
    key: "en-blanco",
    name: "En blanco",
    kind: "other",
    description: "Sin etapas ni tareas predefinidas.",
    definition: { phases: [] },
  },
];

export const DEFAULT_CATEGORIES = {
  income: ["Desarrollo web", "Tiendas online", "Mantenimiento", "SEO", "Otros ingresos"],
  expense: ["Hosting", "Dominios", "Herramientas / SaaS", "IA", "Hardware", "Publicidad", "Formación", "Otros gastos"],
};

export const DEFAULT_QUOTE_TEMPLATE = {
  name: "Presupuesto base",
  introMd: "Gracias por la confianza. Te comparto la propuesta para el proyecto, con el alcance, los plazos y las condiciones de trabajo.",
  scopeMd:
    "- Relevamiento inicial y lista única de preguntas.\n- Diseño y desarrollo de lo detallado en los ítems.\n- Una ronda de revisión incluida por entrega.\n- Publicación y verificación en producción.\n- Documentación y manual de uso.",
  exclusionsMd:
    "- Costos de terceros (dominio, hosting, plugins pagos, publicidad, comisiones de medios de pago).\n- Redacción de contenidos y producción de fotos, salvo que figuren como ítem.\n- Cambios de alcance posteriores a la aprobación (se presupuestan aparte).\n- Mantenimiento posterior a la entrega, salvo abono mensual.",
  termsMd:
    "- **Forma de pago:** según el plan de cobro de este presupuesto. Transferencia bancaria o Mercado Pago.\n- **Plazos:** se cuentan desde la recepción del anticipo y de los materiales del cliente.\n- **Validez:** los precios se mantienen durante el período de validez indicado.\n- **Precios finales.** Documento no válido como factura.",
};

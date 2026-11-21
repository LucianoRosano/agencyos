# ADR 0014 · Cerebro inteligente sin servicios externos

**Estado:** aceptada · 21/11/2026

## Contexto
Subir documentos, proyectos, PDFs y apuntes, hacer preguntas, relacionar información y recuperar decisiones anteriores, sin pagar APIs.

## Decisiones
1. **Índice propio en PostgreSQL** (migración 0011): `knowledge_chunk` (fragmentos de ~1.100 caracteres con solapamiento) con columna generada `tsv` = `to_tsvector('spanish', f_search_norm(...))` (título con peso A) e índice GIN; `knowledge_source` guarda la versión indexada de cada fuente para reindexar solo lo cambiado.
2. **Fuentes:** notas, documentos de la Biblioteca (PDF con pdf.js, Word .docx leyendo el XML del ZIP, texto/Markdown/CSV/HTML/JSON), decisiones de proyectos, conversaciones con clientes, proyectos y clientes. El worker (`brain-index`, cada minuto, de a 40 por tipo) indexa lo nuevo y saca lo que va a la papelera.
3. **Preguntar:** consulta `OR` con prefijos sobre los términos útiles (sin acentos ni palabras vacías), `ts_rank_cd`, doble peso si cumple la consulta completa, refuerzo de decisiones y conversaciones cuando la pregunta habla de «decidimos / quedamos / prometí». Se agrupa por fuente y se eligen las mejores oraciones (sin depender de acentos). La primera oración es «Lo más relevante». Sin LLM: respuestas extractivas con su fuente y fecha, verificables.
4. **Relacionado:** los términos más característicos de una fuente contra el resto del índice («Relacionado en el Cerebro» en cada nota).
5. **MCP `preguntar_cerebro`:** Claude (con la suscripción de Luciano) consulta el Cerebro y redacta la respuesta; así hay respuestas generativas sin costo de API.

## Consecuencias
- Búsqueda semántica con embeddings queda como mejora futura (necesita un modelo local o una API).

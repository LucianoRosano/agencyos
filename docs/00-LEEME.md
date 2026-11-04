# AGENCYOS (Digital Agency OS): paquete de documentación para Claude Code

**Dueño:** Luciano Rosano · lucianorosanott@gmail.com
**Versión:** 1.0, 3 de noviembre de 2026
**Estado:** diseño cerrado y listo para implementar. Todavía no hay código.

## Qué es este paquete

Contiene la especificación completa de **AGENCYOS**, el sistema operativo propio de Luciano para gestionar y automatizar su agencia digital, sus proyectos personales y su conocimiento. Lo produjo un "equipo senior" simulado (producto, CTO, arquitectura, full stack, UX/UI, DevOps, IA, seguridad, QA y negocios), con **decisiones concretas, no listas de alternativas**.

## Orden de lectura obligatorio para Claude Code

| # | Archivo | Contenido |
|---|---|---|
| 00 | `00-LEEME.md` | Este índice, reglas de precedencia y supuestos |
| 01 | `01-vision.md` | Visión del producto, principios y métricas de éxito |
| 02 | `02-especificacion-funcional.md` | Especificación funcional de cada módulo |
| 03 | `03-arquitectura.md` | Arquitectura técnica, stack justificado e infraestructura |
| 04 | `04-modelo-de-datos.md` | Entidades, campos clave, relaciones e índices |
| 05 | `05-estructura-de-carpetas.md` | Monorepo, carpetas y convenciones de código |
| 06 | `06-navegacion.md` | Mapa de navegación y rutas |
| 07 | `07-ux-ui.md` | Sistema de diseño, patrones e identidad por módulo |
| 08 | `08-seguridad.md` | Estrategia de seguridad |
| 09 | `09-testing.md` | Estrategia de testing y calidad |
| 10 | `10-roadmap.md` | Roadmap por fases con criterios de salida |
| 11 | `11-mvp.md` | Definición exacta del MVP |
| 12 | `12-funcionalidades-posteriores.md` | Backlog posterior al MVP |
| 13 | `13-instrucciones-claude-code.md` | **Cómo trabajar**, prompt de arranque y `CLAUDE.md` |
| 14 | `14-agentes-ia.md` | AI Command Center: agentes, permisos, herramientas y trazabilidad |
| 15 | `15-repositorios.md` | **Parámetro prioritario: Claude organiza los repositorios** |
| 16 | `16-preguntas-abiertas.md` | Información que todavía falta de Luciano |
| — | `contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md` | Quién es Luciano, cómo trabaja, clientes, identidad visual |
| — | `contexto/referencias/*.png` | Vistas de referencia: Hoy y Cerebro, en desktop y celular |

## Precedencia ante contradicciones

1. Lo que Luciano diga en la conversación actual.
2. Este paquete (`00`–`16`).
3. `contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md`. Vale para todo lo referido a Luciano, su forma de trabajar y la identidad visual. Para módulos y arquitectura manda este paquete, que integra y amplía lo que dice ese documento.

## Supuestos explícitos

- **Nombre del producto:** AGENCYOS (subtítulo: Digital Agency OS). Luciano lo eligió.
- **"Que Claude me organice los repositorios"** se interpreta en dos niveles, y se implementan los dos:
  1. **Una sola vez, en la Fase 0:** Claude Code inventaría, ordena, estandariza y migra los repositorios y el código suelto de Luciano a GitHub, con convenciones fijas. Lo hace con su aprobación antes de cualquier cambio.
  2. **De forma permanente:** AGENCYOS tiene un módulo **Repositorios** y un **Repo Agent** que mantienen ese orden en el tiempo: detectan desvíos, proponen correcciones y las ejecutan con aprobación.
- **Alcance:** AGENCYOS cubre la agencia **y también** lo personal y la facultad (Luciano pidió "todo, bien organizado") y **reemplaza a Obsidian** (notas y Cerebro).
- **Facturación fiscal:** no la hay. Luciano no está inscripto en ARCA. El sistema gestiona dinero, no impuestos.
- **Datos:** el sistema **nunca** muestra datos de ejemplo como si fueran reales. Los datos de prueba existen solo en los entornos de desarrollo y test.
- **Presupuesto de infraestructura:** hasta US$ 15/mes.

## Qué falta de Luciano

Ver `16-preguntas-abiertas.md`. Ninguna de esas respuestas bloquea el arranque de la Fase 0. Las que bloquean fases posteriores están marcadas.

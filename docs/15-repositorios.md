# 15 · Repositorios: Claude organiza el GitHub de Luciano

> **Parámetro prioritario de Luciano:** "que Claude me organice los repositorios".
> Se implementa en dos niveles:
> - **(A)** una organización inicial completa, ejecutada por Claude Code en la **Fase 0**;
> - **(B)** un mantenimiento permanente desde AGENCYOS (módulo **Repositorios** + **Repo Agent**).
>
> Luciano solo aprueba: no tiene que hacer nada a mano salvo los prerrequisitos de la §3.

## 1. Situación actual (lo que se sabe)
- Luciano tiene cuenta de GitHub y "algunos repositorios", pero **lo usa poco**. No se conocen el usuario ni la lista de repositorios (ver `16-preguntas-abiertas.md`).
- Gran parte de su código **no está en GitHub**. Fuentes conocidas a inventariar:

| Código | Dónde está hoy (según el contexto) | Destino propuesto |
|---|---|---|
| LibreríaOS Fiscal 1.1.0 (plugin WP, facturación ARCA por web services) | Respaldo en el Proyecto "Librería Uno" de claude.ai (`claude/libreriaos/backup-codigo/`); instalado en staging | `prod-libreriaos-fiscal` |
| LibreríaOS Panel (plugin WP) | Diseños en Claude Design (exportar **antes del 14/12/2026**); sin código | `prod-libreriaos-panel` (se crea al empezar a programarlo) |
| Caja del local (sistema aparte, dos cuentas fiscales) | En definición | `prod-caja-local` (al empezar) |
| Facturador de escritorio (Python + Playwright + Excel + tkinter), versiones Librería Uno y Sofía | PC de Luciano | `int-facturador-arca-escritorio` (legado; se archiva cuando Fiscal esté en producción en ambos) |
| Panel de Sofía (PHP independiente, REST de WooCommerce) | `public_html` del hosting de Sofía (ruta no obvia) | `cli-sofia-php-panel` |
| CSS de tarjetas v5.4, sección "Servicio editorial", snippets de Sofía | WordPress de Sofía (CSS adicional, bloques) | `cli-sofia-wp-sitio` |
| Personalizaciones del sitio de Librería Uno (CSS, snippets, hero, plantillas de mails) | WordPress de Librería Uno / staging | `cli-libreriauno-wp-tienda` |
| Plantilla Excel de importación de productos WooCommerce | Archivos de Luciano | `cli-libreriauno-wp-tienda/herramientas/` |
| Gestión SCE (PHP, ~27 archivos) + mu-plugin `sce-tracker` (Parinama) | Servidor de Parinama (`/gestion-sce/`) | `cli-parinama-php-gestion-sce` → **archivado** (proyecto terminado) |
| Plataforma mayorista Bellezatecnia | Por empezar (en su Hostinger) | `cli-bellezatecnia-wp-mayorista` |
| Generador de certificados ADEH (SVG + Playwright → PDF) | Sesiones anteriores de Claude (puede no estar guardado) | `cli-adeh-tool-certificados` (se reconstruye desde las specs si no aparece) |
| Motor de PDF y manual de SEÑAL | Artifact "Centro de control SEÑAL" | `per-senal` |
| Herramientas de PDF de estudio (`studybook.py`, etc.) | Sesiones anteriores | `per-pdf-toolkit` |
| Material de la facultad | Varios | `edu-ungs-sistemas` (un solo repositorio con carpetas por materia) |
| AGENCYOS | — | `prod-agencyos` |

## 2. Decisiones de organización

### 2.1 Cuenta
- **Cuenta personal de Luciano** con **GitHub Pro, gratis con el GitHub Student Developer Pack** (es estudiante universitario). Motivo: en el plan gratuito, la **protección de ramas y los rulesets solo funcionan en repositorios públicos**. Con Pro funcionan en los privados.
- **Sin organización por ahora.** Una organización gratuita no tiene protección de ramas en privados y la paga (Team) cuesta por usuario. Se reevalúa en la F6, cuando haya colaboradores. Mientras tanto, el orden lo dan los **prefijos** y los **topics**.
- **Todos los repositorios son privados.** Ninguno se hace público sin una orden explícita de Luciano.
- Si el Student Pack no se aprueba: se sigue con el plan gratuito y la protección se reemplaza por convención (Claude nunca hace push directo a `main` en repositorios de producción) + verificación en la CI.

### 2.2 Convención de nombres
`<alcance>-<cliente o producto>-<tecnología>-<nombre>` en minúsculas, kebab-case, sin tildes ni ñ (ñ → n), máximo 50 caracteres. El segmento de tecnología se omite si no aporta.

| Alcance | Uso | Ejemplos |
|---|---|---|
| `prod` | Productos propios reutilizables (se instalan en varios clientes) | `prod-agencyos`, `prod-libreriaos-fiscal`, `prod-libreriaos-panel`, `prod-caja-local` |
| `cli` | Código específico de un cliente | `cli-sofia-wp-sitio`, `cli-bellezatecnia-wp-mayorista` |
| `int` | Herramientas internas de la agencia | `int-facturador-arca-escritorio`, `int-scripts-hostinger` |
| `tpl` | Plantillas para arrancar repositorios | `tpl-wp-plugin`, `tpl-php-panel`, `tpl-proyecto-docs`, `tpl-next-app` |
| `per` | Proyectos personales | `per-senal`, `per-pdf-toolkit` |
| `edu` | Facultad y estudio | `edu-ungs-sistemas` |

**Regla de producto (importante):** lo que se instala en más de un cliente (por ejemplo, LibreríaOS para Librería Uno y para Sofía) es **un solo repositorio `prod-*`** con **configuración por cliente**. **No se copian repositorios por cliente.** Qué versión está instalada en qué cliente, y con qué configuración, se registra en AGENCYOS (`installation`). Las diferencias de cada cliente van en archivos de configuración o en hooks, nunca en forks.

### 2.3 Topics (vocabulario fijo)
- `alcance-<prod|cli|int|tpl|per|edu>`
- `cliente-<libreriauno|sofia|adeh|bellezatecnia|parinama>` (si aplica)
- `tipo-<wp-plugin|wp-tema|wp-sitio|php-panel|app-web|herramienta|docs|plantilla>`
- `stack-<wordpress|woocommerce|php|python|nextjs|typescript>`
- `estado-<activo|mantenimiento|pausado|archivado>`

### 2.4 Descripción
Formato: `[Cliente o Producto] Qué es, en una frase — stack`.
Ejemplo: `[Librería Uno] Facturación automática en ARCA para pedidos WooCommerce — WordPress/PHP`.

### 2.5 Archivos estándar (todos los repositorios)

| Archivo | Contenido mínimo |
|---|---|
| `README.md` | Qué es · Cliente/Proyecto (con enlace a AGENCYOS) · Estado · Stack · Instalación/Despliegue · Configuración (variables, **sin secretos**) · Estructura · Versionado · Mantenimiento |
| `CLAUDE.md` | Reglas para Claude en ese repositorio: qué es, comandos, convenciones, qué no tocar, cómo probar, cómo desplegar, "sin narración, verificar antes de decir listo", "nada irreversible sin aprobación" |
| `.gitignore` | Según el stack + `.env*` (salvo `.env.example`), `config.php`, `*.key`, `*.pem`, `*.crt`, `*.p12`, `/vendor`, `/node_modules`, `*.zip` de build |
| `.env.example` / `config.example.php` | Si el proyecto usa configuración |
| `CHANGELOG.md` | Versiones (SemVer) |
| `docs/` | Decisiones (ADR) y procedimientos |
| `.github/workflows/ci.yml` | Lint, tests si existen, **gitleaks** |
| `.github/dependabot.yml` | Actualizaciones de dependencias (si aplica) |
| `.github/pull_request_template.md` | Qué cambia · cómo se probó · riesgos |

### 2.6 Ramas, versiones y releases
- Rama por defecto `main`. Claude trabaja en `feat/…`, `fix/…`, `chore/…`, `docs/…` y abre un PR.
- Con GitHub Pro, en los repositorios `prod-*` y `cli-*` activos, `main` queda protegida: PR obligatorio, CI en verde, sin force-push y sin borrado.
- **Conventional Commits** en español. **SemVer** con tags `vX.Y.Z` y GitHub Releases.
- Para los plugins de WordPress, la CI arma el **ZIP instalable** y lo adjunta al release, que es lo que Luciano sube una sola vez. El release queda registrado en AGENCYOS como `own_product_version`.

### 2.7 Seguridad de los repositorios
- **gitleaks** sobre **todo** el código antes de su primer push y en cada PR.
- Si se detecta un secreto (por ejemplo, la Consumer Key/Secret de WooCommerce en `config.php`, claves de ARCA o API keys):
  1. **no se sube**;
  2. se reemplaza por un archivo de ejemplo;
  3. se avisa a Luciano y se le recomienda **rotarlo**.
- Los certificados y claves privadas de ARCA (hoy en `Descargas\LibreriaUno-ARCA` de su PC) **nunca** van a un repositorio.
- Las alertas de Dependabot y el secret scanning (donde el plan lo permita) quedan activados.
- **Nunca** se borra un repositorio: se archiva. Nunca se hace force-push sobre `main`. Nunca se cambia la visibilidad a pública.

## 3. Prerrequisitos (Luciano, una sola vez)
1. Solicitar el **GitHub Student Developer Pack** (education.github.com) con su constancia de alumno regular de la UNGS. Es recomendado, no bloqueante.
2. Activar **2FA** en GitHub.
3. Pasarle a Claude Code su **usuario de GitHub** y autorizar el acceso: `gh auth login` en la sesión de Claude Code (o un token fine-grained con los permisos que Claude indique).
4. Indicar dónde está el código local (carpetas de su PC) y autorizar el acceso a los servidores (SFTP/rsync de Hostinger o royal-mcp) para traer el código que solo vive allí.

## 4. Organización inicial (Fase 0): procedimiento para Claude Code

1. **Inventario (solo lectura):**
   - listar los repositorios con `gh repo list <usuario> --limit 200 --json …`;
   - para cada uno: lenguaje, último push, tamaño, visibilidad, README sí/no, secretos (gitleaks sobre un clon temporal);
   - inventariar las fuentes de la §1 que estén accesibles.

   Resultado: `docs/repos/INVENTARIO.md`.
2. **Plan de organización:** `docs/repos/PLAN-ORGANIZACION.md`, con una tabla `actual → propuesto` y una acción por fila:
   - crear;
   - renombrar (GitHub mantiene redirecciones);
   - topics;
   - descripción;
   - agregar archivos estándar (vía PR);
   - migrar código suelto;
   - archivar;
   - activar seguridad;
   - proteger `main`.

   Cada fila indica su riesgo. Al final, **una única lista de preguntas** para Luciano (por ejemplo: "¿este repositorio viejo se archiva?").
3. **Aprobación:** Luciano aprueba todo, por fila o con cambios. Sin aprobación no se ejecuta nada.
4. **Ejecución**, en este orden:
   1. plantillas `tpl-*`;
   2. renombres, topics y descripciones;
   3. archivos estándar vía PR;
   4. migración de código suelto (copiar a un directorio temporal → gitleaks → limpiar secretos → historial nuevo con commit inicial `chore: importación inicial desde <origen>` → push privado);
   5. protección de ramas;
   6. archivado.

   Cada acción se registra en `docs/repos/REGISTRO.md` (fecha, acción, resultado).
5. **Verificación:** se corren los checks del estándar (§5) sobre todos los repositorios. Todo en verde o con una excepción justificada.
6. **Informe final** para Luciano: qué se hizo, qué quedó pendiente (por ejemplo, código que no se encontró) y qué secretos hay que rotar. Esos datos se usan para la **carga inicial** del módulo Repositorios de AGENCYOS (vínculos con cliente, proyecto y producto).

## 5. Estándar verificable y puntaje de salud (0–100)

| Check | Peso | Regla |
|---|---|---|
| `nombre` | 10 | Cumple la convención §2.2 |
| `descripcion` | 5 | Presente y con el formato §2.4 |
| `topics` | 10 | Incluye alcance, tipo, stack y estado (+ cliente si es `cli`) |
| `readme` | 15 | Existe y tiene las secciones mínimas |
| `claude_md` | 10 | Existe |
| `gitignore` | 5 | Existe y cubre los patrones sensibles |
| `secretos` | 20 | gitleaks limpio. **Si falla, el puntaje máximo es 40 y el repositorio aparece en "Ponerse al día" como crítico** |
| `ci` | 10 | Hay workflow y la última ejecución en `main` está en verde |
| `rama_protegida` | 5 | `main` protegida (si el plan lo permite; si no, N/A y se redistribuye el peso) |
| `seguridad` | 5 | Alertas de Dependabot activadas |
| `coherencia_estado` | 5 | Si `estado-activo`, push en los últimos 90 días; si no, sugiere `mantenimiento` o `archivado` |

Puntaje ≥ 90 verde, 70–89 amarillo, < 70 rojo.

## 6. Mantenimiento permanente en AGENCYOS (módulo M11)
- **GitHub App** "AGENCYOS" instalada en la cuenta de Luciano, con permisos mínimos (ver `03-arquitectura.md` §6). Webhooks: `repository`, `push`, `pull_request`, `release`, `installation`.
- **Sincronización:** por webhooks, más una sincronización completa diaria (04:00 ART). Los checks se recalculan al sincronizar.
- **Vínculos:** cada repositorio se vincula a cliente, proyecto, sitio y/o producto propio. Lo infiere la convención de nombres y topics; si la inferencia no es segura, lo confirma Luciano.
- **Desvíos:** un repositorio rojo o nuevo fuera de estándar aparece en **"Ponerse al día"**.
- **Planes:** botón "Generar plan" (determinístico en el MVP: aplica la convención) → `repo_plan` con acciones → **Aprobar** → el worker ejecuta con el token de instalación (cambios de archivos siempre vía PR; merge automático solo si la CI está en verde y el plan fue aprobado) → registro y auditoría.
- **Repositorio nuevo desde AGENCYOS:** "Crear repositorio" en un proyecto → elegir plantilla `tpl-*` → el nombre se genera con la convención → se crea privado con topics, descripción y archivos estándar, y queda vinculado al proyecto.
- **Eventos útiles:**
  - `release` de un `prod-*` → nueva `own_product_version` + tarea "actualizar en clientes" (una por instalación);
  - PR abierto por Claude → aparece en "Ponerse al día" para revisar.
- **Repo Agent (F5):** redacta README y CLAUDE.md faltantes (vía PR), detecta repositorios sin uso, sugiere unificaciones y revisa la coherencia de los topics.

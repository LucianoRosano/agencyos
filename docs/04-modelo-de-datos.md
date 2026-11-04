# 04 · Modelo de datos y relaciones

## Convenciones

- **Columnas comunes en todas las tablas de negocio:** `id uuid (v7) PK`, `workspace_id uuid FK → workspace` (indexada), `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid null` (usuario), `created_by_agent uuid null` (agente), `archived_at timestamptz null`, `deleted_at timestamptz null` (papelera).
- **Nombres** en inglés, `snake_case`, tablas en singular. La UI siempre en español.
- **Dinero:** `amount numeric(14,2)` + `currency char(3)`.
- **Enums** como `text` con `CHECK` (más fácil de migrar que los enums nativos).
- **Búsqueda:** `search_vector tsvector` + índice GIN en las tablas marcadas con 🔎.
- **Unicidad:** los índices únicos siempre incluyen `workspace_id`.
- Las tablas marcadas **[Fx]** se crean en esa fase. El esquema está pensado para que agregarlas no altere las existentes.

---

## 1. Identidad y organización

| Tabla | Campos clave | Relaciones / notas |
|---|---|---|
| `workspace` | `name`, `slug`, `logo_file_id`, `default_currency` ('ARS'), `enabled_currencies text[]`, `timezone` ('America/Buenos_Aires'), `settings jsonb`, `enabled_modules text[]` | Raíz multi-inquilino |
| `user` (Better Auth) | `email` (único), `name`, `image`, `email_verified`, `two_factor_enabled` | Tablas propias de Better Auth: `session`, `account`, `verification`, `two_factor`, `apikey` |
| `membership` | `user_id`, `workspace_id`, `role` (`owner·admin·member·client`), `status` | Un usuario puede estar en varios workspaces ([F6]) |
| `space` 🔎 | `name`, `color`, `icon`, `kind` (`agency·personal·study·custom`), `sort` | Agencia, Personal y Facultad creados por seed |
| `tag` | `name`, `color` | Único (`workspace_id`, `name`) |
| `tagging` | `tag_id`, `entity_type`, `entity_id` | Polimórfica |
| `link` | `from_type`, `from_id`, `to_type`, `to_id`, `kind` (`wikilink·mention·belongs·related·tag`), `source_note_id null` | **Corazón del Cerebro**; índices por (`from_type`,`from_id`) y (`to_type`,`to_id`) |
| `comment` | `entity_type`, `entity_id`, `body_md`, `author_id`, `parent_id` | Hilos |
| `saved_view` | `user_id`, `module`, `name`, `filters jsonb`, `sort jsonb`, `columns jsonb`, `pinned` | Vistas guardadas |
| `user_preference` | `user_id`, `key`, `value jsonb` | Tema, bloques de Hoy, foco elegido |

## 2. Eventos, actividad, notificaciones y auditoría

| Tabla | Campos clave | Notas |
|---|---|---|
| `domain_event` | `type`, `entity_type`, `entity_id`, `actor_type`, `actor_id`, `payload jsonb`, `occurred_at`, `dispatched_at null` | **Outbox**; se publica a pg-boss |
| `activity` | `entity_type`, `entity_id`, `verb`, `summary`, `actor_type`, `actor_id`, `meta jsonb`, `occurred_at` | Línea de tiempo visible |
| `notification` | `user_id`, `type`, `title`, `body`, `entity_type`, `entity_id`, `read_at`, `channels_sent text[]` | |
| `notification_preference` | `user_id`, `event_type`, `in_app`, `push`, `email` | |
| `push_subscription` | `user_id`, `endpoint`, `keys jsonb`, `user_agent` | Web Push |
| `audit_log` | `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `ip`, `user_agent`, `before jsonb`, `after jsonb`, `at` | **Solo inserción** (sin UPDATE/DELETE por permisos de la base) |
| `approval` | `kind`, `requested_by_type/id`, `entity_type`, `entity_id`, `proposal jsonb`, `status` (`pending·approved·rejected·expired·executed·failed`), `decided_by`, `decided_at`, `execution_result jsonb` | Humano en el bucle (agentes, repositorios, emails a clientes) |

## 3. Bandeja

| Tabla | Campos clave |
|---|---|
| `inbox_item` | `text`, `suggested_type` (`task·note·idea·expense·link`), `source` (`app·mcp·email·agent`), `processed_at`, `result_entity_type/id` |

## 4. CRM (M02)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `client` 🔎 | `name`, `trade_name`, `industry`, `website`, `city`, `province`, `relationship` (`family·referral·external`), `status` (`prospect·active·paused·finished·archived`), `source`, `space_id`, `notes_md` | 1–N contactos, oportunidades, proyectos, sitios, presupuestos, cobros |
| `client_fiscal_holder` | `client_id`, `legal_name`, `tax_id` (CUIT, validado), `vat_condition`, `is_default` | Oculto por defecto en la UI |
| `contact` 🔎 | `name`, `role`, `email`, `phone`, `whatsapp`, `notes_md` | |
| `client_contact` | `client_id`, `contact_id`, `is_primary`, `role_in_client` | N–N |
| `interaction` 🔎 | `client_id`, `contact_id null`, `kind` (`whatsapp·call·email·meeting·message·note`), `occurred_at`, `summary_md`, `next_step`, `next_step_due date null` | Adjuntos vía `file_attachment` |
| `opportunity` 🔎 | `client_id`, `title`, `stage` (`new·contacted·meeting·proposal_sent·negotiation·won·lost`), `value_amount`, `value_currency`, `probability int`, `expected_close date`, `next_action`, `next_action_due date`, `lost_reason`, `won_at`, `lost_at` | N–N con `service` (`opportunity_service`); 1–N `quote` |

## 5. Proyectos y tareas (M03)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `project` 🔎 | `name`, `space_id`, `client_id null`, `kind`, `goal`, `definition_of_done`, `status` (`idea·planning·in_progress·paused·blocked·done·archived`), `priority`, `start_date`, `target_date`, `delivered_date`, `next_action`, `owner_id`, `template_id null`, `progress int` (calculado), `last_activity_at` | 1–N `project_phase`, `task`, `decision`, `blocker`, `deliverable`, `changelog_entry`; N–N `repository`, `site` |
| `project_phase` | `project_id`, `name`, `sort`, `status`, `due_date` | |
| `task` 🔎 | `title`, `description_md`, `space_id`, `project_id null`, `phase_id null`, `parent_task_id null` (1 nivel), `status` (`todo·doing·waiting·done·cancelled`), `priority` (1–4), `due_at timestamptz null`, `due_date date null`, `rrule null`, `estimate_minutes`, `assignee_type` (`user·agent·client`), `assignee_id`, `completed_at`, `sort` | Checklist en `task_checklist_item` |
| `task_checklist_item` | `task_id`, `text`, `done`, `sort` | |
| `focus_pick` | `user_id`, `date`, `task_id`, `slot` (1–3), `suggested bool` | Foco de hoy |
| `focus_session` | `user_id`, `task_id`, `started_at`, `ended_at`, `minutes` | Modo foco |
| `blocker` | `project_id`, `waiting_for`, `revisit_on date`, `resolved_at` | |
| `decision` 🔎 | `project_id`, `title`, `rationale_md`, `decided_on date`, `approved_by` | |
| `deliverable` | `project_id`, `title`, `due_date`, `status` (`pending·delivered·approved·changes_requested`), `approved_at`, `approved_by_contact_id` | |
| `changelog_entry` | `project_id`, `kind` (`auto·manual·release`), `title`, `body_md`, `version null` | |
| `project_template` | `name`, `kind`, `description`, `definition jsonb` (fases, tareas con desfase en días, checklist, preguntas, nota inicial) | Seed con 8 plantillas |
| `weekly_review` [F3] | `week` (ISO), `completed_at`, `note_id`, `answers jsonb` | |

## 6. Servicios y presupuestos (M04)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `service` 🔎 | `name`, `description_md`, `deliverables_md`, `unit` (`project·hour·month·page·product·item`), `price_ars null`, `price_usd null`, `project_template_id null`, `active` | |
| `quote` 🔎 | `number` ('P-2026-0001', único), `client_id`, `contact_id`, `opportunity_id null`, `title`, `current_version_id`, `status` (`draft·sent·viewed·accepted·rejected·expired·void`), `sent_at`, `viewed_at`, `decided_at`, `public_token_hash null` [F2], `public_expires_at` [F2] | 1–N `quote_version` |
| `quote_version` | `quote_id`, `version int`, `currency`, `exchange_rate_ref null`, `issue_date`, `valid_until`, `intro_md`, `scope_md`, `exclusions_md`, `terms_md`, `payment_plan jsonb` (`{kind: single·milestones·monthly, items:[...]}`), `global_discount_type` (`percent·amount·none`), `global_discount_value`, `subtotal`, `discount_total`, `total`, `locked_at`, `pdf_file_id` | Inmutable una vez enviado |
| `quote_item` | `quote_version_id`, `service_id null`, `description`, `quantity numeric`, `unit`, `unit_price`, `discount_type`, `discount_value`, `line_total`, `sort` | |
| `quote_template` | `name`, `intro_md`, `scope_md`, `exclusions_md`, `terms_md`, `default_items jsonb`, `default_valid_days` | |
| `quote_decision` [F2] | `quote_id`, `version_id`, `decision`, `signer_name`, `ip`, `user_agent`, `at` | Aceptación pública |

## 7. Finanzas (M05)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `ledger` | `name` (Agencia/Personal), `space_id` | |
| `account` | `ledger_id`, `name`, `kind` (`cash·bank·wallet·usd·other`), `currency`, `opening_balance`, `opening_date` | |
| `category` | `ledger_id null`, `parent_id null`, `name`, `kind` (`income·expense`) | Seed con categorías iniciales |
| `transaction` 🔎 | `ledger_id`, `account_id`, `kind` (`income·expense·transfer`), `date`, `amount`, `currency`, `exchange_rate null`, `rate_base_currency null`, `category_id`, `client_id null`, `project_id null`, `counterpart`, `description`, `transfer_pair_id null`, `receivable_id null`, `payable_id null`, `subscription_id null` | Comprobante vía `file_attachment` |
| `subscription` | `ledger_id`, `vendor`, `description`, `amount`, `currency`, `frequency` (`monthly·yearly·custom`), `rrule`, `next_due date`, `account_id`, `notify_days_before`, `status` (`active·paused·cancelled`) | |
| `receivable` | `client_id`, `project_id null`, `quote_id null`, `concept`, `amount`, `currency`, `due_date`, `status` (`pending·partial·paid·overdue·void`), `paid_amount` | |
| `payable` | `ledger_id`, `counterpart`, `concept`, `amount`, `currency`, `due_date`, `status` | |
| `payment_receipt` [F3] | `receivable_id`, `transaction_id`, `number`, `pdf_file_id` | Leyenda "no válido como factura" |
| `time_entry` [F3, opcional] | `project_id`, `task_id null`, `user_id`, `minutes`, `date`, `billable`, `rate` | |

## 8. Website Factory y activos (M06)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `site` 🔎 | `client_id`, `project_id null`, `name`, `kind` (`institutional·landing·store·catalog·b2b·blog·app`), `stack`, `publication_status` (`building·staging·ready·live·maintenance`), `prod_url`, `staging_url`, `docs_note_id` | 1–N `site_environment`, `site_page`, `revision_round`, `launch_check`; N–N `repository` |
| `site_environment` | `site_id`, `kind` (`prod·staging`), `url`, `hosting_id`, `php_version`, `wp_version`, `last_seen_at` | |
| `site_brief` | `site_id`, `answers jsonb` (por tipo de sitio), `questions_for_client jsonb`, `version int` | |
| `site_requirement` | `site_id`, `title`, `moscow` (`must·should·could·wont`), `acceptance_md`, `status` | |
| `site_blueprint` | `site_id`, `version int`, `tree jsonb` (páginas → secciones → slots), `source` (`manual·template·agent`), `is_current` | **Independiente de la tecnología** (base para IA) |
| `content_slot` | `site_id`, `blueprint_version`, `page_key`, `section_key`, `slot_key`, `kind`, `status` (`pending·draft·review·approved·published`), `assignee_type/id`, `body_md`, `file_ids uuid[]` | |
| `revision_round` | `site_id`, `number`, `status` (`open·closed`), `opened_at`, `closed_at` | 1–N `revision_item` |
| `revision_item` | `round_id`, `page_ref`, `description`, `screenshot_file_id`, `priority`, `status`, `assignee` | |
| `launch_check` | `site_id`, `area`, `item`, `owner_type`, `status` (`todo·done·na`), `evidence_md` | Desde la plantilla de 17 áreas |
| `domain` | `name` (único), `client_id`, `registrar`, `holder`, `expires_on`, `auto_renew`, `dns_ref`, `credential_ref_id null` | |
| `hosting` | `provider`, `plan`, `client_id null`, `expires_on`, `location`, `credential_ref_id null` | |
| `certificate` | `kind` (`ssl·arca·other`), `subject`, `expires_on`, `site_id null`, `notes` | ARCA de Librería Uno: 27/10/2028 |
| `credential_ref` | `label`, `vault` ('bitwarden'), `item_path` (texto), `notes` | **Nunca contraseñas** |
| `uptime_check` [F4] | `site_environment_id`, `checked_at`, `status_code`, `ok`, `latency_ms`, `error` | Particionada por mes |
| `own_product` 🔎 | `name` (LibreríaOS Fiscal…), `kind` (`wp_plugin·php_panel·tool·app`), `repository_id` | |
| `own_product_version` | `product_id`, `version` (semver), `released_at`, `changelog_md`, `artifact_file_id` (zip) | |
| `installation` | `product_id`, `version_id`, `site_id`, `config_ref_md`, `installed_at`, `status` | Qué versión hay en qué cliente |

## 9. SEO Auditor (M07) [F4]

| Tabla | Campos clave |
|---|---|
| `seo_audit` | `site_id null`, `root_url`, `config jsonb` (límites), `status` (`queued·running·completed·failed·cancelled`), `started_at`, `finished_at`, `pages_crawled`, `score int`, `score_formula_version`, `summary jsonb`, `report_file_id` |
| `seo_page` | `audit_id`, `url`, `status_code`, `redirect_to`, `title`, `meta_description`, `h1 text[]`, `canonical`, `robots_meta`, `indexable bool`, `depth`, `word_count`, `size_bytes`, `ttfb_ms`, `structured_data jsonb`, `og jsonb` |
| `seo_link` | `audit_id`, `from_url`, `to_url`, `internal bool`, `status_code`, `anchor`, `nofollow` |
| `seo_issue` | `audit_id`, `code` (por ejemplo `missing_meta_description`), `category`, `severity`, `url`, `details jsonb`, `fingerprint` (para comparar entre auditorías) |
| `seo_lighthouse` | `audit_id`, `url`, `strategy` (`mobile·desktop`), `performance`, `accessibility`, `best_practices`, `seo`, `lab_metrics jsonb`, `raw_file_id` |
| `seo_field_metrics` | `audit_id`, `url_or_origin`, `form_factor`, `lcp_p75`, `inp_p75`, `cls_p75`, `has_data bool`, `collected_at` |
| `seo_schedule` | `site_id`, `cron`, `config jsonb`, `active` |

## 10. Biblioteca (M08) [F2]

| Tabla | Campos clave |
|---|---|
| `folder` | `parent_id null`, `name`, `client_id null`, `project_id null` |
| `file` 🔎 | `folder_id null`, `name`, `mime`, `size`, `storage_key`, `sha256`, `width`, `height`, `kind` (`image·logo·document·pdf·video·archive·font·other`), `client_id`, `project_id`, `site_id`, `description`, `origin` (`upload·generated·import`), `current_version int` |
| `file_version` | `file_id`, `version`, `storage_key`, `size`, `sha256`, `uploaded_by` |
| `file_attachment` | `file_id`, `entity_type`, `entity_id` |
| `brand_kit` | `client_id`, `colors jsonb`, `fonts jsonb`, `logo_file_ids uuid[]`, `guidelines_file_id` |
| `reusable_template` 🔎 | `kind` (`document·snippet·prompt·checklist`), `name`, `body_md`, `vars jsonb` |

## 11. Automatizaciones (M09) [F4]

| Tabla | Campos clave |
|---|---|
| `automation_rule` | `name`, `trigger_kind` (`event·schedule`), `event_type`, `cron`, `conditions jsonb`, `actions jsonb[]`, `active`, `requires_approval bool`, `template_key null` |
| `automation_run` | `rule_id`, `event_id null`, `status` (`running·succeeded·failed·skipped·waiting_approval`), `input jsonb`, `output jsonb`, `error`, `attempt`, `started_at`, `finished_at`; único (`rule_id`, `event_id`) para idempotencia |
| `webhook_endpoint` | `direction` (`in·out`), `name`, `url`, `secret_enc`, `events text[]`, `active` |
| `webhook_delivery` | `endpoint_id`, `event_id`, `status_code`, `attempt`, `response_excerpt`, `at` |
| `integration` | `provider` (`github·brevo·google·wordpress·anthropic·openai·google_ai·ollama`), `config jsonb`, `secret_enc bytea`, `status`, `last_ok_at`, `last_error` |

## 12. IA (M10) [MCP en el MVP; agentes en F5]

| Tabla | Campos clave |
|---|---|
| `mcp_token` (vía `apikey` de Better Auth) | `name`, `scopes text[]`, `last_used_at`, `expires_at` |
| `ai_provider_config` | `provider`, `default_model`, `enabled`, `monthly_budget_usd`, `integration_id` |
| `agent` | `key` (`business·pm·web_architect·content·seo·qa·code_reviewer·research·repo`), `name`, `enabled`, `model_provider`, `model_id`, `fallback_model`, `system_prompt_version`, `tools text[]`, `permission_level` (`read·propose·execute_with_approval`), `max_steps`, `timeout_s`, `budget_per_run_usd`, `monthly_budget_usd` |
| `agent_run` | `agent_id`, `trigger` (`manual·automation·schedule·mcp`), `input jsonb`, `status` (`queued·running·waiting_approval·succeeded·failed·cancelled·budget_exceeded`), `output_md`, `output_entities jsonb`, `tokens_in`, `tokens_out`, `cost_usd`, `model_used`, `error_code`, `error_message`, `started_at`, `finished_at`, `parent_run_id null` |
| `agent_step` | `run_id`, `index`, `kind` (`model·tool·approval`), `tool_name`, `input jsonb` (redactado), `output jsonb` (resumido), `latency_ms`, `tokens`, `error` |
| `agent_eval_case` | `agent_id`, `name`, `input jsonb`, `expectations jsonb` |

## 13. Repositorios (M11) [MVP]

| Tabla | Campos clave |
|---|---|
| `github_installation` | `installation_id`, `account_login`, `account_type`, `permissions jsonb` |
| `repository` 🔎 | `github_id` (único), `full_name`, `name`, `description`, `private`, `default_branch`, `topics text[]`, `archived`, `pushed_at`, `language`, `scope` (`prod·cli·int·tpl·per·edu`), `client_id null`, `project_id null`, `product_id null`, `health_score int`, `last_synced_at` |
| `repo_check` | `repository_id`, `check_key`, `status` (`pass·warn·fail`), `details jsonb`, `checked_at` |
| `repo_plan` | `name`, `status` (`draft·pending_approval·approved·executing·done·failed`), `created_by_type/id`, `summary_md` |
| `repo_plan_action` | `plan_id`, `repository_id null`, `kind` (`rename·set_topics·set_description·add_file·archive·transfer·create_repo·enable_security·protect_branch`), `params jsonb`, `status`, `result jsonb`, `executed_at` |
| `repo_event` | `repository_id`, `kind` (`push·pr·release·issue`), `payload_excerpt jsonb`, `at` |

## 14. Conocimiento y Facultad (M12–M13) [F3]

| Tabla | Campos clave |
|---|---|
| `note` 🔎 | `title`, `slug`, `space_id`, `folder_path`, `body_md`, `frontmatter jsonb`, `is_daily`, `daily_date`, `aliases text[]`, `word_count`, `last_opened_at` |
| `note_version` | `note_id`, `body_md`, `frontmatter`, `created_at` (cada 5 minutos de edición o al cerrar) |
| `note_template` | `name`, `body_md` |
| `graph_layout` | `view_key`, `positions jsonb` (id → x,y[,z]), `computed_at`, `node_count` |
| `import_job` | `kind` (`obsidian·csv_clients·csv_transactions`), `status`, `stats jsonb` (notas, enlaces, adjuntos, errores), `report_md` |
| `course` 🔎 | `name`, `program`, `term`, `commission`, `schedule jsonb`, `status`, `final_grade`, `space_id` |
| `assessment` | `course_id`, `kind`, `date`, `topics_md`, `target_grade`, `grade` |

## 15. Diagrama de relaciones principales

```
workspace ─┬─ space ─┬─ project ─┬─ project_phase ─ task ─ task_checklist_item
           │         │           ├─ decision · blocker · deliverable · changelog_entry
           │         │           └─ (N–N) repository · site
           │         ├─ task · note · transaction(ledger)
           ├─ client ─┬─ client_contact ─ contact
           │          ├─ interaction · opportunity ─ quote ─ quote_version ─ quote_item ─ service
           │          ├─ receivable ─ transaction ─ account ─ ledger
           │          ├─ site ─┬─ site_brief · site_blueprint · content_slot · revision_round · launch_check
           │          │        ├─ site_environment ─ hosting · domain · certificate
           │          │        └─ installation ─ own_product_version ─ own_product ─ repository
           │          └─ brand_kit · file
           ├─ link (cualquier entidad ↔ cualquier entidad) ──► Cerebro
           ├─ domain_event → activity · notification · automation_run · agent_run
           └─ approval (propuestas de agentes, de repositorios y emails a clientes)
```

## 16. Seed inicial (solo estructura, **sin datos inventados**)

- Workspace, usuario owner, espacios (Agencia, Personal, Facultad), ledgers (Agencia, Personal) y categorías iniciales.
- 8 plantillas de proyecto, plantilla de checklist de lanzamiento (17 áreas), 1 plantilla de presupuesto base y plantillas de estructura de sitio por tipo.
- Definiciones de agentes (deshabilitados hasta la F5).
- **Carga real de datos de Luciano** (clientes y proyectos de `contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md`, tabla A4): **script de importación revisado por Luciano antes de ejecutarlo en producción**. Datos sin confirmar (montos, fechas de suscripciones) no se cargan: quedan como tareas "Completar…" en la Bandeja.

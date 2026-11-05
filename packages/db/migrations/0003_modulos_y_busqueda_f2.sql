-- Índices de búsqueda para las entidades nuevas (mismo esquema que 0001).
CREATE INDEX IF NOT EXISTS site_search_trgm ON site USING gin (public.f_search_norm(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS file_search_trgm ON file USING gin (public.f_search_norm(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS repository_search_trgm ON repository USING gin (public.f_search_norm(full_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS domain_search_trgm ON domain USING gin (public.f_search_norm(name) gin_trgm_ops);
--> statement-breakpoint
-- Habilita los módulos de la segunda vuelta en los workspaces existentes (se pueden apagar en Configuración → Módulos).
UPDATE workspace SET enabled_modules = (
  SELECT array_agg(DISTINCT m) FROM unnest(enabled_modules || ARRAY['sites','assets','library','seo','automations','repos','review']) AS m
);

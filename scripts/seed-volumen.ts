/**
 * Datos de volumen para medir consultas e índices (docs/SCALING.md).
 *
 *   DATABASE_URL=postgres://…/agencyos_vol pnpm seed:volumen [--escala 1]
 *
 * Crea UN workspace nuevo ("Volumen") con su dueño `volumen@agencyos.local` (2FA marcado, sin contraseña: el
 * test de carga entra con una sesión creada por base) y, con escala 1:
 *   500 clientes · 1.000 proyectos · 50.000 tareas · 20.000 movimientos · 100.000 domain_event · 100.000 activity
 *   5.000 notas (+10.000 enlaces) · 5.000 notificaciones · 20.000 auditoría · 2.000 oportunidades · 5.000 interacciones
 * Todo se genera con `generate_series` (segundos, no minutos). NUNCA correr contra producción: se niega si la URL no
 * contiene "test", "vol" o "e2e".
 */
import { getDb, getPool, schema, uuidv7 } from "@agencyos/db";
import { seedStructure } from "@agencyos/modules/setup/service";
import { eq } from "drizzle-orm";
import { VOLUME_EMAIL } from "./seed-volumen-const";

process.env.AGENCYOS_ROLE ??= "script";
const url = process.env.DATABASE_URL ?? "";
if (!/test|vol|e2e/.test(url)) {
  console.error("seed-volumen: DATABASE_URL debe apuntar a una base de prueba (test/vol/e2e).");
  process.exit(1);
}
const scaleArg = process.argv.indexOf("--escala");
const SCALE = scaleArg > 0 ? Number(process.argv[scaleArg + 1] ?? 1) : 1;
const n = (x: number) => Math.max(1, Math.round(x * SCALE));

async function main() {
  const db = getDb();
  const pool = getPool();
  const t0 = Date.now();
  const existing = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, VOLUME_EMAIL));
  if (existing.length) {
    console.log("seed-volumen: ya existe el usuario de volumen; nada que hacer (borrá la base para regenerar).");
    return;
  }
  const userId = `u_${uuidv7()}`;
  await db.insert(schema.user).values({ id: userId, name: "Volumen", email: VOLUME_EMAIL, emailVerified: true, twoFactorEnabled: true });
  const [ws] = await db
    .insert(schema.workspace)
    .values({
      name: "Volumen",
      slug: `volumen-${uuidv7()}`,
      enabledModules: ["inbox", "crm", "projects", "quotes", "finance", "notes", "brain", "calendar", "study"],
    })
    .returning();
  if (!ws) throw new Error("workspace");
  await db.insert(schema.membership).values({ workspaceId: ws.id, userId, role: "owner" });
  const { spaces, ledgers } = await db.transaction((t) => seedStructure(t, ws.id, userId));
  const W = ws.id;
  const space = spaces.find((s) => s.kind === "agency")?.id ?? spaces[0]?.id;
  const ledger = ledgers[0]?.id;
  const [acc] = await db.select({ id: schema.moneyAccount.id }).from(schema.moneyAccount).where(eq(schema.moneyAccount.workspaceId, W)).limit(1);
  const accountId =
    acc?.id ??
    (
      await db
        .insert(schema.moneyAccount)
        .values({ workspaceId: W, ledgerId: ledger as string, name: "Caja", openingDate: "2024-01-01" })
        .returning({ id: schema.moneyAccount.id })
    )[0]?.id;

  const q = async (label: string, text: string, values: unknown[] = []) => {
    const s = Date.now();
    const r = await pool.query(text, values);
    console.log(`  ${label}: ${r.rowCount ?? 0} filas (${Date.now() - s} ms)`);
  };
  await pool.query("select setseed(0.42)");

  console.log(`seed-volumen: workspace ${W} (escala ${SCALE})`);
  await q(
    "clientes",
    `insert into client (id, workspace_id, name, industry, city, status, relationship, space_id, last_activity_at, created_at, updated_at)
     select gen_random_uuid(), $1, 'Cliente ' || g, (array['Gastronomía','Salud','Comercio','Industria','Educación'])[1 + g % 5],
            (array['Córdoba','Rosario','CABA','Mendoza'])[1 + g % 4],
            (array['prospect','active','active','paused','finished','archived'])[1 + g % 6], 'external', $2,
            now() - (g || ' hours')::interval, now() - (g || ' days')::interval, now()
     from generate_series(1, $3) g`,
    [W, space, n(500)],
  );
  await q(
    "proyectos",
    `insert into project (id, workspace_id, name, space_id, client_id, kind, status, priority, next_action, target_date, last_activity_at, created_at, updated_at)
     select gen_random_uuid(), $1, 'Proyecto ' || g, $2, c.id, 'website',
            s.status, 1 + g % 4, case when s.status = 'in_progress' then 'Seguir' end,
            current_date + (g % 120 - 30), now() - (g || ' minutes')::interval, now() - (g || ' days')::interval, now()
     from generate_series(1, $3) g
     cross join lateral (select (array['idea','planning','in_progress','paused','blocked','done','done','done'])[1 + g % 8] as status) s
     left join lateral (select id from client where workspace_id = $1 order by id offset (g % $4) limit 1) c on true`,
    [W, space, n(1000), n(500)],
  );
  await q(
    "tareas",
    `with p as (select array_agg(id order by id) as ids from project where workspace_id = $1)
     insert into task (id, workspace_id, title, space_id, project_id, status, priority, due_date, completed_at, deleted_at, created_at, updated_at)
     select gen_random_uuid(), $1, 'Tarea ' || g || ' ' || (array['diseño','contenido','SEO','deploy','reunión','factura'])[1 + g % 6], $2,
            case when g % 5 = 0 then null else p.ids[1 + g % $4] end,
            st.status, 1 + g % 4,
            case when g % 7 = 0 then null else current_date + ((g % 730) - 365) end,
            case when st.status = 'done' then now() - ((g % 900) || ' hours')::interval end,
            case when g % 50 = 0 then now() - interval '2 days' end,
            now() - ((g % 1000) || ' hours')::interval, now()
     from p, generate_series(1, $3) g
     cross join lateral (select case when g % 10 < 7 then 'done' else (array['todo','doing','waiting'])[1 + g % 3] end as status) st`,
    [W, space, n(50_000), n(1000)],
  );
  await q(
    "movimientos",
    `insert into transaction (id, workspace_id, ledger_id, account_id, kind, date, amount, currency, description, created_at, updated_at)
     select gen_random_uuid(), $1, $2, $3, case when g % 3 = 0 then 'expense' else 'income' end,
            current_date - (g % 1095), (1000 + (g * 37) % 90000)::numeric(14,2), 'ARS', 'Movimiento ' || g, now(), now()
     from generate_series(1, $4) g`,
    [W, ledger, accountId, n(20_000)],
  );
  await q(
    "domain_event",
    `insert into domain_event (id, workspace_id, type, entity_type, entity_id, actor_type, actor_id, payload, occurred_at, dispatched_at)
     select gen_random_uuid(), $1, 'tarea.actualizada', 'task', gen_random_uuid(), 'user', $2, '{}'::jsonb,
            now() - (g || ' seconds')::interval, case when g > 200 then now() - (g || ' seconds')::interval end
     from generate_series(1, $3) g`,
    [W, userId, n(100_000)],
  );
  await q(
    "activity",
    `with p as (select array_agg(id order by id) as ids from project where workspace_id = $1)
     insert into activity (id, workspace_id, entity_type, entity_id, verb, summary, actor_type, actor_id, actor_name, occurred_at)
     select gen_random_uuid(), $1, 'project', p.ids[1 + g % $4], 'proyecto.actualizado', 'Actualizó el proyecto ' || g,
            'user', $2, 'Volumen', now() - (g || ' seconds')::interval
     from p, generate_series(1, $3) g`,
    [W, userId, n(100_000), n(1000)],
  );
  await q(
    "notas",
    `insert into note (id, workspace_id, title, slug, space_id, folder_path, body_md, word_count, created_at, updated_at)
     select gen_random_uuid(), $1, 'Nota ' || g, 'nota-' || g, $2, (array['Clientes','Procesos','Ideas',null])[1 + g % 4],
            repeat('Texto de la nota ' || g || ' sobre diseño web, posicionamiento y procesos de la agencia. ', 30) || ' [[Nota ' || (1 + (g * 7) % $3) || ']]',
            300, now() - (g || ' hours')::interval, now() - (g || ' minutes')::interval
     from generate_series(1, $3) g`,
    [W, space, n(5_000)],
  );
  await q(
    "enlaces entre notas",
    `with nn as (select id, row_number() over (order by id) as rn, count(*) over () as total from note where workspace_id = $1)
     insert into link (id, workspace_id, from_type, from_id, to_type, to_id, kind)
     select gen_random_uuid(), $1, 'note', a.id, 'note', b.id, 'wikilink'
     from nn a cross join generate_series(0, 1) k
     join nn b on b.rn = 1 + (a.rn * 7 + k) % a.total
     on conflict do nothing`,
    [W],
  );
  await q(
    "notificaciones",
    `insert into notification (id, workspace_id, user_id, type, title, read_at, created_at)
     select gen_random_uuid(), $1, $2, 'presupuesto.aceptado', 'Notificación ' || g, case when g > 20 then now() end, now() - (g || ' minutes')::interval
     from generate_series(1, $3) g`,
    [W, userId, n(5_000)],
  );
  await q(
    "auditoría",
    `insert into audit_log (id, workspace_id, actor_type, actor_id, action, target_type, target_id, at)
     select gen_random_uuid(), $1, 'user', $2, 'tarea.actualizada', 'task', gen_random_uuid()::text, now() - (g || ' minutes')::interval
     from generate_series(1, $3) g`,
    [W, userId, n(20_000)],
  );
  await q(
    "oportunidades",
    `with c as (select array_agg(id order by id) as ids from client where workspace_id = $1)
     insert into opportunity (id, workspace_id, client_id, title, stage, created_at, updated_at)
     select gen_random_uuid(), $1, c.ids[1 + g % $3], 'Oportunidad ' || g,
            (array['new','contacted','meeting','proposal_sent','negotiation','won','lost'])[1 + g % 7], now(), now()
     from c, generate_series(1, $2) g`,
    [W, n(2_000), n(500)],
  );
  await q(
    "interacciones",
    `with c as (select array_agg(id order by id) as ids from client where workspace_id = $1)
     insert into interaction (id, workspace_id, client_id, kind, occurred_at, summary_md, created_at, updated_at)
     select gen_random_uuid(), $1, c.ids[1 + g % $3], 'call', now() - (g || ' hours')::interval, 'Llamada ' || g, now(), now()
     from c, generate_series(1, $2) g`,
    [W, n(5_000), n(500)],
  );
  await pool.query("analyze");
  console.log(`seed-volumen: listo en ${((Date.now() - t0) / 1000).toFixed(1)} s · usuario ${VOLUME_EMAIL} · workspace ${W}`);
}

main()
  .then(() => getPool().end())
  .catch(async (e) => {
    console.error(e);
    await getPool().end();
    process.exit(1);
  });

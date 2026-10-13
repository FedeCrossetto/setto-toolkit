/**
 * SQL por tabla para "completar la base de datos" de Supabase. Es el mismo esquema que
 * `supabase/migrations/001_gastos_schema.sql` + `002_gastos_variables.sql`, pero partido por
 * tabla e idempotente (políticas con `if not exists`), para poder ofrecer sólo lo que falta.
 * `schema-sql.test.ts` verifica que las columnas sigan en línea con las migraciones.
 */

export const SUPABASE_TABLES = ['servicios', 'pagos', 'gastos', 'credenciales', 'queries'] as const
export type SupabaseTable = (typeof SUPABASE_TABLES)[number]

function policy(table: string): string {
  return `alter table public.${table} enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = '${table}' and policyname = '${table}_service_only') then
    create policy "${table}_service_only" on public.${table} for all using (false);
  end if;
end $$;`
}

export const TABLE_SQL: Record<SupabaseTable, string> = {
  servicios: `create table if not exists public.servicios (
  id            text primary key,
  nombre        text not null,
  emoji         text not null default '',
  numero_cuenta text,
  categoria     text not null default '',
  activo        boolean not null default true,
  orden         integer not null default 0,
  updated_at    timestamptz not null default now()
);
${policy('servicios')}`,

  pagos: `create table if not exists public.pagos (
  id           text primary key,
  servicio_id  text not null references public.servicios (id) on delete cascade,
  mes          text not null,
  monto        numeric not null default 0,
  fecha        text,
  metodo_pago  text,
  pagado       boolean not null default false,
  notas        text,
  updated_at   timestamptz not null default now()
);
create index if not exists pagos_servicio_id_idx on public.pagos (servicio_id);
create index if not exists pagos_mes_idx on public.pagos (mes);
${policy('pagos')}`,

  gastos: `create table if not exists public.gastos (
  id           text primary key,
  fecha        date not null,
  monto        numeric not null default 0,
  descripcion  text not null default '',
  categoria    text not null default 'Otro',
  metodo_pago  text not null default '',
  moneda       text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists gastos_fecha_idx on public.gastos (fecha);
create index if not exists gastos_updated_at_idx on public.gastos (updated_at);
${policy('gastos')}`,

  credenciales: `create table if not exists public.credenciales (
  id            text primary key,
  nombre        text not null,
  usuario       text not null default '',
  password_enc  text not null default '',
  url           text,
  notas         text,
  categoria     text,
  orden         integer not null default 0,
  updated_at    timestamptz not null default now()
);
${policy('credenciales')}`,

  queries: `create table if not exists public.queries (
  id           text primary key,
  motor        text not null default 'Otro',
  descripcion  text not null,
  query        text not null default '',
  tags         text[] not null default '{}',
  orden        integer not null default 0,
  updated_at   timestamptz not null default now()
);
${policy('queries')}`,
}

/** SQL para crear todas las tablas faltantes (en orden de dependencias); '' si no falta ninguna. */
export function buildMissingSql(tables: Record<SupabaseTable, boolean>): string {
  // SUPABASE_TABLES ya está en orden de dependencias (`pagos` referencia a `servicios`).
  const missing = SUPABASE_TABLES.filter((t) => !tables[t])
  if (!missing.length) return ''
  const parts = missing.map((t) => `-- ── ${t} ──\n${TABLE_SQL[t]}`)
  return [
    '-- Setto — tablas faltantes en Supabase. Pegar en SQL Editor y ejecutar (es idempotente).',
    ...parts,
    "-- Que PostgREST vea las tablas nuevas sin esperar el refresco automático.\nnotify pgrst, 'reload schema';",
  ].join('\n\n') + '\n'
}

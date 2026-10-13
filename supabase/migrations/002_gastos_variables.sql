-- Setto Toolkit — gastos variables (ad-hoc: "1500 super efectivo")
-- Aditiva: no toca las tablas existentes. Correr en Supabase SQL Editor
-- (Dashboard → SQL → New query). Es idempotente.

create table if not exists public.gastos (
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

-- ── RLS (igual que el resto: la app de escritorio usa service_role desde main) ─

alter table public.gastos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'gastos' and policyname = 'gastos_service_only'
  ) then
    create policy "gastos_service_only" on public.gastos for all using (false);
  end if;
end $$;

-- Que PostgREST vea la tabla nueva sin esperar el refresco automático.
notify pgrst, 'reload schema';

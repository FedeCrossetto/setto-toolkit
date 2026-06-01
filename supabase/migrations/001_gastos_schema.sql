-- Setto Toolkit — gastos / credenciales / queries
-- Run in Supabase SQL Editor (Dashboard → SQL → New query) on a new project.

create extension if not exists "pgcrypto";

-- ── Servicios ────────────────────────────────────────────────────────────────

create table if not exists public.servicios (
  id            text primary key,
  nombre        text not null,
  emoji         text not null default '',
  numero_cuenta text,
  categoria     text not null default '',
  activo        boolean not null default true,
  orden         integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- ── Pagos mensuales ──────────────────────────────────────────────────────────

create table if not exists public.pagos (
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

-- ── Credenciales (password_enc = safeStorage ciphertext, base64) ─────────────

create table if not exists public.credenciales (
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

-- ── Queries SQL ──────────────────────────────────────────────────────────────

create table if not exists public.queries (
  id           text primary key,
  motor        text not null default 'Otro',
  descripcion  text not null,
  query        text not null default '',
  tags         text[] not null default '{}',
  orden        integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- ── RLS (desktop app uses service_role from main process — restrict in production) ─

alter table public.servicios enable row level security;
alter table public.pagos enable row level security;
alter table public.credenciales enable row level security;
alter table public.queries enable row level security;

-- Service role bypasses RLS. For anon/authenticated clients, deny by default:
create policy "servicios_service_only" on public.servicios for all using (false);
create policy "pagos_service_only" on public.pagos for all using (false);
create policy "credenciales_service_only" on public.credenciales for all using (false);
create policy "queries_service_only" on public.queries for all using (false);

-- Setto Toolkit — sincronización de Notas y Snippets entre equipos.
-- Aditiva: no toca las tablas existentes. Correr en Supabase SQL Editor
-- (Dashboard → SQL → New query). Es idempotente.
--
-- Una fila por ítem: kind = 'note' | 'snippet' | 'snippet-collection'.
-- `hash` identifica la versión; `deleted` = lápida (se borró en algún equipo).

create table if not exists public.setto_sync (
  kind        text    not null check (kind in ('note', 'snippet', 'snippet-collection')),
  id          text    not null,
  payload     jsonb,
  hash        text    not null,
  updated_at  bigint  not null,
  deleted     boolean not null default false,
  device      text,
  primary key (kind, id)
);

-- ── RLS (igual que el resto: la app de escritorio usa service_role desde main) ─

alter table public.setto_sync enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'setto_sync' and policyname = 'setto_sync_service_only'
  ) then
    create policy "setto_sync_service_only" on public.setto_sync for all using (false);
  end if;
end $$;

notify pgrst, 'reload schema';

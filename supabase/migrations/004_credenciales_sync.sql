-- Setto Toolkit — Claves: contraseñas sincronizadas con cifrado de extremo a extremo.
-- Aditiva e idempotente. Correr en Supabase SQL Editor (Dashboard → SQL → New query).
--
-- password_e2e: AES-256-GCM con una clave derivada (scrypt) de la contraseña maestra,
--               formato v1:salt:iv:tag:ct. Supabase nunca ve la contraseña maestra.
-- vault_meta:   una fila ('default') con el salt, los parámetros de derivación y un valor
--               de verificación para saber si la contraseña maestra es correcta.

alter table public.credenciales add column if not exists password_e2e text;

create table if not exists public.vault_meta (
  id           text        primary key default 'default',
  salt         text        not null,
  kdf          jsonb       not null,
  check_value  text        not null,
  updated_at   timestamptz not null default now()
);

alter table public.vault_meta enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vault_meta' and policyname = 'vault_meta_service_only'
  ) then
    create policy "vault_meta_service_only" on public.vault_meta for all using (false);
  end if;
end $$;

notify pgrst, 'reload schema';

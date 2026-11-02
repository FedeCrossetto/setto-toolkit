-- Setto Toolkit — Gastos: planes de pago (una factura pagada en 2 o 3 cuotas).
-- Aditiva e idempotente. Correr en Supabase SQL Editor (Dashboard → SQL → New query).
--
-- Cada cuota es un pago en el mes en que se paga. Las cuotas de un mismo plan comparten
-- plan_id; cuota_n / cuota_de dicen "cuota 2 de 3" y cuota_vence es su vencimiento ("DD/MM").
-- Los pagos comunes las dejan en null.

alter table public.pagos add column if not exists plan_id  text;
alter table public.pagos add column if not exists cuota_n  smallint;
alter table public.pagos add column if not exists cuota_de smallint;
alter table public.pagos add column if not exists cuota_vence text;

create index if not exists pagos_plan_id_idx on public.pagos (plan_id);

-- Que PostgREST vea las columnas nuevas sin esperar el refresco automático.
notify pgrst, 'reload schema';

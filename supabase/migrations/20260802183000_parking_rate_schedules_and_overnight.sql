alter table public.parking_rates
  add column if not exists regular_start_time time null,
  add column if not exists regular_end_time time null,
  add column if not exists overnight_end_time time null,
  add column if not exists overnight_flat_amount numeric(14,2) null;

alter table public.parking_rates drop constraint if exists parking_rates_overnight_flat_amount_check;
alter table public.parking_rates add constraint parking_rates_overnight_flat_amount_check
  check (overnight_flat_amount is null or overnight_flat_amount >= 0);

comment on column public.parking_rates.regular_start_time is 'Inicio diario del horario regular del estacionamiento.';
comment on column public.parking_rates.regular_end_time is 'Término diario del horario regular e inicio de la estadía nocturna.';
comment on column public.parking_rates.overnight_end_time is 'Término diario de la estadía nocturna.';
comment on column public.parking_rates.overnight_flat_amount is 'Valor único en CLP por cada período nocturno utilizado.';

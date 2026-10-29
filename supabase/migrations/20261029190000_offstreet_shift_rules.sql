-- Reglas de turnos por estacionamiento Off Street (SOL-2026-10-29-006).
-- Viven en parking_offstreet_settings (misma fila que la foto de patente y el
-- aviso de deuda). Valores iniciales = comportamiento anterior («como hoy»):
-- ningún estacionamiento cambia hasta que su administrador elija otra regla.
-- Idempotente.

alter table public.parking_offstreet_settings
  add column if not exists shift_start_window text not null default 'FREE',
  add column if not exists shift_expired_policy text not null default 'ALLOW',
  add column if not exists shift_on_demand_policy text not null default 'ALWAYS';

alter table public.parking_offstreet_settings drop constraint if exists parking_offstreet_settings_shift_start_window_check;
alter table public.parking_offstreet_settings add constraint parking_offstreet_settings_shift_start_window_check
  check (shift_start_window in ('FREE', '60', '30', '15', '0'));
alter table public.parking_offstreet_settings drop constraint if exists parking_offstreet_settings_shift_expired_policy_check;
alter table public.parking_offstreet_settings add constraint parking_offstreet_settings_shift_expired_policy_check
  check (shift_expired_policy in ('ALLOW', 'WARN', 'BLOCK'));
alter table public.parking_offstreet_settings drop constraint if exists parking_offstreet_settings_shift_on_demand_policy_check;
alter table public.parking_offstreet_settings add constraint parking_offstreet_settings_shift_on_demand_policy_check
  check (shift_on_demand_policy in ('ALWAYS', 'NO_PROGRAMMED', 'NEVER'));

comment on column public.parking_offstreet_settings.shift_start_window is
  'Inicio de turno programado: FREE sin restricción; 60/30/15 minutos antes; 0 solo desde la hora exacta.';
comment on column public.parking_offstreet_settings.shift_expired_policy is
  'Turno vencido: ALLOW sigue operando; WARN avisa; BLOCK sin ingresos y, si hay turno siguiente ya empezado, solo cerrar.';
comment on column public.parking_offstreet_settings.shift_on_demand_policy is
  'Turno a pedido: ALWAYS; NO_PROGRAMMED solo sin turno programado ese día; NEVER no permitido.';

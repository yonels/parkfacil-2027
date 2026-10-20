-- Boleta electrónica: RUT emisor de prueba (SOL-2026-10-20-001).
--
-- Decisión del usuario: en ambiente Prueba se puede emitir con el RUT de la
-- empresa de prueba de Haulmer (sus API Keys públicas de desarrollo solo emiten
-- con ese RUT; con otro responden OF-02 RUTEmisor). La aplicación SOLO lo usa
-- cuando environment = 'TEST'; en Producción siempre emite con el RUT de la empresa.

alter table public.company_dte_settings
  add column if not exists test_emitter_rut text null;

alter table public.company_dte_settings drop constraint if exists company_dte_settings_test_rut_check;
alter table public.company_dte_settings add constraint company_dte_settings_test_rut_check check (test_emitter_rut is null or test_emitter_rut ~ '^[0-9]{7,8}-[0-9K]$');

comment on column public.company_dte_settings.test_emitter_rut is 'RUT emisor solo para ambiente Prueba (empresa de prueba de Haulmer). Ignorado en Producción.';

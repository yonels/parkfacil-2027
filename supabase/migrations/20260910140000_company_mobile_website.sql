-- Teléfono móvil y sitio web de la empresa (campos pedidos en el formulario
-- de creación de empresa, encargo "ajustar flujo de creación de empresas"
-- 2026-09-10). No existían columnas equivalentes en companies -- ver
-- diagnóstico previo (companies.email/phone ya existían y se reutilizan tal
-- cual). Aditivo, sin tocar columnas existentes ni datos previos.
alter table public.companies
  add column if not exists mobile_phone text not null default '',
  add column if not exists website text not null default '';

comment on column public.companies.mobile_phone is
  'Teléfono móvil de contacto de la empresa, formato +56 9 XXXX XXXX. Opcional.';
comment on column public.companies.website is
  'URL del sitio web de la empresa (https://...). Opcional.';

-- Etapa 18: trazabilidad de envios de credenciales de abonados

create table if not exists public.abonado_credencial_envios (
  id uuid primary key default gen_random_uuid(),
  abonado_id uuid not null references public.abonados(id) on delete cascade,
  credencial_id uuid not null references public.abonado_credenciales(id) on delete cascade,
  destinatario text not null,
  asunto text,
  remitente text,
  proveedor text not null default 'microsoft_graph',
  estado text not null,
  error_codigo text,
  error_mensaje text,
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint abonado_credencial_envios_estado_check check (estado in ('pending','sent','failed'))
);

create index if not exists abonado_credencial_envios_abonado_id_idx on public.abonado_credencial_envios (abonado_id);
create index if not exists abonado_credencial_envios_credencial_id_idx on public.abonado_credencial_envios (credencial_id);
create index if not exists abonado_credencial_envios_destinatario_idx on public.abonado_credencial_envios (destinatario);
create index if not exists abonado_credencial_envios_created_at_idx on public.abonado_credencial_envios (created_at);
create index if not exists abonado_credencial_envios_estado_idx on public.abonado_credencial_envios (estado);

alter table public.abonado_credencial_envios enable row level security;

drop policy if exists abonado_credencial_envios_select_authenticated on public.abonado_credencial_envios;
create policy abonado_credencial_envios_select_authenticated
on public.abonado_credencial_envios
for select
to authenticated
using (true);

revoke all on table public.abonado_credencial_envios from anon;
grant select, insert, update, delete on table public.abonado_credencial_envios to service_role;
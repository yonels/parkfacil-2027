-- SOL-2026-11-12-004 («Consulte su boleta»), etapa 1, control C8: auditoría
-- de consultas. Se guarda el hash de la patente (nunca en claro) y el
-- número de resultados; sin dato personal, sin huella del navegador (esa
-- vive en el sitio www, no en esta plataforma). Solo service_role accede
-- (la API 2027 valida la x-parkfacil-service-key antes de escribir aquí).

create table if not exists public.public_receipt_queries (
  id uuid primary key default gen_random_uuid(),
  plate_hash text not null,
  result_count integer not null default 0 check (result_count >= 0),
  queried_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.public_receipt_queries is
  'Auditoría de «Consulte su boleta» (SOL-2026-11-12-004): patente con hash, nunca en claro.';

create index if not exists public_receipt_queries_plate_hash_idx
  on public.public_receipt_queries (plate_hash, queried_at desc);

alter table public.public_receipt_queries enable row level security;
revoke all on table public.public_receipt_queries from public, anon, authenticated;
grant select, insert on public.public_receipt_queries to service_role;

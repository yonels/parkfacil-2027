-- SOL-2026-11-12-004 («Consulte su boleta»), etapa 6, control C8:
-- auditoría de envíos por correo. El destinatario queda con hash, nunca
-- en claro -- igual criterio que public_receipt_queries (patente).
-- También sirve para el límite de 10 envíos por patente por día (sección
-- 3 de DISENO.md): se cuenta sobre esta misma tabla, sin tabla aparte.

create table if not exists public.public_receipt_sends (
  id uuid primary key default gen_random_uuid(),
  plate_hash text not null,
  email_hash text not null,
  stay_id uuid not null references public.parking_stays(id) on delete restrict,
  result text not null check (result in ('SENT', 'FAILED')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.public_receipt_sends is
  'Auditoría de envíos por correo de «Consulte su boleta» (SOL-2026-11-12-004): patente y correo con hash, nunca en claro.';

create index if not exists public_receipt_sends_plate_hash_idx
  on public.public_receipt_sends (plate_hash, sent_at desc);

alter table public.public_receipt_sends enable row level security;
revoke all on table public.public_receipt_sends from public, anon, authenticated;
grant select, insert on public.public_receipt_sends to service_role;

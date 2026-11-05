-- SOL-2026-11-04-013: activar o desactivar una empresa desde Root, con registro de
-- quién, cuándo y por qué. El cambio de estado y su registro ocurren en una sola transacción.
create table if not exists public.company_status_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  previous_status text not null,
  new_status text not null check (new_status in ('active', 'inactive')),
  reason_code text not null check (reason_code in ('UNPAID_INVOICES', 'PLATFORM_MISUSE', 'RULES_BREACH', 'REACTIVATION', 'OTHER')),
  reason_detail text check (reason_detail is null or char_length(reason_detail) <= 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists company_status_events_company_created_idx
  on public.company_status_events (company_id, created_at desc);

alter table public.company_status_events enable row level security;
revoke all on table public.company_status_events from public, anon, authenticated;
grant select on table public.company_status_events to service_role;

create or replace function public.set_company_service_status(
  p_company_id text,
  p_new_status text,
  p_reason_code text,
  p_reason_detail text,
  p_actor_id uuid,
  p_actor_email text
) returns public.company_status_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_event public.company_status_events%rowtype;
begin
  select * into v_company from public.companies where id = p_company_id for update;
  if not found then raise exception 'COMPANY_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_company.relationship_type <> 'client' then raise exception 'COMPANY_STATUS_NOT_MANAGEABLE' using errcode = 'P0001'; end if;
  if p_new_status not in ('active', 'inactive') or v_company.status not in ('active', 'inactive') then
    raise exception 'COMPANY_STATUS_NOT_MANAGEABLE' using errcode = 'P0001';
  end if;
  if v_company.status = p_new_status then raise exception 'COMPANY_STATUS_UNCHANGED' using errcode = 'P0001'; end if;

  update public.companies set status = p_new_status, updated_at = now() where id = p_company_id;
  insert into public.company_status_events (company_id, previous_status, new_status, reason_code, reason_detail, actor_id, actor_email)
  values (p_company_id, v_company.status, p_new_status, p_reason_code, nullif(btrim(coalesce(p_reason_detail, '')), ''), p_actor_id, p_actor_email)
  returning * into v_event;
  return v_event;
end;
$$;

revoke all on function public.set_company_service_status(text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_company_service_status(text, text, text, text, uuid, text) to service_role;

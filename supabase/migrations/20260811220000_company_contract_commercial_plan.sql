-- Modelo comercial inequívoco: empresa -> contrato -> versión de plan -> estacionamientos.
-- Nullable deliberadamente: no se infieren asignaciones desde companies.commercial_plan.
alter table public.company_contracts
  add column if not exists commercial_plan_version_id uuid null
  references public.commercial_plan_versions(id) on delete restrict;

create index if not exists company_contracts_plan_version_idx
  on public.company_contracts(commercial_plan_version_id)
  where commercial_plan_version_id is not null;

comment on column public.companies.commercial_plan is
  'Clasificación comercial legacy. No identifica commercial_plans ni puede utilizarse como fuente contractual o de precios.';
comment on column public.company_contracts.commercial_plan_version_id is
  'Versión de plan comercial asignada explícitamente al contrato. NULL significa sin plan asignado.';

create or replace function public.company_contract_plan_version_guard()
returns trigger language plpgsql as $$
declare version_currency text;
begin
  if new.commercial_plan_version_id is null then return new; end if;
  select currency into version_currency from public.commercial_plan_versions where id=new.commercial_plan_version_id;
  if version_currency is null then raise exception 'COMMERCIAL_PLAN_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  if version_currency<>new.currency then raise exception 'CONTRACT_PLAN_CURRENCY_MISMATCH' using errcode='23514'; end if;
  return new;
end $$;
create trigger company_contract_plan_version_guard before insert or update of commercial_plan_version_id,currency on public.company_contracts for each row execute function public.company_contract_plan_version_guard();

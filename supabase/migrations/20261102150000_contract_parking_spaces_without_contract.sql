-- Plazas contratadas sin contrato (SOL-2026-11-02-001): una empresa sin contrato puede
-- definirlas a mano. contract_id nulo significa ingreso manual; a lo más una fila manual
-- por estacionamiento (el unique existente no aplica a nulos).

alter table public.contract_parking_spaces alter column contract_id drop not null;

create unique index if not exists contract_parking_spaces_manual_parking_idx
  on public.contract_parking_spaces(parking_id)
  where contract_id is null;

create or replace function public.check_contract_parking_company_match()
returns trigger language plpgsql as $$
declare
  contract_company_id text;
  parking_company_id text;
begin
  select company_id into parking_company_id from public.parkings where id = new.parking_id;
  if parking_company_id is null then
    raise exception 'CONTRACT_OR_PARKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.contract_id is null then
    return new;
  end if;
  select company_id into contract_company_id from public.company_contracts where id = new.contract_id;
  if contract_company_id is null then
    raise exception 'CONTRACT_OR_PARKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if contract_company_id <> parking_company_id then
    raise exception 'CONTRACT_PARKING_COMPANY_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

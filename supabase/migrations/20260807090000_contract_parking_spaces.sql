-- Plazas contratadas por estacionamiento: tabla intermedia entre company_contracts y parkings.
-- Un contrato pertenece a una empresa; un parking pertenece a una empresa; esta tabla ata
-- explicitamente contrato + parking + cantidad de plazas comerciales, sin asumir que toda
-- la capacidad de la empresa se reparte igual entre sus estacionamientos.

create table if not exists public.contract_parking_spaces (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts(id) on delete cascade,
  parking_id uuid not null references public.parkings(id) on delete cascade,
  contracted_spaces integer not null check (contracted_spaces > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, parking_id)
);

create index if not exists contract_parking_spaces_contract_idx on public.contract_parking_spaces(contract_id);
create index if not exists contract_parking_spaces_parking_idx on public.contract_parking_spaces(parking_id);

-- Defensa en profundidad: aunque la API resuelve el contrato desde el company_id del
-- parking (nunca acepta un contract_id enviado libremente por el cliente), esta
-- comprobación en base de datos impide que cualquier ruta (incluida una futura, o SQL
-- directo con service_role) asocie el contrato de una empresa a un parking de otra.
create or replace function public.check_contract_parking_company_match()
returns trigger language plpgsql as $$
declare
  contract_company_id text;
  parking_company_id text;
begin
  select company_id into contract_company_id from public.company_contracts where id = new.contract_id;
  select company_id into parking_company_id from public.parkings where id = new.parking_id;
  if contract_company_id is null or parking_company_id is null then
    raise exception 'CONTRACT_OR_PARKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if contract_company_id <> parking_company_id then
    raise exception 'CONTRACT_PARKING_COMPANY_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists contract_parking_spaces_company_match on public.contract_parking_spaces;
create trigger contract_parking_spaces_company_match
before insert or update on public.contract_parking_spaces
for each row execute function public.check_contract_parking_company_match();

-- Reutiliza el trigger genérico de updated_at ya definido para company_contracts
-- (solo hace new.updated_at = now(); sin dependencias de columnas específicas).
drop trigger if exists contract_parking_spaces_set_updated_at on public.contract_parking_spaces;
create trigger contract_parking_spaces_set_updated_at before update on public.contract_parking_spaces
for each row execute function public.set_company_contract_updated_at();

alter table public.contract_parking_spaces enable row level security;
revoke all on public.contract_parking_spaces from public, anon, authenticated;
grant select, insert, update, delete on public.contract_parking_spaces to service_role;

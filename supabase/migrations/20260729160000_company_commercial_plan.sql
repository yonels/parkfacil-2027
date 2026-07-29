-- Plan comercial persistente por empresa.
alter table public.companies
  add column if not exists commercial_plan text not null default 'UNASSIGNED';

alter table public.companies
  drop constraint if exists companies_commercial_plan_check;
alter table public.companies
  add constraint companies_commercial_plan_check
  check (commercial_plan in ('UNASSIGNED','ESSENTIAL','PROFESSIONAL','ENTERPRISE','CUSTOM'));

update public.companies
set commercial_plan=case id
  when 'emp-ramis' then 'ENTERPRISE'
  when 'emp-5q' then 'UNASSIGNED'
  else commercial_plan
end;

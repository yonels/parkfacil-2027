-- Esquema de contratación: aplicar exclusivamente al destino QA autorizado. Destino distinto: base operativa 2027, primero LOCAL/QA.
-- No modifica el repositorio 2027. Revisar triggers de códigos/altas antes de aplicar.
begin;
create table public.web_enrollments (
  id uuid primary key,
  fingerprint text not null,
  rut_normalizado text not null unique,
  company_id text not null references public.companies(id),
  parking_id uuid not null references public.parkings(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.web_enrollments enable row level security;
revoke all on public.web_enrollments from public,anon,authenticated;
grant select,insert on public.web_enrollments to service_role;

create function public.contratacion_operational_finish(p_id uuid,p_fingerprint text,p_payload jsonb,p_accounts jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.web_enrollments; r text; c text; p uuid; level_id uuid; account jsonb; idx integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into j from public.web_enrollments where id=p_id;
  if found then
    if j.fingerprint<>p_fingerprint then raise exception 'REQUEST_CONFLICT'; end if;
    return jsonb_build_object('companyId',j.company_id,'parkingId',j.parking_id);
  end if;
  if jsonb_array_length(p_accounts)<>3
    or (select count(distinct value->>'id') from jsonb_array_elements(p_accounts))<>3
    or p_accounts->0->>'role'<>'company_admin'
    or p_accounts->1->>'role'<>'operator'
    or p_accounts->2->>'role'<>'operator' then raise exception 'ACCOUNTS_INVALID'; end if;
  if (p_payload->>'planId') is null or p_payload->>'planId' not in ('start','business','enterprise') then raise exception 'PLAN_INVALID'; end if;
  if (p_payload->>'plazas') is null or (p_payload->>'plazas')::integer < 50 then raise exception 'CAPACITY_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_accounts) a
    left join auth.users u on u.id=(a->>'id')::uuid
    where u.id is null or u.raw_app_meta_data->>'enrollment_id' is distinct from p_id::text
      or u.raw_app_meta_data->>'role' is distinct from 'pending_enrollment'
      or lower(u.email) is distinct from lower(a->>'email')
      or exists(select 1 from public.company_members cm where cm.user_id=u.id)
  ) then raise exception 'ACCOUNT_OWNERSHIP_CONFLICT'; end if;
  r:=ltrim(upper(regexp_replace(p_payload->>'rut','[^0-9kK]','','g')),'0');
  perform pg_advisory_xact_lock(hashtextextended('contratacion-rut:'||r,0));
  if exists(select 1 from public.companies where ltrim(rut_number,'0')||upper(rut_dv)=ltrim(r,'0')) then
    raise exception 'COMPANY_REQUIRES_REVIEW';
  end if;
  c:='emp-'||p_id::text;
  insert into public.companies(id,rut_number,rut_dv,business_name,trade_name,business_activity,address,district,city,region,primary_contact,email,phone,legal_representative,status,relationship_type,commercial_plan,enabled_products,notes)
  values(c,left(r,length(r)-1),right(r,1),p_payload->>'empresa',p_payload->>'empresa',p_payload->>'giro',p_payload->>'direccion',p_payload->>'comuna',p_payload->>'ciudad',p_payload->>'region',concat_ws(' ',p_payload->>'representanteNombres',p_payload->>'representanteApellidos'),p_payload->>'correo',p_payload->>'telefono',concat_ws(' ',p_payload->>'representanteNombres',p_payload->>'representanteApellidos'),'inactive','client',case p_payload->>'planId' when 'start' then 'ESSENTIAL' when 'business' then 'PROFESSIONAL' when 'enterprise' then 'ENTERPRISE' else 'UNASSIGNED' end,array['OFF_STREET'],'Alta automática web. Precio y aceptación conservados en web_enrollments; commercial_plan no es fuente de facturación.');
  insert into public.parkings(code,name,company_id,company_name,type,status,address,district,city,region,country,off_street_configuration_status,notes)
  values('WEB-'||p_id::text,p_payload->>'estacionamientoNombre',c,p_payload->>'empresa','OFF_STREET','DRAFT',p_payload->>'estacionamientoDireccion',p_payload->>'estacionamientoComuna',p_payload->>'estacionamientoCiudad',p_payload->>'estacionamientoRegion','Chile','EMPTY','Tarifa, horario y accesos pendientes: no se inventan datos para activar el cobro.') returning id into p;
  insert into public.parking_levels(parking_id,code,name,status,declared_capacity)
  values(p,'NIV-001','Nivel general','ACTIVE',(p_payload->>'plazas')::integer) returning id into level_id;
  insert into public.parking_zones(parking_id,level_id,code,name,status,capacity,occupied)
  values(p,level_id,'ZON-001','Zona general','ACTIVE',(p_payload->>'plazas')::integer,0);
  for account in select value from jsonb_array_elements(p_accounts) loop
    insert into public.company_members(user_id,company_id,full_name,role,status,pos_only,must_change_password,recovery_email)
    values((account->>'id')::uuid,c,account->>'fullName',account->>'role','inactive',account->>'role'='operator',true,account->>'recoveryEmail');
    insert into public.company_member_parkings(user_id,parking_id,access_level)
    values((account->>'id')::uuid,p,case account->>'role' when 'operator' then 'POS_OPERATOR' else 'ADMIN' end);
    idx:=idx+1;
  end loop;
  insert into public.web_enrollments(id,fingerprint,rut_normalizado,company_id,parking_id,payload)
  values(p_id,p_fingerprint,r,c,p,p_payload);
  return jsonb_build_object('companyId',c,'parkingId',p);
end $$;
revoke all on function public.contratacion_operational_finish(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.contratacion_operational_finish(uuid,text,jsonb,jsonb) to service_role;
commit;

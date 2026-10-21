-- Esquema de contratación: aplicar exclusivamente al destino QA autorizado. Destino distinto: base operativa 2027, primero LOCAL/QA.
-- No modifica el repositorio 2027. Revisar triggers de códigos/altas antes de aplicar.
begin;
create table if not exists public.web_enrollments (
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

create or replace function public.contratacion_operational_finish(p_id uuid,p_fingerprint text,p_payload jsonb,p_accounts jsonb)
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
  insert into public.web_enrollments(id,fingerprint,rut_normalizado,company_id,parking_id,payload,flow_version)
  values(p_id,p_fingerprint,r,c,p,p_payload,'integral_v1');
  return jsonb_build_object('companyId',c,'parkingId',p);
end $$;
revoke all on function public.contratacion_operational_finish(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.contratacion_operational_finish(uuid,text,jsonb,jsonb) to service_role;
alter table public.web_enrollments add column if not exists activated_at timestamptz;
alter table public.web_enrollments add column if not exists flow_version text not null default 'legacy';
create schema if not exists contratacion_integral;
revoke all on schema contratacion_integral from public,anon,authenticated,service_role;
create table contratacion_integral.environment(id boolean primary key default true check(id),mode text not null default 'production' check(mode in ('production','qa')));
insert into contratacion_integral.environment(id) values(true);
alter table contratacion_integral.environment enable row level security;
create table contratacion_integral.evidence (
 enrollment_id uuid primary key references public.web_enrollments(id), revision bigint not null,
 snapshot jsonb not null, created_at timestamptz not null default now()
);
create table contratacion_integral.status_history (
 id bigint generated always as identity primary key,enrollment_id uuid not null references public.web_enrollments(id),
 actor_id uuid not null, previous_status text not null,new_status text not null,
 evidence_revision bigint,reason text not null,created_at timestamptz not null default now()
);
create table contratacion_integral.status_permits(tx bigint not null,company_id text not null,status text not null,primary key(tx,company_id));
alter table contratacion_integral.evidence enable row level security;
alter table contratacion_integral.status_history enable row level security;
alter table contratacion_integral.status_permits enable row level security;
revoke all on all tables in schema contratacion_integral from public,anon,authenticated,service_role;
create function contratacion_integral.preserve_history() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'HISTORY_IMMUTABLE'; end $$;
create trigger preserve_history before update or delete on contratacion_integral.status_history for each row execute function contratacion_integral.preserve_history();
create function contratacion_integral.guard_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status and exists(select 1 from public.web_enrollments where company_id=old.id and flow_version='integral_v1') then
 delete from contratacion_integral.status_permits where tx=txid_current() and company_id=old.id and status=new.status;
 if not found then raise exception 'CONTROLLED_ACTIVATION_REQUIRED'; end if;
 end if;
 return new;
end $$;
create trigger enrollment_status_guard before update of status on public.companies for each row execute function contratacion_integral.guard_status();

-- Only the CRM bridge uses this RPC, after reading existing acceptance/contract/payment records.
create function public.contratacion_integral_evidence(p_id uuid,p_revision bigint,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.web_enrollments where id=p_id and flow_version='integral_v1' for update;
 if not found then raise exception 'ENROLLMENT_REQUIRED'; end if;
 if p_revision<1 or jsonb_typeof(p_snapshot)<>'object' then raise exception 'EVIDENCE_INVALID'; end if;
 insert into contratacion_integral.evidence(enrollment_id,revision,snapshot) values(p_id,p_revision,p_snapshot)
 on conflict(enrollment_id) do update set revision=excluded.revision,snapshot=excluded.snapshot,created_at=now()
 where contratacion_integral.evidence.revision<excluded.revision;
 if not found then raise exception 'EVIDENCE_VERSION_CONFLICT'; end if;
end $$;

create function public.contratacion_integral_status(p_id uuid,p_status text,p_revision bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.web_enrollments; ev contratacion_integral.evidence; previous text; actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and raw_app_meta_data->>'role'='platform_admin'
 and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED'; end if;
 if p_status not in ('active','inactive') or p_status is null or length(trim(coalesce(p_reason,'')))<8 then raise exception 'STATUS_OR_REASON_INVALID'; end if;
 select * into strict e from public.web_enrollments where id=p_id and flow_version='integral_v1' for update;
 select status into strict previous from public.companies where id=e.company_id for update;
 if p_status='active' then
   select * into strict ev from contratacion_integral.evidence where enrollment_id=p_id for update;
   if ev.revision<>p_revision or ev.created_at<now()-interval '5 minutes' then raise exception 'EVIDENCE_STALE'; end if;
   if (ev.snapshot->>'simulated' is distinct from 'false' and not ((select mode from contratacion_integral.environment where id)='qa' and ev.snapshot->>'simulated'='true')) or coalesce(ev.snapshot->>'acceptanceId','')=''
   or coalesce(ev.snapshot->>'contractId','')='' or coalesce(ev.snapshot->>'paymentId','')=''
   or coalesce(ev.snapshot->>'documentHash','')!~'^[a-f0-9]{64}$'
   or ev.snapshot->>'acceptedByCustomer' is distinct from 'true'
   or ev.snapshot->>'contractAccepted' is distinct from 'true'
   or ev.snapshot->>'paymentVerified' is distinct from 'true'
   or coalesce(ev.snapshot->>'currency','') not in ('CLP','UF') or coalesce(ev.snapshot->>'basis','') not in ('first_month','full_contract')
   or coalesce((ev.snapshot->>'requiredAmount')::numeric,0)<=0
   or coalesce((ev.snapshot->>'paidAmount')::numeric,0)<(ev.snapshot->>'requiredAmount')::numeric
   then raise exception 'COMMERCIAL_REQUIREMENTS_MISSING'; end if;
   if coalesce(ev.snapshot->>'reservationId','')<>p_id::text or coalesce((ev.snapshot->>'reservationExpiresAt')::timestamptz,'epoch'::timestamptz)<=clock_timestamp()+interval '1 second' then raise exception 'COMMERCIAL_RESERVATION_EXPIRED'; end if;
   -- Three accounts are an initial-provisioning invariant, never a suspension prerequisite.
   if e.activated_at is null then
     if (select count(*) from public.company_members where company_id=e.company_id)<>3
     or (select count(*) from public.company_members where company_id=e.company_id and role='company_admin')<>1
     or (select count(*) from public.company_members where company_id=e.company_id and role='operator')<>2 then raise exception 'INITIAL_ACCOUNTS_INVALID'; end if;
     update public.company_members set status='active' where company_id=e.company_id;
     update public.web_enrollments set activated_at=now() where id=p_id;
   end if;
 end if;
 if previous=p_status then return jsonb_build_object('changed',false,'commercialStatus',p_status); end if;
 if p_status='active' and (ev.snapshot->>'reservationExpiresAt')::timestamptz<=clock_timestamp()+interval '1 second' then raise exception 'COMMERCIAL_RESERVATION_EXPIRED'; end if;
 -- Suspension blocks through company status, preserving each membership's individual suspension.
 insert into contratacion_integral.status_permits(tx,company_id,status) values(txid_current(),e.company_id,p_status);
 update public.companies set status=p_status where id=e.company_id;
 insert into contratacion_integral.status_history(enrollment_id,actor_id,previous_status,new_status,evidence_revision,reason)
 values(p_id,actor,previous,p_status,case when p_status='active' then p_revision end,p_reason);
 return jsonb_build_object('changed',true,'commercialStatus',p_status,'parkingStatus',(select status from public.parkings where id=e.parking_id));
end $$;
revoke all on function public.contratacion_integral_evidence(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.contratacion_integral_evidence(uuid,bigint,jsonb) to service_role;
revoke all on function public.contratacion_integral_status(uuid,text,bigint,text) from public,anon,service_role;
grant execute on function public.contratacion_integral_status(uuid,text,bigint,text) to authenticated;
revoke all on all functions in schema contratacion_integral from public,anon,authenticated,service_role;
-- PROPOSAL ONLY. Do not execute without authorization. Operational QA only.
-- Requires existing operational enrollment + Root status history migrations.


create schema contratacion_integral_pin_private;
revoke all on schema contratacion_integral_pin_private from public,anon,authenticated,service_role;
create table contratacion_integral_pin_private.credentials(
 user_id uuid primary key references auth.users(id), enrollment_id uuid not null,
 email text unique not null, salt text not null check(salt~'^[a-f0-9]{64}$'),
 hash text not null check(hash~'^[a-f0-9]{64}$'), revision bigint not null default 1,
 attempts integer not null default 0, window_until timestamptz not null default now()+interval '10 minutes',
 expires_at timestamptz not null default now()+interval '24 hours',
 consumed boolean not null default false, disabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table contratacion_integral_pin_private.rate_limit(id integer primary key check(id=1),attempts integer not null,window_until timestamptz not null);
insert into contratacion_integral_pin_private.rate_limit values(1,0,now()+interval '10 minutes');
alter table contratacion_integral_pin_private.credentials enable row level security;
alter table contratacion_integral_pin_private.rate_limit enable row level security;
revoke all on all tables in schema contratacion_integral_pin_private from public,anon,authenticated,service_role;
create function public.contratacion_pin_register(p_user uuid,p_enrollment uuid,p_email text,p_salt text,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(trim(p_email))
 and raw_app_meta_data->>'credential_scheme'='enrollment_pin_v1'
 and raw_app_meta_data->>'enrollment_id'=p_enrollment::text)
 then raise exception 'PIN_OWNERSHIP_REQUIRED'; end if;
 insert into contratacion_integral_pin_private.credentials(user_id,enrollment_id,email,salt,hash)
 values(p_user,p_enrollment,lower(trim(p_email)),p_salt,p_hash) on conflict(user_id) do nothing;
 if not exists(select 1 from contratacion_integral_pin_private.credentials where user_id=p_user and enrollment_id=p_enrollment and email=lower(trim(p_email)))
 then raise exception 'PIN_OWNERSHIP_REQUIRED'; end if;
 -- Retry never resets attempts, expiry, consumed state or credentials.
end $$;
create function public.contratacion_pin_attempt(p_email text,p_reauth_user uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r contratacion_integral_pin_private.credentials; g contratacion_integral_pin_private.rate_limit;
begin
 select * into g from contratacion_integral_pin_private.rate_limit where id=1 for update;
 if g.window_until<=now() then g.attempts:=0;g.window_until:=now()+interval '10 minutes';end if;
 if g.attempts>=100 then return null;end if;
 update contratacion_integral_pin_private.rate_limit set attempts=g.attempts+1,window_until=g.window_until where id=1;
 select k.* into r from contratacion_integral_pin_private.credentials k join auth.users u on u.id=k.user_id where k.email=lower(trim(p_email)) and coalesce(u.raw_app_meta_data->>'enrollment_credentials_changed','false')<>'true' for update of k;
 if not found or r.disabled or r.expires_at<=now() or (r.consumed and r.user_id is distinct from p_reauth_user) then return null;end if;
 if r.window_until<=now() then r.attempts:=0;r.window_until:=now()+interval '10 minutes';end if;
 if r.attempts>=5 then return null;end if;
 update contratacion_integral_pin_private.credentials set attempts=r.attempts+1,window_until=r.window_until where user_id=r.user_id;
 return jsonb_build_object('userId',r.user_id,'enrollmentId',r.enrollment_id,'salt',r.salt,'hash',r.hash,'revision',r.revision);
end $$;
create function public.contratacion_pin_success(p_user uuid,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update contratacion_integral_pin_private.credentials set attempts=0,window_until=now()+interval '10 minutes',revision=revision+1
 where user_id=p_user and revision=p_revision and not consumed and not disabled and expires_at>now()
 and exists(select 1 from auth.users u where u.id=p_user and coalesce(u.raw_app_meta_data->>'enrollment_credentials_changed','false')<>'true');
 get diagnostics changed=row_count;return changed=1;
end $$;
create function public.contratacion_pin_revoke(p_user uuid)
returns void language sql security definer set search_path='' as $$
 update contratacion_integral_pin_private.credentials set disabled=true,consumed=true,revision=revision+1 where user_id=p_user;
$$;
create function public.contratacion_pin_access(p_user uuid,p_enrollment uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('companyId',c.id,'companyStatus',c.status,'memberStatus',m.status,'role',m.role,
 'pinAvailable',exists(select 1 from contratacion_integral_pin_private.credentials k where k.user_id=p_user and not k.consumed and not k.disabled and k.expires_at>now()),
 'everActivated',exists(select 1 from contratacion_integral.status_history h where h.enrollment_id=e.id and h.new_status='active'))
 from public.web_enrollments e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=c.id and m.user_id=p_user
 where e.id=p_enrollment;
$$;
revoke all on function public.contratacion_pin_register(uuid,uuid,text,text,text),public.contratacion_pin_attempt(text,uuid),public.contratacion_pin_success(uuid,bigint),public.contratacion_pin_revoke(uuid),public.contratacion_pin_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.contratacion_pin_register(uuid,uuid,text,text,text),public.contratacion_pin_attempt(text,uuid),public.contratacion_pin_success(uuid,bigint),public.contratacion_pin_revoke(uuid),public.contratacion_pin_access(uuid,uuid) to service_role;
create table contratacion_integral_pin_private.reveal_audit(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 enrollment_id uuid not null references public.web_enrollments(id), created_at timestamptz not null default now()
);
alter table contratacion_integral_pin_private.reveal_audit enable row level security;
revoke all on contratacion_integral_pin_private.reveal_audit from public,anon,authenticated,service_role;
create trigger preserve_pin_reveal_audit before update or delete on contratacion_integral_pin_private.reveal_audit
 for each row execute function contratacion_integral.preserve_history();
create function public.contratacion_pin_audit_reveal(p_actor uuid,p_enrollment uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_actor and raw_app_meta_data->>'role'='platform_admin'
 and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED';end if;
 insert into contratacion_integral_pin_private.reveal_audit(actor_id,enrollment_id) values(p_actor,p_enrollment);
end $$;
revoke all on function public.contratacion_pin_audit_reveal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.contratacion_pin_audit_reveal(uuid,uuid) to service_role;



create table contratacion_integral.recovery_requests(
 id uuid primary key default gen_random_uuid(),email text not null,
 state text not null default 'pending' check(state in ('pending','issued','processing','consumed','expired')),
 user_id uuid references auth.users(id),token_hash text unique,expires_at timestamptz,
 issues integer not null default 0 check(issues between 0 and 3),created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),check(token_hash is null or token_hash~'^[a-f0-9]{64}$')
);
create table contratacion_integral.credential_events(
 id bigint generated always as identity primary key,user_id uuid,request_id uuid,actor_id uuid,
 action text not null,reason text,created_at timestamptz not null default now()
);
create table contratacion_integral.session_cutoffs(user_id uuid primary key references auth.users(id),not_before bigint not null);
alter table contratacion_integral.recovery_requests enable row level security;
alter table contratacion_integral.credential_events enable row level security;
alter table contratacion_integral.session_cutoffs enable row level security;
revoke all on all tables in schema contratacion_integral from public,anon,authenticated,service_role;
create index recovery_email on contratacion_integral.recovery_requests(email,created_at);
create trigger preserve_credential_events before update or delete on contratacion_integral.credential_events for each row execute function contratacion_integral.preserve_history();

create function public.contratacion_recovery_request(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(trim(p_email));
begin
 if v_email is null or length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('enrollment:recovery',0));
 update contratacion_integral.recovery_requests set state='expired',token_hash=null,updated_at=now() where state='issued' and expires_at<=now();
 if (select count(*) from contratacion_integral.recovery_requests where created_at>now()-interval '1 hour')>=100
 or (select count(*) from contratacion_integral.recovery_requests r where r.email=v_email and r.created_at>now()-interval '1 day')>=5
 or exists(select 1 from contratacion_integral.recovery_requests r where r.email=v_email and (r.state='processing' or (r.state in ('pending','issued') and r.created_at>now()-interval '1 hour'))) then return; end if;
 insert into contratacion_integral.recovery_requests(email) values(v_email);
end $$;
create function public.contratacion_recovery_issue(p_id uuid,p_hash text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r contratacion_integral.recovery_requests; u uuid; actor uuid:=auth.uid();
begin
 if not exists(select 1 from auth.users where id=actor and raw_app_meta_data->>'role'='platform_admin' and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED'; end if;
 if p_hash!~'^[a-f0-9]{64}$' or p_hash is null or length(trim(coalesce(p_reason,'')))<8 then raise exception 'IDENTITY_VERIFICATION_REQUIRED'; end if;
 select * into strict r from contratacion_integral.recovery_requests where id=p_id for update;
 if r.state in ('processing','consumed') or r.issues>=3 or r.created_at<now()-interval '1 hour' then raise exception 'RECOVERY_UNAVAILABLE'; end if;
 select a.id into u from auth.users a join public.company_members m on m.user_id=a.id
 join public.companies c on c.id=m.company_id join public.web_enrollments e on e.company_id=c.id and e.flow_version='integral_v1'
 where lower(a.email)=r.email and a.raw_app_meta_data->>'enrollment_id'=e.id::text
 and a.deleted_at is null and (a.banned_until is null or a.banned_until<now())
 and m.role in ('company_admin','operator')
 and ((c.status='active' and m.status='active') or (c.status='inactive' and m.status='inactive' and e.activated_at is null));
 if u is null then raise exception 'RECOVERY_UNAVAILABLE'; end if;
 -- Replacing the hash revokes every previous link, including one not yet expired.
 update contratacion_integral.recovery_requests set state='issued',user_id=u,token_hash=p_hash,expires_at=now()+interval '15 minutes',issues=issues+1,updated_at=now() where id=p_id;
 insert into contratacion_integral.credential_events(user_id,request_id,actor_id,action,reason) values(u,p_id,actor,'recovery_issue',p_reason);
 return jsonb_build_object('userId',u,'expiresIn',900);
end $$;
create function public.contratacion_recovery_claim(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r contratacion_integral.recovery_requests;
begin
 select * into r from contratacion_integral.recovery_requests where token_hash=p_hash and state='issued' and expires_at>now() for update;
 if not found then return null; end if;
 if not exists(select 1 from public.company_members m join public.companies c on c.id=m.company_id join public.web_enrollments e on e.company_id=c.id and e.flow_version='integral_v1'
 join auth.users u on u.id=m.user_id where m.user_id=r.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and ((m.status='active' and c.status='active') or (m.status='inactive' and c.status='inactive' and e.activated_at is null))) then return null; end if;
 update contratacion_integral.recovery_requests set state='processing',token_hash=null,updated_at=now() where id=r.id;
 update contratacion_integral_pin_private.credentials set disabled=true,consumed=true,revision=revision+1 where user_id=r.user_id;
 insert into contratacion_integral.session_cutoffs(user_id,not_before) values(r.user_id,ceil(extract(epoch from clock_timestamp()))::bigint)
 on conflict(user_id) do update set not_before=excluded.not_before;
 insert into contratacion_integral.credential_events(user_id,request_id,action) values(r.user_id,r.id,'recovery_claim');
 return jsonb_build_object('userId',r.user_id,'requestId',r.id);
end $$;
create function public.contratacion_recovery_finish(p_id uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update contratacion_integral.recovery_requests set state='consumed',updated_at=now() where id=p_id and user_id=p_user and state='processing';
 if not found then raise exception 'RECOVERY_CONFLICT'; end if;
 update public.company_members set must_change_password=false where user_id=p_user;
 insert into contratacion_integral.credential_events(user_id,request_id,action) values(p_user,p_id,'password_changed');
end $$;
create function public.contratacion_context(p_user uuid,p_iat bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('companyId',c.id,'companyStatus',c.status,'memberStatus',m.status,'role',m.role,
 'enrollmentId',e.id,'mustChangePassword',m.must_change_password,'everActivated',e.activated_at is not null,
 'sessionValid',p_iat>=coalesce(s.not_before,0) and not exists(select 1 from contratacion_integral.recovery_requests r where r.user_id=m.user_id and r.state='processing'))
 from public.company_members m join public.companies c on c.id=m.company_id join public.web_enrollments e on e.company_id=c.id and e.flow_version='integral_v1'
 left join contratacion_integral.session_cutoffs s on s.user_id=m.user_id where m.user_id=p_user;
$$;
create function public.contratacion_credential_begin(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.company_members m join public.web_enrollments e on e.company_id=m.company_id and e.flow_version='integral_v1' where m.user_id=p_user and m.must_change_password for update of m;
 if not found then raise exception 'INITIAL_CREDENTIAL_REQUIRED'; end if;
 update contratacion_integral_pin_private.credentials set disabled=true,consumed=true,revision=revision+1 where user_id=p_user;
 insert into contratacion_integral.session_cutoffs(user_id,not_before) values(p_user,ceil(extract(epoch from clock_timestamp()))::bigint)
 on conflict(user_id) do update set not_before=excluded.not_before;
 insert into contratacion_integral.credential_events(user_id,action) values(p_user,'personal_password_begin');
end $$;
create function public.contratacion_credential_finish(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.company_members set must_change_password=false where user_id=p_user;
 insert into contratacion_integral.credential_events(user_id,action) values(p_user,'personal_password_complete');
end $$;
create function public.contratacion_session_valid() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.company_members m join public.web_enrollments e on e.company_id=m.company_id and e.flow_version='integral_v1' where m.user_id=auth.uid())
 or exists(select 1 from public.company_members m join public.companies c on c.id=m.company_id
 left join contratacion_integral.session_cutoffs s on s.user_id=m.user_id
 where m.user_id=auth.uid() and m.status='active' and c.status='active' and not m.must_change_password
 and coalesce((auth.jwt()->>'iat')::bigint,0)>=coalesce(s.not_before,0)
 and not exists(select 1 from contratacion_integral.recovery_requests r where r.user_id=m.user_id and r.state='processing'));
$$;
-- Restrict only enrolled users. Existing non-enrollment users preserve their current policies.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
 execute format('create policy enrollment_session_guard on public.%I as restrictive for all to authenticated using (public.contratacion_session_valid()) with check (public.contratacion_session_valid())',t.tablename);
 end loop;
end $$;
revoke all on function public.contratacion_recovery_request(text),public.contratacion_recovery_claim(text),public.contratacion_recovery_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.contratacion_recovery_request(text),public.contratacion_recovery_claim(text),public.contratacion_recovery_finish(uuid,uuid) to service_role;
revoke all on function public.contratacion_recovery_issue(uuid,text,text) from public,anon,service_role;
grant execute on function public.contratacion_recovery_issue(uuid,text,text) to authenticated;
revoke all on function public.contratacion_session_valid() from public,anon;
grant execute on function public.contratacion_session_valid() to authenticated,service_role;
create function public.contratacion_recovery_inspect() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='platform_admin' and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED'; end if;
 return coalesce((select jsonb_agg(x) from(select id,email,state,expires_at,issues,updated_at from contratacion_integral.recovery_requests order by updated_at desc limit 100)x),'[]'::jsonb);
end $$;
create function public.contratacion_recovery_release(p_id uuid,p_reason text,p_excluded boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='platform_admin' and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED'; end if;
 if p_excluded is distinct from true or length(trim(coalesce(p_reason,'')))<8 then raise exception 'WORKER_EXCLUSION_REQUIRED'; end if;
 update contratacion_integral.recovery_requests set state='expired',token_hash=null,updated_at=now()
 where id=p_id and state='processing' and updated_at<now()-interval '5 minutes' returning user_id into target;
 if not found then raise exception 'RECOVERY_CONFLICT'; end if;
 insert into contratacion_integral.credential_events(user_id,request_id,actor_id,action,reason) values(target,p_id,auth.uid(),'recovery_release',p_reason);
end $$;
create function public.contratacion_pin_renew(p_user uuid,p_salt text,p_hash text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='platform_admin' and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED'; end if;
 if p_salt!~'^[a-f0-9]{64}$' or p_hash!~'^[a-f0-9]{64}$' or p_salt is null or p_hash is null or length(trim(coalesce(p_reason,'')))<8 then raise exception 'IDENTITY_VERIFICATION_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('enrollment:pin-renew:'||p_user::text,0));
 if (select count(*) from contratacion_integral.credential_events where user_id=p_user and action='pin_renew' and created_at>now()-interval '1 day')>=3 then raise exception 'RENEWAL_LIMIT'; end if;
 if not exists(select 1 from public.company_members m join public.companies c on c.id=m.company_id join public.web_enrollments e on e.company_id=c.id and e.flow_version='integral_v1'
 join auth.users u on u.id=m.user_id where u.id=p_user and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and m.must_change_password and ((c.status='active' and m.status='active')or(c.status='inactive' and m.status='inactive' and e.activated_at is null))) then raise exception 'INITIAL_ACCOUNT_REQUIRED'; end if;
 update contratacion_integral_pin_private.credentials set salt=p_salt,hash=p_hash,expires_at=now()+interval '24 hours',attempts=0,window_until=now()+interval '10 minutes',disabled=false,consumed=false,revision=revision+1 where user_id=p_user;
 if not found then raise exception 'CREDENTIAL_REQUIRED'; end if;
 insert into contratacion_integral.credential_events(user_id,actor_id,action,reason) values(p_user,auth.uid(),'pin_renew',p_reason);
end $$;
revoke all on function public.contratacion_recovery_inspect(),public.contratacion_recovery_release(uuid,text,boolean),public.contratacion_pin_renew(uuid,text,text,text) from public,anon,service_role;
grant execute on function public.contratacion_recovery_inspect(),public.contratacion_recovery_release(uuid,text,boolean),public.contratacion_pin_renew(uuid,text,text,text) to authenticated;
revoke all on function public.contratacion_context(uuid,bigint),public.contratacion_credential_begin(uuid),public.contratacion_credential_finish(uuid) from public,anon,authenticated;
grant execute on function public.contratacion_context(uuid,bigint),public.contratacion_credential_begin(uuid),public.contratacion_credential_finish(uuid) to service_role;
commit;




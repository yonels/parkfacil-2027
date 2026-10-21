-- PROPOSAL ONLY. Do not execute without authorization. Operational QA only.
-- Requires existing operational enrollment + Root status history migrations.
begin;
do $$ begin
 if not exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_enrollments')
 or not exists(select 1 from information_schema.tables where table_schema='contratacion_private' and table_name='status_history')
 then raise exception 'QA_FOUNDATION_REQUIRED'; end if;
end $$;
create schema contratacion_pin_private;
revoke all on schema contratacion_pin_private from public,anon,authenticated,service_role;
create table contratacion_pin_private.credentials(
 user_id uuid primary key references auth.users(id), enrollment_id uuid not null,
 email text unique not null, salt text not null check(salt~'^[a-f0-9]{64}$'),
 hash text not null check(hash~'^[a-f0-9]{64}$'), revision bigint not null default 1,
 attempts integer not null default 0, window_until timestamptz not null default now()+interval '10 minutes',
 expires_at timestamptz not null default now()+interval '24 hours',
 consumed boolean not null default false, disabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table contratacion_pin_private.rate_limit(id integer primary key check(id=1),attempts integer not null,window_until timestamptz not null);
insert into contratacion_pin_private.rate_limit values(1,0,now()+interval '10 minutes');
alter table contratacion_pin_private.credentials enable row level security;
alter table contratacion_pin_private.rate_limit enable row level security;
revoke all on all tables in schema contratacion_pin_private from public,anon,authenticated,service_role;
create function public.qa_pin_register(p_user uuid,p_enrollment uuid,p_email text,p_salt text,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(trim(p_email))
 and raw_app_meta_data->>'credential_scheme'='qa_pin_v1'
 and raw_app_meta_data->>'enrollment_id'=p_enrollment::text)
 then raise exception 'PIN_OWNERSHIP_REQUIRED'; end if;
 insert into contratacion_pin_private.credentials(user_id,enrollment_id,email,salt,hash)
 values(p_user,p_enrollment,lower(trim(p_email)),p_salt,p_hash) on conflict(user_id) do nothing;
 if not exists(select 1 from contratacion_pin_private.credentials where user_id=p_user and enrollment_id=p_enrollment and email=lower(trim(p_email)))
 then raise exception 'PIN_OWNERSHIP_REQUIRED'; end if;
 -- Retry never resets attempts, expiry, consumed state or credentials.
end $$;
create function public.qa_pin_attempt(p_email text,p_reauth_user uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r contratacion_pin_private.credentials; g contratacion_pin_private.rate_limit;
begin
 select * into g from contratacion_pin_private.rate_limit where id=1 for update;
 if g.window_until<=now() then g.attempts:=0;g.window_until:=now()+interval '10 minutes';end if;
 if g.attempts>=100 then return null;end if;
 update contratacion_pin_private.rate_limit set attempts=g.attempts+1,window_until=g.window_until where id=1;
 select k.* into r from contratacion_pin_private.credentials k join auth.users u on u.id=k.user_id where k.email=lower(trim(p_email)) and coalesce(u.raw_app_meta_data->>'qa_credentials_changed','false')<>'true' for update of k;
 if not found or r.disabled or r.expires_at<=now() or (r.consumed and r.user_id is distinct from p_reauth_user) then return null;end if;
 if r.window_until<=now() then r.attempts:=0;r.window_until:=now()+interval '10 minutes';end if;
 if r.attempts>=5 then return null;end if;
 update contratacion_pin_private.credentials set attempts=r.attempts+1,window_until=r.window_until where user_id=r.user_id;
 return jsonb_build_object('userId',r.user_id,'enrollmentId',r.enrollment_id,'salt',r.salt,'hash',r.hash,'revision',r.revision);
end $$;
create function public.qa_pin_success(p_user uuid,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update contratacion_pin_private.credentials set attempts=0,window_until=now()+interval '10 minutes',revision=revision+1
 where user_id=p_user and revision=p_revision and not consumed and not disabled and expires_at>now()
 and exists(select 1 from auth.users u where u.id=p_user and coalesce(u.raw_app_meta_data->>'qa_credentials_changed','false')<>'true');
 get diagnostics changed=row_count;return changed=1;
end $$;
create function public.qa_pin_revoke(p_user uuid)
returns void language sql security definer set search_path='' as $$
 update contratacion_pin_private.credentials set disabled=true,consumed=true,revision=revision+1 where user_id=p_user;
$$;
create function public.qa_pin_access(p_user uuid,p_enrollment uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('companyId',c.id,'companyStatus',c.status,'memberStatus',m.status,'role',m.role,
 'pinAvailable',exists(select 1 from contratacion_pin_private.credentials k where k.user_id=p_user and not k.consumed and not k.disabled and k.expires_at>now()),
 'everActivated',exists(select 1 from contratacion_private.status_history h where h.company_id=c.id and h.new_status='active'))
 from public.web_enrollments e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=c.id and m.user_id=p_user
 where e.id=p_enrollment;
$$;
revoke all on function public.qa_pin_register(uuid,uuid,text,text,text),public.qa_pin_attempt(text,uuid),public.qa_pin_success(uuid,bigint),public.qa_pin_revoke(uuid),public.qa_pin_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qa_pin_register(uuid,uuid,text,text,text),public.qa_pin_attempt(text,uuid),public.qa_pin_success(uuid,bigint),public.qa_pin_revoke(uuid),public.qa_pin_access(uuid,uuid) to service_role;
create table contratacion_pin_private.reveal_audit(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 enrollment_id uuid not null references public.web_enrollments(id), created_at timestamptz not null default now()
);
alter table contratacion_pin_private.reveal_audit enable row level security;
revoke all on contratacion_pin_private.reveal_audit from public,anon,authenticated,service_role;
create trigger preserve_pin_reveal_audit before update or delete on contratacion_pin_private.reveal_audit
 for each row execute function public.contratacion_reject_delete();
create function public.qa_pin_audit_reveal(p_actor uuid,p_enrollment uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_actor and raw_app_meta_data->>'role'='platform_admin'
 and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'ROOT_REQUIRED';end if;
 insert into contratacion_pin_private.reveal_audit(actor_id,enrollment_id) values(p_actor,p_enrollment);
end $$;
revoke all on function public.qa_pin_audit_reveal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qa_pin_audit_reveal(uuid,uuid) to service_role;
commit;


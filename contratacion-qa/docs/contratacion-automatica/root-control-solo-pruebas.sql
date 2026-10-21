-- ONLY isolated operational QA. Commercial evidence is manually attested by Root;
-- this is not an automatic integration with CRM, a bank or a payment gateway.
create schema if not exists contratacion_private;
revoke all on schema contratacion_private from public, anon, authenticated, service_role;
grant usage on schema contratacion_private to authenticated;
create table contratacion_private.status_history (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 actor_id uuid not null references auth.users(id), previous_status text not null, new_status text not null,
 reason text not null check(length(trim(reason))>0), evidence jsonb,
 created_at timestamptz not null default now()
);
alter table contratacion_private.status_history enable row level security;
revoke all on contratacion_private.status_history from public,anon,authenticated,service_role;
create trigger preserve_history before update or delete on contratacion_private.status_history
 for each row execute function public.contratacion_reject_delete();
-- Service can edit other fields, but status changes must use the controlled RPC.
revoke update on public.companies, public.company_members from service_role;
do $$ declare t text; cols text; begin
 foreach t in array array['companies','company_members'] loop
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
 where table_schema='public' and table_name=t and column_name<>'status';
 execute format('grant update (%s) on public.%I to service_role',cols,t);
 end loop;
end $$;
create function contratacion_private.inactive_insert_only() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.status<>'inactive' then raise exception 'INITIAL_STATUS_MUST_BE_INACTIVE'; end if;
 return new; end $$;
revoke all on function contratacion_private.inactive_insert_only() from public,anon,authenticated,service_role;
create trigger company_initial_inactive before insert on public.companies for each row execute function contratacion_private.inactive_insert_only();
create trigger member_initial_inactive before insert on public.company_members for each row execute function contratacion_private.inactive_insert_only();
create function contratacion_private.change_status(p_company text,p_status text,p_reason text,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous text; member_count integer; admin_count integer; operator_count integer;
begin
 if auth.role() is distinct from 'authenticated' or actor is null or not exists(
 select 1 from auth.users where id=actor and raw_app_meta_data->>'role'='platform_admin'
 and (banned_until is null or banned_until<now()) and deleted_at is null
 ) then raise exception 'ROOT_REQUIRED'; end if;
 if p_status is null or p_status not in ('active','inactive') then raise exception 'STATUS_INVALID'; end if;
 if p_reason is null or length(trim(p_reason))=0 then raise exception 'REASON_REQUIRED'; end if;
 select status into previous from public.companies where id=p_company for update;
 if not found or not exists(select 1 from public.web_enrollments where company_id=p_company) then raise exception 'ENROLLMENT_NOT_FOUND'; end if;
 if p_status='active' then
 -- All evidence is Root's manual verification in this prototype, not payment processing.
 if p_evidence is null or jsonb_typeof(p_evidence)<>'object'
 or coalesce(p_evidence->>'quoteReference','')=''
 or coalesce(p_evidence->>'contractReference','')=''
 or coalesce(p_evidence->>'paymentReference','')=''
 or p_evidence->>'quoteAccepted' is distinct from 'true'
 or p_evidence->>'contractCompleted' is distinct from 'true'
 or p_evidence->>'paymentVerified' is distinct from 'true'
 or coalesce(p_evidence->>'basis','') not in ('first_month','full_contract')
 or coalesce(p_evidence->>'currency','') not in ('CLP','UF')
 or coalesce((p_evidence->>'requiredAmount')::numeric,0)<=0
 or coalesce((p_evidence->>'paidAmount')::numeric,0)<(p_evidence->>'requiredAmount')::numeric
 then raise exception 'ACTIVATION_REQUIREMENTS_MISSING'; end if;
 end if;
 select count(*),count(*) filter(where role='company_admin'),count(*) filter(where role='operator')
 into member_count,admin_count,operator_count from public.company_members where company_id=p_company;
 if member_count<>3 or admin_count<>1 or operator_count<>2 then raise exception 'INITIAL_ACCOUNTS_INVALID'; end if;
 if previous=p_status and not exists(select 1 from public.company_members where company_id=p_company and status<>p_status)
 then return jsonb_build_object('changed',false,'status',p_status); end if;
 update public.companies set status=p_status where id=p_company;
 update public.company_members set status=p_status where company_id=p_company;
 update auth.users u set raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',case when p_status='active' then cm.role else 'pending_enrollment' end)
 from public.company_members cm where cm.company_id=p_company and cm.user_id=u.id;
 insert into contratacion_private.status_history(company_id,actor_id,previous_status,new_status,reason,evidence)
 values(p_company,actor,previous,p_status,p_reason,case when p_status='active' then p_evidence else null end);
 return jsonb_build_object('changed',true,'status',p_status,'members',member_count);
end $$;
revoke all on function contratacion_private.change_status(text,text,text,jsonb) from public,anon,service_role;
grant execute on function contratacion_private.change_status(text,text,text,jsonb) to authenticated;
create function public.contratacion_root_change_status(p_company text,p_status text,p_reason text,p_evidence jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
 select contratacion_private.change_status(p_company,p_status,p_reason,p_evidence);
$$;
revoke all on function public.contratacion_root_change_status(text,text,text,jsonb) from public,anon,service_role;
grant execute on function public.contratacion_root_change_status(text,text,text,jsonb) to authenticated;

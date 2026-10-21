begin;
do $$
declare c text; root_id uuid:=gen_random_uuid(); client_id uuid; result jsonb; evidence jsonb;
begin
 select company_id into strict c from public.web_enrollments limit 1;
 select user_id into strict client_id from public.company_members where company_id=c and role='company_admin';
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 values(root_id,'authenticated','authenticated','root-fixture@example.invalid','{"role":"platform_admin"}','{}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',client_id,'role','authenticated','user_metadata',jsonb_build_object('role','platform_admin'))::text,true);
 set local role authenticated;
 begin
 perform public.contratacion_root_change_status(c,'active','Intento cliente',null);
 raise exception 'TEST_CLIENT_WAS_ALLOWED';
 exception when raise_exception then if sqlerrm<>'ROOT_REQUIRED' then raise; end if; end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',root_id,'role','authenticated')::text,true);
 set local role authenticated;
 begin
 perform public.contratacion_root_change_status(c,'active','Sin documentos',null);
 raise exception 'TEST_MISSING_EVIDENCE_ALLOWED';
 exception when raise_exception then if sqlerrm<>'ACTIVATION_REQUIREMENTS_MISSING' then raise; end if; end;
 evidence:='{"quoteReference":"QA-QUOTE","contractReference":"QA-CONTRACT","paymentReference":"QA-SIMULATED","quoteAccepted":true,"contractCompleted":true,"paymentVerified":true,"basis":"first_month","currency":"CLP","requiredAmount":10000,"paidAmount":9999}';
 begin
 perform public.contratacion_root_change_status(c,'active','Pago insuficiente',evidence);
 raise exception 'TEST_UNDERPAYMENT_ALLOWED';
 exception when raise_exception then if sqlerrm<>'ACTIVATION_REQUIREMENTS_MISSING' then raise; end if; end;
 evidence:=jsonb_set(evidence,'{paidAmount}','10000');
 result:=public.contratacion_root_change_status(c,'active','Activación ficticia dentro de rollback',evidence);
 if result->>'changed'<>'true' then raise exception 'TEST_ACTIVATION_FAILED'; end if;
 result:=public.contratacion_root_change_status(c,'active','Reintento',evidence);
 if result->>'changed'<>'false' then raise exception 'TEST_DUPLICATE_EVENT'; end if;
 reset role;
 if (select count(*) from public.company_members where company_id=c and status='active')<>3
 or (select status from public.companies where id=c)<>'active' then raise exception 'TEST_INCOMPLETE_ACTIVATION'; end if;
 set local role authenticated;
 perform public.contratacion_root_change_status(c,'inactive','Desactivación ficticia',null);
 reset role;
 if (select count(*) from public.company_members where company_id=c and status='inactive')<>3
 or (select status from public.companies where id=c)<>'inactive'
 or (select count(*) from contratacion_private.status_history where company_id=c)<>2
 then raise exception 'TEST_DEACTIVATION_HISTORY_FAILED'; end if;
 -- No service-key bypass of the controlled status transition.
 set local role service_role;
 begin
 update public.companies set status='active' where id=c;
 raise exception 'TEST_SERVICE_BYPASS_ALLOWED';
 exception when insufficient_privilege then null; end;
 reset role;
 begin
 delete from contratacion_private.status_history where company_id=c;
 raise exception 'TEST_HISTORY_DELETE_ALLOWED';
 exception when raise_exception then if sqlerrm<>'ACCOUNT_HISTORY_MUST_BE_PRESERVED' then raise; end if; end;
end $$;
select 'PASS: client denied, spoofed metadata denied, missing evidence and insufficient payment denied, Root activation/deactivation, three accounts, idempotency, history and service bypass protection; fixtures rolled back' as result;
rollback;

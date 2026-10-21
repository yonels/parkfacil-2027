-- PROPUESTA NO EJECUTADA. Destino: base CRM V2. Convertir con CLI en una migración tras revisión.
begin;
create table public.contratacion_jobs (
  id uuid primary key,
  fingerprint text not null,
  rut_normalizado text not null unique,
  payload jsonb not null,
  credentials text,
  empresa_id uuid not null references public.empresas(id),
  lead_id uuid not null references public.leads(id),
  state text not null check(state in ('processing','failed','completed')),
  operational jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contratacion_jobs enable row level security;
revoke all on public.contratacion_jobs from public, anon, authenticated;
grant select, insert, update on public.contratacion_jobs to service_role;

create table public.contratacion_delivery (
  job_id uuid primary key references public.contratacion_jobs(id),
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.contratacion_delivery enable row level security;
revoke all on public.contratacion_delivery from public, anon, authenticated;
grant select, insert, update on public.contratacion_delivery to service_role;

create function public.contratacion_begin(p_id uuid,p_fingerprint text,p_payload jsonb,p_credentials text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.contratacion_jobs; e uuid; l uuid; r text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into j from public.contratacion_jobs where id=p_id for update;
  if found then
    if j.fingerprint <> p_fingerprint then raise exception 'REQUEST_CONFLICT'; end if;
    if j.state <> 'failed' then
      return jsonb_build_object('state',j.state,'claimed',false);
    end if;
    update public.contratacion_jobs set state='processing',updated_at=now() where id=p_id;
    return jsonb_build_object('state','processing','claimed',true,'payload',j.payload,'fingerprint',j.fingerprint,'credentials',j.credentials);
  end if;
  r := ltrim(upper(regexp_replace(p_payload->>'rut','[^0-9kK]','','g')),'0');
  perform pg_advisory_xact_lock(hashtextextended('contratacion-email:'||lower(p_payload->>'correo'),0));
  if (select count(*) from public.contratacion_jobs where lower(payload->>'correo')=lower(p_payload->>'correo') and created_at>now()-interval '1 day') >= 2 then
    raise exception 'ENROLLMENT_RATE_LIMIT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contratacion-rut:'||r,0));
  if exists(select 1 from public.empresas where ltrim(upper(regexp_replace(rut,'[^0-9kK]','','g')),'0')=r)
    or exists(select 1 from public.contratacion_jobs where rut_normalizado=r) then
    raise exception 'COMPANY_REQUIRES_REVIEW';
  end if;
  insert into public.empresas(razon_social,rut,representante_legal,rut_representante,correo,telefono,direccion,comuna,ciudad,region,giro,direccion_representante,comuna_representante,ciudad_representante,estado)
  values(p_payload->>'empresa',p_payload->>'rut',concat_ws(' ',p_payload->>'representanteNombres',p_payload->>'representanteApellidos'),p_payload->>'representanteRut',p_payload->>'correo',p_payload->>'telefono',p_payload->>'direccion',p_payload->>'comuna',p_payload->>'ciudad',p_payload->>'region',p_payload->>'giro',p_payload->>'representanteDireccion',p_payload->>'representanteComuna',p_payload->>'representanteCiudad','Inactiva') returning id into e;
  insert into public.leads(empresa_id,empresa,rut,contacto,correo,telefono,plazas,mensaje,origen,estado)
  values(e,p_payload->>'empresa',p_payload->>'rut',concat_ws(' ',p_payload->>'representanteNombres',p_payload->>'representanteApellidos'),p_payload->>'correo',p_payload->>'telefono',(p_payload->>'plazas')::integer,p_payload::text,'Contratación web','Nuevo') returning id into l;
  insert into public.contratacion_jobs(id,fingerprint,rut_normalizado,payload,credentials,empresa_id,lead_id,state)
  values(p_id,p_fingerprint,r,p_payload,p_credentials,e,l,'processing');
  return jsonb_build_object('state','processing','claimed',true,'payload',p_payload,'fingerprint',p_fingerprint,'credentials',p_credentials);
end $$;

create function public.contratacion_complete(p_id uuid,p_operational jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.contratacion_jobs set state='completed',operational=p_operational,updated_at=now()
  where id=p_id and state='processing';
  if not found then raise exception 'JOB_STATE_INVALID'; end if;
  -- Completar el alta no cambia el estado comercial del lead.
  insert into public.contratacion_delivery(job_id) values(p_id) on conflict(job_id) do nothing;
end $$;

create function public.contratacion_fail(p_id uuid)
returns void language sql security invoker set search_path='' as $$
  update public.contratacion_jobs set state='failed',updated_at=now() where id=p_id and state='processing';
$$;

create function public.contratacion_delivery_claim(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.contratacion_delivery; j public.contratacion_jobs;
begin
  select * into d from public.contratacion_delivery where job_id=p_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if d.state in ('sent','sending') then return jsonb_build_object('claimed',false,'state',d.state); end if;
  select * into j from public.contratacion_jobs where id=p_id and state='completed';
  if not found or j.credentials is null then raise exception 'DELIVERY_INVALID'; end if;
  update public.contratacion_delivery set state='sending',attempts=attempts+1,updated_at=now() where job_id=p_id;
  return jsonb_build_object('claimed',true,'credentials',j.credentials,'email',j.payload->>'correo');
end $$;

create function public.contratacion_delivery_finish(p_id uuid,p_sent boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.contratacion_delivery set state=case when p_sent then 'sent' else 'failed' end,updated_at=now()
  where job_id=p_id and state='sending';
  if not found then raise exception 'DELIVERY_STATE_INVALID'; end if;
  if p_sent then update public.contratacion_jobs set credentials=null where id=p_id; end if;
end $$;
revoke all on function public.contratacion_delivery_claim(uuid),public.contratacion_delivery_finish(uuid,boolean) from public,anon,authenticated;
grant execute on function public.contratacion_delivery_claim(uuid),public.contratacion_delivery_finish(uuid,boolean) to service_role;
revoke all on function public.contratacion_begin(uuid,text,jsonb,text),public.contratacion_complete(uuid,jsonb),public.contratacion_fail(uuid) from public,anon,authenticated;
grant execute on function public.contratacion_begin(uuid,text,jsonb,text),public.contratacion_complete(uuid,jsonb),public.contratacion_fail(uuid) to service_role;
commit;

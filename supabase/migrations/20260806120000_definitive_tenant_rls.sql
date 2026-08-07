-- Etapa 4: RLS definitivo para aislamiento por empresa y estacionamiento.

create index if not exists abonados_estacionamientos_gin_idx on public.abonados using gin(estacionamientos);
create index if not exists abonado_credenciales_estacionamientos_gin_idx on public.abonado_credenciales using gin(estacionamientos);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists notifications_parking_created_idx on public.notifications(parking_id,created_at desc);

create or replace function public.pf_is_platform_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role','')='platform_admin';
$$;

create or replace function public.pf_current_company_id()
returns text language sql stable security definer set search_path=public,auth as $$
  select cm.company_id from public.company_members cm join public.companies c on c.id=cm.company_id
  where cm.user_id=auth.uid() and cm.status='active' and c.status='active' and c.relationship_type='client' limit 1;
$$;

create or replace function public.pf_is_company_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.company_members cm join public.companies c on c.id=cm.company_id
    where cm.user_id=auth.uid() and cm.status='active' and cm.role='company_admin' and c.status='active' and c.relationship_type='client');
$$;

create or replace function public.pf_can_access_parking(p_parking_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select public.pf_is_platform_admin() or exists(
    select 1 from public.parkings p where p.id=p_parking_id and p.company_id=public.pf_current_company_id()
    and (public.pf_is_company_admin() or exists(select 1 from public.company_member_parkings cmp where cmp.user_id=auth.uid() and cmp.parking_id=p.id))
  );
$$;

create or replace function public.pf_can_manage_parking(p_parking_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select public.pf_is_platform_admin() or (public.pf_is_company_admin() and exists(select 1 from public.parkings p where p.id=p_parking_id and p.company_id=public.pf_current_company_id()));
$$;

revoke all on function public.pf_is_platform_admin() from public;
revoke all on function public.pf_current_company_id() from public;
revoke all on function public.pf_is_company_admin() from public;
revoke all on function public.pf_can_access_parking(uuid) from public;
revoke all on function public.pf_can_manage_parking(uuid) from public;
grant execute on function public.pf_is_platform_admin(),public.pf_current_company_id(),public.pf_is_company_admin(),public.pf_can_access_parking(uuid),public.pf_can_manage_parking(uuid) to authenticated,service_role;

do $$
declare t text; p record;
begin
  foreach t in array array['companies','company_contracts','company_members','company_member_parkings','parkings','parking_levels','parking_level_counters','parking_zones','parking_sectors','parking_streets','parking_street_segments','parking_rates','parking_rate_blocks','parking_type_changes','operator_assignments','operator_shifts','shift_closures','shift_handoffs','shift_incidents','parking_movements','parking_stays','abonados','abonado_vehiculos','abonado_credenciales','abonado_responsables','abonado_credencial_envios','notifications','notification_attempts','coupon_merchants','coupons','commercial_plans','module_pricing','module_pricing_audit']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $$;

create policy companies_read on public.companies for select to authenticated using (public.pf_is_platform_admin() or id=public.pf_current_company_id());
create policy companies_write on public.companies for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and id=public.pf_current_company_id())) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and id=public.pf_current_company_id()));
create policy contracts_scope on public.company_contracts for select to authenticated using (public.pf_is_platform_admin() or company_id=public.pf_current_company_id());
create policy contracts_root_write on public.company_contracts for all to authenticated using (public.pf_is_platform_admin()) with check (public.pf_is_platform_admin());
create policy members_read on public.company_members for select to authenticated using (public.pf_is_platform_admin() or (company_id=public.pf_current_company_id() and (public.pf_is_company_admin() or user_id=auth.uid())));
create policy members_manage on public.company_members for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id())) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id()));
create policy member_parkings_read on public.company_member_parkings for select to authenticated using (public.pf_is_platform_admin() or (public.pf_can_access_parking(parking_id) and (public.pf_is_company_admin() or user_id=auth.uid())));
create policy member_parkings_manage on public.company_member_parkings for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and public.pf_can_manage_parking(parking_id))) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and public.pf_can_manage_parking(parking_id)));

create policy parkings_read on public.parkings for select to authenticated using (public.pf_can_access_parking(id));
create policy parkings_manage on public.parkings for all to authenticated using (public.pf_can_manage_parking(id)) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id()));

do $$ declare t text; begin
  foreach t in array array['parking_levels','parking_level_counters','parking_zones','parking_sectors','parking_streets','parking_street_segments','parking_rates','parking_type_changes','operator_assignments','parking_movements','parking_stays'] loop
    execute format('create policy %I_read on public.%I for select to authenticated using (public.pf_can_access_parking(parking_id))',t,t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.pf_can_manage_parking(parking_id)) with check (public.pf_can_manage_parking(parking_id))',t,t);
  end loop;
end $$;
create policy rate_blocks_read on public.parking_rate_blocks for select to authenticated using (exists(select 1 from public.parking_rates r where r.id=rate_id and public.pf_can_access_parking(r.parking_id)));
create policy rate_blocks_write on public.parking_rate_blocks for all to authenticated using (exists(select 1 from public.parking_rates r where r.id=rate_id and public.pf_can_manage_parking(r.parking_id))) with check (exists(select 1 from public.parking_rates r where r.id=rate_id and public.pf_can_manage_parking(r.parking_id)));

create policy shifts_read on public.operator_shifts for select to authenticated using (public.pf_can_access_parking(parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or operator_id=auth.uid()::text));
create policy shifts_write on public.operator_shifts for all to authenticated using (public.pf_can_access_parking(parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or operator_id=auth.uid()::text)) with check (public.pf_can_access_parking(parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or operator_id=auth.uid()::text));
create policy closures_scope on public.shift_closures for all to authenticated using (exists(select 1 from public.operator_shifts s where s.id=shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text))) with check (exists(select 1 from public.operator_shifts s where s.id=shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text)));
create policy handoffs_scope on public.shift_handoffs for all to authenticated using (exists(select 1 from public.operator_shifts s where s.id=outgoing_shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text))) with check (exists(select 1 from public.operator_shifts s where s.id=outgoing_shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text)));
create policy incidents_scope on public.shift_incidents for all to authenticated using (exists(select 1 from public.operator_shifts s where s.id=shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text))) with check (exists(select 1 from public.operator_shifts s where s.id=shift_id and public.pf_can_access_parking(s.parking_id) and (public.pf_is_platform_admin() or public.pf_is_company_admin() or s.operator_id=auth.uid()::text)));

create policy abonados_read on public.abonados for select to authenticated using (public.pf_is_platform_admin() or (empresa_id=public.pf_current_company_id() and (public.pf_is_company_admin() or exists(select 1 from public.company_member_parkings cmp where cmp.user_id=auth.uid() and cmp.parking_id::text=any(estacionamientos)))));
create policy abonados_manage on public.abonados for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and empresa_id=public.pf_current_company_id())) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and empresa_id=public.pf_current_company_id()));
do $$ declare t text; begin foreach t in array array['abonado_vehiculos','abonado_credenciales'] loop execute format('create policy %I_read on public.%I for select to authenticated using (exists(select 1 from public.abonados a where a.id=abonado_id))',t,t); execute format('create policy %I_write on public.%I for all to authenticated using (exists(select 1 from public.abonados a where a.id=abonado_id and (public.pf_is_platform_admin() or public.pf_is_company_admin()))) with check (exists(select 1 from public.abonados a where a.id=abonado_id and (public.pf_is_platform_admin() or public.pf_is_company_admin())))',t,t); end loop; end $$;
create policy responsables_read on public.abonado_responsables for select to authenticated using (exists(select 1 from public.abonados a where a.responsable_id=id));
create policy responsables_write on public.abonado_responsables for all to authenticated using (public.pf_is_platform_admin() or public.pf_is_company_admin()) with check (public.pf_is_platform_admin() or public.pf_is_company_admin());
create policy credential_sends_scope on public.abonado_credencial_envios for all to authenticated using (exists(select 1 from public.abonados a where a.id=abonado_id)) with check (exists(select 1 from public.abonados a where a.id=abonado_id and (public.pf_is_platform_admin() or public.pf_is_company_admin())));

create policy notifications_read on public.notifications for select to authenticated using (public.pf_is_platform_admin() or user_id=auth.uid() or (parking_id is not null and public.pf_can_access_parking(parking_id)) or exists(select 1 from public.abonados a where a.id=subscriber_id));
create policy notifications_write on public.notifications for all to authenticated using (public.pf_is_platform_admin() or public.pf_is_company_admin()) with check (public.pf_is_platform_admin() or public.pf_is_company_admin() or (user_id=auth.uid() and parking_id is null and subscriber_id is null));
create policy notification_attempts_scope on public.notification_attempts for all to authenticated using (exists(select 1 from public.notifications n where n.id=notification_id)) with check (exists(select 1 from public.notifications n where n.id=notification_id and (public.pf_is_platform_admin() or public.pf_is_company_admin())));

create policy merchants_read on public.coupon_merchants for select to authenticated using (public.pf_is_platform_admin() or company_id=public.pf_current_company_id());
create policy merchants_manage on public.coupon_merchants for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id())) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id()));
create policy coupons_read on public.coupons for select to authenticated using (public.pf_is_platform_admin() or company_id=public.pf_current_company_id());
create policy coupons_manage on public.coupons for all to authenticated using (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id())) with check (public.pf_is_platform_admin() or (public.pf_is_company_admin() and company_id=public.pf_current_company_id()));

do $$ declare t text; begin foreach t in array array['commercial_plans','module_pricing'] loop execute format('create policy %I_read on public.%I for select to authenticated using (true)',t,t); execute format('create policy %I_root_write on public.%I for all to authenticated using (public.pf_is_platform_admin()) with check (public.pf_is_platform_admin())',t,t); end loop; end $$;
create policy module_pricing_audit_read on public.module_pricing_audit for select to authenticated using (public.pf_is_platform_admin());
create policy module_pricing_audit_write on public.module_pricing_audit for insert to authenticated with check (public.pf_is_platform_admin());

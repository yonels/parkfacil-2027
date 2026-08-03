-- Seed explícito Etapa 19. Ejecutar solo después de 20260728160000.
do $$
declare off_id uuid; on_id uuid; level_n1 uuid; sector_a uuid; street_bandera uuid;
begin
  select id into off_id from public.parkings where code='PC-001';
  select id into on_id from public.parkings where code='PN-002';
  insert into public.parking_levels(parking_id,code,name,status) values(off_id,'N-1','Nivel -1','ACTIVE')
    on conflict(parking_id,code) do update set name=excluded.name returning id into level_n1;
  insert into public.parking_zones(parking_id,level_id,code,name,status,capacity,occupied) values
    (off_id,level_n1,'A','Zona A','ACTIVE',40,25),(off_id,level_n1,'VIS','Zona Visitas','ACTIVE',20,10)
    on conflict(level_id,code) do update set capacity=excluded.capacity,occupied=excluded.occupied;
  insert into public.parking_sectors(parking_id,code,name,status,description,notes,type,capacity,occupied)
    values(on_id,'A','Norte','ACTIVE','Área norte','',null,null,0)
    on conflict(parking_id,code) do update set name=excluded.name returning id into sector_a;
  insert into public.parking_streets(parking_id,sector_id,name,district,status,capacity,occupied)
    values(on_id,sector_a,'Bandera','Centro','ACTIVE',25,13)
    on conflict(sector_id,name) do update set capacity=excluded.capacity,occupied=excluded.occupied returning id into street_bandera;
  insert into public.parking_streets(parking_id,sector_id,name,district,status,capacity,occupied)
    values(on_id,sector_a,'Morandé','Centro','ACTIVE',10,5)
    on conflict(sector_id,name) do update set capacity=excluded.capacity,occupied=excluded.occupied;
  if not exists(select 1 from public.operator_assignments where street_id=street_bandera and operator_id='u-001') then
    insert into public.operator_assignments(operator_id,parking_id,sector_id,street_id,number_from,number_to,max_vehicles,valid_from,start_time,end_time,days_of_week,status)
    values('u-001',on_id,sector_a,street_bandera,100,300,15,current_date,'08:00','16:00',array[1,2,3,4,5],'ACTIVE');
  end if;
  if not exists(select 1 from public.operator_assignments where street_id=street_bandera and operator_id='u-002') then
    insert into public.operator_assignments(operator_id,parking_id,sector_id,street_id,number_from,number_to,max_vehicles,valid_from,start_time,end_time,days_of_week,status)
    values('u-002',on_id,sector_a,street_bandera,301,500,10,current_date,'08:00','16:00',array[1,2,3,4,5],'ACTIVE');
  end if;
end $$;

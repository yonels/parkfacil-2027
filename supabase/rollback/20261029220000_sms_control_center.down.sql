-- Reversión de 20261029220000_sms_control_center.sql (SOL-2026-10-29-007).
-- Elimina solo objetos sms_* creados por esa migración; no toca tablas On Street.
-- Uso local: psql -v ON_ERROR_STOP=1 -f supabase/rollback/20261029220000_sms_control_center.down.sql
begin;
drop function if exists public.sms_consumption(jsonb);
drop function if exists public.sms_failure_summary(jsonb);
drop function if exists public.sms_history_filtered(jsonb);
drop function if exists public.sms_user_labels(uuid[]);
drop function if exists public.sms_dashboard_summary(jsonb);
drop view if exists public.sms_history_v;
drop function if exists public.sms_apply_retention(uuid);
drop function if exists public.sms_claim_due(integer);
drop function if exists public.sms_transition(uuid, text[], text, jsonb, jsonb);
drop function if exists public.sms_enqueue_message(jsonb);
drop table if exists public.sms_admin_audit;
drop table if exists public.sms_tariffs;
drop table if exists public.sms_provider_checks;
drop table if exists public.sms_inbound_messages;
drop table if exists public.sms_message_events;
drop table if exists public.sms_messages;
drop table if exists public.sms_settings;
delete from supabase_migrations.schema_migrations where version = '20261029220000';
commit;

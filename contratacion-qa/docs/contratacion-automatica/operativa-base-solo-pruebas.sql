SET search_path=public;
CREATE TABLE public."companies" (
"id" text NOT NULL,
"rut_number" text NOT NULL,
"rut_dv" text NOT NULL,
"business_name" text NOT NULL,
"trade_name" text NOT NULL,
"business_activity" text DEFAULT ''::text NOT NULL,
"address" text NOT NULL,
"district" text DEFAULT ''::text NOT NULL,
"city" text NOT NULL,
"region" text DEFAULT ''::text NOT NULL,
"country" text DEFAULT 'Chile'::text NOT NULL,
"primary_contact" text NOT NULL,
"email" text NOT NULL,
"phone" text NOT NULL,
"legal_representative" text NOT NULL,
"status" text DEFAULT 'inactive'::text NOT NULL,
"relationship_type" text DEFAULT 'client'::text NOT NULL,
"incorporated_on" date,
"notes" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"commercial_plan" text DEFAULT 'UNASSIGNED'::text NOT NULL,
"enabled_products" text[] DEFAULT '{}'::text[] NOT NULL,
"mobile_phone" text DEFAULT ''::text NOT NULL,
"website" text DEFAULT ''::text NOT NULL);
CREATE TABLE public."company_member_parkings" (
"user_id" uuid NOT NULL,
"parking_id" uuid NOT NULL,
"access_level" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."company_members" (
"user_id" uuid NOT NULL,
"company_id" text NOT NULL,
"full_name" text NOT NULL,
"role" text NOT NULL,
"status" text DEFAULT 'inactive'::text NOT NULL,
"pos_only" boolean DEFAULT false NOT NULL,
"must_change_password" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"recovery_email" text);
CREATE TABLE public."parking_levels" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"parking_id" uuid NOT NULL,
"code" text NOT NULL,
"name" text NOT NULL,
"status" text DEFAULT 'ACTIVE'::text NOT NULL,
"description" text DEFAULT ''::text NOT NULL,
"notes" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"declared_capacity" integer DEFAULT 0 NOT NULL);
CREATE TABLE public."parking_zones" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"parking_id" uuid NOT NULL,
"level_id" uuid NOT NULL,
"code" text NOT NULL,
"name" text NOT NULL,
"status" text DEFAULT 'ACTIVE'::text NOT NULL,
"capacity" integer NOT NULL,
"occupied" integer DEFAULT 0 NOT NULL,
"description" text DEFAULT ''::text NOT NULL,
"notes" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."parkings" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"code" text NOT NULL,
"name" text NOT NULL,
"company_id" text NOT NULL,
"company_name" text,
"type" text NOT NULL,
"status" text NOT NULL,
"address" text NOT NULL,
"city" text NOT NULL,
"country" text DEFAULT ''::text NOT NULL,
"schedule" text DEFAULT ''::text NOT NULL,
"description" text DEFAULT ''::text NOT NULL,
"access_count" integer DEFAULT 0 NOT NULL,
"exit_count" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"district" text DEFAULT ''::text NOT NULL,
"region" text DEFAULT ''::text NOT NULL,
"notes" text DEFAULT ''::text NOT NULL,
"off_street_configuration_status" text DEFAULT 'EMPTY'::text NOT NULL,
"on_street_configuration_status" text DEFAULT 'EMPTY'::text NOT NULL,
"type_changed_at" timestamp with time zone,
"type_changed_by" uuid,
"predecessor_parking_id" uuid,
"suspended_at" timestamp with time zone,
"closed_at" timestamp with time zone,
"closure_reason" text DEFAULT ''::text NOT NULL);
ALTER TABLE public."companies" ADD CONSTRAINT "companies_commercial_plan_check" CHECK ((commercial_plan = ANY (ARRAY['UNASSIGNED'::text, 'ESSENTIAL'::text, 'PROFESSIONAL'::text, 'ENTERPRISE'::text, 'CUSTOM'::text])));
ALTER TABLE public."companies" ADD CONSTRAINT "companies_enabled_products_check" CHECK ((enabled_products <@ ARRAY['OFF_STREET'::text, 'ON_STREET'::text]));
ALTER TABLE public."companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id);
ALTER TABLE public."companies" ADD CONSTRAINT "companies_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['client'::text, 'operator'::text, 'administrator'::text, 'partner'::text, 'supplier'::text])));
ALTER TABLE public."companies" ADD CONSTRAINT "companies_rut_number_rut_dv_key" UNIQUE (rut_number, rut_dv);
ALTER TABLE public."companies" ADD CONSTRAINT "companies_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'onboarding'::text])));
ALTER TABLE public."company_member_parkings" ADD CONSTRAINT "company_member_parkings_access_level_check" CHECK ((access_level = ANY (ARRAY['ADMIN'::text, 'POS_OPERATOR'::text])));
ALTER TABLE public."company_member_parkings" ADD CONSTRAINT "company_member_parkings_pkey" PRIMARY KEY (user_id, parking_id);
ALTER TABLE public."company_members" ADD CONSTRAINT "company_members_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."company_members" ADD CONSTRAINT "company_members_role_check" CHECK ((role = ANY (ARRAY['company_admin'::text, 'operator'::text])));
ALTER TABLE public."company_members" ADD CONSTRAINT "company_members_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'inactive'::text])));
ALTER TABLE public."parking_levels" ADD CONSTRAINT "parking_levels_declared_capacity_check" CHECK ((declared_capacity >= 0));
ALTER TABLE public."parking_levels" ADD CONSTRAINT "parking_levels_parking_id_code_key" UNIQUE (parking_id, code);
ALTER TABLE public."parking_levels" ADD CONSTRAINT "parking_levels_pkey" PRIMARY KEY (id);
ALTER TABLE public."parking_levels" ADD CONSTRAINT "parking_levels_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'MAINTENANCE'::text])));
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_capacity_check" CHECK ((capacity > 0));
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_check" CHECK (((occupied >= 0) AND (occupied <= capacity)));
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_level_id_code_key" UNIQUE (level_id, code);
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_pkey" PRIMARY KEY (id);
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'MAINTENANCE'::text])));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_access_count_check" CHECK ((access_count >= 0));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_code_key" UNIQUE (code);
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_exit_count_check" CHECK ((exit_count >= 0));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_off_street_configuration_status_check" CHECK ((off_street_configuration_status = ANY (ARRAY['EMPTY'::text, 'ACTIVE'::text, 'ARCHIVED'::text])));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_on_street_configuration_status_check" CHECK ((on_street_configuration_status = ANY (ARRAY['EMPTY'::text, 'ACTIVE'::text, 'ARCHIVED'::text])));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_pkey" PRIMARY KEY (id);
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CONFIGURING'::text, 'READY_FOR_REVIEW'::text, 'ACTIVE'::text, 'INACTIVE'::text, 'SUSPENDED'::text, 'CLOSED'::text])));
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_type_check" CHECK ((type = ANY (ARRAY['OFF_STREET'::text, 'ON_STREET'::text])));
ALTER TABLE public."company_member_parkings" ADD CONSTRAINT "company_member_parkings_parking_id_fkey" FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE RESTRICT;
ALTER TABLE public."company_member_parkings" ADD CONSTRAINT "company_member_parkings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES company_members(user_id) ON DELETE RESTRICT;
ALTER TABLE public."company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public."company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."parking_levels" ADD CONSTRAINT "parking_levels_parking_id_fkey" FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE RESTRICT;
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_level_id_fkey" FOREIGN KEY (level_id) REFERENCES parking_levels(id) ON DELETE RESTRICT;
ALTER TABLE public."parking_zones" ADD CONSTRAINT "parking_zones_parking_id_fkey" FOREIGN KEY (parking_id) REFERENCES parkings(id) ON DELETE RESTRICT;
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_predecessor_parking_id_fkey" FOREIGN KEY (predecessor_parking_id) REFERENCES parkings(id) ON DELETE RESTRICT;
ALTER TABLE public."parkings" ADD CONSTRAINT "parkings_type_changed_by_fkey" FOREIGN KEY (type_changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."companies" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."companies" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."companies" TO service_role;
ALTER TABLE public."company_member_parkings" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."company_member_parkings" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."company_member_parkings" TO service_role;
ALTER TABLE public."company_members" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."company_members" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."company_members" TO service_role;
ALTER TABLE public."parking_levels" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."parking_levels" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."parking_levels" TO service_role;
ALTER TABLE public."parking_zones" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."parking_zones" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."parking_zones" TO service_role;
ALTER TABLE public."parkings" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."parkings" FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public."parkings" TO service_role;
CREATE FUNCTION public.contratacion_reject_delete() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'ACCOUNT_HISTORY_MUST_BE_PRESERVED'; END $$;
REVOKE ALL ON FUNCTION public.contratacion_reject_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."companies" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."company_member_parkings" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."company_members" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."parking_levels" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."parking_zones" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();
CREATE TRIGGER preserve_contratacion_history BEFORE DELETE ON public."parkings" FOR EACH ROW EXECUTE FUNCTION public.contratacion_reject_delete();


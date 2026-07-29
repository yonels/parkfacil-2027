import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [companyId, companySlug, administratorName] = process.argv.slice(2);
if (!companyId || !companySlug || !administratorName) {
  throw new Error("Uso: node scripts/provision-company-default-users.mjs <company-id> <slug> <nombre-administrador>");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Falta la configuración de Supabase.");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: defaultParking, error: parkingError } = await supabase
  .from("parkings")
  .select("id,code")
  .eq("company_id", companyId)
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (parkingError) throw parkingError;
if (!defaultParking) throw new Error("La empresa no tiene un estacionamiento inicial.");
const definitions = [
  { fullName: administratorName, email: `admin.${companySlug}@usuarios.parkfacil.cl`, role: "company_admin", posOnly: false },
  { fullName: `Operador 1 ${companySlug.toUpperCase()}`, email: `operador1.${companySlug}@usuarios.parkfacil.cl`, role: "operator", posOnly: true },
  { fullName: `Operador 2 ${companySlug.toUpperCase()}`, email: `operador2.${companySlug}@usuarios.parkfacil.cl`, role: "operator", posOnly: true },
];

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

const credentials = [];
for (const definition of definitions) {
  const existing = listed.users.find((user) => user.email?.toLowerCase() === definition.email);
  let user = existing;
  let temporaryPassword = null;
  if (!user) {
    temporaryPassword = `Pf-${randomBytes(12).toString("base64url")}!9`;
    const created = await supabase.auth.admin.createUser({
      email: definition.email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: {
        role: definition.role,
        company_id: companyId,
        parking_id: defaultParking.id,
        access_scope: definition.posOnly ? "pos_only" : "company",
      },
      user_metadata: { full_name: definition.fullName, must_change_password: true },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        role: definition.role,
        company_id: companyId,
        parking_id: defaultParking.id,
        access_scope: definition.posOnly ? "pos_only" : "company",
      },
      user_metadata: { ...user.user_metadata, full_name: definition.fullName, must_change_password: true },
    });
    if (updated.error) throw updated.error;
  }

  const member = await supabase.from("company_members").upsert({
    user_id: user.id,
    company_id: companyId,
    full_name: definition.fullName,
    role: definition.role,
    status: "active",
    pos_only: definition.posOnly,
    must_change_password: true,
  });
  if (member.error) throw member.error;
  const parkingAccess = await supabase.from("company_member_parkings").upsert({
    user_id: user.id,
    parking_id: defaultParking.id,
    access_level: definition.posOnly ? "POS_OPERATOR" : "ADMIN",
  });
  if (parkingAccess.error) throw parkingAccess.error;
  credentials.push({ email: definition.email, temporaryPassword, role: definition.role, existing: Boolean(existing) });
}

console.log(JSON.stringify({ companyId, credentials }, null, 2));

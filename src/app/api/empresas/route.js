import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listCompanies } from "@/lib/companiesRepository";
import { randomUUID } from "node:crypto";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { companyScope, requirePermission, requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.COMPANY_READ);
    return NextResponse.json({ data: await listCompanies(getSupabaseAdminClient(), { companyId: companyScope(authorization.context) }) });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    console.error("[companies:list]", error);
    return NextResponse.json({ error: "No fue posible obtener las empresas.", code: "COMPANIES_READ_FAILED" }, { status: 500 });
  }
}

function text(value) {
  return String(value || "").trim();
}

function accountInput(value, role, index) {
  return {
    fullName: text(value?.fullName) || (role === "company_admin" ? "Administrador de empresa" : `Operador ${index}`),
    email: text(value?.email).toLowerCase(),
    password: String(value?.password || ""),
    role,
  };
}

function validateCreation(input) {
  const errors = [];
  if (!text(input?.businessName)) errors.push("La razón social es obligatoria.");
  if (!/^\d{7,8}$/.test(text(input?.rutNumber))) errors.push("El RUT debe contener 7 u 8 dígitos.");
  if (!/^[0-9Kk]$/.test(text(input?.rutDv))) errors.push("El dígito verificador no es válido.");
  const accounts = [
    accountInput(input?.administrator, "company_admin", 1),
    accountInput(input?.operators?.[0], "operator", 1),
    accountInput(input?.operators?.[1], "operator", 2),
  ];
  for (const account of accounts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) errors.push(`Falta un correo válido para ${account.fullName}.`);
    if (account.password.length < 12) errors.push(`La clave temporal de ${account.fullName} debe tener al menos 12 caracteres.`);
  }
  if (new Set(accounts.map((account) => account.email)).size !== 3) errors.push("Las tres cuentas deben usar correos distintos.");
  return { errors, accounts };
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePlatformAdmin(authorization.context); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const input = await request.json();
  const { errors, accounts } = validateCreation(input);
  if (errors.length) return NextResponse.json({ error: "Revisa los datos de la empresa y sus cuentas.", details: errors }, { status: 400 });

  const db = getSupabaseAdminClient();
  const companyId = `emp-${randomUUID()}`;
  const createdUsers = [];
  let companyCreated = false;
  let parkingCreated = false;
  let parkingId = null;
  let levelId = null;
  let zoneId = null;
  try {
    const company = {
      id: companyId,
      rut_number: text(input.rutNumber),
      rut_dv: text(input.rutDv).toUpperCase(),
      business_name: text(input.businessName),
      trade_name: text(input.tradeName) || text(input.businessName),
      business_activity: text(input.businessActivity),
      address: text(input.address),
      district: text(input.district),
      city: text(input.city),
      region: text(input.region),
      country: text(input.country) || "Chile",
      primary_contact: accounts[0].fullName,
      email: accounts[0].email,
      phone: text(input.phone),
      legal_representative: text(input.legalRepresentative),
      status: "active",
      relationship_type: "client",
      incorporated_on: new Date().toISOString().slice(0, 10),
      notes: text(input.notes),
      commercial_plan: ({
        Esencial: "ESSENTIAL",
        Profesional: "PROFESSIONAL",
        Enterprise: "ENTERPRISE",
        Personalizado: "CUSTOM",
      })[text(input.plan)] || "UNASSIGNED",
    };
    const inserted = await db.from("companies").insert(company).select("*").single();
    if (inserted.error) throw inserted.error;
    companyCreated = true;

    const defaultParking = {
      code: text(input.defaultParking?.code).toUpperCase() || `EMP-${company.rut_number}-01`,
      name: text(input.defaultParking?.name) || `Estacionamiento ${company.trade_name}`,
      company_id: companyId,
      company_name: company.trade_name,
      type: text(input.defaultParking?.type).toUpperCase() === "ON_STREET" ? "ON_STREET" : "OFF_STREET",
      status: "DRAFT",
      address: text(input.defaultParking?.address) || company.address,
      district: text(input.defaultParking?.district) || company.district,
      city: text(input.defaultParking?.city) || company.city,
      region: text(input.defaultParking?.region) || company.region,
      country: text(input.defaultParking?.country) || company.country,
      schedule: text(input.defaultParking?.schedule) || "Pendiente de configuración",
      description: text(input.defaultParking?.description) || "Estacionamiento inicial creado con los datos de la empresa y su contrato.",
      notes: "Modalidad, capacidad, accesos, salidas y horario deben ser confirmados antes de activar.",
      access_count: 0,
      exit_count: 0,
      off_street_configuration_status: "EMPTY",
      on_street_configuration_status: "EMPTY",
    };
    const parkingResult = await db.from("parkings").insert(defaultParking).select("id,code,name").single();
    if (parkingResult.error) throw parkingResult.error;
    parkingCreated = true;
    parkingId = parkingResult.data.id;

    const declaredCapacity = Number(input.defaultParking?.capacity || 0);
    if (defaultParking.type === "OFF_STREET" && Number.isInteger(declaredCapacity) && declaredCapacity > 0) {
      const levelResult = await db.from("parking_levels").insert({
        parking_id: parkingId,
        code: "NIV-001",
        name: "Nivel general",
        status: "ACTIVE",
        description: "Nivel inicial creado desde los datos del contrato.",
        notes: "Puede subdividirse durante la configuración.",
        declared_capacity: declaredCapacity,
      }).select("id").single();
      if (levelResult.error) throw levelResult.error;
      levelId = levelResult.data.id;
      const zoneResult = await db.from("parking_zones").insert({
        parking_id: parkingId,
        level_id: levelId,
        code: "ZON-001",
        name: "Zona general",
        status: "ACTIVE",
        capacity: declaredCapacity,
        occupied: 0,
        description: "Zona inicial que representa la capacidad indicada en el contrato.",
        notes: "Puede subdividirse conservando la capacidad total.",
      }).select("id").single();
      if (zoneResult.error) throw zoneResult.error;
      zoneId = zoneResult.data.id;
      const configured = await db.from("parkings").update({
        off_street_configuration_status: "ACTIVE",
      }).eq("id", parkingId);
      if (configured.error) throw configured.error;
    }

    for (const account of accounts) {
      const created = await db.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        app_metadata: {
          role: account.role,
          company_id: companyId,
          parking_id: parkingId,
          access_scope: account.role === "operator" ? "pos_only" : "company",
        },
        user_metadata: { full_name: account.fullName, must_change_password: true },
      });
      if (created.error) throw created.error;
      createdUsers.push(created.data.user.id);
      const member = await db.from("company_members").insert({
        user_id: created.data.user.id,
        company_id: companyId,
        full_name: account.fullName,
        role: account.role,
        status: "active",
        pos_only: account.role === "operator",
        must_change_password: true,
      });
      if (member.error) throw member.error;
      const parkingAccess = await db.from("company_member_parkings").insert({
        user_id: created.data.user.id,
        parking_id: parkingId,
        access_level: account.role === "operator" ? "POS_OPERATOR" : "ADMIN",
      });
      if (parkingAccess.error) throw parkingAccess.error;
    }

    return NextResponse.json({
      data: (await listCompanies(db, { companyId })).find((company) => company.id === companyId),
      parking: parkingResult.data,
      accounts: accounts.map(({ password: _password, ...account }) => ({ ...account, mustChangePassword: true })),
    }, { status: 201 });
  } catch (error) {
    for (const userId of createdUsers) await db.auth.admin.deleteUser(userId);
    if (zoneId) await db.from("parking_zones").delete().eq("id", zoneId);
    if (levelId) await db.from("parking_levels").delete().eq("id", levelId);
    if (parkingCreated) await db.from("parkings").delete().eq("id", parkingId);
    if (companyCreated) await db.from("companies").delete().eq("id", companyId);
    console.error("[companies:create]", error);
    return NextResponse.json({ error: "No fue posible crear la empresa y sus tres cuentas.", code: "COMPANY_CREATE_FAILED" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listCompanies } from "@/lib/companiesRepository";
import { randomUUID } from "node:crypto";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { companyScope, requirePermission, requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, PRODUCTS } from "@/lib/auth/permissions.mjs";
import { createAccessUsername, buildTechnicalEmail, createTemporaryPassword } from "@/lib/auth/accessCredentialCore.mjs";
import { isValidContactEmail, normalizeChileanMobile, normalizeWebsiteUrl } from "@/lib/companyContactCore.mjs";
import { sendCompanyEnrollmentEmail } from "@/lib/companyEnrollmentEmailCore.mjs";

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

const ACCOUNT_LABELS = { company_admin: "Administrador", operator: "Operador" };

// Las 3 cuentas iniciales ya NO reciben correo ni clave desde el
// formulario (encargo "ajustar flujo de creación de empresas" 2026-09-10,
// §1/§2): el único dato que aporta Root es el nombre completo. El usuario
// de acceso y la clave inicial se generan en el servidor -- ver
// accessCredentialCore.mjs.
function accountInput(value, role, index) {
  return {
    fullName: text(value?.fullName) || (role === "company_admin" ? "Administrador de empresa" : `Operador ${index}`),
    role,
    label: role === "company_admin" ? "Administrador" : `Operador ${index}`,
  };
}

function validateCreation(input) {
  const errors = [];
  if (!text(input?.businessName)) errors.push("La razón social es obligatoria.");
  if (!/^\d{7,8}$/.test(text(input?.rutNumber))) errors.push("El RUT debe contener 7 u 8 dígitos.");
  if (!/^[0-9Kk]$/.test(text(input?.rutDv))) errors.push("El dígito verificador no es válido.");

  // Correo de CONTACTO de la empresa (obligatorio, §4): destino del correo
  // de enrolamiento con las credenciales -- nunca un correo individual.
  const contactEmail = text(input?.contactEmail).toLowerCase();
  if (!isValidContactEmail(contactEmail)) errors.push("El correo de contacto de la empresa es obligatorio y debe ser válido.");

  let mobilePhone = "";
  if (text(input?.mobilePhone)) {
    const mobile = normalizeChileanMobile(input.mobilePhone);
    if (!mobile.ok) errors.push(mobile.error);
    else mobilePhone = mobile.value;
  }

  let website = "";
  if (text(input?.website)) {
    const site = normalizeWebsiteUrl(input.website);
    if (!site.ok) errors.push(site.error);
    else website = site.value;
  }

  const accounts = [
    accountInput(input?.administrator, "company_admin", 1),
    accountInput(input?.operators?.[0], "operator", 1),
    accountInput(input?.operators?.[1], "operator", 2),
  ];
  for (const account of accounts) {
    if (!account.fullName.trim()) errors.push(`Falta el nombre completo del ${ACCOUNT_LABELS[account.role].toLowerCase()}.`);
  }

  return { errors, accounts, contactEmail, mobilePhone, website };
}

// Productos habilitados al crear la empresa: si el formulario los indica
// explícitamente se usan esos (saneados contra la lista válida); si no, se
// infieren del tipo del estacionamiento inicial que se está creando junto
// con la empresa, para no dejarla sin acceso a lo que se le acaba de crear.
// Nunca queda implícito "ambos" -- Root debe declarar el producto igual que
// para cualquier empresa nueva (ver §5 de la auditoría de acceso por producto).
function resolveNewCompanyProducts(input, defaultParkingType) {
  const requested = Array.isArray(input?.products) ? input.products : null;
  if (requested) {
    const sanitized = requested.filter((product) => product === PRODUCTS.OFF_STREET || product === PRODUCTS.ON_STREET);
    if (sanitized.length) return [...new Set(sanitized)];
  }
  return [defaultParkingType];
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePlatformAdmin(authorization.context); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const input = await request.json();
  const { errors, accounts, contactEmail, mobilePhone, website } = validateCreation(input);
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
    const defaultParkingType = text(input.defaultParking?.type).toUpperCase() === "ON_STREET" ? "ON_STREET" : "OFF_STREET";
    const company = {
      id: companyId,
      enabled_products: resolveNewCompanyProducts(input, defaultParkingType),
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
      email: contactEmail,
      phone: text(input.phone),
      mobile_phone: mobilePhone,
      website,
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
      type: defaultParkingType,
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

    // Cada cuenta recibe un usuario de acceso + clave inicial generados por
    // el servidor (§1/§2): username -> email técnico bajo un dominio fijo
    // que Supabase nunca usa para enviar nada (ver accessCredentialCore.mjs).
    // Reintenta con un nuevo candidato ante colisión real (mismo criterio
    // EMAIL_ALREADY_EXISTS que ya usa POST /api/usuarios) -- la probabilidad
    // de choque con un sufijo aleatorio de 6 caracteres es prácticamente
    // nula, esto es solo una red de seguridad.
    const provisionedAccounts = [];
    for (const account of accounts) {
      let created = null;
      let username = "";
      let password = "";
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        username = createAccessUsername(account.role);
        password = createTemporaryPassword();
        const technicalEmail = buildTechnicalEmail(username);
        const attemptResult = await db.auth.admin.createUser({
          email: technicalEmail,
          password,
          email_confirm: true,
          app_metadata: {
            role: account.role,
            company_id: companyId,
            parking_id: parkingId,
            access_scope: account.role === "operator" ? "pos_only" : "company",
          },
          user_metadata: { full_name: account.fullName, must_change_password: true },
        });
        if (!attemptResult.error) {
          created = attemptResult.data.user;
        } else if (!/already|exists|registered/i.test(attemptResult.error.message || "")) {
          throw attemptResult.error;
        }
      }
      if (!created) throw new Error(`No fue posible generar un usuario de acceso único para ${account.label}.`);

      createdUsers.push(created.id);
      const member = await db.from("company_members").insert({
        user_id: created.id,
        company_id: companyId,
        full_name: account.fullName,
        role: account.role,
        status: "active",
        pos_only: account.role === "operator",
        must_change_password: true,
      });
      if (member.error) throw member.error;
      const parkingAccess = await db.from("company_member_parkings").insert({
        user_id: created.id,
        parking_id: parkingId,
        access_level: account.role === "operator" ? "POS_OPERATOR" : "ADMIN",
      });
      if (parkingAccess.error) throw parkingAccess.error;

      // La clave en texto plano solo vive en esta variable local, dentro de
      // esta misma solicitud -- se usa una vez (correo de enrolamiento, más
      // abajo) y nunca se persiste ni se devuelve en la respuesta HTTP.
      provisionedAccounts.push({ role: account.role, label: account.label, fullName: account.fullName, username, password });
    }

    const companyRecord = (await listCompanies(db, { companyId })).find((item) => item.id === companyId);

    // Correo de enrolamiento (§3): se envía DESPUÉS de que empresa +
    // usuarios + company_members ya existen correctamente -- un fallo de
    // envío NUNCA revierte lo anterior (ver companyEnrollmentEmailCore.mjs),
    // solo se registra para permitir reintento (ver
    // POST /api/empresas/[id]/enrolamiento/reenviar).
    const enrollment = await sendCompanyEnrollmentEmail({
      supabase: db,
      companyId,
      company: { businessName: company.business_name },
      contactEmail,
      accounts: provisionedAccounts,
      requestedBy: authorization.context.userId,
    });

    return NextResponse.json({
      data: companyRecord,
      parking: parkingResult.data,
      accounts: provisionedAccounts.map(({ password: _password, ...account }) => ({ ...account, mustChangePassword: true })),
      enrollment: { emailSent: enrollment.ok, error: enrollment.ok ? null : enrollment.error },
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

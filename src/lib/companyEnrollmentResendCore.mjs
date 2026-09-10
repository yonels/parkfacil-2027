// Núcleo del reenvío de enrolamiento (DECISIÓN APROBADA, encargo "cierre de
// reenvío de enrolamiento" 2026-09-10): rota SOLO la clave de las cuentas
// iniciales de una empresa (administrador + operadores) y reenvía el correo
// de enrolamiento con las credenciales nuevas. NUNCA recrea usuarios, NUNCA
// cambia user_id/username/rol/company_id -- ver test .local.e2e para la
// prueba end-to-end contra Supabase Auth real (username antes = después,
// user_id antes = después, clave anterior rechazada, clave nueva aceptada).
//
// Extraído de la ruta (antes vivía inline en route.js) siguiendo el mismo
// patrón que passwordRecoveryCore.mjs/procesarRecuperacionContrasena: lógica
// pura y testable, separada de NextResponse/autorización HTTP.
import { createTemporaryPassword } from "./auth/accessCredentialCore.mjs";
import { extractDisplayUsername } from "./auth/accessUsernameDomain.mjs";
import { sendCompanyEnrollmentEmail } from "./companyEnrollmentEmailCore.mjs";

export class CompanyEnrollmentResendError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "CompanyEnrollmentResendError";
    this.status = status;
    this.code = code;
  }
}

// Protección contra doble clic / reenvíos accidentales (§7): server-side,
// además del disabled+confirm del lado del cliente -- si ya hay un reenvío
// (o el envío inicial) registrado hace menos de este umbral, se rechaza en
// vez de rotar las claves otra vez.
export const RESEND_COOLDOWN_SECONDS = 10;

async function loadCompany(supabase, companyId) {
  const result = await supabase.from("companies").select("id,business_name,email").eq("id", companyId).maybeSingle();
  if (result.error) throw new CompanyEnrollmentResendError("No fue posible obtener la empresa.", 500, "COMPANY_READ_FAILED");
  if (!result.data) throw new CompanyEnrollmentResendError("No se encontró la empresa solicitada.", 404, "COMPANY_NOT_FOUND");
  return result.data;
}

async function loadInitialAccounts(supabase, companyId) {
  // Únicamente las cuentas del enrolamiento inicial (§9): company_admin +
  // operator. Cualquier usuario creado después por otras vías queda fuera
  // de este reenvío por diseño -- no hay forma de distinguir "posterior"
  // hoy salvo por rol, que es exactamente el criterio ya usado desde la
  // creación (POST /api/empresas nunca crea otros roles).
  const result = await supabase.from("company_members").select("user_id,company_id,full_name,role").eq("company_id", companyId).in("role", ["company_admin", "operator"]);
  if (result.error) throw new CompanyEnrollmentResendError("No fue posible obtener las cuentas de la empresa.", 500, "MEMBERS_READ_FAILED");
  if (!result.data?.length) throw new CompanyEnrollmentResendError("La empresa no tiene cuentas iniciales para reenviar.", 409, "NO_ACCOUNTS");
  return result.data;
}

async function checkCooldown(supabase, companyId, cooldownSeconds) {
  const result = await supabase
    .from("company_enrollment_notifications")
    .select("created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (result.error) return; // no bloquea el reenvío por un problema de lectura de la traza
  const last = result.data?.[0];
  if (!last) return;
  const elapsedSeconds = (Date.now() - new Date(last.created_at).getTime()) / 1000;
  if (elapsedSeconds < cooldownSeconds) {
    throw new CompanyEnrollmentResendError(
      `Ya se generaron credenciales nuevas hace instantes. Espera ${Math.ceil(cooldownSeconds - elapsedSeconds)} segundos antes de reintentar.`,
      429,
      "RESEND_COOLDOWN",
    );
  }
}

// Rota la clave de un usuario en Supabase Auth SIN tocar identidad/rol/
// empresa -- user_id, email (usuario de acceso) y app_metadata quedan
// exactamente iguales; updateUserById con solo `password` reemplaza el
// hash y Supabase invalida cualquier sesión basada en la clave anterior de
// inmediato (§5: la clave anterior deja de funcionar, no se crea cuenta
// nueva).
async function rotatePassword(supabase, member) {
  const authUser = await supabase.auth.admin.getUserById(member.user_id);
  if (authUser.error || !authUser.data?.user) {
    throw new CompanyEnrollmentResendError(`No fue posible ubicar la cuenta de ${member.full_name}.`, 500, "USER_NOT_FOUND");
  }
  const password = createTemporaryPassword();
  const updated = await supabase.auth.admin.updateUserById(member.user_id, {
    password,
    user_metadata: { ...(authUser.data.user.user_metadata || {}), must_change_password: true },
  });
  if (updated.error) {
    throw new CompanyEnrollmentResendError(`No fue posible generar una clave nueva para ${member.full_name}.`, 500, "CREDENTIAL_UPDATE_FAILED");
  }
  await supabase.from("company_members").update({ must_change_password: true }).eq("user_id", member.user_id);
  return { userId: member.user_id, username: extractDisplayUsername(authUser.data.user.email), password };
}

function accountLabel(role, operatorIndex) {
  return role === "operator" ? `Operador ${operatorIndex}` : "Administrador";
}

// requestedBy: userId del platform_admin (Root) real que pidió el reenvío
// -- se audita en company_enrollment_notifications (§6), nunca se usa para
// autorizar (eso ya lo hizo requirePlatformAdmin antes de llegar aquí).
export async function resendCompanyEnrollment({ supabase, companyId, requestedBy, sendMail, cooldownSeconds = RESEND_COOLDOWN_SECONDS }) {
  const company = await loadCompany(supabase, companyId);
  const members = await loadInitialAccounts(supabase, companyId);
  await checkCooldown(supabase, companyId, cooldownSeconds);

  const provisionedAccounts = [];
  let operatorCount = 0;
  for (const member of members) {
    if (member.role === "operator") operatorCount += 1;
    // Secuencial a propósito: cada rotación solo importa en orden de
    // despliegue en el correo, no hay paralelismo real que ganar.
    const rotated = await rotatePassword(supabase, member);
    provisionedAccounts.push({
      role: member.role,
      label: accountLabel(member.role, operatorCount),
      fullName: member.full_name,
      username: rotated.username,
      password: rotated.password,
    });
  }

  const enrollment = await sendCompanyEnrollmentEmail({
    supabase,
    companyId,
    company: { businessName: company.business_name },
    contactEmail: company.email,
    accounts: provisionedAccounts,
    requestedBy,
    isResend: true,
    sendMail,
  });

  return {
    accounts: provisionedAccounts.map(({ password: _password, ...account }) => ({ ...account, mustChangePassword: true })),
    enrollment: { emailSent: enrollment.ok, error: enrollment.ok ? null : enrollment.error },
  };
}

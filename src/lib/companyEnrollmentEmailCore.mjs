// Correo de enrolamiento enviado al CORREO DE CONTACTO DE LA EMPRESA (nunca
// a correos individuales, nunca al email técnico @acceso.parkfacilapp.cl)
// al finalizar con éxito la creación de una empresa y sus 3 cuentas
// iniciales, o al reenviarlo con claves rotadas. Mismo patrón ya probado en
// abonadosCredentialEmailCore.js (crear -> enviar -> trazar éxito/fallo en
// tabla dedicada -> permitir reintento), reutilizando el mismo proveedor
// (Microsoft Graph, sendMicrosoftGraphMail) -- ver diagnóstico "ajustar
// flujo de creación de empresas" 2026-09-10 y su cierre "reenvío de
// enrolamiento" (mismo día).
import { sendMicrosoftGraphMail } from "./microsoftGraphMailCore.js";

const CLIENT_PORTAL_URL = "https://cliente.parkfacilapp.cl";
const SUBJECT_PREFIX = "Credenciales de acceso ParkFacil";
const ROLE_LABELS = { company_admin: "Administrador de empresa", operator: "Operador" };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// `accounts` = [{ label, fullName, username, role, password }] -- username
// es SIEMPRE el "usuario de acceso" visible (nunca el email técnico
// completo, ver accessUsernameDomain.mjs:extractDisplayUsername). password
// solo vive en memoria durante esta llamada -- nunca se persiste ni se
// devuelve en la respuesta HTTP una vez enviado el correo.
export function buildCompanyEnrollmentEmailHtml({ company, accounts, isResend = false }) {
  const rows = accounts.map(({ label, fullName, username, role, password }) => `
    <tr><td colspan="2" style="padding:18px 20px 4px 20px;color:#3150D8;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;border-top:1px solid #E2E8F0;">${escapeHtml(label)} — ${escapeHtml(fullName)}</td></tr>
    <tr><td style="padding:2px 20px;color:#64748B;font-size:13px;width:42%;">Usuario</td><td style="padding:2px 20px;color:#041E42;font-size:15px;font-weight:bold;"><span style="display:inline-block;background-color:#EEF4FF;border:1px solid #C7D2FE;padding:4px 8px;">${escapeHtml(username)}</span></td></tr>
    <tr><td style="padding:2px 20px;color:#64748B;font-size:13px;">Clave temporal</td><td style="padding:2px 20px;color:#041E42;font-size:15px;font-weight:bold;font-family:monospace;">${escapeHtml(password)}</td></tr>
    <tr><td style="padding:2px 20px 14px 20px;color:#64748B;font-size:13px;">Rol</td><td style="padding:2px 20px 14px 20px;color:#041E42;font-size:14px;">${escapeHtml(ROLE_LABELS[role] || role)}</td></tr>
  `).join("");

  const intro = isResend
    ? "Se generaron claves temporales nuevas para las cuentas iniciales de esta empresa. Las claves anteriores quedaron invalidadas de inmediato y ya no permiten iniciar sesión."
    : "Estas son las cuentas iniciales creadas para acceder al Portal Cliente de ParkFacil.";

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Credenciales de acceso ParkFacil</title></head><body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#041E42;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background-color:#EEF2F7;margin:0;padding:0;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="650" cellspacing="0" cellpadding="0" style="width:650px;max-width:650px;background-color:#FFFFFF;border-collapse:collapse;border:1px solid #D8E0EC;"><tr><td style="background-color:#041E42;padding:26px 30px 24px 30px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="color:#FFFFFF;font-size:25px;font-weight:bold;line-height:30px;">ParkFacil</td><td align="right" style="color:#BFD7FF;font-size:12px;line-height:18px;">Administración Inteligente<br />de Estacionamientos</td></tr></table></td></tr><tr><td style="padding:30px 34px 10px 34px;"><h1 style="margin:0;color:#041E42;font-size:26px;line-height:32px;font-weight:bold;">${isResend ? "Nuevas credenciales de acceso" : "Empresa creada correctamente"}</h1><p style="margin:10px 0 0 0;color:#3150D8;font-size:16px;line-height:24px;font-weight:bold;">${escapeHtml(company.businessName)}</p><p style="margin:16px 0 0 0;color:#334155;font-size:15px;line-height:23px;">${intro} Cada persona debe cambiar su clave al iniciar sesión por primera vez.</p></td></tr><tr><td style="padding:6px 34px 0 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #D8E0EC;">${rows}</table></td></tr><tr><td style="padding:26px 34px 8px 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF4FF;border:1px solid #C7D2FE;border-collapse:collapse;"><tr><td style="padding:16px 18px;color:#1E3A8A;font-size:14px;line-height:21px;"><p style="margin:0;">Portal Cliente: <a href="${CLIENT_PORTAL_URL}" style="color:#1E3A8A;font-weight:bold;">${CLIENT_PORTAL_URL}</a></p><p style="margin:6px 0 0 0;">Ingrese con el usuario y la clave temporal de esta tabla; el sistema le pedirá definir una clave propia en el primer acceso.</p></td></tr></table></td></tr><tr><td style="padding:18px 34px 28px 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FFF7ED;border:1px solid #FDBA74;border-collapse:collapse;"><tr><td style="padding:18px 20px;color:#7C2D12;font-size:14px;line-height:22px;"><p style="margin:0 0 8px 0;font-weight:bold;color:#9A3412;">Importante</p><p style="margin:0 0 8px 0;">Estas credenciales son de uso interno de ${escapeHtml(company.businessName)}. No las reenvíe por canales inseguros.</p>${isResend ? '<p style="margin:0;">Cualquier clave temporal entregada anteriormente ya no es válida.</p>' : '<p style="margin:0;">Cada usuario deberá definir su propia clave al iniciar sesión por primera vez.</p>'}</td></tr></table></td></tr><tr><td style="background-color:#041E42;padding:24px 34px;color:#DCE7F7;font-size:13px;line-height:21px;"><p style="margin:0;color:#FFFFFF;font-size:18px;font-weight:bold;">ParkFacil</p><p style="margin:4px 0 0 0;color:#BFD7FF;">Administración Inteligente de Estacionamientos</p><p style="margin:14px 0 0 0;color:#BFD7FF;">Este mensaje fue generado automáticamente por ParkFacil.</p></td></tr></table></td></tr></table></body></html>`;
}

export class CompanyEnrollmentEmailError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "CompanyEnrollmentEmailError";
    this.cause = cause;
  }
}

async function insertTrace(supabase, values) {
  const { data, error } = await supabase.from("company_enrollment_notifications").insert(values).select("id").single();
  if (error) throw error;
  return data.id;
}

async function updateTrace(supabase, id, values) {
  if (!id) return;
  await supabase.from("company_enrollment_notifications").update(values).eq("id", id);
}

// Envía el correo de enrolamiento y registra el resultado (pending -> sent
// | failed) en company_enrollment_notifications, incluida la auditoría
// mínima (requested_by, accounts_count -- §6 "cierre de reenvío de
// enrolamiento": nunca claves/secretos/tokens). NUNCA lanza para un fallo
// de envío -- lo captura y lo reporta en el `ok:false` de retorno, porque un
// fallo de correo NO debe revertir la empresa/usuarios ya creados (ver
// POST /api/empresas y el endpoint de reenvío: este llamado ocurre después
// de que la creación/rotación ya terminó con éxito).
export async function sendCompanyEnrollmentEmail({ supabase, companyId, company, contactEmail, accounts, requestedBy = null, isResend = false, sendMail = sendMicrosoftGraphMail }) {
  const html = buildCompanyEnrollmentEmailHtml({ company, accounts, isResend });
  const subject = `${SUBJECT_PREFIX} — ${company.businessName}`;
  let traceId = null;
  try {
    traceId = await insertTrace(supabase, {
      company_id: companyId, destinatario: contactEmail, asunto: subject, proveedor: "microsoft_graph",
      estado: "pending", requested_by: requestedBy, accounts_count: accounts.length,
    });
    const result = await sendMail({ para: contactEmail, asunto: subject, html, guardarEnviados: true });
    await updateTrace(supabase, traceId, { estado: "sent", enviado_at: new Date().toISOString(), error_mensaje: null });
    return { ok: true, traceId, remitente: result.remitente || null };
  } catch (error) {
    // Mensaje sanitizado: es el `.message` del error del proveedor (nunca
    // incluye la clave, que ni siquiera viaja como argumento a este catch).
    const message = String(error?.message || "No fue posible enviar el correo de enrolamiento.").slice(0, 500);
    await updateTrace(supabase, traceId, { estado: "failed", error_mensaje: message });
    return { ok: false, traceId, error: message };
  }
}

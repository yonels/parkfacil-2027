import QRCode from "qrcode";
import { getTipoCredencialLabel } from "../data/abonados.mjs";
import { sendMicrosoftGraphMail, MicrosoftGraphSendError } from "./microsoftGraphMailCore.js";

const DEFAULT_SUBJECT = "Credencial de acceso ParkFacil";
const PROVIDER = "microsoft_graph";

export class CredentialEmailValidationError extends Error {
  constructor(message, status = 400, code = "validation_error") {
    super(message);
    this.name = "CredentialEmailValidationError";
    this.status = status;
    this.code = code;
  }
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function sanitizeSubject(value) {
  const subject = String(value || "").replace(/\s+/g, " ").trim();
  return (subject || DEFAULT_SUBJECT).slice(0, 120);
}

export function sanitizeMessage(value) {
  return String(value || "").trim().slice(0, 1000);
}

export function sanitizeFileToken(value) {
  return String(value || "credencial")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "credencial";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatEmailDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date).replace(/\//g, "-");
}

const STATUS_TONES = {
  green: { background: "#ECFDF5", border: "#A7F3D0", text: "#065F46", dot: "#059669" },
  yellow: { background: "#FFFBEB", border: "#FDE68A", text: "#92400E", dot: "#D97706" },
  orange: { background: "#FFF7ED", border: "#FDBA74", text: "#9A3412", dot: "#EA580C" },
  red: { background: "#FEF2F2", border: "#FECACA", text: "#991B1B", dot: "#DC2626" },
  gray: { background: "#F8FAFC", border: "#CBD5E1", text: "#334155", dot: "#64748B" },
};

export function getCredentialOperationalStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  const states = {
    active: {
      label: "Activa",
      title: "Acceso habilitado",
      description: "Su credencial está activa y puede utilizarse desde este momento para acceder al estacionamiento.",
      canAccess: true,
      tone: "green",
    },
    pending_activation: {
      label: "Pendiente de activación",
      title: "Pendiente de activación",
      description: "Su credencial fue creada correctamente, pero todavía no está habilitada para acceder. Espere la confirmación del administrador del estacionamiento.",
      canAccess: false,
      tone: "yellow",
    },
    inactive: {
      label: "Inactiva",
      title: "Acceso no habilitado",
      description: "Su credencial se encuentra inactiva y no puede utilizarse para acceder. Comuníquese con el administrador del estacionamiento.",
      canAccess: false,
      tone: "gray",
    },
    suspended: {
      label: "Suspendida",
      title: "Acceso suspendido",
      description: "Su credencial se encuentra suspendida y actualmente no permite el acceso. Comuníquese con el administrador del estacionamiento.",
      canAccess: false,
      tone: "orange",
    },
    expired: {
      label: "Vencida",
      title: "Credencial vencida",
      description: "La vigencia de esta credencial ha finalizado y ya no permite el acceso. Solicite su renovación al administrador del estacionamiento.",
      canAccess: false,
      tone: "orange",
    },
    revoked: {
      label: "Revocada",
      title: "Acceso revocado",
      description: "Esta credencial fue revocada y ya no puede utilizarse para acceder al estacionamiento.",
      canAccess: false,
      tone: "red",
    },
    blocked: {
      label: "Bloqueada",
      title: "Credencial bloqueada",
      description: "Esta credencial se encuentra bloqueada y no permite el acceso. Comuníquese con el administrador del estacionamiento.",
      canAccess: false,
      tone: "red",
    },
    lost: {
      label: "Reportada como perdida",
      title: "Credencial reportada como perdida",
      description: "Esta credencial fue informada como perdida y no debe utilizarse. Solicite una nueva credencial al administrador del estacionamiento.",
      canAccess: false,
      tone: "red",
    },
  };
  return states[normalized] || {
    label: "Estado por confirmar",
    title: "Estado por confirmar",
    description: "No fue posible determinar si esta credencial se encuentra habilitada. Comuníquese con el administrador antes de intentar utilizarla.",
    canAccess: false,
    tone: "gray",
  };
}

function normalizeMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildCredentialQrPayload(credencial) {
  return String(credencial?.numero || "").trim();
}

export async function generateCredentialQrPngBase64(credencial) {
  const payload = buildCredentialQrPayload(credencial);
  if (!payload) throw new CredentialEmailValidationError("La credencial no tiene identificador valido.", 409, "missing_identifier");
  const buffer = await QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2, scale: 8, color: { dark: "#041E42", light: "#FFFFFF" } });
  return buffer.toString("base64");
}

function buildOperationalStatusBlock(statusInfo) {
  const tone = STATUS_TONES[statusInfo.tone] || STATUS_TONES.gray;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0 0;background-color:${tone.background};border:1px solid ${tone.border};border-collapse:collapse;"><tr><td style="padding:16px 18px;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td valign="top" style="padding:2px 10px 0 0;"><span style="display:inline-block;width:12px;height:12px;line-height:12px;background-color:${tone.dot};border-radius:12px;font-size:0;">&nbsp;</span></td><td><p style="margin:0;color:${tone.text};font-size:16px;line-height:22px;font-weight:bold;">${escapeHtml(statusInfo.title)}</p><p style="margin:6px 0 0 0;color:${tone.text};font-size:14px;line-height:22px;">${escapeHtml(statusInfo.description)}</p></td></tr></table></td></tr></table>`;
}

function buildUsageGuide(statusInfo) {
  if (!statusInfo.canAccess) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;border:1px solid #D8E0EC;border-collapse:collapse;"><tr><td style="padding:18px 20px;color:#475569;font-size:14px;line-height:22px;"><p style="margin:0;font-weight:bold;color:#041E42;">¿Cómo utilizar esta credencial?</p><p style="margin:10px 0 0 0;">Esta credencial no se encuentra habilitada para acceso. Comuníquese con el administrador del estacionamiento antes de utilizarla.</p></td></tr></table>`;
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;border:1px solid #D8E0EC;border-collapse:collapse;"><tr><td style="padding:18px 20px;color:#475569;font-size:14px;line-height:22px;"><p style="margin:0 0 10px 0;font-weight:bold;color:#041E42;">¿Cómo utilizar esta credencial?</p><ol style="margin:0 0 12px 20px;padding:0;color:#475569;"><li style="margin:0 0 6px 0;">Abra este correo desde su teléfono móvil.</li><li style="margin:0 0 6px 0;">Presente el código QR frente al lector de acceso.</li><li style="margin:0 0 6px 0;">Espere la confirmación del sistema antes de avanzar.</li><li style="margin:0;">Si su credencial incluye patente, ParkFacil validará ambos elementos cuando corresponda.</li></ol><p style="margin:0;">No es necesario imprimir esta credencial. También puede utilizar el archivo PNG adjunto.</p></td></tr></table>`;
}

export function buildCredentialEmailHtml({ abonado, credencial, vehiculo = null, mensaje = "", qrBase64 = "" }) {
  const tipo = getTipoCredencialLabel(credencial.tipo);
  const codigo = abonado.codigo || abonado.identificador || "No registrado";
  const statusInfo = getCredentialOperationalStatus(credencial.status);
  const patente = credencial.tipo === "qr_plate" ? vehiculo?.license_plate || vehiculo?.licensePlate || "No registrada" : null;
  const qrImage = qrBase64 ? `<img src="data:image/png;base64,${qrBase64}" width="190" height="190" alt="Código QR de la credencial ParkFacil" style="display:block;width:190px;height:190px;border:0;outline:none;text-decoration:none;margin:0 auto;" />` : "";
  const defaultMessage = "Adjuntamos su credencial de acceso ParkFacil.";
  const accessMessage = statusInfo.canAccess
    ? "Puede utilizar el código QR incluido en este correo o el archivo adjunto."
    : "Conserve este correo como referencia. La credencial no podrá utilizarse hasta que su estado permita el acceso.";
  const customMessage = normalizeMessage(mensaje) && normalizeMessage(mensaje) !== normalizeMessage(defaultMessage)
    ? `<p style="margin:14px 0 0 0;color:#475569;font-size:15px;line-height:23px;">${escapeHtml(mensaje).replace(/\r?\n/g, "<br />")}</p>`
    : "";
  const infoRows = [
    ["Tipo de credencial", tipo],
    ["Código", codigo, true],
    ...(patente ? [["Patente", patente]] : []),
    ["Fecha de emisión", formatEmailDate()],
    ["Estado", statusInfo.label],
  ];
  const rowsHtml = infoRows.map(([label, value, highlight]) => `<tr><td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;width:42%;">${escapeHtml(label)}</td><td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;color:#041E42;font-size:15px;font-weight:bold;">${highlight ? `<span style="display:inline-block;background-color:#EEF4FF;border:1px solid #C7D2FE;padding:4px 8px;">${escapeHtml(value)}</span>` : escapeHtml(value)}</td></tr>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Credencial de acceso ParkFacil</title></head><body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#041E42;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background-color:#EEF2F7;margin:0;padding:0;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="650" cellspacing="0" cellpadding="0" style="width:650px;max-width:650px;background-color:#FFFFFF;border-collapse:collapse;border:1px solid #D8E0EC;"><tr><td style="background-color:#041E42;padding:26px 30px 24px 30px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="color:#FFFFFF;font-size:25px;font-weight:bold;line-height:30px;">ParkFacil</td><td align="right" style="color:#BFD7FF;font-size:12px;line-height:18px;">Administración Inteligente<br />de Estacionamientos</td></tr></table></td></tr><tr><td style="padding:30px 34px 18px 34px;"><h1 style="margin:0;color:#041E42;font-size:28px;line-height:34px;font-weight:bold;">Credencial de Acceso</h1><p style="margin:8px 0 0 0;color:#3150D8;font-size:16px;line-height:24px;font-weight:bold;">Su credencial ha sido generada correctamente.</p>${buildOperationalStatusBlock(statusInfo)}<p style="margin:24px 0 0 0;color:#334155;font-size:16px;line-height:25px;">Hola <strong>${escapeHtml(abonado.nombre || abonado.nombres || "")}</strong>,</p><p style="margin:14px 0 0 0;color:#475569;font-size:15px;line-height:23px;">${defaultMessage}</p><p style="margin:10px 0 0 0;color:#475569;font-size:15px;line-height:23px;">${accessMessage}</p>${customMessage}</td></tr><tr><td style="padding:10px 34px 0 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #D8E0EC;background-color:#F8FAFC;"><tr><td style="padding:18px 20px;background-color:#EEF4FF;color:#041E42;font-size:16px;font-weight:bold;">Información de la credencial</td></tr><tr><td style="padding:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rowsHtml}</table></td></tr></table></td></tr><tr><td align="center" style="padding:28px 34px 8px 34px;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background-color:#FFFFFF;border:1px solid #CBD5E1;"><tr><td style="padding:18px;">${qrImage}</td></tr></table><p style="margin:14px 0 0 0;color:#041E42;font-size:14px;line-height:22px;font-weight:bold;">Código QR</p><p style="margin:6px 0 0 0;color:#64748B;font-size:13px;line-height:20px;">Puede presentar este código directamente desde su teléfono.</p><p style="margin:4px 0 0 0;color:#64748B;font-size:13px;line-height:20px;">También encontrará este código QR como archivo adjunto.</p></td></tr><tr><td style="padding:18px 34px 0 34px;">${buildUsageGuide(statusInfo)}</td></tr><tr><td style="padding:18px 34px 0 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;border:1px solid #D8E0EC;border-collapse:collapse;"><tr><td style="padding:18px 20px;color:#475569;font-size:14px;line-height:22px;"><p style="margin:0 0 10px 0;">El código QR contiene únicamente un identificador interno seguro.</p><p style="margin:0;">La patente se valida en el servidor cuando corresponde.</p></td></tr></table></td></tr><tr><td style="padding:18px 34px 28px 34px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FFF7ED;border:1px solid #FDBA74;border-collapse:collapse;"><tr><td style="padding:18px 20px;color:#7C2D12;font-size:14px;line-height:22px;"><p style="margin:0 0 8px 0;font-weight:bold;color:#9A3412;">Importante</p><p style="margin:0 0 8px 0;">Esta credencial es personal e intransferible.</p><p style="margin:0;">Si pierde esta credencial o sospecha un uso no autorizado, comuníquese inmediatamente con el administrador del estacionamiento.</p></td></tr></table></td></tr><tr><td style="background-color:#041E42;padding:24px 34px;color:#DCE7F7;font-size:13px;line-height:21px;"><p style="margin:0;color:#FFFFFF;font-size:18px;font-weight:bold;">ParkFacil</p><p style="margin:4px 0 14px 0;color:#BFD7FF;">Administración Inteligente de Estacionamientos</p><p style="margin:0;">https://parkfacil.cl</p><p style="margin:2px 0 0 0;">info@parkfacil.cl</p><p style="margin:2px 0 0 0;">+56 9 6651 4044</p><p style="margin:14px 0 0 0;color:#BFD7FF;">Este mensaje fue generado automáticamente por ParkFacil.</p></td></tr></table></td></tr></table></body></html>`;
}

async function insertTrace(supabase, values) {
  const { data, error } = await supabase
    .from("abonado_credencial_envios")
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateTrace(supabase, id, values) {
  if (!id) return;
  await supabase.from("abonado_credencial_envios").update(values).eq("id", id);
}

export async function sendAbonadoCredentialEmail({ supabase, abonadoId, credencialId, destinatario, asunto, mensaje = "", sendMail = sendMicrosoftGraphMail }) {
  const email = String(destinatario || "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new CredentialEmailValidationError("El destinatario no es valido.", 400, "invalid_recipient");
  const subject = sanitizeSubject(asunto);
  const safeMessage = sanitizeMessage(mensaje);

  const { data: abonado, error: abonadoError } = await supabase.from("abonados").select("*").eq("id", abonadoId).single();
  if (abonadoError || !abonado) throw new CredentialEmailValidationError("Abonado no encontrado.", 404, "subscriber_not_found");

  const { data: credencial, error: credencialError } = await supabase.from("abonado_credenciales").select("*").eq("id", credencialId).single();
  if (credencialError || !credencial) throw new CredentialEmailValidationError("Credencial no encontrada.", 404, "credential_not_found");
  if (credencial.abonado_id !== abonado.id) throw new CredentialEmailValidationError("La credencial no pertenece al abonado.", 409, "credential_mismatch");
  if (credencial.status !== "active") throw new CredentialEmailValidationError("La credencial no esta activa.", 409, "credential_inactive");

  let vehiculo = null;
  if (credencial.tipo === "qr_plate") {
    if (!credencial.vehiculo_id) throw new CredentialEmailValidationError("La credencial QR + Patente no tiene vehiculo asociado.", 409, "missing_vehicle");
    const { data: vehiculoRow, error: vehiculoError } = await supabase.from("abonado_vehiculos").select("*").eq("id", credencial.vehiculo_id).single();
    if (vehiculoError || !vehiculoRow || vehiculoRow.abonado_id !== abonado.id) throw new CredentialEmailValidationError("El vehiculo asociado no pertenece al abonado.", 409, "vehicle_mismatch");
    vehiculo = vehiculoRow;
  }

  const qrBase64 = await generateCredentialQrPngBase64(credencial);
  const attachmentName = `credencial-parkfacil-${sanitizeFileToken(abonado.codigo || credencial.numero)}.png`;
  const html = buildCredentialEmailHtml({ abonado, credencial, vehiculo, mensaje: safeMessage, qrBase64 });

  let traceId = null;
  try {
    traceId = await insertTrace(supabase, { abonado_id: abonado.id, credencial_id: credencial.id, destinatario: email, asunto: subject, proveedor: PROVIDER, estado: "pending" });
    const result = await sendMail({
      para: email,
      asunto: subject,
      html,
      attachments: [{ name: attachmentName, contentType: "image/png", contentBytes: qrBase64 }],
      guardarEnviados: true,
    });
    await updateTrace(supabase, traceId, { estado: "sent", remitente: result.remitente || null, enviado_at: new Date().toISOString() });
    return { ok: true, traceId, remitente: result.remitente || null };
  } catch (error) {
    const status = error instanceof MicrosoftGraphSendError ? error.status : null;
    await updateTrace(supabase, traceId, { estado: "failed", error_codigo: error?.code || (status ? String(status) : "send_error"), error_mensaje: String(error?.message || "No fue posible enviar la credencial.").slice(0, 500) });
    throw error;
  }
}
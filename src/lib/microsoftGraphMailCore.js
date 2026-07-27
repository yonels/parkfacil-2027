const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_TIMEOUT_MS = 10000;
const SEND_TIMEOUT_MS = 15000;

export class MicrosoftGraphConfigurationError extends Error {
  constructor(missingVariables) {
    super(`Faltan variables de Microsoft Graph: ${missingVariables.join(", ")}`);
    this.name = "MicrosoftGraphConfigurationError";
    this.missingVariables = missingVariables;
  }
}

export class MicrosoftGraphSendError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = "MicrosoftGraphSendError";
    this.status = status;
    this.code = code;
  }
}

export function getMicrosoftGraphConfiguration(env = process.env) {
  const config = {
    tenantId: env.MICROSOFT_TENANT_ID,
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    senderEmail: env.MICROSOFT_SENDER_EMAIL,
  };
  const missing = [];
  if (!config.tenantId) missing.push("MICROSOFT_TENANT_ID");
  if (!config.clientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!config.clientSecret) missing.push("MICROSOFT_CLIENT_SECRET");
  if (!config.senderEmail) missing.push("MICROSOFT_SENDER_EMAIL");
  if (missing.length > 0) throw new MicrosoftGraphConfigurationError(missing);
  return config;
}

export function isMicrosoftGraphConfigurationError(error) {
  return error instanceof MicrosoftGraphConfigurationError;
}

export function sanitizeGraphError(error) {
  return {
    name: error?.name || "MicrosoftGraphError",
    message: error?.message || "Error de Microsoft Graph.",
    status: error?.status || null,
    code: error?.code || null,
    missingVariables: Array.isArray(error?.missingVariables) ? error.missingVariables : undefined,
  };
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function buildRecipients(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]+/) : [];
  return list
    .map((email) => String(email || "").trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

export function buildGraphAttachments(attachments = []) {
  return attachments
    .filter((item) => item?.name && item?.contentBytes)
    .map((item) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: String(item.name),
      contentType: item.contentType || "application/octet-stream",
      contentBytes: String(item.contentBytes),
    }));
}

export function buildSendMailPayload({ para, cc = [], bcc = [], asunto, html, texto = "", attachments = [], guardarEnviados = true }) {
  const toRecipients = buildRecipients(para);
  if (toRecipients.length === 0) throw new Error("Debe indicar al menos un destinatario valido.");
  if (!String(asunto || "").trim()) throw new Error("El asunto del correo es obligatorio.");
  if (!html && !texto) throw new Error("El correo debe contener contenido HTML o texto.");

  const message = {
    subject: String(asunto).trim(),
    body: {
      contentType: html ? "HTML" : "Text",
      content: html || texto,
    },
    toRecipients,
    ccRecipients: buildRecipients(cc),
    bccRecipients: buildRecipients(bcc),
  };

  const graphAttachments = buildGraphAttachments(attachments);
  if (graphAttachments.length > 0) message.attachments = graphAttachments;

  return { message, saveToSentItems: guardarEnviados };
}

async function readGraphError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return {
      message: parsed?.error?.message || parsed?.error?.code || "Microsoft Graph rechazo el envio.",
      code: parsed?.error?.code || null,
    };
  } catch {
    return { message: text || "Microsoft Graph rechazo el envio.", code: null };
  }
}

export async function getMicrosoftGraphAccessToken({ fetchImpl = fetch, env = process.env } = {}) {
  const { tenantId, clientId, clientSecret } = getMicrosoftGraphConfiguration(env);
  const timeout = withTimeout(TOKEN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: GRAPH_SCOPE, grant_type: "client_credentials" }).toString(),
      cache: "no-store",
      signal: timeout.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.access_token) {
      throw new MicrosoftGraphSendError(result?.error_description || result?.error || "Microsoft no entrego un token de acceso.", response.status, result?.error || null);
    }
    return result.access_token;
  } catch (error) {
    if (error?.name === "AbortError") throw new MicrosoftGraphSendError("Tiempo de espera agotado al autenticar Microsoft Graph.", 504, "timeout");
    throw error;
  } finally {
    timeout.clear();
  }
}

export async function sendMicrosoftGraphMail({ para, cc = [], bcc = [], asunto, html, texto = "", attachments = [], guardarEnviados = true, fetchImpl = fetch, env = process.env } = {}) {
  const { senderEmail } = getMicrosoftGraphConfiguration(env);
  const accessToken = await getMicrosoftGraphAccessToken({ fetchImpl, env });
  const payload = buildSendMailPayload({ para, cc, bcc, asunto, html, texto, attachments, guardarEnviados });
  const timeout = withTimeout(SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${GRAPH_BASE_URL}/users/${encodeURIComponent(senderEmail)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: timeout.signal,
    });
    if (![202, 204].includes(response.status)) {
      const details = await readGraphError(response);
      throw new MicrosoftGraphSendError(details.message, response.status, details.code);
    }
    return { ok: true, remitente: senderEmail, destinatarios: payload.message.toRecipients.map((item) => item.emailAddress.address), status: response.status };
  } catch (error) {
    if (error?.name === "AbortError") throw new MicrosoftGraphSendError("Tiempo de espera agotado al enviar por Microsoft Graph.", 504, "timeout");
    throw error;
  } finally {
    timeout.clear();
  }
}
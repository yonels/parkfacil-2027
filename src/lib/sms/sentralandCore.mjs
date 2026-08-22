// Núcleo puro del cliente Sentraland: configuración, parsing y las
// funciones que llaman a fetch (con fetchImpl inyectable). Deliberadamente
// SIN "import server-only" para poder testear todo esto en directo con
// node --test (igual que onStreetAdminCore.mjs vs onStreetAdminRepository.
// js) — el punto de entrada real para el resto de la app es
// sentralandClient.mjs, que sí lleva la marca server-only y solo reexporta
// esto. No importar este archivo desde componentes cliente.

// Cliente HTTP puro para los 4 servicios de Sentraland (token, envío SMS,
// estado de envío/DLR, estado de bolsa). Sin lógica de negocio de
// ParkFacil (eso vive en onStreetSmsService.js) y sin credenciales
// hardcodeadas: todo viene de variables de entorno, ninguna con prefijo
// NEXT_PUBLIC_ (nunca deben llegar al navegador).
//
// TLS: se usa `fetch` estándar de Node, sin deshabilitar la validación de
// certificado. Los manuales oficiales de Sentraland (PHP: CURLOPT_SSL_
// VERIFYPEER=false; Java: TrustManager que acepta cualquier certificado)
// hacen exactamente eso — deliberadamente NO se replica aquí. Si en algún
// momento Sentraland no funciona con validación TLS estándar, este cliente
// debe fallar (nunca debilitar la verificación para "hacerlo funcionar").

function configError(name) {
  return Object.assign(new Error(`${name}_NOT_CONFIGURED`), { code: `${name}_NOT_CONFIGURED` });
}

// Lee la configuración sin lanzar todavía — permite a los callers decidir
// cuándo validar (p.ej. mostrar todas las variables faltantes de una vez).
export function sentralandConfig() {
  return {
    institucion: process.env.SENTRALAND_INSTITUCION || "",
    tipoServicio: process.env.SENTRALAND_TIPO_SERVICIO || "",
    usuario: process.env.SENTRALAND_USUARIO || "",
    password: process.env.SENTRALAND_PASSWORD || "",
    tokenUrl: process.env.SENTRALAND_TOKEN_URL || "https://ws.sentraland.net/token/index.ams",
    sendUrl: process.env.SENTRALAND_SEND_URL || "https://ws.sentraland.net/tkFinanciero/index.ams",
    statusUrl: process.env.SENTRALAND_STATUS_URL || "https://ws.sentraland.net/smsstatus/index.ams",
    balanceUrl: process.env.SENTRALAND_BALANCE_URL || "https://ws.sentraland.net/bolsaStatus/index.ams",
  };
}

// Fail-closed explícito por variable. SENTRALAND_TIPO_SERVICIO es el caso
// que exige la condición 2 de la autorización: sin ella, ningún envío real
// debe siquiera intentar llamar al proveedor.
export function requireSentralandConfig(config = sentralandConfig()) {
  if (!config.institucion) throw configError("SENTRALAND_INSTITUCION");
  if (!config.tipoServicio) throw configError("SENTRALAND_TIPO_SERVICIO");
  if (!config.usuario) throw configError("SENTRALAND_USUARIO");
  if (!config.password) throw configError("SENTRALAND_PASSWORD");
  return config;
}

function credentialFields(config) {
  return { institucion: config.institucion, tipo_servicio: config.tipoServicio, usuario: config.usuario, password: config.password };
}

async function postForm(url, fields, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!response.ok) throw Object.assign(new Error("SENTRALAND_HTTP_ERROR"), { code: "SENTRALAND_HTTP_ERROR", status: response.status });
  const json = await response.json();
  if (!json || typeof json !== "object") throw Object.assign(new Error("SENTRALAND_RESPONSE_INVALID"), { code: "SENTRALAND_RESPONSE_INVALID" });
  return json;
}

// PROVISIONAL: el manual de Token solo documenta el ejemplo literal
// {"codigo":0,"descripcion":"TOKEN"} sin aclarar si "TOKEN" es un
// placeholder del campo que realmente trae el valor, o el nombre del
// campo en sí. Se asume que el valor del token viene en `descripcion`
// cuando codigo=0. Toda la interpretación de la respuesta queda aislada
// en esta única función: si una llamada real demuestra otra estructura
// (por ejemplo un campo `token` separado), solo hay que corregir esto.
export function parseSentralandTokenResponse(json) {
  const codigo = Number(json.codigo);
  if (codigo !== 0) {
    throw Object.assign(new Error("SENTRALAND_TOKEN_ERROR"), {
      code: "SENTRALAND_TOKEN_ERROR",
      providerCode: codigo,
      providerDescription: json.descripcion ?? null,
    });
  }
  const token = String(json.descripcion || "").trim();
  if (!token) throw Object.assign(new Error("SENTRALAND_TOKEN_EMPTY"), { code: "SENTRALAND_TOKEN_EMPTY" });
  return token;
}

export async function sentralandGetToken({ fetchImpl = fetch } = {}) {
  const config = requireSentralandConfig();
  const json = await postForm(config.tokenUrl, credentialFields(config), fetchImpl);
  return parseSentralandTokenResponse(json);
}

// Catálogo documentado en el manual de Envío SMS/WhatsApp (tkFinanciero).
// codigo=0 es éxito; cualquier otro valor es un error específico. El
// manual no distingue "SMS" de "WhatsApp" por código de error — ambos
// canales comparten el mismo catálogo.
export const SENTRALAND_SEND_ERROR_DESCRIPTIONS = Object.freeze({
  1: "Error mensaje no enviado, caduco la bolsa o fono está en Lista Negra",
  2: "ERROR SIN SMS EN BOLSA",
  3: "ERROR SIN DATOS, DEBE ENVIAR DATOS.",
  4: "Fono largo minimo o maximo, no corresponde.",
  6: "DATOS INGRESADOS NO VALIDOS.",
  7: "ERROR PROBLEMAS CONTINGENCIA",
  8: "ERROR AL REGISTRAR DLR",
  9: "ERROR PROBLEMAS CONTINGENCIA",
  10: "ERROR PROBLEMAS CONTINGENCIA",
  11: "ERROR AL REGISTRAR DLR",
  12: "ERROR PROBLEMAS CONTINGENCIA",
  13: "ERROR NUMERO INGRESADO NO VALIDO",
  20: "ENVIOS SOBRE PROMEDIOS CALCULADOS.",
});

const CHILEAN_MOBILE_PATTERN = /^\+?56?9[0-9]{8}$/;
export const SENTRALAND_SMS_MAX_LENGTH = 160;

export function parseSentralandSendResponse(json) {
  const codigo = Number(json.codigo);
  return {
    ok: codigo === 0,
    code: codigo,
    description: json.descripcion ?? SENTRALAND_SEND_ERROR_DESCRIPTIONS[codigo] ?? null,
    idmensaje: json.idmensaje != null ? String(json.idmensaje) : null,
  };
}

export async function sentralandSendSms({ fono, mensaje, token, fetchImpl = fetch }) {
  const config = requireSentralandConfig();
  if (!CHILEAN_MOBILE_PATTERN.test(String(fono || ""))) throw Object.assign(new Error("SENTRALAND_PHONE_INVALID"), { code: "SENTRALAND_PHONE_INVALID" });
  const text = String(mensaje || "");
  if (!text) throw Object.assign(new Error("SENTRALAND_MESSAGE_EMPTY"), { code: "SENTRALAND_MESSAGE_EMPTY" });
  if (text.length > SENTRALAND_SMS_MAX_LENGTH) throw Object.assign(new Error("SENTRALAND_MESSAGE_TOO_LONG"), { code: "SENTRALAND_MESSAGE_TOO_LONG", length: text.length, max: SENTRALAND_SMS_MAX_LENGTH });
  if (!token) throw Object.assign(new Error("SENTRALAND_TOKEN_REQUIRED"), { code: "SENTRALAND_TOKEN_REQUIRED" });
  const json = await postForm(config.sendUrl, { ...credentialFields(config), fono: String(fono), mensaje: text, token }, fetchImpl);
  return parseSentralandSendResponse(json);
}

// Mapeo de estado de entrega (smsstatus / DLR). El manual solo documenta
// explícitamente tres desenlaces: éxito con descripcion="DELIVRD", y dos
// errores de consulta (idmensaje inexistente / datos inválidos) — ningún
// otro valor de "descripcion" para un envío realmente aceptado está
// documentado. Por eso, ante estado="0" con una descripcion distinta de
// "DELIVRD", se devuelve ACCEPTED (el proveedor tiene registro del envío
// pero no confirma entrega) en vez de asumir un estado más específico que
// el manual no respalda. Debe confirmarse con una consulta real.
export function mapSentralandDeliveryState(estado, descripcion) {
  const normalizedEstado = String(estado ?? "").trim();
  const normalizedDescripcion = String(descripcion ?? "").trim().toUpperCase();
  if (normalizedEstado === "0" && normalizedDescripcion === "DELIVRD") return "DELIVERED";
  if (normalizedEstado === "7" || normalizedEstado === "104") return "UNKNOWN";
  if (normalizedEstado === "0") return "ACCEPTED";
  return "UNKNOWN";
}

export function parseSentralandStatusResponse(json) {
  return {
    idmensaje: json.idmensaje != null ? String(json.idmensaje) : null,
    fechaInicio: json.fechainicio ?? null,
    fechaTermino: json.fechatermino ?? null,
    fono: json.fono ?? null,
    estado: json.estado != null ? String(json.estado) : null,
    descripcion: json.descripcion ?? null,
    operador: json.operador ?? null,
    deliveryState: mapSentralandDeliveryState(json.estado, json.descripcion),
  };
}

export async function sentralandQueryStatus({ idmensaje, fetchImpl = fetch }) {
  const config = requireSentralandConfig();
  if (!idmensaje) throw Object.assign(new Error("SENTRALAND_IDMENSAJE_REQUIRED"), { code: "SENTRALAND_IDMENSAJE_REQUIRED" });
  const json = await postForm(config.statusUrl, { ...credentialFields(config), idmensaje: String(idmensaje) }, fetchImpl);
  return parseSentralandStatusResponse(json);
}

// Estado de bolsa: el manual documenta hasta 6 meses de historial y un
// tipo_servicio propio (1=3° clave, 2=campañas, 3=beneficios) que puede no
// coincidir con el usado en token/envío — ver contradicción documental en
// la auditoría. Se reutiliza la misma SENTRALAND_TIPO_SERVICIO por ahora;
// si Sentraland confirma que debe ser distinta para este servicio, se
// agrega una variable propia sin tocar el resto del cliente.
export function parseSentralandBalanceResponse(json) {
  const codigo = Number(json.codigo);
  if (codigo !== 0) return { ok: false, code: codigo, description: json.descripcion ?? null, bags: [] };
  const rows = Array.isArray(json.descripcion) ? json.descripcion : [];
  return {
    ok: true,
    code: codigo,
    description: null,
    bags: rows.map((row) => ({
      bolsaId: row.bolsa_id ?? null,
      bancoId: row.banco_id ?? null,
      cantidad: row.cantidad ?? null,
      saldo: row.saldo ?? null,
      fechaCreacion: row.fecha_creacion ?? null,
      fechaFin: row.fecha_fin ?? null,
      status: row.status ?? null,
      creado: row.creado ?? null,
    })),
  };
}

export async function sentralandQueryBalance({ fetchImpl = fetch } = {}) {
  const config = requireSentralandConfig();
  const json = await postForm(config.balanceUrl, credentialFields(config), fetchImpl);
  return parseSentralandBalanceResponse(json);
}

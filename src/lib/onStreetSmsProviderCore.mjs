// Núcleo puro de los adaptadores SMS: sin "server-only" para poder
// testearlo en directo. Usa sentralandCore.mjs (también sin server-only)
// directamente. El punto de entrada real para el resto de la app es
// onStreetSmsProvider.js, que sí lleva la marca server-only.
import { sentralandGetToken, sentralandSendSms, sentralandQueryStatus } from "./sms/sentralandCore.mjs";

export const simulatedSmsProvider = {
  name: "SIMULATED",
  async send({ message }) {
    if (!message) return { ok: false, errorCode: "INVALID_MESSAGE" };
    return { ok: true, providerMessageId: `simulated-${crypto.randomUUID()}` };
  },
  // Un envío simulado no tiene entrega real que consultar — nunca queda
  // "pendiente de DLR", así que no hay nada que verificar más tarde.
  checkStatus: null,
};

// Adaptador real: pide un token nuevo por cada envío (el manual de
// Sentraland no documenta vigencia del token, así que no se asume una
// duración cacheable todavía) y traduce la respuesta de tkFinanciero al
// contrato interno { ok, providerMessageId, providerStatus,
// providerDescription, errorCode }. onStreetSmsService.js es quien
// persiste esos campos — este adaptador no toca la base de datos.
export function createSentralandSmsProvider({ getToken = sentralandGetToken, sendSms = sentralandSendSms, queryStatus = sentralandQueryStatus } = {}) {
  return { name: "SENTRALAND",
  async send({ to, message }) {
    let token = await getToken();
    let result;
    try { result = await sendSms({ fono: to, mensaje: message, token }); }
    catch (cause) {
      if (cause?.code !== "SENTRALAND_HTTP_ERROR" || cause.status !== 401) throw cause;
      token = await getToken();
      result = await sendSms({ fono: to, mensaje: message, token });
    }
    return {
      ok: result.ok,
      providerMessageId: result.idmensaje,
      providerStatus: String(result.code),
      providerDescription: result.description,
      errorCode: result.ok ? null : `SENTRALAND_${result.code}`,
    };
  },
  async checkStatus({ providerMessageId }) {
    const status = await queryStatus({ idmensaje: providerMessageId });
    return { deliveryState: status.deliveryState, providerStatus: status.estado, providerDescription: status.descripcion };
  },
}; }

export const sentralandSmsProvider = createSentralandSmsProvider();

const PROVIDERS = Object.freeze({
  simulated: simulatedSmsProvider,
  sentraland: sentralandSmsProvider,
});

// SMS_PROVIDER selecciona el adaptador activo. Por defecto "simulated" —
// nunca se activa Sentraland real sin que alguien lo configure a propósito.
export function resolveSmsProvider(name = process.env.SMS_PROVIDER || "simulated") {
  const provider = PROVIDERS[String(name || "").toLowerCase()];
  if (!provider) throw Object.assign(new Error("SMS_PROVIDER_UNKNOWN"), { code: "SMS_PROVIDER_UNKNOWN", requested: name });
  return provider;
}

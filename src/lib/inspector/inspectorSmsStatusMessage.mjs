// Mensaje real de estado del SMS en la pantalla "Fiscalización registrada"
// (corrección 2026-08-31): antes esa pantalla mostraba SIEMPRE "Se envió el
// SMS de aviso..." para cualquier OVERSTAY, sin importar si el proveedor
// activo era SIMULATED (nunca contacta un proveedor real, ver
// onStreetSmsProviderCore.mjs) o si el envío realmente falló. Esta función
// es la única fuente de verdad del texto -- consume exactamente los campos
// que registerOnStreetInspection ahora reenvía al cliente
// (inspection.smsStatus/smsProvider/smsProviderMessageId, ver
// inspectorInspectionService.js), nunca asume nada por su cuenta. No decide
// NADA sobre si se envía o no -- eso sigue siendo responsabilidad exclusiva
// del backend (sendInspectionSmsIfNeeded), esto solo describe el resultado
// ya ocurrido.
export function inspectorSmsStatusMessage(registro) {
  if (!registro?.smsRequired) {
    return "No fue necesario enviar un aviso SMS para esta fiscalización.";
  }
  const isSimulated = registro.smsProvider === "SIMULATED" || String(registro.smsProviderMessageId || "").startsWith("simulated-");
  if (registro.smsStatus === "SENT" && isSimulated) {
    return "Aviso SMS SIMULADO: no se envió un mensaje real (el proveedor SMS real no está configurado en este ambiente).";
  }
  if (registro.smsStatus === "SENT") {
    return "Se envió el SMS real de aviso al teléfono asociado.";
  }
  if (registro.smsStatus === "FAILED") {
    return "No fue posible enviar el SMS de aviso. La fiscalización quedó registrada de todas formas.";
  }
  // PENDING/SENDING no debería llegar normalmente a esta pantalla (el envío
  // ya se intentó de forma síncrona antes de responder al cliente) -- caso
  // defensivo, nunca se inventa un "enviado" que no está confirmado.
  return "El aviso SMS quedó pendiente de envío.";
}

// Fila compacta "SMS conductor" (2026-09-03, "decouple printing + sms
// copy"): mismo criterio de verdad que inspectorSmsStatusMessage de arriba
// (nunca decide nada por su cuenta, solo describe smsRequired/smsStatus ya
// resueltos por el servidor), pero en forma de {label, tone} para la lista
// de estados separados de la pantalla de éxito -- no reemplaza el mensaje
// largo de arriba, es una vista distinta de los MISMOS datos.
export function inspectorSmsShortStatus(registro) {
  if (!registro?.smsRequired) return { label: "No requerido", tone: "neutral" };
  if (registro.smsStatus === "SENT") return { label: "Enviado", tone: "success" };
  if (registro.smsStatus === "FAILED") return { label: "Error", tone: "error" };
  return { label: "Pendiente", tone: "neutral" };
}

// Fila compacta "Copia inspector": consume inspection.inspectorCopySms tal
// cual lo devuelve sendInspectorCopySmsIfNeeded (inspectorInspectionService.js)
// -- ausencia de teléfono configurado es un estado válido ("No
// configurada"), nunca un error; un fallo del proveedor SÍ se distingue
// como error, pero ninguno de los dos invalida la fiscalización.
export function inspectorCopySmsShortStatus(registro) {
  if (!registro?.smsRequired) return { label: "No aplica", tone: "neutral" };
  const copy = registro?.inspectorCopySms;
  if (!copy) return { label: "No enviada", tone: "neutral" };
  if (!copy.phoneConfigured) return { label: "No configurada", tone: "neutral" };
  if (!copy.attempted) return { label: "No enviada", tone: "neutral" };
  return copy.sent ? { label: "Enviada", tone: "success" } : { label: "Error", tone: "error" };
}

export function getWhatsappProviderStatus() {
  return { provider: "whatsapp_cloud_api", configured: false, enabled: false, message: "El proveedor de WhatsApp aún no se encuentra configurado." };
}

export async function prepareWhatsappNotification() {
  const error = new Error("El proveedor de WhatsApp aún no se encuentra configurado.");
  error.code = "whatsapp_provider_not_configured";
  error.status = 503;
  throw error;
}

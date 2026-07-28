import { CHANNEL_PROVIDER } from "./constants.js";
import { createNotification, recordNotificationAttempt, updateNotificationStatus } from "./notificationRepository.js";
import { validateNotificationInput } from "./notificationValidators.js";
import { getEmailProviderStatus, prepareEmailNotification } from "./providers/emailProvider.js";
import { getInternalProviderStatus, prepareInternalNotification } from "./providers/internalProvider.js";
import { getWhatsappProviderStatus, prepareWhatsappNotification } from "./providers/whatsappProvider.js";

export function getNotificationProvidersStatus(env = process.env) {
  return {
    email: getEmailProviderStatus(env),
    whatsapp: getWhatsappProviderStatus(),
    internal: getInternalProviderStatus(),
  };
}

function getProvider(channel) {
  if (channel === "email") return { status: getEmailProviderStatus(), prepare: prepareEmailNotification };
  if (channel === "internal") return { status: getInternalProviderStatus(), prepare: prepareInternalNotification };
  if (channel === "whatsapp") return { status: getWhatsappProviderStatus(), prepare: prepareWhatsappNotification };
  return null;
}

export async function prepareNotification({ supabase, input = {}, prepareOnly = true } = {}) {
  const { type, channel } = validateNotificationInput(input);
  const provider = getProvider(channel);
  if (!provider) throw new Error("Proveedor de notificación no registrado.");
  const providerStatus = provider.status;
  const notification = await createNotification(supabase, { ...input, type, channel, status: prepareOnly ? "draft" : "pending", provider: CHANNEL_PROVIDER[channel] });

  if (prepareOnly) {
    return { ok: true, notificationId: notification.id, channel, status: notification.status, provider: notification.provider, providerMessageId: null, error: null };
  }

  try {
    await recordNotificationAttempt(supabase, { notificationId: notification.id, attemptNumber: 1, provider: providerStatus.provider, requestSummary: { channel, type }, status: "processing" });
    const result = await provider.prepare(input);
    const finalStatus = channel === "internal" ? "delivered" : "sent";
    const updated = await updateNotificationStatus(supabase, notification.id, finalStatus, { provider_message_id: result.providerMessageId || null });
    return { ok: true, notificationId: updated.id, channel, status: updated.status, provider: updated.provider, providerMessageId: updated.provider_message_id || null, error: null };
  } catch (error) {
    await updateNotificationStatus(supabase, notification.id, "failed", { error_code: error?.code || "provider_error", error_message: String(error?.message || "Error de proveedor.").slice(0, 500) });
    return { ok: false, notificationId: notification.id, channel, status: "failed", provider: CHANNEL_PROVIDER[channel], providerMessageId: null, error: { code: error?.code || "provider_error", message: error?.message || "Error de proveedor." } };
  }
}

export function getInternalProviderStatus() {
  return { provider: "internal", configured: true, enabled: true };
}

export async function prepareInternalNotification() {
  return { provider: "internal", enabled: true, prepared: true };
}

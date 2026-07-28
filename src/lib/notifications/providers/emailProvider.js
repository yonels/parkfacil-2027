import { getMicrosoftGraphConfiguration, isMicrosoftGraphConfigurationError } from "../../microsoftGraphMailCore.js";

export function getEmailProviderStatus(env = process.env) {
  try {
    getMicrosoftGraphConfiguration(env);
    return { provider: "microsoft_graph", configured: true, enabled: true };
  } catch (error) {
    if (isMicrosoftGraphConfigurationError(error)) return { provider: "microsoft_graph", configured: false, enabled: false, missingVariables: error.missingVariables };
    throw error;
  }
}

export async function prepareEmailNotification() {
  return { provider: "microsoft_graph", enabled: true, prepared: true };
}

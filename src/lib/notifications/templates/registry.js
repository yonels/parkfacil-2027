export const notificationTemplateRegistry = {
  credential_created: { key: "credential_created", name: "Credencial creada", channels: ["email", "internal"] },
  credential_status_changed: { key: "credential_status_changed", name: "Cambio de estado de credencial", channels: ["email", "internal"] },
  subscriber_created: { key: "subscriber_created", name: "Abonado creado", channels: ["email", "internal"] },
  operational_alert: { key: "operational_alert", name: "Alerta operacional", channels: ["email", "internal", "whatsapp"] },
};

export function getNotificationTemplate(key) {
  return notificationTemplateRegistry[key] || null;
}

export const NOTIFICATION_CHANNELS = ["email", "whatsapp", "internal"];
export const NOTIFICATION_STATUSES = ["draft", "pending", "processing", "sent", "delivered", "failed", "cancelled"];
export const NOTIFICATION_TYPES = [
  "credential_created",
  "credential_status_changed",
  "subscriber_created",
  "subscriber_expiring",
  "subscriber_expired",
  "payment_received",
  "cash_closure",
  "contract_created",
  "contract_expiring",
  "quote_created",
  "quote_accepted",
  "operational_alert",
  "system_alert",
];

export const CHANNEL_LABELS = {
  email: "Correo electrónico",
  whatsapp: "WhatsApp",
  internal: "Notificación interna",
};

export const STATUS_LABELS = {
  draft: "Borrador",
  pending: "Pendiente",
  processing: "Procesando",
  sent: "Enviada",
  delivered: "Entregada",
  failed: "Fallida",
  cancelled: "Cancelada",
};

export const TYPE_LABELS = {
  credential_created: "Credencial creada",
  credential_status_changed: "Cambio de estado de credencial",
  subscriber_created: "Abonado creado",
  subscriber_expiring: "Abonado por vencer",
  subscriber_expired: "Abonado vencido",
  payment_received: "Pago recibido",
  cash_closure: "Cierre de caja",
  contract_created: "Contrato creado",
  contract_expiring: "Contrato por vencer",
  quote_created: "Cotización creada",
  quote_accepted: "Cotización aceptada",
  operational_alert: "Alerta operacional",
  system_alert: "Alerta del sistema",
};

export const CHANNEL_PROVIDER = {
  email: "microsoft_graph",
  whatsapp: "whatsapp_cloud_api",
  internal: "internal",
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

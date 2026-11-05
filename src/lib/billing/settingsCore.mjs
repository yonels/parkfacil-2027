// Configuración de facturación de ParkFacil (SOL-2026-11-05-005, F1.4): datos del emisor, plazo de pago y
// proveedor de emisión. Validación pura, sin acceso a base de datos.
import { formatRut, parseRut } from "../companySetup/companySetupWizardCore.mjs";

export const BILLING_PROVIDERS = Object.freeze({
  SIMULATED: { label: "Simulado (pruebas, sin validez ante el SII)", available: true },
  HAULMER: { label: "Haulmer OpenFactura", available: false, note: "Se habilita en la etapa F2 (decisiones D8 y D9)." },
});
export const PROVIDER_ENVIRONMENTS = Object.freeze({ TEST: "Pruebas / certificación", PRODUCTION: "Producción" });

export class BillingSettingsError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "BillingSettingsError";
    this.code = code;
    this.field = field;
    this.status = 422;
  }
}

const TEXT_FIELDS = [
  ["issuerBusinessName", "issuer_business_name", 2, 120, "La razón social es obligatoria (2 a 120 caracteres)."],
  ["issuerActivity", "issuer_activity", 2, 160, "El giro es obligatorio (2 a 160 caracteres)."],
  ["issuerActivityCode", "issuer_activity_code", 0, 10, "El código de actividad admite hasta 10 caracteres."],
  ["issuerAddress", "issuer_address", 0, 160, "La dirección admite hasta 160 caracteres."],
  ["issuerDistrict", "issuer_district", 0, 80, "La comuna admite hasta 80 caracteres."],
  ["issuerCity", "issuer_city", 0, 80, "La ciudad admite hasta 80 caracteres."],
  ["issuerSiiOffice", "issuer_sii_office", 0, 80, "La oficina del SII admite hasta 80 caracteres."],
  ["issuerPhone", "issuer_phone", 0, 30, "El teléfono admite hasta 30 caracteres."],
];

export function validateBillingSettings(input = {}) {
  const row = {};
  for (const [key, column, min, max, message] of TEXT_FIELDS) {
    const value = String(input[key] ?? "").trim();
    if (value.length < min || value.length > max) throw new BillingSettingsError("SETTINGS_FIELD_INVALID", message, key);
    row[column] = value;
  }
  const rut = parseRut(input.issuerRut);
  if (!rut) throw new BillingSettingsError("SETTINGS_RUT_INVALID", "El RUT del emisor no es válido (revisa el dígito verificador).", "issuerRut");
  row.issuer_rut_number = rut.number;
  row.issuer_rut_dv = rut.dv;
  const email = String(input.issuerEmail ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BillingSettingsError("SETTINGS_EMAIL_INVALID", "El correo de facturación no es válido.", "issuerEmail");
  row.issuer_email = email;
  const days = Number(input.defaultPaymentDueDays);
  if (!Number.isInteger(days) || days < 0 || days > 120) throw new BillingSettingsError("SETTINGS_DUE_DAYS_INVALID", "Los días de pago deben ser un número entero de 0 a 120.", "defaultPaymentDueDays");
  row.default_payment_due_days = days;
  const provider = String(input.invoiceProvider || "SIMULATED");
  if (!BILLING_PROVIDERS[provider]) throw new BillingSettingsError("SETTINGS_PROVIDER_INVALID", "Proveedor de emisión no válido.", "invoiceProvider");
  if (!BILLING_PROVIDERS[provider].available) throw new BillingSettingsError("SETTINGS_PROVIDER_UNAVAILABLE", `${BILLING_PROVIDERS[provider].label} todavía no está disponible. ${BILLING_PROVIDERS[provider].note || ""}`.trim(), "invoiceProvider");
  row.invoice_provider = provider;
  const environment = String(input.providerEnvironment || "TEST");
  if (!PROVIDER_ENVIRONMENTS[environment]) throw new BillingSettingsError("SETTINGS_ENVIRONMENT_INVALID", "Ambiente no válido.", "providerEnvironment");
  row.provider_environment = environment;
  return row;
}

export function fromSettingsRow(row = {}) {
  return {
    issuerBusinessName: row.issuer_business_name || "",
    issuerRut: row.issuer_rut_number ? formatRut({ number: row.issuer_rut_number, dv: row.issuer_rut_dv }) : "",
    issuerActivity: row.issuer_activity || "", issuerActivityCode: row.issuer_activity_code || "",
    issuerAddress: row.issuer_address || "", issuerDistrict: row.issuer_district || "", issuerCity: row.issuer_city || "",
    issuerSiiOffice: row.issuer_sii_office || "", issuerEmail: row.issuer_email || "", issuerPhone: row.issuer_phone || "",
    defaultPaymentDueDays: Number(row.default_payment_due_days ?? 6),
    invoiceProvider: row.invoice_provider || "SIMULATED", providerEnvironment: row.provider_environment || "TEST",
    updatedAt: row.updated_at || null,
  };
}

// Datos del emisor que viajan en cada documento. Para emitir se exigen razón social, RUT, giro, dirección y comuna.
export function issuerForDocument(row = {}) {
  const settings = fromSettingsRow(row);
  const missing = [["issuerBusinessName", "razón social"], ["issuerRut", "RUT"], ["issuerActivity", "giro"], ["issuerAddress", "dirección"], ["issuerDistrict", "comuna"]]
    .filter(([key]) => !settings[key]).map(([, label]) => label);
  return {
    issuer: { businessName: settings.issuerBusinessName, rut: settings.issuerRut.replace(/\./g, ""), businessActivity: settings.issuerActivity, activityCode: settings.issuerActivityCode, address: settings.issuerAddress, district: settings.issuerDistrict, city: settings.issuerCity, siiOffice: settings.issuerSiiOffice, email: settings.issuerEmail, provider: settings.invoiceProvider === "SIMULATED" ? "mock" : settings.invoiceProvider.toLowerCase(), environment: settings.providerEnvironment },
    missing,
  };
}

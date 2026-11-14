// «Consulte su boleta» (SOL-2026-11-12-004), etapa 1 -- reglas puras (sin
// DOM/Supabase), mismo criterio que el resto de módulos "*Core.mjs" del
// proyecto. La consulta real (API) solo arma los datos crudos y llama a
// estas funciones -- así quedan 100% unit-testeables.
//
// Decisiones ya tomadas por el usuario (DISENO.md):
// - P1: solo patente, sin segundo dato.
// - P5/§9.8: en producción se ocultan las boletas de prueba; en QA se
//   muestran marcadas «DOCUMENTO DE PRUEBA».
// - P6: las boletas FAILED (o inexistentes) no se muestran.
// - §9.5 (P15) y §8.4 (etapa 2 omitida, 2026-11-13): en débito y crédito
//   del POS (TUU) SIEMPRE se muestra el comprobante C (nunca una boleta
//   SII real), con los datos ya guardados en la estadía (sin marca ni
//   código de autorización -- TUU no los entrega hoy).
// - Etapa 3 (2026-11-14): un pago con tarjeta en línea (Webpay, «Pague
//   Aquí») SÍ puede tener una boleta SII real -- a diferencia de TUU, el
//   comprobante de Webpay no reemplaza a la boleta. Por eso `document`
//   (BOLETA/COMPROBANTE_C) es independiente de `kind`/`medio` (el medio
//   de pago): si existe una boleta ISSUED se muestra esa, sea cual sea el
//   medio; si no, tarjeta cae al comprobante C y efectivo sin boleta no
//   se muestra (P6).

const PLATE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{2}$/;

export function normalizePublicReceiptsPlate(value) {
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 6) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function isValidPublicReceiptsPlate(value) {
  return PLATE_PATTERN.test(String(value ?? ""));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePublicReceiptsEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidPublicReceiptsEmail(value) {
  const email = normalizePublicReceiptsEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

// VERCEL_ENV=production -> boletas de prueba ocultas; cualquier otro valor
// (preview/local/indefinido) se trata como QA -- mismo criterio que
// posCardPaymentsEnabled (cardPaymentsAvailability.mjs).
export function isProductionEnvironment(env = process.env) {
  return String(env?.VERCEL_ENV ?? "").trim().toLowerCase() === "production";
}

function emisorFrom(company) {
  if (!company) return null;
  return {
    businessName: company.business_name || "",
    rut: [company.rut_number, company.rut_dv].filter(Boolean).join("-") || "",
    address: [company.address, company.district, company.city].filter(Boolean).join(", "),
  };
}

// Arma una fila visible de la lista a partir de los datos crudos de una
// estadía PAID. Devuelve null cuando esa estadía no debe aparecer (pago en
// efectivo sin boleta ISSUED, o boleta de prueba en producción).
export function buildPublicReceiptRow({ stay, boleta = null, parking = null, company = null, isProduction = true }) {
  if (!stay || stay.status !== "PAID" || !stay.exit_at) return null;
  if (!["CASH", "CARD"].includes(stay.payment_method)) return null;

  const isCard = stay.payment_method === "CARD";
  const cardType = stay.payment_card_type === "CREDIT" ? "CREDITO" : stay.payment_card_type === "DEBIT" ? "DEBITO" : "TARJETA";

  const base = {
    stayId: stay.id,
    paymentCode: stay.payment_code || "",
    entryAt: stay.entry_at || null,
    exitAt: stay.exit_at,
    parkingName: parking?.name || "",
    city: parking?.city || "",
    emisor: emisorFrom(company),
    kind: stay.payment_method,
    medio: isCard ? cardType : "EFECTIVO",
    netAmount: Number(stay.net_amount ?? 0),
    taxAmount: Number(stay.tax_amount ?? 0),
    totalAmount: Number(stay.total_amount ?? 0),
    ...(isCard ? {
      cardLast4: /^\d{4}$/.test(String(stay.card_last4 || "")) ? stay.card_last4 : null,
      cardOperationNumber: stay.card_payment_reference || null,
      cardApprovedAt: stay.card_payment_approved_at || stay.exit_at,
    } : {}),
  };

  if (boleta?.status === "ISSUED") {
    const isTest = boleta.environment === "TEST";
    if (isTest && isProduction) return null; // P5: en producción se ocultan las de prueba.
    return {
      ...base,
      document: "BOLETA",
      folio: boleta.folio != null ? String(boleta.folio) : null,
      isTestDocument: isTest,
      netAmount: Number.isFinite(Number(boleta.net_amount)) ? Number(boleta.net_amount) : base.netAmount,
      taxAmount: Number.isFinite(Number(boleta.tax_amount)) ? Number(boleta.tax_amount) : base.taxAmount,
      totalAmount: Number.isFinite(Number(boleta.total_amount)) ? Number(boleta.total_amount) : base.totalAmount,
    };
  }

  if (isCard) return { ...base, document: "COMPROBANTE_C" };

  return null; // efectivo sin boleta ISSUED: P6, no se muestra.
}

// On Street (Webpay, SOL-2026-11-12-004 etapa 3 -- 2026-11-14): esquema
// totalmente aparte de parking_stays (on_street_payment_intents, sin
// stay_id). A diferencia de Off Street, On Street nunca tuvo un "voucher
// TUU" -- solo paga en línea -- así que no existe un comprobante C para
// este canal: si no hay boleta ISSUED, no hay nada que mostrar (mismo
// criterio que P6 para efectivo).
export function buildPublicReceiptOnStreetRow({ intent, boleta = null, parking = null, company = null, isProduction = true }) {
  if (!intent || intent.status !== "PAID" || !intent.paid_at) return null;
  if (boleta?.status !== "ISSUED") return null;
  const isTest = boleta.environment === "TEST";
  if (isTest && isProduction) return null; // P5

  return {
    stayId: intent.id,
    paymentCode: boleta.payment_code || "",
    entryAt: null,
    exitAt: intent.paid_at,
    parkingName: parking?.name || "",
    city: parking?.city || "",
    emisor: emisorFrom(company),
    kind: "CARD",
    medio: "TARJETA",
    document: "BOLETA",
    folio: boleta.folio != null ? String(boleta.folio) : null,
    isTestDocument: isTest,
    netAmount: Number.isFinite(Number(boleta.net_amount)) ? Number(boleta.net_amount) : 0,
    taxAmount: Number.isFinite(Number(boleta.tax_amount)) ? Number(boleta.tax_amount) : 0,
    totalAmount: Number.isFinite(Number(boleta.total_amount)) ? Number(boleta.total_amount) : Number(intent.amount ?? 0),
  };
}

export function buildPublicReceiptRows({
  stays = [], boletasByStayId = new Map(), parkingsById = new Map(), companiesById = new Map(),
  onStreetIntents = [], onStreetBoletasByIntentId = new Map(),
  isProduction = true,
} = {}) {
  const parkingCompany = (parkingId) => (parkingId ? parkingsById.get(parkingId)?.company_id : null);

  const offStreetRows = stays.map((stay) => buildPublicReceiptRow({
    stay,
    boleta: boletasByStayId.get(stay.id) || null,
    parking: parkingsById.get(stay.parking_id) || null,
    company: companiesById.get(parkingCompany(stay.parking_id)) || null,
    isProduction,
  }));

  const onStreetRows = onStreetIntents.map((intent) => buildPublicReceiptOnStreetRow({
    intent,
    boleta: onStreetBoletasByIntentId.get(intent.id) || null,
    parking: parkingsById.get(intent.parking_id) || null,
    company: companiesById.get(parkingCompany(intent.parking_id)) || null,
    isProduction,
  }));

  return [...offStreetRows, ...onStreetRows]
    .filter(Boolean)
    .sort((a, b) => new Date(b.exitAt) - new Date(a.exitAt));
}

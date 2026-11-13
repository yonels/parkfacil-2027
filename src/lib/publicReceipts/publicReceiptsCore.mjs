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
//   SIEMPRE se muestra el comprobante C (nunca una boleta SII real), con
//   los datos ya guardados en la estadía (sin marca ni código de
//   autorización -- TUU no los entrega hoy).

const PLATE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{2}$/;

export function normalizePublicReceiptsPlate(value) {
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 6) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function isValidPublicReceiptsPlate(value) {
  return PLATE_PATTERN.test(String(value ?? ""));
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

  const base = {
    stayId: stay.id,
    paymentCode: stay.payment_code || "",
    entryAt: stay.entry_at || null,
    exitAt: stay.exit_at,
    parkingName: parking?.name || "",
    city: parking?.city || "",
    emisor: emisorFrom(company),
    netAmount: Number(stay.net_amount ?? 0),
    taxAmount: Number(stay.tax_amount ?? 0),
    totalAmount: Number(stay.total_amount ?? 0),
  };

  if (stay.payment_method === "CARD") {
    const cardType = stay.payment_card_type === "CREDIT" ? "CREDITO" : stay.payment_card_type === "DEBIT" ? "DEBITO" : "TARJETA";
    return {
      ...base,
      kind: "CARD",
      medio: cardType,
      document: "COMPROBANTE_C",
      cardLast4: /^\d{4}$/.test(String(stay.card_last4 || "")) ? stay.card_last4 : null,
      cardOperationNumber: stay.card_payment_reference || null,
      cardApprovedAt: stay.card_payment_approved_at || stay.exit_at,
    };
  }

  if (stay.payment_method === "CASH") {
    if (!boleta || boleta.status !== "ISSUED") return null; // P6: sin boleta emitida, no se muestra.
    const isTest = boleta.environment === "TEST";
    if (isTest && isProduction) return null; // P5: en producción se ocultan las de prueba.
    return {
      ...base,
      kind: "CASH",
      medio: "EFECTIVO",
      document: "BOLETA",
      folio: boleta.folio != null ? String(boleta.folio) : null,
      isTestDocument: isTest,
      netAmount: Number.isFinite(Number(boleta.net_amount)) ? Number(boleta.net_amount) : base.netAmount,
      taxAmount: Number.isFinite(Number(boleta.tax_amount)) ? Number(boleta.tax_amount) : base.taxAmount,
      totalAmount: Number.isFinite(Number(boleta.total_amount)) ? Number(boleta.total_amount) : base.totalAmount,
    };
  }

  return null; // payment_method desconocido o estadía liberada sin cobro: nada que mostrar.
}

export function buildPublicReceiptRows({ stays = [], boletasByStayId = new Map(), parkingsById = new Map(), companiesById = new Map(), isProduction = true } = {}) {
  return stays
    .map((stay) => buildPublicReceiptRow({
      stay,
      boleta: boletasByStayId.get(stay.id) || null,
      parking: parkingsById.get(stay.parking_id) || null,
      company: companiesById.get(stay.parking_id ? parkingsById.get(stay.parking_id)?.company_id : null) || null,
      isProduction,
    }))
    .filter(Boolean)
    .sort((a, b) => new Date(b.exitAt) - new Date(a.exitAt));
}

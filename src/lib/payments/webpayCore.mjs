export function sanitizeWebpayResponse(response = {}) {
  return {
    status: String(response.status || "").slice(0, 40),
    buyOrder: String(response.buy_order || "").slice(0, 26),
    sessionId: String(response.session_id || "").slice(0, 61),
    amount: Number(response.amount),
    responseCode: Number(response.response_code),
    authorizationCode: response.authorization_code ? String(response.authorization_code).slice(0, 64) : null,
    paymentTypeCode: response.payment_type_code ? String(response.payment_type_code).slice(0, 8) : null,
    installmentsNumber: Number.isFinite(Number(response.installments_number)) ? Number(response.installments_number) : null,
    transactionDate: response.transaction_date || null,
  };
}

export function isAuthorizedWebpayResponse(response, expected) {
  return String(response?.status).toUpperCase() === "AUTHORIZED" && Number(response?.response_code) === 0 && String(response?.buy_order) === expected.buyOrder && Number(response?.amount) === expected.amount;
}

export function webpayPaymentType(paymentTypeCode) {
  const code = String(paymentTypeCode || "").toUpperCase();
  if (code === "VD") return "DEBIT";
  if (["VN", "VC", "SI", "S2", "NC"].includes(code)) return "CREDIT";
  return null;
}

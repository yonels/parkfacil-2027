export const PAYMENT_TYPE_LABELS = Object.freeze({ DEBIT: "Débito", CREDIT: "Crédito" });

export function maskAdminPhone(value) {
  const digits=String(value||"").replace(/\D/g,"");
  return digits.length>=4?`***${digits.slice(-4)}`:"—";
}

export function visibleOnStreetStatus(session, now=new Date()) {
  if(session.status==="ACTIVE"&&session.expires_at&&new Date(session.expires_at)<=now)return "EXPIRED";
  return session.status;
}

export function normalizeOnStreetFilters(input={}) {
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||""))?String(input.date):null;
  const uuid=(value)=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""))?String(value):null;
  return {date,parkingId:uuid(input.parkingId),areaId:uuid(input.areaId),streetId:uuid(input.streetId),segmentId:uuid(input.segmentId)};
}

export function paymentTypeFromTransaction(transaction) {
  return PAYMENT_TYPE_LABELS[transaction?.payment_type]||"No informado";
}

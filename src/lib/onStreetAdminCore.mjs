export const PAYMENT_TYPE_LABELS = Object.freeze({ DEBIT: "Débito", CREDIT: "Crédito" });

export function maskAdminPhone(value) {
  const digits=String(value||"").replace(/\D/g,"");
  return digits.length>=4?`***${digits.slice(-4)}`:"—";
}

export function visibleOnStreetStatus(session, now=new Date()) {
  if(session.status==="ACTIVE"&&session.expires_at&&new Date(session.expires_at)<=now)return "EXPIRED";
  return session.status;
}

// period/from/to/month/year (§ corrección "filtro de fechas" 2026-08-28):
// reemplaza el filtro de un solo día ("date") de Sesiones/Pagos On Street
// por el mismo selector HOY/7 DÍAS/MES/AÑO/PERSONALIZADO que ya usa el
// Dashboard -- ver resolvePeriodBounds (onStreetDashboardCore.mjs), que
// resuelve el rango real. "date" se conserva por compatibilidad (algún
// caller externo podría seguir enviándolo, p. ej. un enlace guardado) pero
// ya no es la fuente de verdad del filtrado: ver listOnStreetSessions/
// listOnStreetPayments, que ahora arman los límites con resolvePeriodBounds.
export function normalizeOnStreetFilters(input={}) {
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||""))?String(input.date):null;
  const uuid=(value)=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""))?String(value):null;
  const period=["today","7d","month","year","custom"].includes(input.period)?input.period:null;
  const isoDate=(value)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))?String(value):null;
  const month=/^(0?[1-9]|1[0-2])$/.test(String(input.month||""))?Number(input.month):null;
  const year=/^\d{4}$/.test(String(input.year||""))?Number(input.year):null;
  // plate/status (§ paginación real 2026-08-28): patente es texto libre
  // acotado (evita inyectar patrones ILIKE arbitrarios largos/binarios);
  // estado se restringe a los valores reales del modelo -- cualquier otro
  // valor se descarta a null, nunca se propaga tal cual a la consulta.
  const plate=/^[A-Za-z0-9]{1,10}$/.test(String(input.plate||"").trim())?String(input.plate).trim().toUpperCase():null;
  // Unión de los estados reales de ambas tablas (sesiones y pagos) -- el
  // filtro "Estado" es un único campo compartido en la UI (OnStreetFilters);
  // cada repositorio aplica .eq("status",...) sobre su propia tabla, así
  // que un valor del "otro" universo simplemente no calza con ninguna fila
  // (0 resultados, nunca un error ni una fila incorrecta).
  const status=["ACTIVE","EXPIRED","CLOSED","CREATED","REDIRECTED","COMMITTING","COMMITTED","REJECTED","ABORTED","FAILED"].includes(input.status)?input.status:null;
  return {date,period,from:isoDate(input.from),to:isoDate(input.to),month,year,plate,status,parkingId:uuid(input.parkingId),areaId:uuid(input.areaId),streetId:uuid(input.streetId),segmentId:uuid(input.segmentId)};
}

export function paymentTypeFromTransaction(transaction) {
  return PAYMENT_TYPE_LABELS[transaction?.payment_type]||"No informado";
}

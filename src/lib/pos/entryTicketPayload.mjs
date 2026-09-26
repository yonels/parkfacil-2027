// POS Entry/Exit — ticket de entrada (formato validado físicamente en
// PT-210 / MTP-II 58 mm). Arma el payload que recibe el agente local de
// impresión (parkfacil-print-agent, ticketFormatter.buildEntryTicket).
// Reglas puras, sin DOM: 100% unit-testeables.
//
// Origen de los datos (modelo existente, sin migraciones):
//   estadía (parking_stays) -> parking (parkings, respuesta de ENTRY con
//   company:companies(...) resuelta por la FK parkings.company_id) ->
//   companies.business_name / rut_number + rut_dv / address + district +
//   city / phone.
// Nunca se elige una empresa "por orden": la empresa es la del parking que
// el backend devolvió para ESA estadía.
//
// Campos de empresa vacíos (null/undefined/"") se OMITEN del payload -- el
// agente no imprime etiquetas vacías ("RUT:" / "Tel:" sin valor).

export const TICKET_TIME_ZONE = "America/Santiago";

function clean(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

// "12345678" + "5" -> "12.345.678-5". Si el número ya viene con puntos o
// guion se normaliza igual; sin número o sin DV válido -> undefined.
export function formatRut(rutNumber, rutDv) {
  const digits = String(rutNumber ?? "").replace(/[^0-9]/g, "");
  const dv = String(rutDv ?? "").trim().toUpperCase();
  if (!digits || !/^[0-9K]$/.test(dv)) return undefined;
  const withDots = digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

// Fecha y hora en UNA línea, con segundos, en hora operacional de Chile
// (DD-MM-YYYY HH:mm:ss). La autoridad es entry_at del servidor.
export function formatTicketDateTime(value, timeZone = TICKET_TIME_ZONE) {
  // null/"" no son fechas (new Date(null) sería 1970): sin entry_at no hay
  // ticket, nunca una fecha inventada.
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  if (!parts.day || !parts.month || !parts.year || !parts.hour || !parts.minute || !parts.second) return undefined;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.day}-${parts.month}-${parts.year} ${hour}:${parts.minute}:${parts.second}`;
}

// Patente para el fallback sin foto: solo A-Z/0-9, en mayúsculas.
export function ticketPlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function companyTicketFields(parking) {
  const company = parking?.company || null;
  const fields = {
    razonSocial: clean(company?.business_name) || clean(parking?.company_name),
    rut: formatRut(company?.rut_number, company?.rut_dv),
    direccion: clean([company?.address, company?.district, company?.city].map(clean).filter(Boolean).join(", ")),
    telefono: clean(company?.phone),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

// Payload ENTRY del agente. No incluye nombre/código del parking (el ticket
// aprobado no repite "Empresa - CÓDIGO"); devuelve null si falta un dato
// sin el cual el ticket no identifica la estadía (patente, ticket, QR, fecha).
export function buildAgentEntryTicketPayload(stay, parking) {
  const patente = ticketPlate(stay?.license_plate);
  const ticketNumber = clean(stay?.code);
  const qrValue = clean(stay?.qr_token);
  const fechaHoraIngreso = formatTicketDateTime(stay?.entry_at);
  if (!patente || !ticketNumber || !qrValue || !fechaHoraIngreso) return null;
  const operador = clean(stay?.entry_operator_name);
  return {
    type: "ENTRY",
    ...companyTicketFields(parking),
    fechaHoraIngreso,
    ...(operador ? { operador } : {}),
    patente,
    ticketNumber,
    qrValue,
  };
}

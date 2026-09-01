// Ticket ESC/POS "MULTA DE CORTESIA" (Inspector, Etapa 3 final --
// Capacitor/Android, 2026-08-31; texto pasado a ASCII puro 2026-08-31
// tras confirmarse en la MTP-II física que la impresión Android generaba
// caracteres corruptos con tildes -- ver informe de esa corrección. Solo
// afecta al TEXTO: comandos, tamaños, negrita y estructura del ticket
// quedan exactamente iguales). Constructor PURO de bytes -- sin DOM,
// sin Bluetooth, testeable con `node --test`. Reutiliza escposCore.mjs
// (misma codificación/comandos que el agente de impresión de PC ya
// probado con la MTP-II real -- ver esa cabecera para el detalle). El
// transporte real (Bluetooth Classic SPP vía el plugin nativo Capacitor,
// solo Android -- ver informe de compatibilidad) vive en
// printerAdapter.js, que únicamente consume el Uint8Array que esta
// función produce. La vista en pantalla (CourtesyTicketPrint.js) reutiliza
// courtesyTicketLines() -- el MISMO contenido en ambos casos, nunca una
// segunda fuente de verdad.
//
// Regla explícita del requerimiento: "No agregar información adicional al
// ticket". Solo existen estas líneas, en este orden, nada más:
//   PARKFACIL
//   PATENTE: <patente>
//   <dd/mm/aaaa>  <hh:mm>
//   MULTA DE CORTESIA        <- destacado (negrita + doble alto)
//   TIEMPO VENCIDO           <- destacado (negrita + doble alto)
//   SU TIEMPO EXPIRO Y
//   ESTA EN INFRACCION       <- destacado junto con la línea anterior
//   Fiscalizacion: #<folio>
//   www.parkfacil.cl
//
// Papel de 58mm (MTP-II real, ~48mm de ancho efectivo -- ver informe),
// ~32 columnas a fuente normal, mismo criterio que ticketFormatter.js del
// agente de PC (DASHES de 32 caracteres). Solo doble ALTO (nunca doble
// ancho) para las líneas destacadas: "MULTA DE CORTESIA" (18 caracteres)
// se cortaría a doble ancho en 32 columnas; duplicar solo el alto nunca
// provoca que una línea se corte. Centrado vía el propio comando ESC/POS
// de justificación (align), nunca rellenando con espacios a mano.
import { align, blank, bold, concatBytes, cut, feed, init, size, text } from "./escposCore.mjs";

// Folio corto y REAL (derivado del id UUID real de la fiscalización ya
// confirmada por el servidor -- register_on_street_inspection no expone
// un correlativo numérico propio, ver informe de esta tarea). Nunca se
// inventa un número: son los primeros 8 caracteres del id real, en
// mayúsculas -- suficientemente cortos para el ticket y suficientemente
// únicos para identificar la fiscalización real al buscarla después.
export function courtesyTicketFolio(inspectionId) {
  return String(inspectionId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

// Fecha/hora en horario de Chile, mismo formato "dd/mm/aaaa" + "hh:mm"
// (24h) ya usado en el resto de comprobantes On Street.
export function courtesyTicketDateTime(isoString, now = new Date()) {
  const date = isoString ? new Date(isoString) : now;
  const parts = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("day")}/${get("month")}/${get("year")}`, time: `${get("hour")}:${get("minute")}` };
}

// Líneas de texto plano (sin comandos ESC/POS) -- ÚNICA fuente de verdad
// del contenido, reutilizada por la vista previa en pantalla y por la
// impresión real. "Reimprimir" (§ requerimiento) llama a esta misma
// función con EXACTAMENTE los mismos plate/inspectedAt/inspectionId ya
// guardados del registro original -- nunca recalcula ni vuelve a pedir
// nada al servidor, así que la reimpresión siempre coincide con el
// original (misma patente, misma fecha/hora, mismo folio).
export function courtesyTicketLines({ plate, inspectedAt, inspectionId }) {
  const { date, time } = courtesyTicketDateTime(inspectedAt);
  const folio = courtesyTicketFolio(inspectionId);
  return {
    header: "PARKFACIL",
    plateLine: `PATENTE: ${String(plate || "").toUpperCase()}`,
    dateTimeLine: `${date}  ${time}`,
    title: "MULTA DE CORTESIA",
    subtitle: "TIEMPO VENCIDO",
    messageLines: ["SU TIEMPO EXPIRO Y", "ESTA EN INFRACCION"],
    folioLine: `Fiscalizacion: #${folio}`,
    footer: "www.parkfacil.cl",
  };
}

// Payload JSON para el agente de impresión de PC ya existente (integración
// 2026-08-31 -- ver informe: ParkFacil Print Agent, el mismo que ya usa
// POS, escuchando en 127.0.0.1:19100). A diferencia del transporte
// Android (bytes ESC/POS crudos por Bluetooth), el agente arma sus propios
// bytes desde campos ya formateados -- mismo contrato que sus tickets
// ENTRY/EXIT existentes (ver parkfacil-print-agent/agent.js,
// TICKET_SCHEMAS.COURTESY_FINE): nunca recibe bytes crudos, nunca calcula
// fecha/hora/folio por su cuenta. Reutiliza las MISMAS
// courtesyTicketFolio/courtesyTicketDateTime que usan la vista previa en
// pantalla y el ticket Android -- una sola fuente de verdad de folio y
// fecha/hora para los tres transportes.
export function courtesyTicketAgentPayload({ plate, inspectedAt, inspectionId }) {
  const { date, time } = courtesyTicketDateTime(inspectedAt);
  return {
    type: "COURTESY_FINE",
    patente: String(plate || "").toUpperCase(),
    fechaHora: `${date}  ${time}`,
    folio: courtesyTicketFolio(inspectionId),
  };
}

// Construye los bytes ESC/POS completos, listos para escribirse tal cual
// (en trozos, ver printerAdapter.js) al socket Bluetooth Classic SPP de
// la impresora. Formato fijo -- ver cabecera del archivo.
export function buildCourtesyTicketEscPos({ plate, inspectedAt, inspectionId }) {
  const lines = courtesyTicketLines({ plate, inspectedAt, inspectionId });
  return concatBytes([
    init(),

    align(1),
    bold(true), text(lines.header), bold(false),
    blank(1),

    align(0),
    text(lines.plateLine),
    text(lines.dateTimeLine),
    blank(1),

    align(1),
    bold(true), size(1, 2), text(lines.title), size(1, 1),
    blank(1),

    size(1, 2), text(lines.subtitle), size(1, 1),
    blank(1),

    ...lines.messageLines.map((line) => text(line)),
    bold(false),
    blank(1),

    align(0),
    text(lines.folioLine),
    blank(1),

    align(1),
    text(lines.footer),
    feed(3),
    cut(),
  ]);
}

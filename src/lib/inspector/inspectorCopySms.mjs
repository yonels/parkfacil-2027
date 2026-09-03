// Copia SMS operativa al teléfono del propio Inspector (2026-09-03,
// "decouple printing + sms copy"): trazabilidad de que el aviso al
// conductor salió, sin repetir el texto legal aprobado de ese SMS
// (inspectorSms.mjs -- INSPECTION_OVERDUE_SMS_TEXT no se toca ni se
// reutiliza aquí). Mensaje puramente operativo/informativo para el
// inspector: nunca incluye el teléfono ni ningún dato del conductor, solo
// la patente (ya visible en el propio flujo del inspector) y la fecha/hora
// del envío -- ver "NO incluir datos sensibles innecesarios" de la tarea.
//
// Reutiliza courtesyTicketDateTime (mismo formato dd/mm/aaaa hh:mm, horario
// de Chile) ya usado en el comprobante impreso -- no se inventa un
// formateador de fecha propio.
import { courtesyTicketDateTime } from "./courtesyTicketEscPos.mjs";

export function buildInspectorCopySmsText({ plate, sentAtIso }) {
  const { date, time } = courtesyTicketDateTime(sentAtIso);
  return `COPIA INSPECTOR - Fiscalizacion patente ${String(plate || "").toUpperCase()}. Aviso SMS enviado al conductor el ${date} ${time}.`;
}

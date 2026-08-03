import { getEstacionamientoById } from "./estacionamientos.mjs";
import { getDispositivoById } from "./dispositivos.mjs";
import { getUsuarioById } from "./usuarios.mjs";

export const operacionesDemo = [
  {
    id: "op-001",
    ticketNumero: "TK-1001",
    patente: "ABC-123",
    estacionamientoId: "p-001",
    acceso: "A1",
    tipoMovimiento: "entry",
    estadoTicket: "open",
    fechaHora: "2026-07-24T08:00:00",
    tipoUsuario: "visitor",
    medioIdentificacion: "license_plate",
    operadorId: "u-001",
    dispositivoId: "d-001",
    origen: "automatic",
    observaciones: "Ingreso automático desde el acceso principal.",
    salidaRelacionadaId: "op-002",
    ingresoRelacionadoId: null,
    eventos: ["Entrada detectada", "Ticket abierto"],
    auditoria: ["Registro demo", "Sin validación física real"],
    incidencias: [],
    documentos: ["Ticket de referencia"],
    historial: ["Movimiento creado en demo"],
    permanenciaMinutos: null,
  },
  {
    id: "op-002",
    ticketNumero: "TK-1002",
    patente: "XYZ-789",
    estacionamientoId: "p-002",
    acceso: "B2",
    tipoMovimiento: "exit",
    estadoTicket: "closed",
    fechaHora: "2026-07-24T09:30:00",
    tipoUsuario: "subscriber",
    medioIdentificacion: "qr",
    operadorId: "u-004",
    dispositivoId: "d-002",
    origen: "operator",
    observaciones: "Salida registrada por operador de referencia.",
    salidaRelacionadaId: null,
    ingresoRelacionadoId: "op-001",
    eventos: ["Salida registrada", "Ticket cerrado"],
    auditoria: ["Cierre de ticket demo"],
    incidencias: ["Observación de salida tardía"],
    documentos: ["Salida de referencia"],
    historial: ["Movimiento creado en demo"],
    permanenciaMinutos: 90,
  },
  {
    id: "op-003",
    ticketNumero: "TK-1003",
    patente: "LMN-456",
    estacionamientoId: "p-003",
    acceso: "C3",
    tipoMovimiento: "manual_entry",
    estadoTicket: "pending_review",
    fechaHora: "2026-07-24T10:15:00",
    tipoUsuario: "employee",
    medioIdentificacion: "manual",
    operadorId: "u-002",
    dispositivoId: null,
    origen: "manual",
    observaciones: "Ingreso registrado manualmente sin dispositivo asociado.",
    salidaRelacionadaId: null,
    ingresoRelacionadoId: null,
    eventos: ["Ingreso manual", "Revisión pendiente"],
    auditoria: ["Registro manual de demo"],
    incidencias: ["Sin dispositivo asociado"],
    documentos: [],
    historial: ["Movimiento creado en demo"],
    permanenciaMinutos: null,
  },
  {
    id: "op-004",
    ticketNumero: "TK-1004",
    patente: "QWE-321",
    estacionamientoId: "p-999",
    acceso: "D4",
    tipoMovimiento: "access_denied",
    estadoTicket: "cancelled",
    fechaHora: "2026-07-24T11:00:00",
    tipoUsuario: "unknown",
    medioIdentificacion: "unknown",
    operadorId: "u-999",
    dispositivoId: "d-999",
    origen: "device",
    observaciones: "Acceso denegado de referencia con relaciones inválidas.",
    salidaRelacionadaId: null,
    ingresoRelacionadoId: null,
    eventos: ["Acceso denegado"],
    auditoria: ["Registro demo de incidencia"],
    incidencias: ["Sin identificación válida"],
    documentos: [],
    historial: ["Movimiento creado en demo"],
    permanenciaMinutos: null,
  },
];

export function getOperacionesDemo() {
  return operacionesDemo;
}

export function getOperacionById(id) {
  return operacionesDemo.find((operacion) => operacion.id === id) ?? null;
}

export function getTicketByNumero(numero) {
  return operacionesDemo.find((operacion) => operacion.ticketNumero === numero) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

export function searchOperaciones(query) {
  const normalized = normalizeText(query);

  return operacionesDemo.filter((operacion) => {
    return [
      operacion.ticketNumero,
      operacion.patente,
      getEstacionamientoById(operacion.estacionamientoId)?.nombre || "",
      operacion.acceso,
      getUsuarioById(operacion.operadorId)?.nombreCompleto || "",
      getDispositivoById(operacion.dispositivoId)?.nombre || "",
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function filterOperacionesByTipo(tipo) {
  return operacionesDemo.filter((operacion) => operacion.tipoMovimiento === tipo);
}

export function filterOperacionesByEstado(estado) {
  return operacionesDemo.filter((operacion) => operacion.estadoTicket === estado);
}

export function filterOperacionesByEstacionamiento(estacionamientoId) {
  return operacionesDemo.filter((operacion) => operacion.estacionamientoId === estacionamientoId);
}

export function filterOperacionesByAcceso(acceso) {
  return operacionesDemo.filter((operacion) => operacion.acceso === acceso);
}

export function filterOperacionesByTipoUsuario(tipoUsuario) {
  return operacionesDemo.filter((operacion) => operacion.tipoUsuario === tipoUsuario);
}

export function filterOperacionesByOrigen(origen) {
  return operacionesDemo.filter((operacion) => operacion.origen === origen);
}

export function resolveEstacionamiento(operacion) {
  return getEstacionamientoById(operacion?.estacionamientoId)?.nombre || "No disponible";
}

export function resolveEmpresa(operacion) {
  return getEstacionamientoById(operacion?.estacionamientoId)?.empresa || "Sin empresa asociada";
}

export function resolveDispositivo(operacion) {
  return getDispositivoById(operacion?.dispositivoId)?.nombre || "No disponible";
}

export function resolveOperador(operacion) {
  return getUsuarioById(operacion?.operadorId)?.nombreCompleto || "No disponible";
}

export function getRelacionIngresoSalida(operacion) {
  if (operacion?.tipoMovimiento === "entry") {
    return operacionesDemo.find((item) => item.id === operacion.salidaRelacionadaId) ?? null;
  }

  if (operacion?.tipoMovimiento === "exit") {
    return operacionesDemo.find((item) => item.id === operacion.ingresoRelacionadoId) ?? null;
  }

  return null;
}

export function calcularPermanencia(ingreso, salida) {
  if (!ingreso || !salida) {
    return ingreso?.permanenciaMinutos ?? 0;
  }

  const start = new Date(ingreso.fechaHora);
  const end = new Date(salida.fechaHora);
  const minutos = Math.round((end - start) / (1000 * 60));
  return minutos > 0 ? minutos : 0;
}

export function getTicketsAbiertos() {
  return operacionesDemo.filter((operacion) => operacion.estadoTicket === "open");
}

export function getMovimientosManuales() {
  return operacionesDemo.filter((operacion) => operacion.tipoMovimiento.includes("manual"));
}

export function getVehiculosDentro() {
  return operacionesDemo.filter((operacion) => operacion.tipoMovimiento === "entry" || operacion.tipoMovimiento === "manual_entry");
}

export function getResumenOperativo(referenceDate = "2026-07-24") {
  const ingresosDia = operacionesDemo.filter((operacion) => operacion.tipoMovimiento === "entry" || operacion.tipoMovimiento === "manual_entry").length;
  const salidasDia = operacionesDemo.filter((operacion) => operacion.tipoMovimiento === "exit" || operacion.tipoMovimiento === "manual_exit").length;
  const ticketsAbiertos = getTicketsAbiertos().length;
  const ticketsObservados = operacionesDemo.filter((operacion) => operacion.incidencias.length > 0).length;
  const movimientosManuales = getMovimientosManuales().length;
  const vehiculosDentro = getVehiculosDentro().length;

  return {
    fechaReferencia: referenceDate,
    ingresosDia,
    salidasDia,
    ticketsAbiertos,
    ticketsObservados,
    movimientosManuales,
    vehiculosDentro,
  };
}

export function getTipoMovimientoLabel(tipo) {
  const labels = {
    entry: "Ingreso",
    exit: "Salida",
    manual_entry: "Ingreso manual",
    manual_exit: "Salida manual",
    ticket_opened: "Ticket abierto",
    ticket_closed: "Ticket cerrado",
    ticket_cancelled: "Ticket cancelado",
    access_denied: "Acceso denegado",
  };

  return labels[tipo] ?? tipo;
}

export function getEstadoTicketLabel(estado) {
  const labels = {
    open: "Abierto",
    closed: "Cerrado",
    cancelled: "Cancelado",
    pending_review: "Pendiente de revisión",
    lost: "Extraviado",
    exempt: "Exento",
  };

  return labels[estado] ?? estado;
}

export function getTipoUsuarioLabel(tipo) {
  const labels = {
    visitor: "Visitante",
    subscriber: "Suscriptor",
    employee: "Empleado",
    supplier: "Proveedor",
    resident: "Residente",
    courtesy: "Cortesía",
    unknown: "Desconocido",
  };

  return labels[tipo] ?? tipo;
}

export function getMedioIdentificacionLabel(medio) {
  const labels = {
    license_plate: "Patente",
    qr: "Código QR",
    ticket: "Ticket",
    card: "Tarjeta",
    manual: "Registro manual",
    lpr: "Cámara LPR",
    unknown: "Desconocido",
  };

  return labels[medio] ?? medio;
}

export function getOrigenLabel(origen) {
  const labels = {
    automatic: "Automático",
    operator: "Operador",
    device: "Dispositivo",
    integration: "Integración",
    manual: "Manual",
  };

  return labels[origen] ?? origen;
}

export function formatFechaHora(value) {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

import { getEmpresaById } from "./empresas.mjs";
import { getEstacionamientoById } from "./estacionamientos.mjs";
import { getUsuarioById } from "./usuarios.mjs";
import { getControlAccesoById } from "./controlAccesos.mjs";
import { getOperacionById } from "./operacion.mjs";
import { getAbonadoById } from "./abonados.mjs";

export const tiposVisitaPermitidos = ["business", "supplier", "delivery", "contractor", "personal", "interview", "event", "maintenance", "emergency", "courtesy", "temporary", "other"];
export const estadosVisitaPermitidos = ["scheduled", "pending_approval", "approved", "checked_in", "in_progress", "checked_out", "completed", "cancelled", "rejected", "expired", "no_show"];
export const estadosAprobacionPermitidos = ["not_required", "pending", "approved", "rejected", "revoked"];
export const mediosIdentificacionPermitidos = ["license_plate", "qr_code", "temporary_card", "document", "pin", "mobile", "manual", "reception", "other"];
export const tiposVehiculoPermitidos = ["car", "motorcycle", "van", "truck", "bicycle", "other"];

export const visitasDemo = [
  {
    id: "v-001",
    codigo: "VIS-2026-001",
    visitante: {
      nombre: "Elena Fuentes",
      identificador: "ID-DEMO-001",
      rut: "11.111.111-1",
      correo: "elena.fuentes@demo.local",
      telefono: "+56 9 1111 0001",
      empresaOrigen: "Servicios Delta",
    },
    motivo: "Reunion con gerencia operativa.",
    tipoVisita: "business",
    estado: "scheduled",
    estadoAprobacion: "approved",
    medioIdentificacion: "qr_code",
    hostUsuarioId: "u-001",
    hostEmpresaId: "e-001",
    responsableAlternativo: "Mesa de control ParkFacil",
    visitDate: "2026-07-25",
    validFrom: "2026-07-25T08:00:00",
    validUntil: "2026-07-25T12:00:00",
    entryFrom: "08:00",
    entryUntil: "10:00",
    exitUntil: "12:00",
    allDay: false,
    multipleEntry: false,
    maximumEntries: 1,
    gracePeriodMinutes: 15,
    timezone: "America/Santiago",
    accessNotes: "Ingreso por acceso principal con registro demostrativo.",
    permisos: {
      estacionamientosIds: ["p-001"],
      accesosIds: ["ca-001"],
      accesosPeatonales: ["Lobby Norte"],
      accesosVehiculares: ["Barreras A1"],
      estacionamientoAsignadoId: "p-001",
      zonasAutorizadas: ["Zona A"],
      restricciones: ["Sin acceso a bodega"],
      horarioEspecifico: "08:00 - 12:00",
      ingresoUnico: true,
      autorizacionGeneral: false,
    },
    vehicle: {
      id: "vv-001",
      licensePlate: "DEM-101",
      brand: "Toyota",
      model: "Corolla",
      color: "Blanco",
      vehicleType: "car",
      parkingSpace: "A-12",
      notes: "Vehiculo visitante de referencia.",
    },
    acompanantes: [
      {
        id: "acp-001",
        name: "Laura Pinto",
        identifier: "ID-DEMO-001-A",
        email: "laura.pinto@demo.local",
        phone: "+56 9 2222 0001",
        notes: "Acompaniante para reunion comercial.",
      },
    ],
    actividad: {
      ingresoHora: null,
      salidaHora: null,
      operadorId: null,
      dispositivoId: null,
      movimientosRelacionadosIds: [],
    },
    abonadoRelacionadoId: null,
    observaciones: "Visita programada en modalidad demostrativa.",
    incidencias: ["Sin incidencias"],
    historial: ["Solicitud creada", "Aprobacion demostrativa aplicada"],
    auditoria: ["Registro local", "Sin integracion externa"],
    documentos: ["Invitacion de referencia"],
    notificaciones: ["Notificacion demo enviada"],
  },
  {
    id: "v-002",
    codigo: "VIS-2026-002",
    visitante: {
      nombre: "Bruno Mena",
      identificador: "ID-DEMO-002",
      rut: "22.222.222-2",
      correo: "bruno.mena@demo.local",
      telefono: "+57 4 3333 0002",
      empresaOrigen: "Logistica Norte",
    },
    motivo: "Entrega de insumos operativos.",
    tipoVisita: "delivery",
    estado: "in_progress",
    estadoAprobacion: "not_required",
    medioIdentificacion: "license_plate",
    hostUsuarioId: "u-004",
    hostEmpresaId: "e-001",
    responsableAlternativo: "Recepcion principal",
    visitDate: "2026-07-25",
    validFrom: "2026-07-25T09:00:00",
    validUntil: "2026-07-25T11:15:00",
    entryFrom: "09:00",
    entryUntil: "10:30",
    exitUntil: "11:15",
    allDay: false,
    multipleEntry: true,
    maximumEntries: 3,
    gracePeriodMinutes: 10,
    timezone: "America/Santiago",
    accessNotes: "Entrega rapida por acceso de servicio.",
    permisos: {
      estacionamientosIds: ["p-001", "p-002"],
      accesosIds: ["ca-005", "ca-002"],
      accesosPeatonales: [],
      accesosVehiculares: ["Servicio Exterior"],
      estacionamientoAsignadoId: "p-001",
      zonasAutorizadas: ["Muelle Carga"],
      restricciones: ["No permanecer mas de 2 horas"],
      horarioEspecifico: "09:00 - 11:15",
      ingresoUnico: false,
      autorizacionGeneral: false,
    },
    vehicle: {
      id: "vv-002",
      licensePlate: "DEM-202",
      brand: "Hyundai",
      model: "H1",
      color: "Gris",
      vehicleType: "van",
      parkingSpace: "Carga-03",
      notes: "Vehiculo de reparto demostrativo.",
    },
    acompanantes: [],
    actividad: {
      ingresoHora: "2026-07-25T09:22:00",
      salidaHora: null,
      operadorId: "u-004",
      dispositivoId: "d-002",
      movimientosRelacionadosIds: ["op-001"],
    },
    abonadoRelacionadoId: null,
    observaciones: "Visita en curso para pruebas de vigencia y reservas por vencer.",
    incidencias: ["Sin incidencias"],
    historial: ["Ingreso registrado en modo demostrativo"],
    auditoria: ["Operacion local de referencia"],
    documentos: [],
    notificaciones: ["Recordatorio interno demo"],
  },
  {
    id: "v-003",
    codigo: "VIS-2026-003",
    visitante: {
      nombre: "Camila Soto",
      identificador: "ID-DEMO-003",
      rut: "33.333.333-3",
      correo: "camila.soto@demo.local",
      telefono: "+56 2 4444 0003",
      empresaOrigen: "Infraestructura Andina",
    },
    motivo: "Mantencion preventiva de equipos.",
    tipoVisita: "maintenance",
    estado: "completed",
    estadoAprobacion: "approved",
    medioIdentificacion: "temporary_card",
    hostUsuarioId: "u-002",
    hostEmpresaId: "e-002",
    responsableAlternativo: "Supervisor de turno",
    visitDate: "2026-07-24",
    validFrom: "2026-07-24T06:00:00",
    validUntil: "2026-07-24T10:00:00",
    entryFrom: "06:00",
    entryUntil: "07:00",
    exitUntil: "10:00",
    allDay: false,
    multipleEntry: false,
    maximumEntries: 1,
    gracePeriodMinutes: 20,
    timezone: "America/Santiago",
    accessNotes: "Intervencion en zona tecnica.",
    permisos: {
      estacionamientosIds: ["p-002"],
      accesosIds: ["ca-002"],
      accesosPeatonales: ["Pasarela tecnica"],
      accesosVehiculares: [],
      estacionamientoAsignadoId: "p-002",
      zonasAutorizadas: ["Sala tecnica"],
      restricciones: ["Acceso solo con supervisor"],
      horarioEspecifico: "06:00 - 10:00",
      ingresoUnico: true,
      autorizacionGeneral: false,
    },
    vehicle: null,
    acompanantes: [
      {
        id: "acp-002",
        name: "Rene Vidal",
        identifier: null,
        email: "rene.vidal@demo.local",
        phone: null,
        notes: "Apoyo tecnico con datos incompletos.",
      },
    ],
    actividad: {
      ingresoHora: "2026-07-24T06:10:00",
      salidaHora: "2026-07-24T09:40:00",
      operadorId: "u-002",
      dispositivoId: "d-002",
      movimientosRelacionadosIds: ["op-002"],
    },
    abonadoRelacionadoId: "ab-002",
    observaciones: "Visita finalizada sin acciones reales.",
    incidencias: ["Sin incidencias"],
    historial: ["Ingreso y salida registrados en demo"],
    auditoria: ["Registro validado para etapa visual"],
    documentos: ["Checklist tecnico"],
    notificaciones: ["Cierre de visita demo"],
  },
  {
    id: "v-004",
    codigo: "VIS-2026-004",
    visitante: {
      nombre: "Diego Leon",
      identificador: "ID-DEMO-004",
      rut: "44.444.444-4",
      correo: "diego.leon@demo.local",
      telefono: "+57 2 5555 0004",
      empresaOrigen: "Talento Urbano",
    },
    motivo: "Entrevista operativa.",
    tipoVisita: "interview",
    estado: "cancelled",
    estadoAprobacion: "rejected",
    medioIdentificacion: "document",
    hostUsuarioId: "u-003",
    hostEmpresaId: "e-003",
    responsableAlternativo: "Recursos Humanos",
    visitDate: "2026-07-25",
    validFrom: "2026-07-25T15:00:00",
    validUntil: "2026-07-25T16:30:00",
    entryFrom: "15:00",
    entryUntil: "15:40",
    exitUntil: "16:30",
    allDay: false,
    multipleEntry: false,
    maximumEntries: 1,
    gracePeriodMinutes: 5,
    timezone: "America/Santiago",
    accessNotes: "Cancelada por agenda del anfitrion.",
    permisos: {
      estacionamientosIds: ["p-003"],
      accesosIds: [],
      accesosPeatonales: ["Recepcion Sur"],
      accesosVehiculares: [],
      estacionamientoAsignadoId: "p-003",
      zonasAutorizadas: ["Sala entrevistas"],
      restricciones: ["Solo acceso peatonal"],
      horarioEspecifico: "15:00 - 16:30",
      ingresoUnico: true,
      autorizacionGeneral: true,
    },
    vehicle: null,
    acompanantes: [],
    actividad: {
      ingresoHora: null,
      salidaHora: null,
      operadorId: null,
      dispositivoId: null,
      movimientosRelacionadosIds: [],
    },
    abonadoRelacionadoId: null,
    observaciones: "Visita cancelada en contexto demostrativo.",
    incidencias: ["Cancelacion por agenda"],
    historial: ["Solicitud creada", "Cancelacion informada"],
    auditoria: ["Sin ejecucion operativa"],
    documentos: [],
    notificaciones: ["Aviso demo de cancelacion"],
  },
  {
    id: "v-005",
    codigo: "VIS-2026-005",
    visitante: {
      nombre: "Erika Rios",
      identificador: "ID-DEMO-005",
      rut: "55.555.555-5",
      correo: "erika.rios@demo.local",
      telefono: "+56 9 6666 0005",
      empresaOrigen: "Consultora Pacifico",
    },
    motivo: "Visita de cortesia institucional.",
    tipoVisita: "courtesy",
    estado: "pending_approval",
    estadoAprobacion: "pending",
    medioIdentificacion: "mobile",
    hostUsuarioId: "u-999",
    hostEmpresaId: "e-999",
    responsableAlternativo: "No disponible",
    visitDate: "2026-07-26",
    validFrom: "2026-07-26T10:00:00",
    validUntil: "2026-07-26T13:00:00",
    entryFrom: "10:00",
    entryUntil: "11:00",
    exitUntil: "13:00",
    allDay: false,
    multipleEntry: true,
    maximumEntries: 2,
    gracePeriodMinutes: 15,
    timezone: "America/Santiago",
    accessNotes: "Pendiente de aprobacion, con referencias inexistentes.",
    permisos: {
      estacionamientosIds: ["p-999"],
      accesosIds: ["ca-999"],
      accesosPeatonales: ["No disponible"],
      accesosVehiculares: ["No disponible"],
      estacionamientoAsignadoId: "p-999",
      zonasAutorizadas: ["Zona no definida"],
      restricciones: ["Requiere aprobacion manual"],
      horarioEspecifico: "10:00 - 13:00",
      ingresoUnico: false,
      autorizacionGeneral: false,
    },
    vehicle: {
      id: "vv-005",
      licensePlate: "DEM-505",
      brand: null,
      model: null,
      color: "Negro",
      vehicleType: "other",
      parkingSpace: null,
      notes: "Vehiculo con datos incompletos para pruebas de resiliencia.",
    },
    acompanantes: [
      {
        id: "acp-005",
        name: "Nora Paredes",
        identifier: null,
        email: null,
        phone: "+56 2 7777 0005",
        notes: "Datos parciales demostrativos.",
      },
      {
        id: "acp-006",
        name: "Pablo Moya",
        identifier: "ID-DEMO-006-B",
        email: "pablo.moya@demo.local",
        phone: null,
        notes: "Acompaniante adicional.",
      },
    ],
    actividad: {
      ingresoHora: null,
      salidaHora: null,
      operadorId: "u-999",
      dispositivoId: "d-999",
      movimientosRelacionadosIds: ["op-999"],
    },
    abonadoRelacionadoId: "ab-999",
    observaciones: "Caso de referencias inexistentes para visualizacion segura.",
    incidencias: ["Anfitrion no disponible", "Acceso no disponible"],
    historial: ["Solicitud pendiente de aprobacion"],
    auditoria: ["Validacion de fallback visual"],
    documentos: [],
    notificaciones: ["Pendiente de confirmacion"],
  },
  {
    id: "v-006",
    codigo: "VIS-2026-006",
    visitante: {
      nombre: "Fabian Ortiz",
      identificador: "ID-DEMO-006",
      rut: "66.666.666-6",
      correo: "fabian.ortiz@demo.local",
      telefono: "+57 4 8888 0006",
      empresaOrigen: "Eventos Plaza",
    },
    motivo: "Evento institucional.",
    tipoVisita: "event",
    estado: "expired",
    estadoAprobacion: "approved",
    medioIdentificacion: "reception",
    hostUsuarioId: "u-001",
    hostEmpresaId: "e-001",
    responsableAlternativo: "Equipo de eventos",
    visitDate: "2026-07-25",
    validFrom: "2026-07-25T06:00:00",
    validUntil: "2026-07-25T08:00:00",
    entryFrom: "06:00",
    entryUntil: "06:45",
    exitUntil: "08:00",
    allDay: false,
    multipleEntry: true,
    maximumEntries: 4,
    gracePeriodMinutes: 0,
    timezone: "America/Santiago",
    accessNotes: "Autorizacion vencida por termino de ventana.",
    permisos: {
      estacionamientosIds: ["p-001"],
      accesosIds: ["ca-001"],
      accesosPeatonales: ["Lobby Norte"],
      accesosVehiculares: ["Barreras A1"],
      estacionamientoAsignadoId: "p-001",
      zonasAutorizadas: ["Auditorio"],
      restricciones: [],
      horarioEspecifico: "06:00 - 08:00",
      ingresoUnico: false,
      autorizacionGeneral: false,
    },
    vehicle: null,
    acompanantes: [],
    actividad: {
      ingresoHora: null,
      salidaHora: null,
      operadorId: null,
      dispositivoId: null,
      movimientosRelacionadosIds: [],
    },
    abonadoRelacionadoId: null,
    observaciones: "Reserva vencida sin ingreso registrado.",
    incidencias: ["Vigencia agotada"],
    historial: ["Reserva creada", "Reserva vencida"],
    auditoria: ["Sin acciones fisicas"],
    documentos: [],
    notificaciones: ["Notificacion demo de expiracion"],
  },
];

export function getVisitasDemo() {
  return visitasDemo;
}

export function getVisitaById(id) {
  return visitasDemo.find((visita) => visita.id === id) ?? null;
}

export function getVisitaByCodigo(codigo) {
  return visitasDemo.find((visita) => visita.codigo === codigo) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

function parseDate(value) {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

function getValidFromDate(visita) {
  return parseDate(visita.validFrom);
}

function getValidUntilDate(visita) {
  return parseDate(visita.validUntil);
}

export function searchVisitas(query) {
  const normalized = normalizeText(query || "");

  return visitasDemo.filter((visita) => {
    const accesoTexto = resolveAccesos(visita)
      .map((acceso) => acceso?.codigo || "")
      .join(" ");

    return [
      visita.codigo,
      visita.visitante.nombre,
      visita.visitante.identificador,
      visita.visitante.rut,
      visita.visitante.empresaOrigen,
      visita.vehicle?.licensePlate || "",
      resolveAnfitrion(visita)?.nombreCompleto || "",
      resolveEmpresaAnfitriona(visita)?.nombreFantasia || "",
      resolveEstacionamientos(visita).map((item) => item?.nombre || "").join(" "),
      accesoTexto,
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function searchVisitasByPatente(licensePlate) {
  const normalized = normalizeText(licensePlate || "");
  return visitasDemo.filter((visita) => normalizeText(visita.vehicle?.licensePlate || "").includes(normalized));
}

export function filterVisitasByEstado(estado) {
  return visitasDemo.filter((visita) => visita.estado === estado);
}

export function filterVisitasByTipo(tipoVisita) {
  return visitasDemo.filter((visita) => visita.tipoVisita === tipoVisita);
}

export function filterVisitasByAprobacion(estadoAprobacion) {
  return visitasDemo.filter((visita) => visita.estadoAprobacion === estadoAprobacion);
}

export function filterVisitasByEstacionamiento(estacionamientoId) {
  return visitasDemo.filter((visita) => (visita.permisos?.estacionamientosIds || []).includes(estacionamientoId));
}

export function filterVisitasByAcceso(accesoId) {
  return visitasDemo.filter((visita) => (visita.permisos?.accesosIds || []).includes(accesoId));
}

export function filterVisitasByEmpresaAnfitriona(empresaId) {
  return visitasDemo.filter((visita) => visita.hostEmpresaId === empresaId);
}

export function filterVisitasByAnfitrion(anfitrionId) {
  return visitasDemo.filter((visita) => visita.hostUsuarioId === anfitrionId);
}

export function filterVisitasByMedioIdentificacion(medioIdentificacion) {
  return visitasDemo.filter((visita) => visita.medioIdentificacion === medioIdentificacion);
}

export function filterVisitasConVehiculo(conVehiculo = true) {
  return visitasDemo.filter((visita) => (conVehiculo ? Boolean(visita.vehicle) : !visita.vehicle));
}

export function filterVisitasByFecha(visitDate) {
  return visitasDemo.filter((visita) => visita.visitDate === visitDate);
}

export function filterVisitasByVigencia(vigencia, referenceDate = new Date()) {
  const normalized = normalizeText(vigencia || "");
  return visitasDemo.filter((visita) => normalizeText(getVigenciaLabel(visita, referenceDate)).includes(normalized));
}

export function filterVisitasDelDia(referenceDate = new Date()) {
  const reference = parseDate(referenceDate);
  const key = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`;
  return visitasDemo.filter((visita) => visita.visitDate === key);
}

export function isVisitaVigente(visita, referenceDate = new Date()) {
  const reference = parseDate(referenceDate);
  return reference >= getValidFromDate(visita) && reference <= getValidUntilDate(visita);
}

export function isVisitaFutura(visita, referenceDate = new Date()) {
  const reference = parseDate(referenceDate);
  return reference < getValidFromDate(visita);
}

export function isVisitaEnCurso(visita, referenceDate = new Date()) {
  const reference = parseDate(referenceDate);
  const estadoOperativo = ["checked_in", "in_progress", "approved", "scheduled"].includes(visita.estado);
  return estadoOperativo && reference >= getValidFromDate(visita) && reference <= getValidUntilDate(visita);
}

export function isVisitaFinalizada(visita) {
  return ["checked_out", "completed"].includes(visita.estado);
}

export function isVisitaVencida(visita, referenceDate = new Date()) {
  if (["cancelled", "rejected", "no_show", "checked_out", "completed"].includes(visita.estado)) {
    return false;
  }

  const reference = parseDate(referenceDate);
  return reference > getValidUntilDate(visita) || visita.estado === "expired";
}

export function isVisitaProgramada(visita, referenceDate = new Date()) {
  if (!["scheduled", "approved", "pending_approval"].includes(visita.estado)) {
    return false;
  }

  return isVisitaFutura(visita, referenceDate);
}

export function isVisitaProximaAVencer(visita, referenceDate = new Date()) {
  if (!isVisitaVigente(visita, referenceDate)) {
    return false;
  }

  const remaining = calcularMinutosRestantes(visita, referenceDate);
  return remaining >= 0 && remaining <= 60;
}

export function calcularMinutosRestantes(visita, referenceDate = new Date()) {
  const reference = parseDate(referenceDate);
  const diff = getValidUntilDate(visita).getTime() - reference.getTime();
  return Math.ceil(diff / (1000 * 60));
}

export function calcularDuracionAutorizada(visita) {
  const diff = getValidUntilDate(visita).getTime() - getValidFromDate(visita).getTime();
  return Math.max(0, Math.round(diff / (1000 * 60)));
}

export function calcularVigencia(visita, referenceDate = new Date()) {
  const minutosRestantes = calcularMinutosRestantes(visita, referenceDate);
  const isFutura = isVisitaFutura(visita, referenceDate);
  const isEnCurso = isVisitaEnCurso(visita, referenceDate);
  const isVencida = isVisitaVencida(visita, referenceDate);
  const isFinalizada = isVisitaFinalizada(visita);
  const isProximaAVencer = isVisitaProximaAVencer(visita, referenceDate);
  const isVigente = isVisitaVigente(visita, referenceDate);

  return {
    isFutura,
    isEnCurso,
    isVencida,
    isFinalizada,
    isProximaAVencer,
    isVigente,
    minutosRestantes,
    texto: getVigenciaLabel(visita, referenceDate),
  };
}

export function getVigenciaLabel(visita, referenceDate = new Date()) {
  if (isVisitaFinalizada(visita)) {
    return "Finalizada";
  }

  if (["cancelled", "rejected", "no_show"].includes(visita.estado)) {
    return "No vigente";
  }

  if (isVisitaVencida(visita, referenceDate)) {
    return "Vencida";
  }

  if (isVisitaFutura(visita, referenceDate)) {
    return "Futura";
  }

  if (isVisitaProximaAVencer(visita, referenceDate)) {
    return "Proxima a vencer";
  }

  if (isVisitaEnCurso(visita, referenceDate)) {
    return "Vigente";
  }

  return "No disponible";
}

export function getVisitasProgramadas(referenceDate = new Date()) {
  return visitasDemo.filter((visita) => isVisitaProgramada(visita, referenceDate));
}

export function getVisitasEnCurso(referenceDate = new Date()) {
  return visitasDemo.filter((visita) => isVisitaEnCurso(visita, referenceDate));
}

export function getVisitasFinalizadas() {
  return visitasDemo.filter((visita) => isVisitaFinalizada(visita));
}

export function getVisitasVencidas(referenceDate = new Date()) {
  return visitasDemo.filter((visita) => isVisitaVencida(visita, referenceDate));
}

export function getVisitasProximasAVencer(referenceDate = new Date()) {
  return visitasDemo.filter((visita) => isVisitaProximaAVencer(visita, referenceDate));
}

export function resolveAnfitrion(visita) {
  return visita?.hostUsuarioId ? getUsuarioById(visita.hostUsuarioId) : null;
}

export function resolveEmpresaAnfitriona(visita) {
  return visita?.hostEmpresaId ? getEmpresaById(visita.hostEmpresaId) : null;
}

export function resolveEstacionamientos(visita) {
  return (visita?.permisos?.estacionamientosIds || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function resolveAccesos(visita) {
  return (visita?.permisos?.accesosIds || []).map((id) => getControlAccesoById(id)).filter(Boolean);
}

export function resolveMovimientosRelacionados(visita) {
  return (visita?.actividad?.movimientosRelacionadosIds || []).map((id) => getOperacionById(id)).filter(Boolean);
}

export function resolveAbonadoRelacionado(visita) {
  return visita?.abonadoRelacionadoId ? getAbonadoById(visita.abonadoRelacionadoId) : null;
}

export function getVehiculo(visita) {
  return visita?.vehicle || null;
}

export function getAcompanantes(visita) {
  return visita?.acompanantes || [];
}

export function calcularResumenVisitas(referenceDate = new Date()) {
  const programadas = getVisitasProgramadas(referenceDate).length;
  const enCurso = getVisitasEnCurso(referenceDate).length;
  const visitasDelDia = filterVisitasDelDia(referenceDate).length;
  const finalizadas = getVisitasFinalizadas().length;
  const canceladas = filterVisitasByEstado("cancelled").length;
  const reservasPorVencer = getVisitasProximasAVencer(referenceDate).length;
  const accesosPendientesAprobacion = filterVisitasByAprobacion("pending").length + filterVisitasByEstado("pending_approval").length;
  const conVehiculo = filterVisitasConVehiculo(true).length;

  return {
    total: visitasDemo.length,
    programadas,
    enCurso,
    visitasDelDia,
    finalizadas,
    canceladas,
    reservasPorVencer,
    accesosPendientesAprobacion,
    conVehiculo,
  };
}

export function getTipoVisitaLabel(tipoVisita) {
  const labels = {
    business: "Reunion comercial",
    supplier: "Proveedor",
    delivery: "Entrega",
    contractor: "Contratista",
    personal: "Visita personal",
    interview: "Entrevista",
    event: "Evento",
    maintenance: "Mantencion",
    emergency: "Emergencia",
    courtesy: "Cortesia",
    temporary: "Temporal",
    other: "Otro",
  };

  return labels[tipoVisita] ?? tipoVisita;
}

export function getEstadoVisitaLabel(estado) {
  const labels = {
    scheduled: "Programada",
    pending_approval: "Pendiente de aprobacion",
    approved: "Aprobada",
    checked_in: "Ingreso registrado",
    in_progress: "En curso",
    checked_out: "Salida registrada",
    completed: "Finalizada",
    cancelled: "Cancelada",
    rejected: "Rechazada",
    expired: "Vencida",
    no_show: "No se presento",
  };

  return labels[estado] ?? estado;
}

export function getEstadoAprobacionLabel(estadoAprobacion) {
  const labels = {
    not_required: "No requerida",
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    revoked: "Revocada",
  };

  return labels[estadoAprobacion] ?? estadoAprobacion;
}

export function getMedioIdentificacionLabel(medioIdentificacion) {
  const labels = {
    license_plate: "Patente",
    qr_code: "Codigo QR",
    temporary_card: "Tarjeta temporal",
    document: "Documento",
    pin: "PIN temporal",
    mobile: "Credencial movil",
    manual: "Registro manual",
    reception: "Validacion en recepcion",
    other: "Otro",
  };

  return labels[medioIdentificacion] ?? medioIdentificacion;
}

export function getTipoVehiculoLabel(vehicleType) {
  const labels = {
    car: "Auto",
    motorcycle: "Motocicleta",
    van: "Van",
    truck: "Camion",
    bicycle: "Bicicleta",
    other: "Otro",
  };

  return labels[vehicleType] ?? vehicleType;
}

export function formatDate(value) {
  if (!value) {
    return "No disponible";
  }

  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) {
    return "No disponible";
  }

  return `${day}/${month}/${year}`;
}

export function formatHour(value) {
  if (!value) {
    return "No disponible";
  }

  return String(value).slice(0, 5);
}

export function formatRangoHorario(visita) {
  return `${formatHour(visita.entryFrom)} - ${formatHour(visita.exitUntil)}`;
}

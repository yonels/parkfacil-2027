import { getEstacionamientoById } from "./estacionamientos.mjs";
import { getDispositivoById } from "./dispositivos.mjs";
import { getUsuarioById } from "./usuarios.mjs";
import { getOperacionById } from "./operacion.mjs";

export const tiposAccesoPermitidos = ["entrance", "exit", "bidirectional", "pedestrian", "service", "emergency"];
export const modosOperacionPermitidos = ["automatic", "manual", "mixed", "disabled"];
export const estadosControlAccesoPermitidos = ["active", "inactive", "maintenance", "blocked"];

export const controlAccesosDemo = [
  {
    id: "ca-001",
    nombre: "Acceso Norte Principal",
    codigo: "ACC-001",
    estacionamientoId: "p-001",
    dispositivoId: "d-001",
    tipoAcceso: "entrance",
    direccion: "inbound",
    estado: "active",
    modoOperacion: "automatic",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"], desde: "00:00", hasta: "23:59" },
    capacidad: { vehiculosHora: 220, peatonesHora: 40 },
    operadorId: "u-001",
    estadoOperacional: "Operativo",
    ultimaActividad: {
      fechaHora: "2026-07-24T08:00:00",
      descripcion: "Ingreso autorizado por deteccion demostrativa.",
      operacionId: "op-001",
    },
    historial: ["Alta de acceso en etapa demo", "Ajuste de sensibilidad de lectura"],
    incidencias: ["Sin incidencias"],
    configuracion: ["Lectura demostrativa de patente", "Apertura automatica en modo demo"],
    documentos: ["Ficha de acceso", "Plano de ubicacion"],
    observaciones: "Acceso principal de ingreso vehicular para referencia de etapa 11.",
  },
  {
    id: "ca-002",
    nombre: "Salida Torre Oriente",
    codigo: "ACC-002",
    estacionamientoId: "p-002",
    dispositivoId: "d-002",
    tipoAcceso: "exit",
    direccion: "outbound",
    estado: "maintenance",
    modoOperacion: "manual",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie"], desde: "06:00", hasta: "22:00" },
    capacidad: { vehiculosHora: 140, peatonesHora: 20 },
    operadorId: "u-004",
    estadoOperacional: "En revision",
    ultimaActividad: {
      fechaHora: "2026-07-24T09:30:00",
      descripcion: "Salida supervisada por operador demostrativo.",
      operacionId: "op-002",
    },
    historial: ["Mantenimiento preventivo programado", "Ajuste de brazo de barrera"],
    incidencias: ["Latencia intermitente de comunicacion"],
    configuracion: ["Modo operador", "Confirmacion manual de salida"],
    documentos: ["Checklist de mantenimiento"],
    observaciones: "Acceso en mantenimiento de referencia, sin intervencion de hardware real.",
  },
  {
    id: "ca-003",
    nombre: "Acceso Compartido Sur",
    codigo: "ACC-003",
    estacionamientoId: "p-003",
    dispositivoId: "d-004",
    tipoAcceso: "bidirectional",
    direccion: "both",
    estado: "inactive",
    modoOperacion: "mixed",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab"], desde: "08:00", hasta: "20:00" },
    capacidad: { vehiculosHora: 120, peatonesHora: 35 },
    operadorId: "u-002",
    estadoOperacional: "Suspendido",
    ultimaActividad: {
      fechaHora: "2026-07-24T10:15:00",
      descripcion: "Registro manual de ingreso en revision.",
      operacionId: "op-003",
    },
    historial: ["Desactivado por ajuste de layout interno"],
    incidencias: ["Sin dispositivo de respaldo"],
    configuracion: ["Modo mixto habilitado", "Reglas de prioridad por turno"],
    documentos: ["Procedimiento de cambio de sentido"],
    observaciones: "Acceso bidireccional de referencia para escenarios mixtos.",
  },
  {
    id: "ca-004",
    nombre: "Control Peatonal Lobby",
    codigo: "ACC-004",
    estacionamientoId: "p-001",
    dispositivoId: "d-003",
    tipoAcceso: "pedestrian",
    direccion: "pedestrian",
    estado: "blocked",
    modoOperacion: "disabled",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie"], desde: "07:00", hasta: "19:30" },
    capacidad: { vehiculosHora: 0, peatonesHora: 90 },
    operadorId: "u-003",
    estadoOperacional: "Bloqueado",
    ultimaActividad: {
      fechaHora: "2026-07-24T11:00:00",
      descripcion: "Intento de acceso rechazado en modo demostrativo.",
      operacionId: "op-004",
    },
    historial: ["Bloqueo preventivo activado"],
    incidencias: ["Controlador fuera de linea"],
    configuracion: ["Operacion deshabilitada", "Derivacion a control manual"],
    documentos: [],
    observaciones: "Control peatonal en estado bloqueado por contingencia demostrativa.",
  },
  {
    id: "ca-005",
    nombre: "Acceso Servicio Exterior",
    codigo: "ACC-005",
    estacionamientoId: "p-999",
    dispositivoId: "d-999",
    tipoAcceso: "service",
    direccion: "service",
    estado: "active",
    modoOperacion: "mixed",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab"], desde: "05:00", hasta: "23:00" },
    capacidad: { vehiculosHora: 80, peatonesHora: 25 },
    operadorId: "u-999",
    estadoOperacional: "Operativo",
    ultimaActividad: {
      fechaHora: "2026-07-24T05:45:00",
      descripcion: "Registro de control de servicio sin relaciones validas.",
      operacionId: "op-999",
    },
    historial: ["Acceso agregado para pruebas de referencias inexistentes"],
    incidencias: ["Sin estacionamiento asociado"],
    configuracion: ["Uso de referencia"],
    documentos: [],
    observaciones: "Registro demo con relaciones faltantes para validar manejo visual seguro.",
  },
  {
    id: "ca-006",
    nombre: "Ruta de Emergencia Norte",
    codigo: "ACC-006",
    estacionamientoId: "p-002",
    dispositivoId: null,
    tipoAcceso: "emergency",
    direccion: "emergency",
    estado: "active",
    modoOperacion: "manual",
    horario: { dias: ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"], desde: "00:00", hasta: "23:59" },
    capacidad: { vehiculosHora: 60, peatonesHora: 120 },
    operadorId: "u-004",
    estadoOperacional: "Contingencia",
    ultimaActividad: {
      fechaHora: "2026-07-24T07:10:00",
      descripcion: "Simulacion de paso prioritario de emergencia.",
      operacionId: null,
    },
    historial: ["Ruta habilitada para protocolo de contingencia"],
    incidencias: ["Sin incidencias"],
    configuracion: ["Apertura manual con doble confirmacion"],
    documentos: ["Protocolo de emergencia"],
    observaciones: "Ruta de uso eventual para planes de evacuacion demostrativos.",
  },
];

export function getControlAccesosDemo() {
  return controlAccesosDemo;
}

export function getControlAccesoById(id) {
  return controlAccesosDemo.find((acceso) => acceso.id === id) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

export function searchControlAccesos(query) {
  const normalized = normalizeText(query || "");

  return controlAccesosDemo.filter((acceso) => {
    return [
      acceso.nombre,
      acceso.codigo,
      getEstacionamientoById(acceso.estacionamientoId)?.nombre || "",
      getDispositivoById(acceso.dispositivoId)?.nombre || "",
      getUsuarioById(acceso.operadorId)?.nombreCompleto || "",
      getTipoAccesoLabel(acceso.tipoAcceso),
      getModoOperacionLabel(acceso.modoOperacion),
      getEstadoControlAccesoLabel(acceso.estado),
      acceso.ultimaActividad?.descripcion || "",
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function filterControlAccesosByEstado(estado) {
  return controlAccesosDemo.filter((acceso) => acceso.estado === estado);
}

export function filterControlAccesosByTipoAcceso(tipoAcceso) {
  return controlAccesosDemo.filter((acceso) => acceso.tipoAcceso === tipoAcceso);
}

export function filterControlAccesosByModoOperacion(modoOperacion) {
  return controlAccesosDemo.filter((acceso) => acceso.modoOperacion === modoOperacion);
}

export function filterControlAccesosByEstacionamiento(estacionamientoId) {
  return controlAccesosDemo.filter((acceso) => acceso.estacionamientoId === estacionamientoId);
}

export function filterControlAccesosByDispositivo(dispositivoId) {
  return controlAccesosDemo.filter((acceso) => acceso.dispositivoId === dispositivoId);
}

export function filterControlAccesosByOperador(operadorId) {
  return controlAccesosDemo.filter((acceso) => acceso.operadorId === operadorId);
}

export function filterControlAccesosByEstadoOperacional(estadoOperacional) {
  return controlAccesosDemo.filter((acceso) => acceso.estadoOperacional === estadoOperacional);
}

export function resolveEstacionamiento(acceso) {
  return acceso?.estacionamientoId ? getEstacionamientoById(acceso.estacionamientoId) : null;
}

export function resolveDispositivo(acceso) {
  return acceso?.dispositivoId ? getDispositivoById(acceso.dispositivoId) : null;
}

export function resolveOperador(acceso) {
  return acceso?.operadorId ? getUsuarioById(acceso.operadorId) : null;
}

export function resolveUltimaOperacion(acceso) {
  return acceso?.ultimaActividad?.operacionId ? getOperacionById(acceso.ultimaActividad.operacionId) : null;
}

export function getResumenControlAccesos() {
  const resumen = {
    total: controlAccesosDemo.length,
    active: 0,
    inactive: 0,
    maintenance: 0,
    blocked: 0,
    automatic: 0,
    manual: 0,
    mixed: 0,
    disabled: 0,
    operativos: 0,
  };

  controlAccesosDemo.forEach((acceso) => {
    resumen[acceso.estado] += 1;
    resumen[acceso.modoOperacion] += 1;
    if (["Operativo", "Contingencia"].includes(acceso.estadoOperacional)) {
      resumen.operativos += 1;
    }
  });

  return resumen;
}

export function getIndicadoresControlAccesos() {
  return {
    conIncidencias: controlAccesosDemo.filter((acceso) => acceso.incidencias.some((item) => item !== "Sin incidencias")).length,
    conReferenciasIncompletas: controlAccesosDemo.filter((acceso) => !resolveEstacionamiento(acceso) || !resolveDispositivo(acceso) || !resolveOperador(acceso)).length,
    cobertura24x7: controlAccesosDemo.filter((acceso) => acceso.horario?.desde === "00:00" && acceso.horario?.hasta === "23:59").length,
  };
}

export function getEstadisticasControlAccesos() {
  const porTipo = tiposAccesoPermitidos.reduce((acc, tipo) => ({ ...acc, [tipo]: 0 }), {});
  const porModo = modosOperacionPermitidos.reduce((acc, modo) => ({ ...acc, [modo]: 0 }), {});
  const porEstado = estadosControlAccesoPermitidos.reduce((acc, estado) => ({ ...acc, [estado]: 0 }), {});

  let capacidadVehicularTotal = 0;
  let capacidadPeatonalTotal = 0;

  controlAccesosDemo.forEach((acceso) => {
    porTipo[acceso.tipoAcceso] += 1;
    porModo[acceso.modoOperacion] += 1;
    porEstado[acceso.estado] += 1;
    capacidadVehicularTotal += acceso.capacidad?.vehiculosHora || 0;
    capacidadPeatonalTotal += acceso.capacidad?.peatonesHora || 0;
  });

  return {
    porTipo,
    porModo,
    porEstado,
    capacidadVehicularTotal,
    capacidadPeatonalTotal,
  };
}

export function getTipoAccesoLabel(tipo) {
  const labels = {
    entrance: "Entrada",
    exit: "Salida",
    bidirectional: "Bidireccional",
    pedestrian: "Peatonal",
    service: "Servicio",
    emergency: "Emergencia",
  };

  return labels[tipo] ?? tipo;
}

export function getModoOperacionLabel(modo) {
  const labels = {
    automatic: "Automatico",
    manual: "Manual",
    mixed: "Mixto",
    disabled: "Deshabilitado",
  };

  return labels[modo] ?? modo;
}

export function getEstadoControlAccesoLabel(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    maintenance: "Mantenimiento",
    blocked: "Bloqueado",
  };

  return labels[estado] ?? estado;
}

export function getDireccionLabel(direccion) {
  const labels = {
    inbound: "Ingreso",
    outbound: "Salida",
    both: "Ingreso y salida",
    pedestrian: "Peatonal",
    service: "Servicio",
    emergency: "Emergencia",
  };

  return labels[direccion] ?? direccion;
}

export function formatHorario(horario) {
  if (!horario) {
    return "No disponible";
  }

  const dias = horario.dias?.join(", ") || "Sin dias";
  return `${dias} · ${horario.desde || "--:--"} - ${horario.hasta || "--:--"}`;
}

export function formatCapacidad(capacidad) {
  if (!capacidad) {
    return "No disponible";
  }

  return `${capacidad.vehiculosHora || 0} veh/h · ${capacidad.peatonesHora || 0} peaton/h`;
}

export function formatFechaHora(value) {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

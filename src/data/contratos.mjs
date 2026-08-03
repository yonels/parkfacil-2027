import { getEmpresaById } from "./empresas.mjs";
import { getEstacionamientoById } from "./estacionamientos.mjs";
import { getUsuarioById } from "./usuarios.mjs";

export const contratosDemo = [
  {
    id: "c-001",
    numeroContrato: "PF-2026-001",
    empresaId: "e-001",
    estacionamientos: ["p-001", "p-002"],
    responsableId: "u-001",
    tipo: "software_service",
    estado: "active",
    fechaInicio: "2025-01-01",
    fechaTermino: "2026-01-01",
    renovacionAutomatica: true,
    avisoPreviaNoRenovacion: 60,
    currency: "CLP",
    monthlyValue: 1800000,
    implementationValue: 4500000,
    totalReferenceValue: 21600000,
    contactos: ["María Pérez", "Soporte ParkFacil"],
    alcance: "Plataforma integral para operación digital y administración de estacionamientos.",
    serviciosIncluidos: ["Gestión de accesos", "Reportes de operación", "Soporte premium"],
    equipamiento: ["Panel de control central", "Integración de accesos"],
    documentos: ["Contrato base", "Anexo de implementación"],
    firmas: ["Empresa", "ParkFacil"],
    historial: ["Contrato firmado el 2025-01-01", "Inicio de operación del servicio"],
    observaciones: "Contrato demostrativo vigente con alcance de operación digital.",
  },
  {
    id: "c-002",
    numeroContrato: "PF-2026-002",
    empresaId: "e-002",
    estacionamientos: ["p-003"],
    responsableId: "u-002",
    tipo: "implementation",
    estado: "pending_signature",
    fechaInicio: "2026-02-10",
    fechaTermino: "2026-08-10",
    renovacionAutomatica: false,
    avisoPreviaNoRenovacion: 30,
    currency: "USD",
    monthlyValue: 4200,
    implementationValue: 18000,
    totalReferenceValue: 42000,
    contactos: ["Diego Rojas", "Norte Mobility"],
    alcance: "Implementación inicial para la administración del parking de Norte.",
    serviciosIncluidos: ["Implementación", "Capacitación inicial"],
    equipamiento: ["Lectores de acceso"],
    documentos: ["Propuesta comercial"],
    firmas: ["Empresa"],
    historial: ["Solicitud recibida", "Pendiente de firma"],
    observaciones: "Contrato en revisión previa a la firma.",
  },
  {
    id: "c-003",
    numeroContrato: "PF-2026-003",
    empresaId: "e-003",
    estacionamientos: [],
    responsableId: "u-003",
    tipo: "equipment_lease",
    estado: "signed",
    fechaInicio: "2024-07-01",
    fechaTermino: "2026-07-01",
    renovacionAutomatica: true,
    avisoPreviaNoRenovacion: 45,
    currency: "UF",
    monthlyValue: 8.5,
    implementationValue: 12.4,
    totalReferenceValue: 102,
    contactos: ["Sofía Morales", "Plaza Sur"],
    alcance: "Arriendo de equipos de control y monitoreo para operaciones históricas.",
    serviciosIncluidos: ["Mantenimiento básico", "Reemplazo de componentes"],
    equipamiento: ["Cámaras", "Controladores"],
    documentos: ["Anexo de arrendamiento"],
    firmas: ["Empresa", "ParkFacil"],
    historial: ["Contrato vigente por referencia histórica"],
    observaciones: "Contrato histórico con estado firmado y vigencia cerrada.",
  },
  {
    id: "c-004",
    numeroContrato: "PF-2026-004",
    empresaId: "e-999",
    estacionamientos: ["p-999"],
    responsableId: "u-999",
    tipo: "other",
    estado: "draft",
    fechaInicio: "2026-06-01",
    fechaTermino: "2026-12-01",
    renovacionAutomatica: false,
    avisoPreviaNoRenovacion: 15,
    currency: "CLP",
    monthlyValue: 950000,
    implementationValue: 1200000,
    totalReferenceValue: 11400000,
    contactos: [],
    alcance: "Contrato de referencia sin relaciones válidas.",
    serviciosIncluidos: ["Sin servicios definidos"],
    equipamiento: [],
    documentos: [],
    firmas: [],
    historial: ["Borrador inicial"],
    observaciones: "Contrato demostrativo con referencias ausentes para probar el manejo visual seguro.",
  },
  {
    id: "c-005",
    numeroContrato: "PF-2026-005",
    empresaId: "e-005",
    estacionamientos: ["p-002"],
    responsableId: "u-002",
    tipo: "parking_operation",
    estado: "active",
    fechaInicio: "2026-03-01",
    fechaTermino: "2027-02-28",
    renovacionAutomatica: true,
    avisoPreviaNoRenovacion: 60,
    currency: "CLP",
    monthlyValue: 1650000,
    implementationValue: 3000000,
    totalReferenceValue: 19800000,
    contactos: ["Felipe Soto", "Inmobiliaria 5Q"],
    alcance: "Operación integral del estacionamiento Parking Norte con control de acceso y recaudación.",
    serviciosIncluidos: ["Operación de caja", "Monitoreo", "Soporte en terreno"],
    equipamiento: ["Barrera", "Cámaras LPR", "Terminal POS"],
    documentos: [
      {
        nombre: "CONTRATO DE ADHESIÓN Inmobiliaria 5Q Spa.pdf",
        url: "/contratos/CONTRATO-DE-ADHESION-INMOBILIARIA-5Q-SPA.pdf",
      },
      {
        nombre: "Anexo SLA",
        url: null,
      },
    ],
    firmas: ["Inmobiliaria 5Q", "ParkFacil"],
    historial: ["Aprobado por comité comercial", "Contrato activo en producción"],
    observaciones: "Contrato operativo vigente para cliente Inmobiliaria 5Q.",
  },
];

export function getContratosDemo() {
  return contratosDemo;
}

function normalizeContractKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getContratoById(id) {
  const normalizedInput = normalizeContractKey(id);
  if (!normalizedInput) return null;

  return contratosDemo.find((contrato) => {
    return (
      normalizeContractKey(contrato.id) === normalizedInput
      || normalizeContractKey(contrato.numeroContrato) === normalizedInput
    );
  }) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

export function searchContratos(query) {
  const normalized = normalizeText(query);

  return contratosDemo.filter((contrato) => {
    const empresa = getEmpresaById(contrato.empresaId);
    const estacionamientos = contrato.estacionamientos.map((id) => getEstacionamientoById(id)?.nombre || "").join(" ");

    return [
      contrato.id,
      contrato.numeroContrato,
      empresa?.razonSocial || "",
      empresa?.nombreFantasia || "",
      estacionamientos,
      getUsuarioById(contrato.responsableId)?.nombreCompleto || "",
      getTipoLabel(contrato.tipo),
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function filterContratosByEstado(estado) {
  return contratosDemo.filter((contrato) => contrato.estado === estado);
}

export function filterContratosByTipo(tipo) {
  return contratosDemo.filter((contrato) => contrato.tipo === tipo);
}

export function filterContratosByEmpresa(empresaId) {
  return contratosDemo.filter((contrato) => contrato.empresaId === empresaId);
}

export function filterContratosByEstacionamiento(estacionamientoId) {
  return contratosDemo.filter((contrato) => contrato.estacionamientos.includes(estacionamientoId));
}

export function filterContratosByMoneda(moneda) {
  return contratosDemo.filter((contrato) => contrato.currency === moneda);
}

export function filterContratosByRenovacionAutomatica(renovacionAutomatica) {
  return contratosDemo.filter((contrato) => contrato.renovacionAutomatica === renovacionAutomatica);
}

export function filterContratosProximosAVencer(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  return contratosDemo.filter((contrato) => {
    const vigencia = calcularVigencia(contrato, date);
    return vigencia.isProximoAVencer;
  });
}

export function resolveEmpresa(contrato) {
  return contrato?.empresaId ? getEmpresaById(contrato.empresaId) : null;
}

export function resolveEstacionamientos(contrato) {
  return (contrato?.estacionamientos || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function resolveResponsable(contrato) {
  return contrato?.responsableId ? getUsuarioById(contrato.responsableId)?.nombreCompleto || "No disponible" : "No disponible";
}

export function calcularDuracionMeses(fechaInicio, fechaTermino) {
  const start = new Date(fechaInicio || fechaInicio?.startDate || fechaInicio?.fechaInicio);
  const end = new Date(fechaTermino || fechaTermino?.endDate || fechaTermino?.fechaTermino);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

export function calcularVigencia(contrato, referenceDate = new Date()) {
  const endDate = new Date(contrato?.fechaTermino || contrato?.endDate);
  const reference = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const diff = endDate.getTime() - reference.getTime();
  const diasRestantes = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const estado = contrato?.estado || contrato?.status || "active";
  const isVigente = reference <= endDate && estado === "active";
  const isProximoAVencer = diasRestantes <= 60 && diasRestantes >= 0;
  const isVencido = diasRestantes < 0;

  return {
    diasRestantes,
    isVigente,
    isProximoAVencer,
    isVencido,
    texto: isVencido ? "Vencido" : isVigente ? "Vigente" : "No vigente",
  };
}

export function getResumenContratos() {
  const summary = {
    total: contratosDemo.length,
    draft: 0,
    under_review: 0,
    pending_signature: 0,
    signed: 0,
    active: 0,
    suspended: 0,
    expired: 0,
    terminated: 0,
    cancelled: 0,
    proximosAVencer: 0,
  };

  contratosDemo.forEach((contrato) => {
    summary[contrato.estado] += 1;
    if (calcularVigencia(contrato, new Date("2026-01-15")).isProximoAVencer) {
      summary.proximosAVencer += 1;
    }
  });

  return summary;
}

export function getEstadoLabel(estado) {
  const labels = {
    draft: "Borrador",
    under_review: "En revisión",
    pending_signature: "Pendiente de firma",
    signed: "Firmado",
    active: "Vigente",
    suspended: "Suspendido",
    expired: "Vencido",
    terminated: "Terminado",
    cancelled: "Cancelado",
  };

  return labels[estado] ?? estado;
}

export function getTipoLabel(tipo) {
  const labels = {
    software_service: "Servicio de software",
    parking_operation: "Operación de estacionamiento",
    equipment_lease: "Arriendo de equipamiento",
    support_service: "Servicio de soporte",
    implementation: "Implementación",
    partnership: "Alianza comercial",
    other: "Otro",
  };

  return labels[tipo] ?? tipo;
}

export function getMonedaLabel(moneda) {
  return moneda;
}

export function formatCurrency(value, currency) {
  const normalized = Number(value);

  if (currency === "CLP") {
    return `$${normalized.toLocaleString("es-CL")}`;
  }

  if (currency === "USD") {
    return `USD ${normalized.toLocaleString("en-US")}`;
  }

  return `UF ${normalized.toLocaleString("es-CL")}`;
}

import { getEmpresaById, getEmpresasDemo } from "./empresas.mjs";
import { getEstacionamientoById, getEstacionamientosDemo } from "./estacionamientos.mjs";
import { getUsuarioById, getUsuariosDemo } from "./usuarios.mjs";
import { getContratoById } from "./contratos.mjs";
import { getTarifaById } from "./tarifas.mjs";
import { getAbonadoById } from "./abonados.mjs";
import { getVisitaById } from "./visitas.mjs";
import { getControlAccesoById } from "./controlAccesos.mjs";
import { getOperacionById } from "./operacion.mjs";

export const tiposConvenioPermitidos = ["corporate", "commercial", "employee", "resident", "supplier", "courtesy", "event", "promotional", "institutional", "temporary", "parking_partner", "other"];
export const estadosConvenioPermitidos = ["draft", "scheduled", "active", "suspended", "expired", "cancelled", "archived"];
export const modalidadesBeneficioPermitidas = ["percentage_discount", "fixed_discount", "free_minutes", "free_hours", "preferred_rate", "full_exemption", "partial_exemption", "flat_rate", "daily_cap", "monthly_cap", "courtesy_ticket", "validation", "custom"];
export const tiposBeneficiarioPermitidos = ["company", "user", "subscriber", "visitor", "employee", "supplier", "resident", "vehicle", "license_plate", "group", "public"];
export const diasPermitidos = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const politicasFeriadoPermitidas = ["allowed", "excluded", "same_as_weekday", "special_schedule"];

export const conveniosDemo = [
  {
    id: "cv-001",
    codigo: "CV-2026-001",
    nombre: "Convenio Corporativo Centro",
    descripcion: "Beneficio corporativo para empresas asociadas con descuento porcentual y tope mensual.",
    tipo: "corporate",
    modalidadBeneficio: "percentage_discount",
    estado: "active",
    prioridad: 1,
    responsableId: "u-001",
    empresaPrincipalId: "e-001",
    empresasBeneficiariasIds: ["e-001", "e-002"],
    empresaResponsableId: "e-001",
    contratoId: "c-001",
    tarifaId: "t-001",
    estacionamientosIds: ["p-001", "p-002"],
    accesosIds: ["ca-001", "ca-002"],
    zonas: ["Zona A", "Zona B"],
    tiposEspacio: ["general", "ejecutivo"],
    espaciosReservados: ["A-01", "A-02"],
    coberturaGlobal: false,
    restriccionesEstacionamiento: ["No aplica en nivel tecnico"],
    beneficio: {
      benefitType: "percentage_discount",
      percentage: 30,
      fixedAmount: 0,
      freeMinutes: 0,
      freeHours: 0,
      preferredRate: 2500,
      maximumDiscount: 7000,
      maximumUses: 600,
      maximumUsesPerDay: 60,
      maximumUsesPerMonth: 600,
      maximumAmountPerDay: 180000,
      maximumAmountPerMonth: 3000000,
      minimumStayMinutes: 30,
      maximumStayMinutes: 600,
      appliesToFirstPeriod: true,
      appliesToAdditionalPeriods: false,
      appliesAutomatically: true,
      requiresApproval: false,
      cumulative: false,
      multipleEntries: true,
      allowOvernight: false,
      gracePeriodMinutes: 15,
      priority: 1,
      notes: "Simulación demostrativa para convenio corporativo.",
    },
    vigencia: {
      validFrom: "2026-07-01T00:00:00",
      validUntil: "2026-08-20T23:59:00",
      timezone: "America/Santiago",
      allDay: true,
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
      startTime: "07:00",
      endTime: "21:00",
      excludedDates: ["2026-07-31"],
      holidayPolicy: "same_as_weekday",
      automaticRenewal: true,
      renewalPeriodMonths: 12,
      noticeDays: 30,
      nextRenewalDate: "2027-08-20",
    },
    beneficiarios: [
      {
        id: "bn-001",
        type: "company",
        referenceId: "e-001",
        displayName: "ParkFacil Operaciones",
        identifier: "BEN-COMP-001",
        licensePlate: null,
        companyId: "e-001",
        active: true,
        validFrom: "2026-07-01",
        validUntil: "2026-08-20",
        usageCount: 120,
        accumulatedBenefit: 840000,
        lastUsedAt: "2026-07-25T09:12:00",
        notes: "Beneficiario corporativo principal.",
      },
      {
        id: "bn-002",
        type: "license_plate",
        referenceId: "veh-demo-001",
        displayName: "Vehiculo ejecutivo",
        identifier: "BEN-LP-002",
        licensePlate: "DEM-130",
        companyId: "e-001",
        active: true,
        validFrom: "2026-07-10",
        validUntil: "2026-08-20",
        usageCount: 25,
        accumulatedBenefit: 130000,
        lastUsedAt: "2026-07-24T18:02:00",
        notes: "Patente demostrativa autorizada.",
      },
    ],
    utilizacion: {
      totalUses: 265,
      usesToday: 14,
      usesThisMonth: 190,
      uniqueBeneficiaries: 46,
      accumulatedDiscount: 970000,
      accumulatedFreeMinutes: 0,
      accumulatedFreeHours: 0,
      remainingUses: 335,
      remainingDailyAmount: 90000,
      remainingMonthlyAmount: 2030000,
      lastUsedAt: "2026-07-25T09:12:00",
      lastUsedBy: "BEN-COMP-001",
      lastParkingFacilityId: "p-001",
    },
    fechaCreacionDemo: "2026-06-20",
    fechaActualizacionDemo: "2026-07-25",
    ultimaActualizacion: "2026-07-25T09:30:00",
    observaciones: "Convenio activo para simulaciones comerciales demostrativas.",
    incidencias: ["Sin incidencias"],
    historial: ["Creado en etapa demo", "Actualizado tope mensual"],
    auditoria: ["Sin integraciones productivas"],
    documentos: ["Anexo comercial demo"],
    aprobaciones: ["Aprobacion interna demostrativa"],
    comunicaciones: ["Notificacion comercial demo"],
  },
  {
    id: "cv-002",
    codigo: "CV-2026-002",
    nombre: "Promocion de Evento Sur",
    descripcion: "Promocion temporal para eventos con horas gratuitas.",
    tipo: "event",
    modalidadBeneficio: "free_hours",
    estado: "scheduled",
    prioridad: 2,
    responsableId: "u-002",
    empresaPrincipalId: "e-002",
    empresasBeneficiariasIds: ["e-002"],
    empresaResponsableId: "e-002",
    contratoId: "c-002",
    tarifaId: "t-002",
    estacionamientosIds: ["p-003"],
    accesosIds: ["ca-003"],
    zonas: ["Sur", "Eventos"],
    tiposEspacio: ["evento"],
    espaciosReservados: [],
    coberturaGlobal: false,
    restriccionesEstacionamiento: ["Aplicable solo dias de evento"],
    beneficio: {
      benefitType: "free_hours",
      percentage: 0,
      fixedAmount: 0,
      freeMinutes: 0,
      freeHours: 3,
      preferredRate: 0,
      maximumDiscount: 15000,
      maximumUses: 200,
      maximumUsesPerDay: 35,
      maximumUsesPerMonth: 200,
      maximumAmountPerDay: 130000,
      maximumAmountPerMonth: 600000,
      minimumStayMinutes: 0,
      maximumStayMinutes: 420,
      appliesToFirstPeriod: true,
      appliesToAdditionalPeriods: false,
      appliesAutomatically: false,
      requiresApproval: true,
      cumulative: false,
      multipleEntries: false,
      allowOvernight: true,
      gracePeriodMinutes: 20,
      priority: 2,
      notes: "Aplicacion manual demostrativa para eventos.",
    },
    vigencia: {
      validFrom: "2026-07-28T00:00:00",
      validUntil: "2026-09-05T23:59:00",
      timezone: "America/Santiago",
      allDay: false,
      allowedDays: ["friday", "saturday", "sunday"],
      startTime: "16:00",
      endTime: "23:59",
      excludedDates: [],
      holidayPolicy: "allowed",
      automaticRenewal: false,
      renewalPeriodMonths: 0,
      noticeDays: 15,
      nextRenewalDate: null,
    },
    beneficiarios: [
      {
        id: "bn-003",
        type: "visitor",
        referenceId: "v-002",
        displayName: "Visitante evento demo",
        identifier: "BEN-VIS-003",
        licensePlate: "DEM-202",
        companyId: "e-002",
        active: true,
        validFrom: "2026-07-28",
        validUntil: "2026-09-05",
        usageCount: 2,
        accumulatedBenefit: 18000,
        lastUsedAt: "2026-07-24T19:05:00",
        notes: "Beneficiario eventual de evento.",
      },
    ],
    utilizacion: {
      totalUses: 18,
      usesToday: 0,
      usesThisMonth: 18,
      uniqueBeneficiaries: 12,
      accumulatedDiscount: 58000,
      accumulatedFreeMinutes: 0,
      accumulatedFreeHours: 54,
      remainingUses: 182,
      remainingDailyAmount: 130000,
      remainingMonthlyAmount: 542000,
      lastUsedAt: "2026-07-24T19:05:00",
      lastUsedBy: "BEN-VIS-003",
      lastParkingFacilityId: "p-003",
    },
    fechaCreacionDemo: "2026-07-10",
    fechaActualizacionDemo: "2026-07-24",
    ultimaActualizacion: "2026-07-24T20:00:00",
    observaciones: "Convenio programado para promociones de evento.",
    incidencias: ["Sin incidencias"],
    historial: ["Configuracion inicial"],
    auditoria: ["Validacion de reglas demo"],
    documentos: ["Ficha de promocion"],
    aprobaciones: ["Pendiente de aprobacion de operaciones"],
    comunicaciones: ["Aviso interno de programacion"],
  },
  {
    id: "cv-003",
    codigo: "CV-2026-003",
    nombre: "Cortesia Residentes Norte",
    descripcion: "Minutos gratuitos para residentes y abonados de referencia.",
    tipo: "resident",
    modalidadBeneficio: "free_minutes",
    estado: "active",
    prioridad: 3,
    responsableId: "u-004",
    empresaPrincipalId: "e-001",
    empresasBeneficiariasIds: ["e-001", "e-003"],
    empresaResponsableId: "e-001",
    contratoId: "c-001",
    tarifaId: "t-003",
    estacionamientosIds: ["p-001"],
    accesosIds: ["ca-001", "ca-004"],
    zonas: ["Residencial"],
    tiposEspacio: ["residente"],
    espaciosReservados: ["R-10", "R-11"],
    coberturaGlobal: false,
    restriccionesEstacionamiento: ["Solo para abonados vigentes"],
    beneficio: {
      benefitType: "free_minutes",
      percentage: 0,
      fixedAmount: 0,
      freeMinutes: 90,
      freeHours: 0,
      preferredRate: 0,
      maximumDiscount: 9000,
      maximumUses: 450,
      maximumUsesPerDay: 20,
      maximumUsesPerMonth: 450,
      maximumAmountPerDay: 100000,
      maximumAmountPerMonth: 850000,
      minimumStayMinutes: 15,
      maximumStayMinutes: 360,
      appliesToFirstPeriod: true,
      appliesToAdditionalPeriods: true,
      appliesAutomatically: true,
      requiresApproval: false,
      cumulative: true,
      multipleEntries: true,
      allowOvernight: true,
      gracePeriodMinutes: 10,
      priority: 3,
      notes: "Acumulable solo en entorno demostrativo.",
    },
    vigencia: {
      validFrom: "2026-06-01T00:00:00",
      validUntil: "2026-07-30T23:59:00",
      timezone: "America/Santiago",
      allDay: true,
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      startTime: "00:00",
      endTime: "23:59",
      excludedDates: ["2026-07-20"],
      holidayPolicy: "same_as_weekday",
      automaticRenewal: true,
      renewalPeriodMonths: 6,
      noticeDays: 20,
      nextRenewalDate: "2027-01-30",
    },
    beneficiarios: [
      {
        id: "bn-004",
        type: "subscriber",
        referenceId: "ab-001",
        displayName: "Abonado demo principal",
        identifier: "BEN-SUB-004",
        licensePlate: "ABC-123",
        companyId: "e-001",
        active: true,
        validFrom: "2026-06-01",
        validUntil: "2026-07-30",
        usageCount: 64,
        accumulatedBenefit: 420000,
        lastUsedAt: "2026-07-25T08:55:00",
        notes: "Beneficiario asociado a abonado.",
      },
      {
        id: "bn-005",
        type: "resident",
        referenceId: null,
        displayName: "Residente demo sin referencia",
        identifier: "BEN-RES-005",
        licensePlate: "DEM-777",
        companyId: "e-003",
        active: true,
        validFrom: "2026-06-15",
        validUntil: "2026-07-30",
        usageCount: 11,
        accumulatedBenefit: 70000,
        lastUsedAt: "2026-07-24T17:20:00",
        notes: "Caso de referencia parcial.",
      },
    ],
    utilizacion: {
      totalUses: 155,
      usesToday: 9,
      usesThisMonth: 140,
      uniqueBeneficiaries: 78,
      accumulatedDiscount: 490000,
      accumulatedFreeMinutes: 11200,
      accumulatedFreeHours: 0,
      remainingUses: 295,
      remainingDailyAmount: 42000,
      remainingMonthlyAmount: 360000,
      lastUsedAt: "2026-07-25T08:55:00",
      lastUsedBy: "BEN-SUB-004",
      lastParkingFacilityId: "p-001",
    },
    fechaCreacionDemo: "2026-05-18",
    fechaActualizacionDemo: "2026-07-25",
    ultimaActualizacion: "2026-07-25T08:59:00",
    observaciones: "Convenio activo proximo a vencer (menos de 30 dias).",
    incidencias: ["Sin incidencias"],
    historial: ["Creado", "Ajuste de topes diarios"],
    auditoria: ["Revision comercial interna"],
    documentos: ["Anexo residentes"],
    aprobaciones: ["No requiere aprobacion"],
    comunicaciones: ["Recordatorio de vigencia"],
  },
  {
    id: "cv-004",
    codigo: "CV-2026-004",
    nombre: "Convenio Proveedores Suspendido",
    descripcion: "Descuento fijo para proveedores con aprobacion requerida.",
    tipo: "supplier",
    modalidadBeneficio: "fixed_discount",
    estado: "suspended",
    prioridad: 4,
    responsableId: "u-003",
    empresaPrincipalId: "e-003",
    empresasBeneficiariasIds: ["e-003"],
    empresaResponsableId: "e-003",
    contratoId: "c-003",
    tarifaId: "t-004",
    estacionamientosIds: ["p-003"],
    accesosIds: ["ca-003"],
    zonas: ["Carga"],
    tiposEspacio: ["logistico"],
    espaciosReservados: [],
    coberturaGlobal: false,
    restriccionesEstacionamiento: ["Solo proveedores acreditados"],
    beneficio: {
      benefitType: "fixed_discount",
      percentage: 0,
      fixedAmount: 2500,
      freeMinutes: 0,
      freeHours: 0,
      preferredRate: 0,
      maximumDiscount: 2500,
      maximumUses: 100,
      maximumUsesPerDay: 8,
      maximumUsesPerMonth: 100,
      maximumAmountPerDay: 20000,
      maximumAmountPerMonth: 150000,
      minimumStayMinutes: 20,
      maximumStayMinutes: 240,
      appliesToFirstPeriod: true,
      appliesToAdditionalPeriods: false,
      appliesAutomatically: false,
      requiresApproval: true,
      cumulative: false,
      multipleEntries: false,
      allowOvernight: false,
      gracePeriodMinutes: 5,
      priority: 4,
      notes: "Suspendido por revision interna.",
    },
    vigencia: {
      validFrom: "2026-04-01T00:00:00",
      validUntil: "2026-07-10T23:59:00",
      timezone: "America/Santiago",
      allDay: false,
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      startTime: "08:00",
      endTime: "19:00",
      excludedDates: [],
      holidayPolicy: "excluded",
      automaticRenewal: false,
      renewalPeriodMonths: 0,
      noticeDays: 10,
      nextRenewalDate: null,
    },
    beneficiarios: [
      {
        id: "bn-006",
        type: "supplier",
        referenceId: null,
        displayName: "Proveedor demo suspendido",
        identifier: "BEN-SUP-006",
        licensePlate: "DEM-606",
        companyId: "e-003",
        active: false,
        validFrom: "2026-04-01",
        validUntil: "2026-07-10",
        usageCount: 7,
        accumulatedBenefit: 17500,
        lastUsedAt: "2026-07-08T15:40:00",
        notes: "Beneficiario suspendido.",
      },
    ],
    utilizacion: {
      totalUses: 35,
      usesToday: 0,
      usesThisMonth: 9,
      uniqueBeneficiaries: 5,
      accumulatedDiscount: 56000,
      accumulatedFreeMinutes: 0,
      accumulatedFreeHours: 0,
      remainingUses: 65,
      remainingDailyAmount: 20000,
      remainingMonthlyAmount: 94000,
      lastUsedAt: "2026-07-08T15:40:00",
      lastUsedBy: "BEN-SUP-006",
      lastParkingFacilityId: "p-003",
    },
    fechaCreacionDemo: "2026-03-20",
    fechaActualizacionDemo: "2026-07-09",
    ultimaActualizacion: "2026-07-09T11:00:00",
    observaciones: "Suspendido preventivamente para revision demostrativa.",
    incidencias: ["Revision de cumplimiento"],
    historial: ["Suspendido por auditoria"],
    auditoria: ["Sin impacto productivo"],
    documentos: [],
    aprobaciones: ["Aprobacion requerida"],
    comunicaciones: ["Aviso de suspension"],
  },
  {
    id: "cv-005",
    codigo: "CV-2026-005",
    nombre: "Convenio Referencias Inexistentes",
    descripcion: "Convenio de prueba para relaciones faltantes y manejo seguro.",
    tipo: "temporary",
    modalidadBeneficio: "validation",
    estado: "active",
    prioridad: 5,
    responsableId: "u-999",
    empresaPrincipalId: "e-999",
    empresasBeneficiariasIds: ["e-999"],
    empresaResponsableId: "e-999",
    contratoId: "c-999",
    tarifaId: "t-999",
    estacionamientosIds: ["p-999"],
    accesosIds: ["ca-999"],
    zonas: ["Zona no disponible"],
    tiposEspacio: [],
    espaciosReservados: [],
    coberturaGlobal: false,
    restriccionesEstacionamiento: ["Validacion manual"],
    beneficio: {
      benefitType: "validation",
      percentage: 0,
      fixedAmount: 0,
      freeMinutes: 45,
      freeHours: 0,
      preferredRate: 0,
      maximumDiscount: 4500,
      maximumUses: 25,
      maximumUsesPerDay: 5,
      maximumUsesPerMonth: 25,
      maximumAmountPerDay: 15000,
      maximumAmountPerMonth: 60000,
      minimumStayMinutes: 0,
      maximumStayMinutes: 180,
      appliesToFirstPeriod: true,
      appliesToAdditionalPeriods: true,
      appliesAutomatically: false,
      requiresApproval: true,
      cumulative: false,
      multipleEntries: false,
      allowOvernight: false,
      gracePeriodMinutes: 5,
      priority: 5,
      notes: "Simulacion demostrativa con referencias inexistentes.",
    },
    vigencia: {
      validFrom: "2026-07-20T00:00:00",
      validUntil: "2026-08-10T23:59:00",
      timezone: "America/Santiago",
      allDay: true,
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      startTime: "00:00",
      endTime: "23:59",
      excludedDates: [],
      holidayPolicy: "special_schedule",
      automaticRenewal: false,
      renewalPeriodMonths: 0,
      noticeDays: 5,
      nextRenewalDate: null,
    },
    beneficiarios: [
      {
        id: "bn-007",
        type: "public",
        referenceId: null,
        displayName: "Publico autorizado demo",
        identifier: "BEN-PUB-007",
        licensePlate: null,
        companyId: "e-999",
        active: true,
        validFrom: "2026-07-20",
        validUntil: "2026-08-10",
        usageCount: 3,
        accumulatedBenefit: 5000,
        lastUsedAt: "2026-07-25T07:10:00",
        notes: "Beneficiario de prueba.",
      },
    ],
    utilizacion: {
      totalUses: 3,
      usesToday: 1,
      usesThisMonth: 3,
      uniqueBeneficiaries: 2,
      accumulatedDiscount: 5000,
      accumulatedFreeMinutes: 120,
      accumulatedFreeHours: 0,
      remainingUses: 22,
      remainingDailyAmount: 12000,
      remainingMonthlyAmount: 55000,
      lastUsedAt: "2026-07-25T07:10:00",
      lastUsedBy: "BEN-PUB-007",
      lastParkingFacilityId: "p-999",
    },
    fechaCreacionDemo: "2026-07-18",
    fechaActualizacionDemo: "2026-07-25",
    ultimaActualizacion: "2026-07-25T07:11:00",
    observaciones: "Debe mostrar No disponible en relaciones ausentes.",
    incidencias: ["Empresa no disponible", "Acceso no disponible"],
    historial: ["Creado para pruebas de robustez"],
    auditoria: ["Sin servicios externos"],
    documentos: [],
    aprobaciones: ["Pendiente de revision"],
    comunicaciones: [],
  },
];

export function getConveniosDemo() {
  return conveniosDemo;
}

export function getConvenioById(id) {
  return conveniosDemo.find((convenio) => convenio.id === id) ?? null;
}

export function getConvenioByCodigo(codigo) {
  return conveniosDemo.find((convenio) => convenio.codigo === codigo) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return value;
  }

  const stringValue = String(value || "");
  const dateOnlyMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  return new Date(value);
}

export function searchConvenios(query) {
  const normalized = normalizeText(query || "");

  return conveniosDemo.filter((convenio) => {
    const responsable = resolveUsuarioResponsable(convenio)?.nombreCompleto || "";
    const empresa = resolveEmpresaPrincipal(convenio)?.nombreFantasia || "";
    const estacionamientos = resolveEstacionamientos(convenio).map((item) => item?.nombre || "").join(" ");
    const beneficiariosTexto = getBeneficiarios(convenio).map((item) => [item.displayName, item.identifier, item.licensePlate].join(" ")).join(" ");

    return [
      convenio.codigo,
      convenio.nombre,
      convenio.descripcion,
      responsable,
      empresa,
      estacionamientos,
      beneficiariosTexto,
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function filterConveniosByEstado(estado) {
  return conveniosDemo.filter((convenio) => convenio.estado === estado);
}

export function filterConveniosByTipo(tipo) {
  return conveniosDemo.filter((convenio) => convenio.tipo === tipo);
}

export function filterConveniosByModalidad(modalidad) {
  return conveniosDemo.filter((convenio) => convenio.modalidadBeneficio === modalidad);
}

export function filterConveniosByEmpresa(empresaId) {
  return conveniosDemo.filter((convenio) => convenio.empresaPrincipalId === empresaId || (convenio.empresasBeneficiariasIds || []).includes(empresaId));
}

export function filterConveniosByEstacionamiento(estacionamientoId) {
  return conveniosDemo.filter((convenio) => (convenio.estacionamientosIds || []).includes(estacionamientoId));
}

export function filterConveniosByResponsable(responsableId) {
  return conveniosDemo.filter((convenio) => convenio.responsableId === responsableId);
}

export function filterConveniosByVigencia(vigencia, referenceDate = new Date()) {
  const normalized = normalizeText(vigencia || "");
  return conveniosDemo.filter((convenio) => normalizeText(calcularVigencia(convenio, referenceDate).etiqueta).includes(normalized));
}

export function filterConveniosAplicacionAutomatica(aplicaAutomatico) {
  return conveniosDemo.filter((convenio) => convenio.beneficio?.appliesAutomatically === aplicaAutomatico);
}

export function filterConveniosRequiereAprobacion(requiresApproval) {
  return conveniosDemo.filter((convenio) => convenio.beneficio?.requiresApproval === requiresApproval);
}

export function filterConveniosConTope() {
  return conveniosDemo.filter((convenio) => (convenio.beneficio?.maximumDiscount || 0) > 0 || (convenio.beneficio?.maximumUses || 0) > 0);
}

export function filterConveniosPermiteMultiplesUsos(permiteMultiples) {
  return conveniosDemo.filter((convenio) => convenio.beneficio?.multipleEntries === permiteMultiples);
}

export function filterConveniosConBeneficiarios(minimo = 1) {
  return conveniosDemo.filter((convenio) => getBeneficiarios(convenio).length >= minimo);
}

export function filterConveniosProximosAVencer(referenceDate = new Date()) {
  return conveniosDemo.filter((convenio) => calcularVigencia(convenio, referenceDate).isProximoAVencer);
}

export function getBeneficiarios(convenio) {
  return convenio?.beneficiarios || [];
}

export function filterBeneficiarios(convenio, tipo) {
  return getBeneficiarios(convenio).filter((beneficiario) => beneficiario.type === tipo);
}

export function resolveEmpresaPrincipal(convenio) {
  return convenio?.empresaPrincipalId ? getEmpresaById(convenio.empresaPrincipalId) : null;
}

export function resolveEmpresasBeneficiarias(convenio) {
  return (convenio?.empresasBeneficiariasIds || []).map((id) => getEmpresaById(id)).filter(Boolean);
}

export function resolveEmpresaResponsable(convenio) {
  return convenio?.empresaResponsableId ? getEmpresaById(convenio.empresaResponsableId) : null;
}

export function resolveUsuarioResponsable(convenio) {
  return convenio?.responsableId ? getUsuarioById(convenio.responsableId) : null;
}

export function resolveEstacionamientos(convenio) {
  if (convenio?.coberturaGlobal) {
    return getEstacionamientosDemo();
  }

  return (convenio?.estacionamientosIds || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function resolveAccesos(convenio) {
  return (convenio?.accesosIds || []).map((id) => getControlAccesoById(id)).filter(Boolean);
}

export function resolveContrato(convenio) {
  return convenio?.contratoId ? getContratoById(convenio.contratoId) : null;
}

export function resolveTarifa(convenio) {
  return convenio?.tarifaId ? getTarifaById(convenio.tarifaId) : null;
}

export function resolveAbonado(convenio, beneficiario) {
  if (beneficiario?.referenceId) {
    const abonado = getAbonadoById(beneficiario.referenceId);
    if (abonado) {
      return abonado;
    }
  }

  return convenio?.beneficiarios ? null : null;
}

export function resolveVisita(convenio, beneficiario) {
  if (beneficiario?.referenceId) {
    const visita = getVisitaById(beneficiario.referenceId);
    if (visita) {
      return visita;
    }
  }

  return null;
}

export function resolveOperacion(convenio) {
  const firstBeneficiario = getBeneficiarios(convenio)[0];
  if (!firstBeneficiario?.referenceId) {
    return null;
  }

  return getOperacionById(firstBeneficiario.referenceId);
}

export function calcularVigencia(convenio, referenceDate = new Date()) {
  const reference = parseDateValue(referenceDate);
  const inicio = parseDateValue(convenio?.vigencia?.validFrom);
  const termino = parseDateValue(convenio?.vigencia?.validUntil);

  const isFuturo = reference < inicio;
  const isVencido = reference > termino || convenio.estado === "expired";
  const isActivo = !isFuturo && !isVencido && convenio.estado === "active";
  const diasRestantes = calcularDiasRestantes(convenio, referenceDate);
  const isProximoAVencer = diasRestantes <= 30 && diasRestantes >= 0;

  const etiqueta = isVencido
    ? "Vencido"
    : isFuturo
      ? "Futuro"
      : isActivo && isProximoAVencer
        ? "Vigente - Proximo a vencer"
        : isActivo
          ? "Vigente"
          : isProximoAVencer
            ? "Proximo a vencer"
            : "No vigente";

  return {
    isActivo,
    isFuturo,
    isVencido,
    isProximoAVencer,
    diasRestantes,
    etiqueta,
  };
}

export function calcularDiasRestantes(convenio, referenceDate = new Date()) {
  const reference = parseDateValue(referenceDate);
  const termino = parseDateValue(convenio?.vigencia?.validUntil);
  const diff = termino.getTime() - reference.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function validarDiaPermitido(convenio, referenceDate = new Date()) {
  const reference = parseDateValue(referenceDate);
  const dayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = dayMap[reference.getDay()];
  return (convenio?.vigencia?.allowedDays || []).includes(day);
}

export function validarHorarioPermitido(convenio, referenceDate = new Date()) {
  if (convenio?.vigencia?.allDay) {
    return true;
  }

  const reference = parseDateValue(referenceDate);
  const hh = String(reference.getHours()).padStart(2, "0");
  const mm = String(reference.getMinutes()).padStart(2, "0");
  const hour = `${hh}:${mm}`;

  const start = convenio?.vigencia?.startTime || "00:00";
  const end = convenio?.vigencia?.endTime || "23:59";

  return hour >= start && hour <= end;
}

export function describirBeneficio(convenio) {
  const beneficio = convenio?.beneficio || {};

  switch (beneficio.benefitType) {
    case "percentage_discount":
      return `Descuento de ${beneficio.percentage || 0}% con tope de ${formatValorDemostrativo(beneficio.maximumDiscount || 0)}`;
    case "fixed_discount":
      return `Descuento fijo de ${formatValorDemostrativo(beneficio.fixedAmount || 0)}`;
    case "free_minutes":
      return `${beneficio.freeMinutes || 0} minutos gratuitos`;
    case "free_hours":
      return `${beneficio.freeHours || 0} horas gratuitas`;
    case "preferred_rate":
      return `Tarifa preferencial de ${formatValorDemostrativo(beneficio.preferredRate || 0)}`;
    case "full_exemption":
      return "Gratuidad total";
    case "partial_exemption":
      return "Gratuidad parcial";
    case "flat_rate":
      return `Tarifa plana demostrativa de ${formatValorDemostrativo(beneficio.fixedAmount || 0)}`;
    case "daily_cap":
      return `Tope diario de ${formatValorDemostrativo(beneficio.maximumAmountPerDay || 0)}`;
    case "monthly_cap":
      return `Tope mensual de ${formatValorDemostrativo(beneficio.maximumAmountPerMonth || 0)}`;
    case "courtesy_ticket":
      return "Ticket de cortesia demostrativo";
    case "validation":
      return "Validacion comercial demostrativa";
    default:
      return "Beneficio personalizado";
  }
}

export function validarReglasBasicas(convenio, referenceDate = new Date()) {
  const vigente = calcularVigencia(convenio, referenceDate);
  const diaPermitido = validarDiaPermitido(convenio, referenceDate);
  const horarioPermitido = validarHorarioPermitido(convenio, referenceDate);
  const beneficio = convenio?.beneficio || {};

  const cumpleTopes = !detectarTopeAlcanzado(convenio).algunTope;
  const puedeAplicarse = vigente.isActivo && diaPermitido && horarioPermitido && cumpleTopes && (beneficio.requiresApproval ? convenio.estado !== "draft" : true);

  return {
    vigente,
    diaPermitido,
    horarioPermitido,
    cumpleTopes,
    puedeAplicarse,
  };
}

export function detectarTopeAlcanzado(convenio) {
  const beneficio = convenio?.beneficio || {};
  const uso = convenio?.utilizacion || {};

  const topeUsos = (beneficio.maximumUses || 0) > 0 && (uso.totalUses || 0) >= (beneficio.maximumUses || 0);
  const topeDiario = (beneficio.maximumAmountPerDay || 0) > 0 && (uso.remainingDailyAmount || 0) <= 0;
  const topeMensual = (beneficio.maximumAmountPerMonth || 0) > 0 && (uso.remainingMonthlyAmount || 0) <= 0;

  return {
    topeUsos,
    topeDiario,
    topeMensual,
    algunTope: topeUsos || topeDiario || topeMensual,
  };
}

export function calcularConsumoRestante(convenio) {
  const beneficio = convenio?.beneficio || {};
  const uso = convenio?.utilizacion || {};

  return {
    usosRestantes: Math.max(0, (beneficio.maximumUses || 0) - (uso.totalUses || 0)),
    montoDiarioRestante: Math.max(0, uso.remainingDailyAmount || 0),
    montoMensualRestante: Math.max(0, uso.remainingMonthlyAmount || 0),
  };
}

export function detectarConveniosIncompatibles(convenio, listaConvenios = conveniosDemo) {
  return listaConvenios.filter((item) => {
    if (item.id === convenio.id) {
      return false;
    }

    const empresasCoinciden = (item.empresasBeneficiariasIds || []).some((empresaId) => (convenio.empresasBeneficiariasIds || []).includes(empresaId));
    const modalidadIncompatible = item.modalidadBeneficio === convenio.modalidadBeneficio && item.tipo === convenio.tipo;
    return empresasCoinciden && modalidadIncompatible;
  });
}

export function ordenarConveniosPorPrioridad(convenios = conveniosDemo) {
  return [...convenios].sort((a, b) => (a.prioridad || 0) - (b.prioridad || 0));
}

export function simularBeneficio(convenio, montoBase = 12000, referenceDate = new Date()) {
  const validacion = validarReglasBasicas(convenio, referenceDate);
  const beneficio = convenio?.beneficio || {};

  let descuento = 0;

  if (beneficio.benefitType === "percentage_discount") {
    descuento = Math.round((montoBase * (beneficio.percentage || 0)) / 100);
  } else if (["fixed_discount", "flat_rate"].includes(beneficio.benefitType)) {
    descuento = beneficio.fixedAmount || 0;
  } else if (beneficio.benefitType === "full_exemption") {
    descuento = montoBase;
  } else if (beneficio.benefitType === "partial_exemption") {
    descuento = Math.round(montoBase * 0.5);
  } else if (["free_minutes", "free_hours", "validation", "courtesy_ticket"].includes(beneficio.benefitType)) {
    descuento = Math.min(montoBase, beneficio.maximumDiscount || 3000);
  }

  if ((beneficio.maximumDiscount || 0) > 0) {
    descuento = Math.min(descuento, beneficio.maximumDiscount);
  }

  if (!validacion.puedeAplicarse) {
    descuento = 0;
  }

  const montoFinal = Math.max(0, montoBase - descuento);

  return {
    etiqueta: "Simulacion demostrativa",
    montoBase,
    beneficioAplicable: describirBeneficio(convenio),
    descuentoEstimado: descuento,
    montoFinalEstimado: montoFinal,
    aceptado: validacion.puedeAplicarse,
    motivo: validacion.puedeAplicarse ? "Reglas demostrativas cumplidas" : "Reglas demostrativas no cumplidas",
    reglasEvaluadas: [
      `Vigente: ${validacion.vigente.etiqueta}`,
      `Dia permitido: ${validacion.diaPermitido ? "Si" : "No"}`,
      `Horario permitido: ${validacion.horarioPermitido ? "Si" : "No"}`,
      `Topes disponibles: ${validacion.cumpleTopes ? "Si" : "No"}`,
    ],
  };
}

export function calcularUtilizacion(convenio) {
  const uso = convenio?.utilizacion || {};

  return {
    total: uso.totalUses || 0,
    diario: uso.usesToday || 0,
    mensual: uso.usesThisMonth || 0,
    beneficiariosUnicos: uso.uniqueBeneficiaries || 0,
    acumuladoDescuento: uso.accumulatedDiscount || 0,
    acumuladoMinutos: uso.accumulatedFreeMinutes || 0,
    acumuladoHoras: uso.accumulatedFreeHours || 0,
  };
}

export function detectarAltaUtilizacion(convenio) {
  const beneficio = convenio?.beneficio || {};
  const uso = convenio?.utilizacion || {};
  if ((beneficio.maximumUses || 0) <= 0) {
    return false;
  }

  return (uso.totalUses || 0) / (beneficio.maximumUses || 1) >= 0.8;
}

export function calcularResumenGeneral(referenceDate = new Date()) {
  const activos = conveniosDemo.filter((item) => item.estado === "active").length;
  const programados = conveniosDemo.filter((item) => item.estado === "scheduled").length;
  const suspendidos = conveniosDemo.filter((item) => item.estado === "suspended").length;
  const vencidos = conveniosDemo.filter((item) => calcularVigencia(item, referenceDate).isVencido).length;
  const proximosAVencer = filterConveniosProximosAVencer(referenceDate).length;

  const empresasBeneficiarias = new Set(conveniosDemo.flatMap((item) => item.empresasBeneficiariasIds || [])).size;
  const beneficiariosRegistrados = conveniosDemo.reduce((acc, item) => acc + getBeneficiarios(item).length, 0);
  const beneficiosUtilizados = conveniosDemo.reduce((acc, item) => acc + (item.utilizacion?.totalUses || 0), 0);
  const consumoAcumulado = conveniosDemo.reduce((acc, item) => acc + (item.utilizacion?.accumulatedDiscount || 0), 0);

  return {
    total: conveniosDemo.length,
    activos,
    programados,
    suspendidos,
    vencidos,
    empresasBeneficiarias,
    beneficiariosRegistrados,
    beneficiosUtilizados,
    proximosAVencer,
    consumoAcumulado,
  };
}

export function getTipoConvenioLabel(tipo) {
  const labels = {
    corporate: "Corporativo",
    commercial: "Comercial",
    employee: "Trabajadores",
    resident: "Residentes",
    supplier: "Proveedores",
    courtesy: "Cortesia",
    event: "Evento",
    promotional: "Promocional",
    institutional: "Institucional",
    temporary: "Temporal",
    parking_partner: "Estacionamiento asociado",
    other: "Otro",
  };

  return labels[tipo] ?? tipo;
}

export function getEstadoConvenioLabel(estado) {
  const labels = {
    draft: "Borrador",
    scheduled: "Programado",
    active: "Activo",
    suspended: "Suspendido",
    expired: "Vencido",
    cancelled: "Cancelado",
    archived: "Archivado",
  };

  return labels[estado] ?? estado;
}

export function getModalidadBeneficioLabel(modalidad) {
  const labels = {
    percentage_discount: "Descuento porcentual",
    fixed_discount: "Descuento fijo",
    free_minutes: "Minutos gratuitos",
    free_hours: "Horas gratuitas",
    preferred_rate: "Tarifa preferencial",
    full_exemption: "Gratuidad total",
    partial_exemption: "Gratuidad parcial",
    flat_rate: "Tarifa plana",
    daily_cap: "Tope diario",
    monthly_cap: "Tope mensual",
    courtesy_ticket: "Ticket de cortesia",
    validation: "Validacion comercial",
    custom: "Beneficio personalizado",
  };

  return labels[modalidad] ?? modalidad;
}

export function getTipoBeneficiarioLabel(tipo) {
  const labels = {
    company: "Empresa",
    user: "Usuario",
    subscriber: "Abonado",
    visitor: "Visitante",
    employee: "Trabajador",
    supplier: "Proveedor",
    resident: "Residente",
    vehicle: "Vehiculo",
    license_plate: "Patente",
    group: "Grupo",
    public: "Publico autorizado",
  };

  return labels[tipo] ?? tipo;
}

export function formatDate(value) {
  if (!value) {
    return "No disponible";
  }

  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

export function formatHour(value) {
  if (!value) {
    return "No disponible";
  }

  return String(value).slice(0, 5);
}

export function formatValorDemostrativo(value, currency = "CLP") {
  const normalized = Number(value || 0);

  if (currency === "USD") {
    return `USD ${normalized.toLocaleString("en-US")}`;
  }

  if (currency === "UF") {
    return `UF ${normalized.toLocaleString("es-CL")}`;
  }

  return `$${normalized.toLocaleString("es-CL")}`;
}

export function getEmpresasRelacionables() {
  return getEmpresasDemo();
}

export function getUsuariosRelacionables() {
  return getUsuariosDemo();
}

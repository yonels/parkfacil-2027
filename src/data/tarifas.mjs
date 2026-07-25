import { getContratoById } from "./contratos.mjs";

export const tarifasDemo = [
  {
    id: "t-001",
    codigo: "PF-PLAN-001",
    nombre: "ParkFacil Operación Premium",
    descripcion: "Plan comercial demostrativo para operaciones completas y soporte avanzado.",
    estado: "active",
    tipo: "monthly_subscription",
    moneda: "CLP",
    modalidadCobro: "monthly",
    monthlyFee: 1800000,
    annualFee: 19800000,
    implementationFee: 1200000,
    transactionFee: 4200,
    deviceFee: 95000,
    parkingFee: 550000,
    supportFee: 250000,
    discountPercentage: 8,
    minimumMonthlyCharge: 1500000,
    estacionamientosIncluidos: 4,
    dispositivosIncluidos: 12,
    usuariosIncluidos: 20,
    modulos: ["Gestión de accesos", "Reportes", "Monitoreo"],
    equipamiento: ["Lectores", "Cámaras", "Controladores"],
    limites: ["Sin límite de reportes", "Soporte 24/7"],
    soporte: ["Atención prioritaria", "Capacitación en línea"],
    implementacion: ["Implementación inicial", "Ajuste de configuración"],
    capacitacion: ["Capacitación de operación"],
    reportes: ["Dashboards"],
    integraciones: ["API básica"],
    condiciones: ["Vigencia comercial demostrativa", "Renovación mensual"],
    vigencia: "2025-01-01 a 2026-12-31",
    fechaCreacion: "2024-12-01",
    contractIds: ["c-001"],
    observaciones: "Plan activo de referencia para operaciones premium.",
  },
  {
    id: "t-002",
    codigo: "PF-PLAN-002",
    nombre: "Control Transaccional Básico",
    descripcion: "Plan orientado a operaciones con cobro por transacción y soporte estándar.",
    estado: "inactive",
    tipo: "per_transaction",
    moneda: "USD",
    modalidadCobro: "per_transaction",
    monthlyFee: 0,
    annualFee: 0,
    implementationFee: 3500,
    transactionFee: 0.8,
    deviceFee: 0,
    parkingFee: 0,
    supportFee: 400,
    discountPercentage: 0,
    minimumMonthlyCharge: 1200,
    estacionamientosIncluidos: 1,
    dispositivosIncluidos: 4,
    usuariosIncluidos: 8,
    modulos: ["Control de ingreso"],
    equipamiento: ["Lectores de acceso"],
    limites: ["Límite de transacciones estándar"],
    soporte: ["Soporte por ticket"],
    implementacion: ["Implementación básica"],
    capacitacion: ["Capacitación esencial"],
    reportes: ["Reportes básicos"],
    integraciones: ["Sin integraciones"],
    condiciones: ["Pago por transacción"],
    vigencia: "2024-06-01 a 2025-06-01",
    fechaCreacion: "2024-05-01",
    contractIds: ["c-002"],
    observaciones: "Plan inactivo de referencia con modalidad transaccional.",
  },
  {
    id: "t-003",
    codigo: "PF-PLAN-003",
    nombre: "Paquete de Equipamiento Central",
    descripcion: "Plan para despliegue con equipamiento incluido y cobro mensual.",
    estado: "draft",
    tipo: "equipment_bundle",
    moneda: "UF",
    modalidadCobro: "mixed",
    monthlyFee: 18,
    annualFee: 180,
    implementationFee: 6,
    transactionFee: 0,
    deviceFee: 3,
    parkingFee: 0,
    supportFee: 2,
    discountPercentage: 5,
    minimumMonthlyCharge: 15,
    estacionamientosIncluidos: 3,
    dispositivosIncluidos: 20,
    usuariosIncluidos: 12,
    modulos: ["Gestión integral"],
    equipamiento: ["Cámaras", "Controladores", "Lectores"],
    limites: ["Cobertura por instalaciones"],
    soporte: ["Soporte base"],
    implementacion: ["Implementación guiada"],
    capacitacion: ["Capacitación inicial"],
    reportes: ["Reportes de operación"],
    integraciones: ["Integración con panel"],
    condiciones: ["Cobro mixto demostrativo"],
    vigencia: "2026-01-01 a 2026-06-30",
    fechaCreacion: "2025-12-01",
    contractIds: ["c-003"],
    observaciones: "Plan en borrador con alcance de equipamiento.",
  },
  {
    id: "t-004",
    codigo: "PF-PLAN-004",
    nombre: "Implementación a Medida",
    descripcion: "Plan personalizado demostrativo sin contratos asociados.",
    estado: "archived",
    tipo: "custom",
    moneda: "CLP",
    modalidadCobro: "one_time",
    monthlyFee: 0,
    annualFee: 0,
    implementationFee: 5000000,
    transactionFee: 0,
    deviceFee: 180000,
    parkingFee: 0,
    supportFee: 0,
    discountPercentage: 12,
    minimumMonthlyCharge: 0,
    estacionamientosIncluidos: 2,
    dispositivosIncluidos: 8,
    usuariosIncluidos: 10,
    modulos: ["Personalización inicial"],
    equipamiento: ["Integración especial"],
    limites: ["Configuración específica"],
    soporte: ["Soporte por alcance"],
    implementacion: ["Diseño personalizado"],
    capacitacion: ["Capacitación a medida"],
    reportes: ["Reportes personalizados"],
    integraciones: ["Integraciones especiales"],
    condiciones: ["Plan personalizado de referencia"],
    vigencia: "2024-01-01 a 2024-12-31",
    fechaCreacion: "2023-09-01",
    contractIds: [],
    observaciones: "Plan personalizado sin contratos asociados para probar el manejo seguro.",
  },
];

export function getTarifasDemo() {
  return tarifasDemo;
}

export function getTarifaById(id) {
  return tarifasDemo.find((tarifa) => tarifa.id === id) ?? null;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

export function searchTarifas(query) {
  const normalized = normalizeText(query);

  return tarifasDemo.filter((tarifa) => {
    return [
      tarifa.nombre,
      tarifa.codigo,
      tarifa.tipo,
      tarifa.descripcion,
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function filterTarifasByEstado(estado) {
  return tarifasDemo.filter((tarifa) => tarifa.estado === estado);
}

export function filterTarifasByTipo(tipo) {
  return tarifasDemo.filter((tarifa) => tarifa.tipo === tipo);
}

export function filterTarifasByMoneda(moneda) {
  return tarifasDemo.filter((tarifa) => tarifa.moneda === moneda);
}

export function filterTarifasByModalidad(modalidad) {
  return tarifasDemo.filter((tarifa) => tarifa.modalidadCobro === modalidad);
}

export function hasImplementation(tarifa) {
  return (tarifa?.implementationFee || 0) > 0;
}

export function isCustomPlan(tarifa) {
  return tarifa?.tipo === "custom";
}

export function resolveContratos(tarifa) {
  return (tarifa?.contractIds || []).map((id) => getContratoById(id)).filter(Boolean);
}

export function getResumenTarifas() {
  const summary = {
    total: tarifasDemo.length,
    active: 0,
    inactive: 0,
    draft: 0,
    archived: 0,
    porEstacionamiento: 0,
    porTransaccion: 0,
    personalizados: 0,
  };

  tarifasDemo.forEach((tarifa) => {
    summary[tarifa.estado] += 1;
    if (tarifa.tipo === "per_parking") {
      summary.porEstacionamiento += 1;
    }
    if (tarifa.tipo === "per_transaction") {
      summary.porTransaccion += 1;
    }
    if (isCustomPlan(tarifa)) {
      summary.personalizados += 1;
    }
  });

  return summary;
}

export function getEstadoLabel(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    draft: "Borrador",
    archived: "Archivado",
  };

  return labels[estado] ?? estado;
}

export function getTipoLabel(tipo) {
  const labels = {
    monthly_subscription: "Suscripción mensual",
    per_transaction: "Por transacción",
    per_parking: "Por estacionamiento",
    equipment_bundle: "Paquete de equipamiento",
    implementation_only: "Solo implementación",
    custom: "Personalizado",
  };

  return labels[tipo] ?? tipo;
}

export function getModalidadLabel(modalidad) {
  const labels = {
    monthly: "Mensual",
    annual: "Anual",
    one_time: "Pago único",
    per_transaction: "Por transacción",
    mixed: "Mixto",
  };

  return labels[modalidad] ?? modalidad;
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

export function getPlanTotalReferencial(tarifa) {
  return (tarifa?.monthlyFee || 0) + (tarifa?.implementationFee || 0) + (tarifa?.transactionFee || 0);
}

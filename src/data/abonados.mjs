import { getEmpresaById } from "./empresas.mjs";
import { getEstacionamientoById } from "./estacionamientos.mjs";
import { getUsuarioById } from "./usuarios.mjs";
import { getContratoById } from "./contratos.mjs";

export const abonadosDemo = [
  {
    id: "ab-001",
    nombre: "María Elena Pérez",
    identificador: "AB-1001",
    empresaId: "e-001",
    contratoId: "c-001",
    responsableId: "u-001",
    tipo: "resident",
    estado: "active",
    correo: "maria.perez@demo.local",
    telefono: "+56 9 1111 2222",
    rut: "11.111.111-1",
    fechaInicio: "2026-01-01",
    fechaTermino: "2026-12-31",
    estacionamientos: ["p-001", "p-002"],
    vehiculos: [
      {
        id: "veh-001",
        licensePlate: "ABC-123",
        brand: "Toyota",
        model: "Yaris",
        color: "Blanco",
        year: 2022,
        vehicleType: "car",
        isPrimary: true,
        status: "authorized",
        notes: "Vehículo principal del abonado.",
      },
      {
        id: "veh-002",
        licensePlate: "XYZ-789",
        brand: "Honda",
        model: "CB",
        color: "Negro",
        year: 2021,
        vehicleType: "motorcycle",
        isPrimary: false,
        status: "pending",
        notes: "Motocicleta de respaldo.",
      },
    ],
    credenciales: [
      {
        id: "cred-001",
        numero: "CRD-1001",
        tipo: "rfid_card",
        estado: "active",
        fechaInicio: "2026-01-01",
        fechaTermino: "2026-12-31",
        estacionamientos: ["p-001"],
        accesoBloqueado: false,
        observaciones: "Credencial activa para ingreso principal.",
      },
      {
        id: "cred-002",
        numero: "CRD-1002",
        tipo: "license_plate",
        estado: "pending_activation",
        fechaInicio: "2026-07-01",
        fechaTermino: "2026-09-30",
        estacionamientos: ["p-002"],
        accesoBloqueado: false,
        observaciones: "Patente vinculada a permiso temporal.",
      },
    ],
    permisos: [
      {
        id: "perm-001",
        estacionamientos: ["p-001", "p-002"],
        accesos: ["A1", "B2"],
        dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
        horarioDesde: "06:00",
        horarioHasta: "22:00",
        fechaInicio: "2026-01-01",
        fechaTermino: "2026-12-31",
        acceso24x7: false,
        maxIngresosDiarios: 2,
        reglas: "Permiso con horario de acceso diario.",
        estado: "active",
        tipo: "limited",
      },
      {
        id: "perm-002",
        estacionamientos: ["p-003"],
        accesos: [],
        dias: ["Todos"],
        horarioDesde: null,
        horarioHasta: null,
        fechaInicio: "2026-06-01",
        fechaTermino: "2026-09-01",
        acceso24x7: true,
        maxIngresosDiarios: 5,
        reglas: "Permiso temporal 24/7 para acceso de cortesía.",
        estado: "pending",
        tipo: "full",
      },
    ],
    observaciones: "Abonado de referencia con empresa y contrato asociados.",
    historial: ["Alta inicial", "Actualización de vehículos"],
    incidencias: ["Sin incidencias"],
    auditoria: ["Registro demo", "Sin operaciones reales"],
    documentos: ["Contrato y documento de identidad"],
  },
  {
    id: "ab-002",
    nombre: "Javier Morales",
    identificador: "AB-1002",
    empresaId: "e-002",
    contratoId: "c-002",
    responsableId: "u-002",
    tipo: "company_employee",
    estado: "suspended",
    correo: "javier.morales@demo.local",
    telefono: "+57 4 2222 3333",
    rut: "22.222.222-2",
    fechaInicio: "2026-02-01",
    fechaTermino: "2026-08-01",
    estacionamientos: ["p-003"],
    vehiculos: [
      {
        id: "veh-003",
        licensePlate: "LMN-456",
        brand: null,
        model: null,
        color: "Azul",
        year: 2020,
        vehicleType: "van",
        isPrimary: true,
        status: "blocked",
        notes: "Vehículo sin marca o modelo registrado.",
      },
    ],
    credenciales: [
      {
        id: "cred-003",
        numero: "CRD-1003",
        tipo: "qr_code",
        estado: "suspended",
        fechaInicio: "2026-02-01",
        fechaTermino: "2026-08-01",
        estacionamientos: ["p-003"],
        accesoBloqueado: true,
        observaciones: "Credencial suspendida temporalmente.",
      },
    ],
    permisos: [
      {
        id: "perm-003",
        estacionamientos: ["p-003"],
        accesos: ["C1"],
        dias: ["Lunes", "Miércoles", "Viernes"],
        horarioDesde: "08:00",
        horarioHasta: "18:00",
        fechaInicio: "2026-02-01",
        fechaTermino: "2026-06-01",
        acceso24x7: false,
        maxIngresosDiarios: 1,
        reglas: "Permiso limitado a ciertos accesos.",
        estado: "suspended",
        tipo: "limited",
      },
    ],
    observaciones: "Abonado con credencial suspendida y permisos limitados.",
    historial: ["Alta de empresa", "Suspensión de credenciales"],
    incidencias: ["Acceso bloqueado"],
    auditoria: ["Revisión de seguridad"],
    documentos: ["Documento de empresa"],
  },
  {
    id: "ab-003",
    nombre: "Clara Flores",
    identificador: "AB-1003",
    empresaId: null,
    contratoId: null,
    responsableId: "u-004",
    tipo: "temporary",
    estado: "pending",
    correo: "clara.flores@demo.local",
    telefono: "+56 2 4444 5555",
    rut: "33.333.333-3",
    fechaInicio: "2026-07-10",
    fechaTermino: "2026-09-10",
    estacionamientos: ["p-001"],
    vehiculos: [
      {
        id: "veh-004",
        licensePlate: "QWE-321",
        brand: "Mazda",
        model: "2",
        color: "Rojo",
        year: 2023,
        vehicleType: "car",
        isPrimary: true,
        status: "pending",
        notes: "Vehículo temporal pendiente de confirmación.",
      },
    ],
    credenciales: [
      {
        id: "cred-004",
        numero: "CRD-1004",
        tipo: "mobile",
        estado: "pending_activation",
        fechaInicio: "2026-07-10",
        fechaTermino: "2026-09-10",
        estacionamientos: ["p-001"],
        accesoBloqueado: false,
        observaciones: "Credencial móvil pendiente de activación.",
      },
    ],
    permisos: [
      {
        id: "perm-004",
        estacionamientos: ["p-001"],
        accesos: [],
        dias: ["Todos"],
        horarioDesde: null,
        horarioHasta: null,
        fechaInicio: "2026-07-10",
        fechaTermino: "2026-09-10",
        acceso24x7: true,
        maxIngresosDiarios: 3,
        reglas: "Permiso futuro 24/7 para uso temporal.",
        estado: "pending",
        tipo: "full",
      },
    ],
    observaciones: "Abonado temporal sin empresa asignada.",
    historial: ["Alta temporal"],
    incidencias: [],
    auditoria: ["Registro en proceso"],
    documentos: [],
  },
];

export function getAbonadosDemo() {
  return abonadosDemo;
}

export function getAbonadoById(id) {
  return abonadosDemo.find((abonado) => abonado.id === id) ?? null;
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

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  return new Date(value);
}

export function searchAbonados(query) {
  const normalized = normalizeText(query);

  return abonadosDemo.filter((abonado) => {
    return [
      abonado.nombre,
      abonado.identificador,
      abonado.rut,
      abonado.correo,
      getEmpresaById(abonado.empresaId)?.nombreFantasia || "",
      abonado.credenciales.map((credencial) => credencial.numero).join(" "),
      abonado.vehiculos.map((vehiculo) => vehiculo.licensePlate).join(" "),
    ].some((value) => normalizeText(value).includes(normalized));
  });
}

export function searchAbonadosByPatente(patente) {
  const normalized = normalizeText(patente);
  return abonadosDemo.filter((abonado) => getVehiculos(abonado).some((vehiculo) => normalizeText(vehiculo.licensePlate).includes(normalized)));
}

export function searchAbonadosByCredencial(credencial) {
  const normalized = normalizeText(credencial);
  return abonadosDemo.filter((abonado) => getCredenciales(abonado).some((item) => normalizeText(item.numero).includes(normalized)));
}

export function filterAbonadosByEstado(estado) {
  return abonadosDemo.filter((abonado) => abonado.estado === estado);
}

export function filterAbonadosByTipo(tipo) {
  return abonadosDemo.filter((abonado) => abonado.tipo === tipo);
}

export function filterAbonadosByEmpresa(empresaId) {
  return abonadosDemo.filter((abonado) => abonado.empresaId === empresaId);
}

export function filterAbonadosByEstacionamiento(estacionamientoId) {
  return abonadosDemo.filter((abonado) => abonado.estacionamientos.includes(estacionamientoId));
}

export function filterAbonadosByTipoCredencial(tipoCredencial) {
  return abonadosDemo.filter((abonado) => getCredenciales(abonado).some((credencial) => credencial.tipo === tipoCredencial));
}

export function filterAbonadosByVigencia(vigencia) {
  return abonadosDemo.filter((abonado) => getTextoVigencia(abonado, new Date("2026-08-01")).toLowerCase() === vigencia.toLowerCase());
}

export function filterAbonadosBloqueados() {
  return abonadosDemo.filter((abonado) => abonado.estado === "blocked" || getCredenciales(abonado).some((credencial) => credencial.accesoBloqueado));
}

export function filterAbonadosCredencialesPorVencer(referenceDate = "2026-08-01") {
  return abonadosDemo.filter((abonado) => getCredenciales(abonado).some((credencial) => isCredencialProximaAVencer(credencial, referenceDate)));
}

export function resolveEmpresa(abonado) {
  return abonado?.empresaId ? getEmpresaById(abonado.empresaId) : null;
}

export function resolveEstacionamientos(abonado) {
  return (abonado?.estacionamientos || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function resolveResponsable(abonado) {
  return abonado?.responsableId ? getUsuarioById(abonado.responsableId)?.nombreCompleto || "No disponible" : "No disponible";
}

export function resolveContrato(abonado) {
  return abonado?.contratoId ? getContratoById(abonado.contratoId) : null;
}

export function getVehiculos(abonado) {
  return abonado?.vehiculos || [];
}

export function getPatentePrincipal(abonado) {
  return getVehiculos(abonado).find((vehiculo) => vehiculo.isPrimary)?.licensePlate || getVehiculos(abonado)[0]?.licensePlate || null;
}

export function getCredenciales(abonado) {
  return abonado?.credenciales || [];
}

export function getPermisos(abonado) {
  return abonado?.permisos || [];
}

export function isAbonadoVigente(abonado, referenceDate = new Date()) {
  const fechaTermino = parseDateValue(abonado?.fechaTermino || "2099-01-01");
  const reference = parseDateValue(referenceDate);
  return reference <= fechaTermino;
}

export function getDiasRestantes(abonado, referenceDate = new Date()) {
  const fechaTermino = parseDateValue(abonado?.fechaTermino || "2099-01-01");
  const reference = parseDateValue(referenceDate);
  const diff = fechaTermino.getTime() - reference.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isAbonadoVencido(abonado, referenceDate = new Date()) {
  return getDiasRestantes(abonado, referenceDate) < 0;
}

export function isCredencialVencida(credencial, referenceDate = new Date()) {
  const fechaTermino = parseDateValue(credencial?.fechaTermino || "2099-01-01");
  const reference = parseDateValue(referenceDate);
  return reference > fechaTermino;
}

export function isCredencialProximaAVencer(credencial, referenceDate = new Date()) {
  const fechaTermino = parseDateValue(credencial?.fechaTermino || "2099-01-01");
  const reference = parseDateValue(referenceDate);
  const diff = fechaTermino.getTime() - reference.getTime();
  return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
}

export function isPermisoVigente(permiso, referenceDate = new Date()) {
  const fechaTermino = parseDateValue(permiso?.fechaTermino || "2099-01-01");
  const reference = parseDateValue(referenceDate);
  return reference <= fechaTermino;
}

export function getTextoVigencia(abonado, referenceDate = new Date()) {
  const diasRestantes = getDiasRestantes(abonado, referenceDate);
  if (diasRestantes < 0) return "Vencido";
  if (diasRestantes <= 30) return "Próximo a vencer";
  return "Vigente";
}

export function getResumenAbonados(referenceDate = new Date()) {
  const active = abonadosDemo.filter((abonado) => abonado.estado === "active").length;
  const suspended = abonadosDemo.filter((abonado) => abonado.estado === "suspended").length;
  const blocked = abonadosDemo.filter((abonado) => abonado.estado === "blocked" || getCredenciales(abonado).some((credencial) => credencial.accesoBloqueado)).length;
  const vehiculosAutorizados = abonadosDemo.reduce((acc, abonado) => acc + getVehiculos(abonado).filter((vehiculo) => vehiculo.status === "authorized").length, 0);
  const credencialesVigentes = abonadosDemo.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => !isCredencialVencida(credencial, referenceDate) && credencial.estado === "active").length, 0);
  const credencialesPorVencer = abonadosDemo.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => isCredencialProximaAVencer(credencial, referenceDate)).length, 0);
  const accesosBloqueados = abonadosDemo.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => credencial.accesoBloqueado).length, 0);

  return {
    total: abonadosDemo.length,
    activos: active,
    suspendidos: suspended,
    bloqueados: blocked,
    vehiculosAutorizados,
    credencialesVigentes,
    credencialesPorVencer,
    accesosBloqueados,
  };
}

export function getTipoAbonadoLabel(tipo) {
  const labels = {
    individual: "Particular",
    company_employee: "Colaborador de empresa",
    resident: "Residente",
    tenant: "Arrendatario",
    supplier: "Proveedor",
    courtesy: "Cortesía",
    temporary: "Temporal",
    other: "Otro",
  };
  return labels[tipo] ?? tipo;
}

export function getEstadoAbonadoLabel(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    suspended: "Suspendido",
    pending: "Pendiente",
    expired: "Vencido",
    cancelled: "Cancelado",
    blocked: "Bloqueado",
  };
  return labels[estado] ?? estado;
}

export function getTipoCredencialLabel(tipo) {
  const labels = {
    license_plate: "Patente",
    rfid_card: "Tarjeta RFID",
    qr_code: "Código QR",
    qr_plate: "QR + Patente",
    mobile: "Credencial móvil",
    barcode: "Código de barras",
    pin: "PIN",
    biometric_reference: "Referencia biométrica",
    manual: "Autorización manual",
    other: "Otro",
  };
  return labels[tipo] ?? tipo;
}

export function getEstadoCredencialLabel(estado) {
  const labels = {
    active: "Activa",
    inactive: "Inactiva",
    suspended: "Suspendida",
    expired: "Vencida",
    revoked: "Revocada",
    lost: "Perdida",
    blocked: "Bloqueada",
    pending_activation: "Pendiente de activación",
  };
  return labels[estado] ?? estado;
}

export function getTipoVehiculoLabel(tipo) {
  const labels = {
    car: "Auto",
    motorcycle: "Motocicleta",
    van: "Van",
    truck: "Camión",
    bicycle: "Bicicleta",
    other: "Otro",
  };
  return labels[tipo] ?? tipo;
}

export function getEstadoVehiculoLabel(estado) {
  const labels = {
    authorized: "Autorizado",
    inactive: "Inactivo",
    blocked: "Bloqueado",
    pending: "Pendiente",
  };
  return labels[estado] ?? estado;
}

export function formatDate(value) {
  const date = parseDateValue(value);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

import { getEmpresaById } from "./empresas.mjs";
import { getEstacionamientoById } from "./estacionamientos.mjs";

export const usuariosDemo = [
  {
    id: "u-001",
    nombreCompleto: "María Elena Pérez",
    correo: "maria.perez@parkfacil.cl",
    telefono: "+56 9 8765 4321",
    empresaId: "e-001",
    organizationId: "org-001",
    perfilPrincipal: "platform_admin",
    perfilesSecundarios: ["company_admin", "auditor"],
    estado: "active",
    estacionamientos: ["p-001", "p-002"],
    ultimoAcceso: "Hace 10 minutos",
    fechaIncorporacion: "2024-01-16",
    preferencias: ["Notificaciones por correo", "Panel diario"],
    permisos: ["Gestión de módulos", "Consulta de inventario"],
    historial: ["Alta inicial", "Capacitación de supervisión"],
    actividad: ["Accedió al panel principal", "Revisó inventario"],
    observaciones: "Usuario con acceso ejecutivo y supervisión de varios estacionamientos.",
  },
  {
    id: "u-002",
    nombreCompleto: "Carlos Andrés Rojas",
    correo: "carlos.rojas@northmobility.co",
    telefono: "+57 4 5555 1234",
    empresaId: "e-002",
    organizationId: "org-002",
    perfilPrincipal: "parking_manager",
    perfilesSecundarios: ["operator"],
    estado: "pending",
    estacionamientos: ["p-003"],
    ultimoAcceso: "Sin uso aún",
    fechaIncorporacion: "2025-05-12",
    preferencias: ["Alertas de operación"],
    permisos: ["Gestión local", "Control de ingreso"],
    historial: ["Invitación enviada"],
    actividad: ["Pendiente de activación"],
    observaciones: "Usuario pendiente de activación en implementación.",
  },
  {
    id: "u-003",
    nombreCompleto: "Ana María Soto",
    correo: "ana.soto@plazasure.com",
    telefono: "+57 2 4444 8888",
    empresaId: "e-003",
    organizationId: "org-003",
    perfilPrincipal: "viewer",
    perfilesSecundarios: [],
    estado: "inactive",
    estacionamientos: [],
    ultimoAcceso: "Hace 2 meses",
    fechaIncorporacion: "2023-08-03",
    preferencias: ["Consulta mensual"],
    permisos: ["Solo lectura"],
    historial: ["Baja de referencia"],
    actividad: ["Último acceso histórico"],
    observaciones: "Usuario fuera de servicio con relación histórica.",
  },
  {
    id: "u-004",
    nombreCompleto: "Daniela Torres",
    correo: "daniela.torres@parkfacil.cl",
    telefono: "+56 2 1111 2222",
    empresaId: null,
    organizationId: null,
    perfilPrincipal: "support",
    perfilesSecundarios: ["viewer"],
    estado: "active",
    estacionamientos: ["p-001"],
    ultimoAcceso: "Hace 6 minutos",
    fechaIncorporacion: "2024-09-01",
    preferencias: ["Panel de soporte"],
    permisos: ["Soporte de incidentes"],
    historial: ["Alta de soporte"],
    actividad: ["Atendió incidente"],
    observaciones: "Usuario sin empresa asociada, con acceso a soporte.",
  },
  {
    id: "u-005",
    nombreCompleto: "Patricia González",
    cargo: "Administradora de estacionamientos",
    correo: "administracion@clinicaramis.cl",
    telefono: "+56 2 2300 0000",
    empresaId: "emp-ramis",
    organizationId: "org-ramis",
    perfilPrincipal: "company_admin",
    perfilesSecundarios: ["parking_manager"],
    estado: "active",
    estacionamientos: ["ramis-central", "ramis-norte", "ramis-urgencias"],
    ultimoAcceso: "Sin acceso registrado",
    fechaIncorporacion: "2026-01-01",
    preferencias: ["Alertas operacionales"],
    permisos: ["Administración de empresa", "Gestión de estacionamientos"],
    historial: ["Alta asociada a Clínica Ramis"],
    actividad: ["Sin actividad registrada"],
    observaciones: "Responsable administrativa de los estacionamientos de Clínica Ramis.",
  },
];

export function normalizeUserSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getUsuarioSearchValues(usuario) {
  const empresa = getEmpresaById(usuario.empresaId);
  const parkings = getEstacionamientosAsociados(usuario);
  return [
    usuario.nombreCompleto,
    usuario.cargo,
    usuario.correo,
    usuario.telefono,
    getPerfilLabel(usuario.perfilPrincipal),
    ...(usuario.perfilesSecundarios || []).map(getPerfilLabel),
    empresa?.razonSocial,
    empresa?.nombreFantasia,
    empresa ? `${empresa.rutNumero}-${empresa.rutDv}` : "",
    empresa?.contactoPrincipal,
    empresa?.representanteLegal,
    ...parkings.flatMap((parking) => [parking.nombre, parking.codigo]),
  ];
}

export function getUsuariosDemo() {
  return usuariosDemo;
}

export function getUsuarioById(id) {
  return usuariosDemo.find((usuario) => usuario.id === id) ?? null;
}

export function searchUsuarios(query) {
  const normalized = normalizeUserSearch(query);

  return usuariosDemo.filter((usuario) => {
    return getUsuarioSearchValues(usuario)
      .some((value) => normalizeUserSearch(value).includes(normalized));
  });
}

export function filterUsuariosByEstado(estado) {
  return usuariosDemo.filter((usuario) => usuario.estado === estado);
}

export function filterUsuariosByPerfil(perfil) {
  return usuariosDemo.filter((usuario) => usuario.perfilPrincipal === perfil);
}

export function filterUsuariosByEmpresa(empresaId) {
  return usuariosDemo.filter((usuario) => usuario.empresaId === empresaId);
}

export function filterUsuariosByEstacionamiento(estacionamientoId) {
  return usuariosDemo.filter((usuario) => usuario.estacionamientos.includes(estacionamientoId));
}

export function isUsuarioConMultiplesEstacionamientos(usuario) {
  return (usuario.estacionamientos || []).length > 1;
}

export function getEmpresaAsociada(usuario) {
  return usuario.empresaId ? getEmpresaById(usuario.empresaId) : null;
}

export function getEstacionamientosAsociados(usuario) {
  return (usuario.estacionamientos || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function getResumenUsuarios() {
  const summary = {
    total: usuariosDemo.length,
    active: 0,
    inactive: 0,
    pending: 0,
    multiplesEstacionamientos: 0,
  };

  usuariosDemo.forEach((usuario) => {
    summary[usuario.estado] += 1;
    if (isUsuarioConMultiplesEstacionamientos(usuario)) {
      summary.multiplesEstacionamientos += 1;
    }
  });

  return summary;
}

export function getPerfilLabel(perfil) {
  const labels = {
    platform_admin: "Administrador de plataforma",
    organization_admin: "Administrador de organización",
    company_admin: "Administrador de empresa",
    parking_manager: "Administrador de estacionamiento",
    operator: "Operador",
    cashier: "Cajero",
    auditor: "Auditor",
    support: "Soporte",
    viewer: "Solo lectura",
  };

  return labels[perfil] ?? perfil;
}

import { getEstacionamientoById } from "./estacionamientos.mjs";

export const empresasDemo = [
  {
    id: "e-001",
    razonSocial: "ParkFacil Operaciones Spa",
    nombreFantasia: "ParkFacil Operaciones",
    rutNumero: "4943377",
    rutDv: "8",
    giro: "Operación de estacionamientos",
    direccion: "Av. Apoquindo 1111",
    comuna: "Las Condes",
    ciudad: "Santiago",
    region: "Metropolitana",
    pais: "Chile",
    contactoPrincipal: "María Pérez",
    correo: "maria.perez@parkfacil.cl",
    telefono: "+56 2 2345 6789",
    representanteLegal: "Juan Pérez",
    estado: "active",
    tipoRelacion: "client",
    fechaIncorporacion: "2024-01-15",
    estacionamientos: ["p-001", "p-002"],
    usuarios: 14,
    contratos: ["Contrato base", "Contrato de expansión"],
    documentos: ["RUT", "Contrato"],
    historial: ["Alta inicial", "Implementación de módulos"],
    observaciones: "Empresa activa con operaciones en dos instalaciones.",
  },
  {
    id: "e-002",
    razonSocial: "Grupo Norte Mobility Ltda.",
    nombreFantasia: "Norte Mobility",
    rutNumero: "7654321",
    rutDv: "5",
    giro: "Gestión de movilidad",
    direccion: "Calle 80 1200",
    comuna: "Laureles",
    ciudad: "Medellín",
    region: "Antioquia",
    pais: "Colombia",
    contactoPrincipal: "Diego Rojas",
    correo: "diego.rojas@northmobility.co",
    telefono: "+57 4 3210 9876",
    representanteLegal: "Ana Rojas",
    estado: "onboarding",
    tipoRelacion: "operator",
    fechaIncorporacion: "2025-05-10",
    estacionamientos: ["p-003"],
    usuarios: 7,
    contratos: ["Contrato de implementación"],
    documentos: ["RUT", "Poder"],
    historial: ["Solicitud de implementación"],
    observaciones: "En proceso de incorporación al modelo base.",
  },
  {
    id: "e-003",
    razonSocial: "Administradora Plaza Sur S.A.",
    nombreFantasia: "Plaza Sur",
    rutNumero: "11223344",
    rutDv: "6",
    giro: "Administración de inmuebles",
    direccion: "Carrera 15 500",
    comuna: "San Fernando",
    ciudad: "Cali",
    region: "Valle del Cauca",
    pais: "Colombia",
    contactoPrincipal: "Sofía Morales",
    correo: "sofia@plazasure.com",
    telefono: "+57 2 5555 0000",
    representanteLegal: "Luis Morales",
    estado: "inactive",
    tipoRelacion: "administrator",
    fechaIncorporacion: "2023-08-01",
    estacionamientos: [],
    usuarios: 3,
    contratos: ["Contrato histórico"],
    documentos: ["RUT"],
    historial: ["Alta histórica", "Sin uso activo"],
    observaciones: "Empresa con relación histórica y sin operaciones actuales.",
  },
];

export function getEmpresasDemo() {
  return empresasDemo;
}

export function getEmpresaById(id) {
  return empresasDemo.find((empresa) => empresa.id === id) ?? null;
}

export function searchEmpresas(query) {
  const normalized = query.toLowerCase();

  return empresasDemo.filter((empresa) => {
    return [
      empresa.razonSocial,
      empresa.nombreFantasia,
      empresa.rutNumero,
      empresa.contactoPrincipal,
      empresa.correo,
      empresa.ciudad,
    ].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function filterEmpresasByEstado(estado) {
  return empresasDemo.filter((empresa) => empresa.estado === estado);
}

export function filterEmpresasByTipoRelacion(tipo) {
  return empresasDemo.filter((empresa) => empresa.tipoRelacion === tipo);
}

export function filterEmpresasByCiudad(ciudad) {
  return empresasDemo.filter((empresa) => empresa.ciudad === ciudad);
}

export function getEstacionamientosAsociados(empresa) {
  return (empresa.estacionamientos || []).map((id) => getEstacionamientoById(id)).filter(Boolean);
}

export function getResumenEmpresas() {
  const summary = {
    total: empresasDemo.length,
    active: 0,
    inactive: 0,
    onboarding: 0,
    conEstacionamientos: 0,
  };

  empresasDemo.forEach((empresa) => {
    summary[empresa.estado] += 1;
    if (empresa.estacionamientos.length > 0) {
      summary.conEstacionamientos += 1;
    }
  });

  return summary;
}

export function limpiarRut(rut) {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatearRut(rut) {
  const limpio = limpiarRut(rut);

  if (limpio.length < 2) {
    return limpio;
  }

  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${numero.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.")}-${dv}`;
}

export function construirRutCompleto(rutNumero, rutDv) {
  return `${rutNumero}-${rutDv}`;
}

export function validarRutEstructural(rutNumero, rutDv) {
  const limpioNumero = String(rutNumero).replace(/[^0-9]/g, "");
  const limpioDv = String(rutDv).replace(/[^0-9kK]/g, "").toUpperCase();

  if (!limpioNumero || !limpioDv) {
    return false;
  }

  if (!/^\d{1,8}$/.test(limpioNumero)) {
    return false;
  }

  const factor = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let index = 0;
  const reversed = limpioNumero.split("").reverse().join("");

  for (const digit of reversed) {
    suma += Number(digit) * factor[index % factor.length];
    index += 1;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);

  return dvEsperado === limpioDv;
}

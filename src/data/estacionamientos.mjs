export const estacionamientosDemo = [
  {
    id: "p-001",
    nombre: "Parking Centro",
    codigo: "PC-001",
    direccion: "Av. Principal 123",
    ciudad: "Bogotá",
    capacidad: 240,
    estado: "Activo",
    accesos: 6,
    dispositivos: 18,
    horarios: "24/7",
    zonas: "A, B, C",
    niveles: 3,
    salidas: 4,
    estadoOperacional: "Operativo",
  },
  {
    id: "p-002",
    nombre: "Parking Norte",
    codigo: "PN-002",
    direccion: "Calle 80 #12-45",
    ciudad: "Medellín",
    capacidad: 180,
    estado: "Mantenimiento",
    accesos: 4,
    dispositivos: 12,
    horarios: "06:00 - 22:00",
    zonas: "Norte",
    niveles: 2,
    salidas: 2,
    estadoOperacional: "En revisión",
  },
  {
    id: "p-003",
    nombre: "Parking Sur",
    codigo: "PS-003",
    direccion: "Carrera 15 #20-10",
    ciudad: "Cali",
    capacidad: 320,
    estado: "Inactivo",
    accesos: 3,
    dispositivos: 9,
    horarios: "08:00 - 20:00",
    zonas: "Sur",
    niveles: 2,
    salidas: 2,
    estadoOperacional: "Suspendido",
  },
];

export function getEstacionamientosDemo() {
  return estacionamientosDemo;
}

export function getEstacionamientoById(id) {
  return estacionamientosDemo.find((estacionamiento) => estacionamiento.id === id) ?? null;
}

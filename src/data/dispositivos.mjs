import { getEstacionamientoById, getEstacionamientosDemo } from "./estacionamientos.mjs";

export const dispositivosDemo = [
  {
    id: "d-001",
    nombre: "Cámara LPR Norte",
    codigo: "DEV-001",
    tipo: "Cámara LPR",
    marca: "Hikvision",
    modelo: "DS-2CD2X",
    estacionamientoId: "p-001",
    ubicacion: "Entrada principal",
    estado: "active",
    conexion: "online",
    ip: "10.10.10.21",
    firmware: "V4.8.2",
    ultimaComunicacion: "Hace 2 min",
    descripcion: "Monitoreo de acceso vehicular y lectura de placas.",
    mantenimiento: "Programado mensual",
    historial: ["Instalado en 2024", "Revisión de lente en junio"],
    alertas: ["Sin alertas"],
    estadoOperacional: "Operativo",
    configuracion: ["Detección por IA", "Registro de eventos"],
  },
  {
    id: "d-002",
    nombre: "Barrera de acceso",
    codigo: "DEV-002",
    tipo: "Barrera",
    marca: "FAAC",
    modelo: "SLIM 4",
    estacionamientoId: "p-002",
    ubicacion: "Control de ingresos",
    estado: "maintenance",
    conexion: "warning",
    ip: "10.10.10.42",
    firmware: "V3.1.0",
    ultimaComunicacion: "Hace 12 min",
    descripcion: "Control de barrera para ingresos y salidas.",
    mantenimiento: "Revisión pendiente",
    historial: ["Reemplazo de sensor", "Prueba de cierre"],
    alertas: ["Latencia en comunicación"],
    estadoOperacional: "Requiere revisión",
    configuracion: ["Modo manual", "Cierre automático"],
  },
  {
    id: "d-003",
    nombre: "Terminal POS Sur",
    codigo: "DEV-003",
    tipo: "Terminal POS",
    marca: "Ingenico",
    modelo: "Lane 3000",
    estacionamientoId: "sin-asignar",
    ubicacion: "Caja de cobro",
    estado: "inactive",
    conexion: "offline",
    ip: null,
    firmware: "V2.4.7",
    ultimaComunicacion: "Hace 3 horas",
    descripcion: "Terminal para cobros y control de pagos.",
    mantenimiento: "Etapa futura",
    historial: ["Configuración inicial"],
    alertas: ["Sin comunicación"],
    estadoOperacional: "Fuera de servicio",
    configuracion: ["Modo offline", "Sin sincronización"],
  },
  {
    id: "d-004",
    nombre: "Lector QR Torre",
    codigo: "DEV-004",
    tipo: "Lector QR",
    marca: "Axis",
    modelo: "QR-100",
    estacionamientoId: "p-003",
    ubicacion: "Nivel 2",
    estado: "active",
    conexion: "online",
    ip: "10.10.10.88",
    firmware: "V1.2.0",
    ultimaComunicacion: "Hace 1 min",
    descripcion: "Lectura de códigos QR para acceso de usuarios.",
    mantenimiento: "Sin incidencias",
    historial: ["Instalado en 2025"],
    alertas: ["Sin alertas"],
    estadoOperacional: "Operativo",
    configuracion: ["Autenticación rápida"],
  },
  {
    id: "d-005",
    nombre: "Sensor de ocupación",
    codigo: "DEV-005",
    tipo: "Sensor",
    marca: "Parker",
    modelo: "SENS-8",
    estacionamientoId: "p-001",
    ubicacion: "Nivel 1",
    estado: "retired",
    conexion: "unknown",
    ip: "10.10.10.111",
    firmware: "V0.9.8",
    ultimaComunicacion: "Hace 1 día",
    descripcion: "Sensor de ocupación de plazas.",
    mantenimiento: "Etapa futura",
    historial: ["Retirado del inventario"],
    alertas: ["Sin uso"],
    estadoOperacional: "Retirado",
    configuracion: ["Modo legado"],
  },
];

export function getDispositivosDemo() {
  return dispositivosDemo;
}

export function getDispositivoById(id) {
  return dispositivosDemo.find((dispositivo) => dispositivo.id === id) ?? null;
}

export function filterDispositivosByType(tipo) {
  return dispositivosDemo.filter((dispositivo) => dispositivo.tipo === tipo);
}

export function filterDispositivosByEstado(estado) {
  return dispositivosDemo.filter((dispositivo) => dispositivo.estado === estado);
}

export function filterDispositivosByConexion(conexion) {
  return dispositivosDemo.filter((dispositivo) => dispositivo.conexion === conexion);
}

export function searchDispositivos(query) {
  const normalized = query.toLowerCase();

  return dispositivosDemo.filter((dispositivo) => {
    return [
      dispositivo.nombre,
      dispositivo.codigo,
      dispositivo.marca,
      dispositivo.modelo,
      getEstacionamientoById(dispositivo.estacionamientoId)?.nombre || "",
    ].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function getResumenEstados() {
  const summary = {
    total: dispositivosDemo.length,
    active: 0,
    inactive: 0,
    maintenance: 0,
    retired: 0,
    alertas: 0,
  };

  dispositivosDemo.forEach((dispositivo) => {
    summary[dispositivo.estado] += 1;
    if (dispositivo.alertas.some((alerta) => alerta !== "Sin alertas")) {
      summary.alertas += 1;
    }
  });

  return summary;
}

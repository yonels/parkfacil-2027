import {
  Activity,
  BadgeDollarSign,
  Banknote,
  Building2,
  Camera,
  Car,
  ChartColumn,
  CircleCheckBig,
  Clock3,
  CreditCard,
  FileSignature,
  Files,
  Gauge,
  Handshake,
  HardHat,
  History,
  Info,
  Keyboard,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map,
  MonitorCog,
  NotebookTabs,
  PanelTop,
  ParkingSquare,
  QrCode,
  RadioTower,
  ReceiptText,
  Route,
  ScanLine,
  Settings,
  SquareParking,
  TicketPercent,
  TriangleAlert,
  UserCheck,
  UserCog,
  Users,
  WalletCards,
  Warehouse,
  Wrench,
} from "lucide-react";

export const ICON_REGISTRY = {
  Activity,
  BadgeDollarSign,
  Banknote,
  Building2,
  Camera,
  Car,
  ChartColumn,
  CircleCheckBig,
  Clock3,
  CreditCard,
  FileSignature,
  Files,
  Gauge,
  Handshake,
  HardHat,
  History,
  Info,
  Keyboard,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map,
  MonitorCog,
  NotebookTabs,
  PanelTop,
  ParkingSquare,
  QrCode,
  RadioTower,
  ReceiptText,
  Route,
  ScanLine,
  Settings,
  SquareParking,
  TicketPercent,
  TriangleAlert,
  UserCheck,
  UserCog,
  Users,
  WalletCards,
  Warehouse,
  Wrench,
};

const DEFAULT_ACTIONS = {
  default_object: ["Ver", "Editar", "Historial", "Configurar"],
  dispositivo: ["Ver", "Editar", "Historial", "Configurar"],
  operador: ["Ver", "Editar", "Ver turnos", "Desactivar"],
  caja: ["Ver", "Editar", "Historial", "Configurar"],
  turno: ["Ver", "Editar", "Historial", "Configurar"],
  plan_comercial: ["Ver", "Editar", "Historial", "Configurar"],
};

function createDefinition(input) {
  return {
    id: input.id,
    type: input.type,
    label: input.label,
    icon: input.icon,
    description: input.description || "",
    parent: input.parent || null,
    children: [],
    properties: input.properties || {},
    actions: input.actions || DEFAULT_ACTIONS[input.type] || DEFAULT_ACTIONS.default_object,
    relationships: input.relationships || [],
    status: input.status || "demo",
    permissions: input.permissions || ["read"],
    visible: input.visible !== false,
    expanded: Boolean(input.expanded),
    badge: input.badge || "",
    searchable: input.searchable !== false,
    sortable: input.sortable !== false,
    metadata: {
      updatedAt: input.metadata?.updatedAt || "2026-08-09 11:00",
      category: input.metadata?.category || "OBJETO",
      secondary: input.metadata?.secondary || "",
      searchableTags: input.metadata?.searchableTags || [],
      targetObjectId: input.metadata?.targetObjectId || null,
      ...input.metadata,
    },
  };
}

function add(definitions, value) {
  definitions.push(createDefinition(value));
}

function addRelationshipBranches(definitions, sourceId, branches) {
  const rootId = `${sourceId}-relaciones`;
  add(definitions, {
    id: rootId,
    type: "contenedor_relaciones",
    label: "Relaciones",
    icon: "Route",
    parent: sourceId,
    description: "Relaciones del objeto",
    status: "ok",
    metadata: { category: "CONTENEDOR", secondary: `${branches.length} grupos` },
    expanded: true,
  });

  branches.forEach((branch) => {
    const branchId = `${rootId}-${branch.key}`;
    add(definitions, {
      id: branchId,
      type: "contenedor_relaciones",
      label: branch.label,
      icon: branch.icon,
      parent: rootId,
      description: `Relacion ${branch.label}`,
      status: "ok",
      metadata: { category: "CONTENEDOR" },
      expanded: true,
    });

    branch.targets.forEach((target, index) => {
      add(definitions, {
        id: `${branchId}-${index + 1}`,
        type: "referencia_relacion",
        label: target.label,
        icon: target.icon,
        parent: branchId,
        description: `Referencia a ${target.label}`,
        status: "info",
        actions: ["Abrir objeto"],
        metadata: {
          category: "OBJETO",
          secondary: "Referencia",
          targetObjectId: target.targetObjectId,
          searchableTags: [target.label],
        },
      });
    });
  });
}

function addCompany(definitions) {
  add(definitions, {
    id: "company-5q",
    type: "empresa",
    label: "Inmobiliaria 5Q",
    icon: "Building2",
    description: "Empresa principal demo",
    status: "activa",
    properties: {
      identity: {
        Nombre: "Inmobiliaria 5Q",
        Tipo: "Empresa",
        Estado: "Activa",
        Codigo: "EMP-5Q",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
      },
      assignment: {
        "Asignado a": "Equipo central",
        Rol: "Corporativo",
        "Fecha de asignacion": "01-08-2026",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Fee mensual": "Demo",
        Condicion: "Cliente activo",
        "Fecha contractual": "01-07-2026",
      },
      operational: {
        Estado: "Operativa",
        "Ultima operacion": "Hoy 10:59",
      },
    },
    permissions: ["read", "write"],
    metadata: { category: "EMPRESA", searchableTags: ["empresa", "5q"] },
    expanded: true,
  });

  [
    ["general", "Informacion General", "Info", "empresa_info"],
    ["contrato", "Contrato", "FileSignature", "contrato"],
    ["plan", "Plan Comercial", "BadgeDollarSign", "plan_comercial_root"],
    ["usuarios", "Usuarios", "Users", "usuario"],
    ["abonados", "Abonados", "UserCheck", "abonado"],
    ["convenios", "Convenios", "Handshake", "convenio"],
    ["facturacion", "Facturacion", "ReceiptText", "facturacion"],
  ].forEach(([suffix, label, icon, type]) => {
    add(definitions, {
      id: `company-5q-${suffix}`,
      type,
      label,
      icon,
      parent: "company-5q",
      description: `${label} de empresa`,
      status: "ok",
      properties: {
        identity: {
          Nombre: label,
          Tipo: "Objeto empresa",
          Estado: "Activo",
          Codigo: `EMP-${suffix.toUpperCase()}`,
        },
      },
      metadata: { category: "OBJETO" },
      expanded: suffix === "plan",
    });
  });

  add(definitions, {
    id: "plan-enterprise",
    type: "plan_comercial",
    label: "Enterprise",
    icon: "BadgeDollarSign",
    parent: "company-5q-plan",
    description: "Plan comercial corporativo",
    status: "activo",
    properties: {
      identity: {
        Nombre: "Enterprise",
        Tipo: "Plan Comercial",
        Estado: "Activo",
        Codigo: "PLAN-ENT-01",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
      },
      assignment: {
        "Asignado a": "Inmobiliaria 5Q",
        Rol: "Plan corporativo",
        "Fecha de asignacion": "01-07-2026",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Incluido en fee mensual": "Si",
        "Cargo adicional": "LPR Norte",
        "Fecha contractual": "01-07-2026",
      },
      operational: {
        Estado: "Activo",
        "Ultima operacion": "Hoy 10:55",
      },
    },
    relationships: [
      { type: "PART_OF_PLAN", label: "POS TUU-01", targetObjectId: "device-pos-tuu-01" },
      { type: "PART_OF_PLAN", label: "POS TUU-02", targetObjectId: "device-pos-tuu-02" },
      { type: "PART_OF_PLAN", label: "PC Webpay-01", targetObjectId: "device-pc-webpay-01" },
      { type: "PART_OF_PLAN", label: "Gateway Principal", targetObjectId: "device-gateway-principal" },
      { type: "PART_OF_PLAN", label: "LPR Entrada Norte", targetObjectId: "device-lpr-entrada-norte" },
    ],
    metadata: { category: "OBJETO", secondary: "Fee mensual demo", searchableTags: ["enterprise", "plan comercial"] },
  });
}

function addParkingHierarchy(definitions) {
  add(definitions, {
    id: "company-5q-estacionamientos",
    type: "estacionamientos",
    label: "ESTACIONAMIENTOS",
    icon: "SquareParking",
    parent: "company-5q",
    description: "Organizador de estacionamientos",
    status: "ok",
    metadata: { category: "CONTENEDOR" },
    expanded: true,
  });

  add(definitions, {
    id: "company-5q-offstreet",
    type: "off_street",
    label: "OFF STREET",
    icon: "Warehouse",
    parent: "company-5q-estacionamientos",
    description: "Parking fuera de calle",
    status: "ok",
    metadata: { category: "CONTENEDOR", searchableTags: ["off street"] },
    expanded: true,
  });

  add(definitions, {
    id: "company-5q-onstreet",
    type: "on_street",
    label: "ON STREET",
    icon: "Route",
    parent: "company-5q-estacionamientos",
    description: "Parking en via publica",
    status: "ok",
    metadata: { category: "CONTENEDOR", searchableTags: ["on street"] },
  });

  [
    ["off-centro", "Estacionamiento Centro", "5Q-CEN", "122", "68%", "2"],
    ["off-ramis", "Clinica Ramis", "CR-CEN", "38", "76%", "1"],
    ["off-mall", "Mall Plaza", "MP-001", "412", "84%", "3"],
  ].forEach(([id, label, code, vehicles, occupancy, alerts]) => {
    add(definitions, {
      id,
      type: "estacionamiento",
      label,
      icon: "ParkingSquare",
      parent: "company-5q-offstreet",
      description: "Estacionamiento OFF STREET",
      status: "operativo",
      properties: {
        identity: {
          Nombre: label,
          Tipo: "Estacionamiento",
          Estado: "Operativo",
          Codigo: code,
        },
        location: {
          Empresa: "Inmobiliaria 5Q",
          Estacionamiento: label,
          "Sector / Nivel / Caseta": "Caseta Norte",
        },
        assignment: {
          "Asignado a": "Equipo operativo",
          Rol: "Operacion",
          "Fecha de asignacion": "01-08-2026",
          "Turno actual": "Turno Manana",
          "Caja asociada": "Caja Principal",
        },
        commercial: {
          "Plan Comercial": "Enterprise",
          "Incluido en fee mensual": "Si",
          "Cargo adicional": alerts === "3" ? "LPR Norte" : "No",
          "Fecha contractual": "01-07-2026",
        },
        operational: {
          "Online / Offline": "Online",
          "Ultima conexion": "Hace 20 segundos",
          "Ultima operacion": "Hoy 10:58",
          Alerta: `${alerts} pendiente(s)`,
          "Vehiculos dentro": vehicles,
          Ocupacion: occupancy,
          "Turnos activos": "2",
          "Dispositivos online": "14/15",
        },
      },
      metadata: { category: "ESTACIONAMIENTO", searchableTags: [label, "estacionamiento"] },
      expanded: id === "off-centro",
    });
  });

  [
    ["on-providencia", "Providencia Centro", "ON-PROV"],
    ["on-santiago", "Santiago Centro", "ON-STGO"],
    ["on-las-condes", "Las Condes", "ON-LC"],
  ].forEach(([id, label, code]) => {
    add(definitions, {
      id,
      type: "estacionamiento",
      label,
      icon: "Map",
      parent: "company-5q-onstreet",
      description: "Estacionamiento ON STREET",
      status: "operativo",
      properties: {
        identity: {
          Nombre: label,
          Tipo: "Estacionamiento",
          Estado: "Operativo",
          Codigo: code,
        },
      },
      metadata: { category: "ESTACIONAMIENTO", searchableTags: [label] },
    });
  });
}

function addCoreOperationalTree(definitions) {
  const parent = "off-centro";

  [
    ["resumen", "Resumen", "LayoutDashboard", "resumen"],
    ["configuracion", "Configuracion", "Settings", "configuracion"],
    ["operacion", "Operacion Diaria", "Activity", "operacion_diaria"],
    ["recaudacion", "Recaudacion", "Banknote", "recaudacion"],
    ["reportes", "Reportes", "ChartColumn", "reporte"],
    ["administracion", "Administracion", "Wrench", "administracion"],
    ["activacion", "Activacion", "CircleCheckBig", "activacion"],
  ].forEach(([suffix, label, icon, type]) => {
    add(definitions, {
      id: `${parent}-${suffix}`,
      type,
      label,
      icon,
      parent,
      description: `${label} del estacionamiento`,
      status: suffix === "activacion" ? "pendiente" : "ok",
      properties: {
        identity: {
          Nombre: label,
          Tipo: "Contenedor",
          Estado: "Activo",
          Codigo: `CNT-${suffix.toUpperCase()}`,
        },
      },
      metadata: { category: "CONTENEDOR" },
      expanded: suffix === "configuracion" || suffix === "operacion",
    });
  });

  add(definitions, {
    id: "off-centro-operacion-data-entry",
    type: "data_entry",
    label: "Data Entry",
    icon: "Keyboard",
    parent: "off-centro-operacion",
    description: "Captura operativa",
    status: "ok",
    properties: {
      identity: {
        Nombre: "Data Entry",
        Tipo: "Operacion",
        Estado: "Activo",
        Codigo: "DE-CEN-01",
      },
    },
    metadata: { category: "CONTENEDOR", searchableTags: ["data entry"] },
    expanded: true,
  });

  [
    ["ingreso", "Ingreso", "LogIn"],
    ["salida", "Salida", "LogOut"],
    ["vehiculos-dentro", "Vehiculos dentro", "Car"],
    ["codigo-qr", "Codigo QR", "QrCode"],
    ["consulta-patente", "Consulta Patente", "ScanLine"],
  ].forEach(([suffix, label, icon]) => {
    add(definitions, {
      id: `off-centro-data-${suffix}`,
      type: "data_entry_item",
      label,
      icon,
      parent: "off-centro-operacion-data-entry",
      description: `Subflujo ${label}`,
      status: "ok",
      properties: { identity: { Nombre: label, Tipo: "Data Entry", Estado: "Activo", Codigo: `DE-${suffix}` } },
      metadata: { category: "OBJETO", searchableTags: [label] },
    });
  });

  add(definitions, {
    id: "off-centro-turnos",
    type: "turno_root",
    label: "Turnos",
    icon: "Clock3",
    parent: "off-centro-operacion",
    description: "Turnos de operacion",
    status: "ok",
    properties: {
      identity: {
        Nombre: "Turnos",
        Tipo: "Contenedor",
        Estado: "Activo",
        Codigo: "TUR-CEN",
      },
      operational: {
        "Turnos activos": "1",
        Programados: "2",
        "Cerrados hoy": "0",
      },
    },
    metadata: { category: "CONTENEDOR" },
    expanded: true,
  });

  add(definitions, {
    id: "off-centro-cajas",
    type: "caja_root",
    label: "Cajas",
    icon: "WalletCards",
    parent: "off-centro-operacion",
    description: "Cajas operativas",
    status: "ok",
    properties: { identity: { Nombre: "Cajas", Tipo: "Contenedor", Estado: "Activo", Codigo: "CAJ-CEN" } },
    metadata: { category: "CONTENEDOR" },
    expanded: true,
  });

  add(definitions, {
    id: "off-centro-operadores-activos",
    type: "operador_root",
    label: "Operadores Activos",
    icon: "UserCheck",
    parent: "off-centro-operacion",
    description: "Operadores en servicio",
    status: "ok",
    properties: {
      operational: {
        Activos: "5",
        Supervisores: "1",
      },
    },
    metadata: { category: "OBJETO", searchableTags: ["operadores activos"] },
  });

  add(definitions, {
    id: "off-centro-incidencias",
    type: "incidencia",
    label: "Incidencias",
    icon: "TriangleAlert",
    parent: "off-centro-operacion",
    description: "Incidencias abiertas",
    status: "alerta",
    properties: {
      operational: {
        Abiertas: "2",
        Criticas: "0",
      },
    },
    metadata: { category: "OBJETO" },
  });

  add(definitions, {
    id: "off-centro-dispositivos",
    type: "dispositivo_root",
    label: "Dispositivos",
    icon: "MonitorCog",
    parent: "off-centro-configuracion",
    description: "Inventario de dispositivos",
    status: "ok",
    properties: {
      operational: {
        Online: "14/15",
        Offline: "1",
      },
    },
    metadata: { category: "CONTENEDOR" },
    expanded: true,
  });

  [
    ["pos", "POS", "CreditCard"],
    ["pc", "PC", "MonitorCog"],
    ["barreras", "Barreras", "PanelTop"],
    ["lpr", "LPR", "ScanLine"],
    ["camaras", "Camaras", "Camera"],
    ["sensores", "Sensores", "RadioTower"],
    ["gateway", "Gateway", "MonitorCog"],
  ].forEach(([suffix, label, icon]) => {
    add(definitions, {
      id: `off-centro-dispositivos-${suffix}`,
      type: "dispositivo_tipo",
      label,
      icon,
      parent: "off-centro-dispositivos",
      description: `Subgrupo ${label}`,
      status: "ok",
      properties: { identity: { Nombre: label, Tipo: "Subgrupo", Estado: "Activo", Codigo: `DEV-${suffix.toUpperCase()}` } },
      metadata: { category: "CONTENEDOR" },
      expanded: suffix === "pos" || suffix === "pc" || suffix === "barreras" || suffix === "lpr" || suffix === "camaras" || suffix === "sensores" || suffix === "gateway",
    });
  });
}

function addCoreObjects(definitions) {
  add(definitions, {
    id: "operador-juan-perez",
    type: "operador",
    label: "Juan Perez",
    icon: "UserCog",
    parent: "off-centro-configuracion",
    description: "Operador principal",
    status: "activo",
    properties: {
      identity: {
        Nombre: "Juan Perez",
        Tipo: "Operador",
        Estado: "Activo",
        Codigo: "OP-JP-01",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
        Estacionamiento: "Estacionamiento Centro",
        "Sector / Nivel / Caseta": "Caseta Norte",
      },
      assignment: {
        "Asignado a": "Caja Principal",
        Rol: "Operador",
        "Fecha de asignacion": "01-08-2026",
        "Turno actual": "Turno Manana",
        "Caja asociada": "Caja Principal",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Incluido en fee mensual": "Si",
        "Cargo adicional": "No",
        "Fecha contractual": "01-07-2026",
      },
      operational: {
        "Online / Offline": "Online",
        "Ultima conexion": "Hace 20 segundos",
        "Ultima operacion": "Cobro ticket 10:57",
        Alerta: "Sin alertas",
      },
    },
    relationships: [
      { type: "CURRENT_SHIFT", label: "Turno Manana", targetObjectId: "turno-manana" },
      { type: "CURRENT_CASH_REGISTER", label: "Caja Principal", targetObjectId: "caja-principal" },
      { type: "USES", label: "POS TUU-01", targetObjectId: "device-pos-tuu-01" },
      { type: "PART_OF_PLAN", label: "Enterprise", targetObjectId: "plan-enterprise" },
    ],
    actions: DEFAULT_ACTIONS.operador,
    metadata: { category: "OBJETO", searchableTags: ["juan perez", "operador"] },
  });

  add(definitions, {
    id: "turno-manana",
    type: "turno",
    label: "Turno Manana",
    icon: "Clock3",
    parent: "off-centro-turnos",
    description: "Turno activo",
    status: "activo",
    properties: {
      identity: {
        Nombre: "Turno Manana",
        Tipo: "Turno",
        Estado: "Activo",
        Codigo: "TUR-MAN-01",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
        Estacionamiento: "Estacionamiento Centro",
        "Sector / Nivel / Caseta": "Caseta Norte",
      },
      assignment: {
        "Asignado a": "Juan Perez",
        Rol: "Operador",
        "Fecha de asignacion": "01-08-2026",
        "Turno actual": "Turno Manana",
        "Caja asociada": "Caja Principal",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Incluido en fee mensual": "Si",
        "Cargo adicional": "No",
        "Fecha contractual": "01-07-2026",
      },
      operational: {
        "Online / Offline": "Online",
        "Ultima conexion": "Hace 15 segundos",
        "Ultima operacion": "Ticket emitido 10:59",
        Alerta: "Sin alertas",
      },
    },
    relationships: [
      { type: "OPERATED_BY", label: "Juan Perez", targetObjectId: "operador-juan-perez" },
      { type: "CURRENT_CASH_REGISTER", label: "Caja Principal", targetObjectId: "caja-principal" },
      { type: "USES", label: "POS TUU-01", targetObjectId: "device-pos-tuu-01" },
      { type: "LOCATED_IN", label: "Estacionamiento Centro", targetObjectId: "off-centro" },
    ],
    actions: DEFAULT_ACTIONS.turno,
    metadata: { category: "OBJETO", searchableTags: ["turno manana"] },
  });

  add(definitions, {
    id: "turno-tarde",
    type: "turno",
    label: "Turno Tarde",
    icon: "Clock3",
    parent: "off-centro-turnos",
    description: "Turno programado",
    status: "programado",
    properties: { identity: { Nombre: "Turno Tarde", Tipo: "Turno", Estado: "Programado", Codigo: "TUR-TAR-01" } },
    metadata: { category: "OBJETO" },
  });

  add(definitions, {
    id: "turno-noche",
    type: "turno",
    label: "Turno Noche",
    icon: "Clock3",
    parent: "off-centro-turnos",
    description: "Turno programado",
    status: "programado",
    properties: { identity: { Nombre: "Turno Noche", Tipo: "Turno", Estado: "Programado", Codigo: "TUR-NOC-01" } },
    metadata: { category: "OBJETO" },
  });

  add(definitions, {
    id: "caja-principal",
    type: "caja",
    label: "Caja Principal",
    icon: "Landmark",
    parent: "off-centro-cajas",
    description: "Caja operativa principal",
    status: "abierta",
    properties: {
      identity: {
        Nombre: "Caja Principal",
        Tipo: "Caja",
        Estado: "Abierta",
        Codigo: "CAJ-PRI-01",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
        Estacionamiento: "Estacionamiento Centro",
        "Sector / Nivel / Caseta": "Caseta Norte",
      },
      assignment: {
        "Asignado a": "Juan Perez",
        Rol: "Operador",
        "Fecha de asignacion": "01-08-2026",
        "Turno actual": "Turno Manana",
        "Caja asociada": "Caja Principal",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Incluido en fee mensual": "Si",
        "Cargo adicional": "No",
        "Fecha contractual": "01-07-2026",
        "Medios habilitados": "Efectivo, Webpay, POS",
      },
      operational: {
        "Online / Offline": "Online",
        "Ultima conexion": "Hace 18 segundos",
        "Ultima operacion": "Cobro ticket 10:58",
        Alerta: "Sin alertas",
      },
    },
    relationships: [
      { type: "LOCATED_IN", label: "Caseta Norte", targetObjectId: "ubicacion-caseta-norte" },
      { type: "OPERATED_BY", label: "Juan Perez", targetObjectId: "operador-juan-perez" },
      { type: "CURRENT_SHIFT", label: "Turno Manana", targetObjectId: "turno-manana" },
      { type: "USES", label: "POS TUU-01", targetObjectId: "device-pos-tuu-01" },
      { type: "USES", label: "PC Webpay-01", targetObjectId: "device-pc-webpay-01" },
      { type: "USES", label: "Impresora Epson TM-T20", targetObjectId: "device-printer-epson" },
      { type: "USES", label: "Lector QR", targetObjectId: "device-reader-qr" },
      { type: "PART_OF_PLAN", label: "Enterprise", targetObjectId: "plan-enterprise" },
    ],
    actions: DEFAULT_ACTIONS.caja,
    metadata: { category: "OBJETO", searchableTags: ["caja principal"] },
    expanded: true,
  });

  add(definitions, {
    id: "caja-secundaria",
    type: "caja",
    label: "Caja Secundaria",
    icon: "Landmark",
    parent: "off-centro-cajas",
    description: "Caja operacional secundaria",
    status: "abierta",
    properties: {
      identity: { Nombre: "Caja Secundaria", Tipo: "Caja", Estado: "Abierta", Codigo: "CAJ-SEC-01" },
    },
    metadata: { category: "OBJETO" },
  });

  add(definitions, {
    id: "caja-visitas",
    type: "caja",
    label: "Caja Visitas",
    icon: "Landmark",
    parent: "off-centro-cajas",
    description: "Caja visitas",
    status: "programado",
    properties: {
      identity: { Nombre: "Caja Visitas", Tipo: "Caja", Estado: "Programada", Codigo: "CAJ-VIS-01" },
    },
    metadata: { category: "OBJETO" },
  });

  // Devices
  add(definitions, {
    id: "device-pos-tuu-01",
    type: "dispositivo",
    label: "POS TUU-01",
    icon: "CreditCard",
    parent: "off-centro-dispositivos-pos",
    description: "POS Android TUU Pro",
    status: "online",
    properties: {
      identity: {
        Nombre: "POS TUU-01",
        Tipo: "POS Android",
        Estado: "Online",
        Codigo: "DEV-POS-01",
        Modelo: "TUU Pro",
      },
      location: {
        Empresa: "Inmobiliaria 5Q",
        Estacionamiento: "Estacionamiento Centro",
        "Sector / Nivel / Caseta": "Caja Principal · Caseta Norte",
      },
      assignment: {
        "Asignado a": "Juan Perez",
        Rol: "Operador",
        "Fecha de asignacion": "01-08-2026",
        "Turno actual": "Turno Manana",
        "Caja asociada": "Caja Principal",
        Correo: "juan.perez@empresa.cl",
        Telefono: "+56 9 5555 1111",
      },
      commercial: {
        "Plan Comercial": "Enterprise",
        "Incluido en fee mensual": "Si",
        "Cargo adicional": "No",
        "Fecha contractual": "01-07-2026",
      },
      operational: {
        "Online / Offline": "Online",
        "Ultima conexion": "Hace 15 segundos",
        "Ultima operacion": "Ticket emitido 10:59",
        Alerta: "Sin alertas",
      },
    },
    relationships: [
      { type: "LOCATED_IN", label: "Estacionamiento Centro", targetObjectId: "off-centro" },
      { type: "CURRENT_CASH_REGISTER", label: "Caja Principal", targetObjectId: "caja-principal" },
      { type: "ASSIGNED_TO", label: "Juan Perez", targetObjectId: "operador-juan-perez" },
      { type: "CURRENT_SHIFT", label: "Turno Manana", targetObjectId: "turno-manana" },
      { type: "PART_OF_PLAN", label: "Enterprise", targetObjectId: "plan-enterprise" },
    ],
    actions: DEFAULT_ACTIONS.dispositivo,
    metadata: { category: "OBJETO", searchableTags: ["pos tuu-01", "juan perez", "turno manana", "caja principal"] },
    expanded: true,
  });

  add(definitions, {
    id: "device-pos-tuu-02",
    type: "dispositivo",
    label: "POS TUU-02",
    icon: "CreditCard",
    parent: "off-centro-dispositivos-pos",
    description: "POS Android",
    status: "online",
    properties: { identity: { Nombre: "POS TUU-02", Tipo: "POS Android", Estado: "Online", Codigo: "DEV-POS-02" } },
    metadata: { category: "OBJETO" },
  });

  add(definitions, {
    id: "device-pc-webpay-01",
    type: "dispositivo",
    label: "PC Webpay-01",
    icon: "MonitorCog",
    parent: "off-centro-dispositivos-pc",
    description: "PC operacional de cobro",
    status: "online",
    properties: {
      identity: { Nombre: "PC Webpay-01", Tipo: "PC Operacional", Estado: "Online", Codigo: "DEV-PC-01", Sistema: "Windows" },
      location: { Empresa: "Inmobiliaria 5Q", Estacionamiento: "Estacionamiento Centro", "Sector / Nivel / Caseta": "Caja Secundaria · Nivel -1" },
      assignment: { "Asignado a": "Maria Soto", "Caja asociada": "Caja Secundaria", "Medio de pago": "Webpay", Impresora: "Epson TM-T20" },
      commercial: { "Plan Comercial": "Enterprise", "Incluido en fee mensual": "Si", "Cargo adicional": "No" },
      operational: { "Online / Offline": "Online", "Ultima conexion": "Hace 1 minuto", "Ultima operacion": "Pago webpay 10:53" },
    },
    relationships: [
      { type: "LOCATED_IN", label: "Caja Secundaria", targetObjectId: "caja-secundaria" },
      { type: "PART_OF_PLAN", label: "Enterprise", targetObjectId: "plan-enterprise" },
    ],
    actions: DEFAULT_ACTIONS.dispositivo,
    metadata: { category: "OBJETO", searchableTags: ["pc webpay-01"] },
  });

  add(definitions, {
    id: "device-pc-admin",
    type: "dispositivo",
    label: "PC Administracion",
    icon: "MonitorCog",
    parent: "off-centro-dispositivos-pc",
    description: "PC de administracion",
    status: "online",
    properties: { identity: { Nombre: "PC Administracion", Tipo: "PC", Estado: "Online", Codigo: "DEV-PC-ADM" } },
    metadata: { category: "OBJETO" },
  });

  [
    ["device-barrera-entrada", "Barrera Entrada", "off-centro-dispositivos-barreras"],
    ["device-barrera-salida", "Barrera Salida", "off-centro-dispositivos-barreras"],
    ["device-lpr-entrada-norte", "LPR Entrada Norte", "off-centro-dispositivos-lpr"],
    ["device-lpr-salida-norte", "LPR Salida Norte", "off-centro-dispositivos-lpr"],
    ["device-camara-patio", "Camara Patio", "off-centro-dispositivos-camaras"],
    ["device-sensor-01", "Sensor 01", "off-centro-dispositivos-sensores"],
    ["device-gateway-principal", "Gateway Principal", "off-centro-dispositivos-gateway"],
    ["device-printer-epson", "Impresora Epson TM-T20", "off-centro-dispositivos-pc"],
    ["device-reader-qr", "Lector QR", "off-centro-dispositivos-pc"],
  ].forEach(([id, label, parent]) => {
    add(definitions, {
      id,
      type: "dispositivo",
      label,
      icon: id.includes("lpr") ? "ScanLine" : id.includes("barrera") ? "PanelTop" : id.includes("camara") ? "Camera" : id.includes("sensor") ? "RadioTower" : id.includes("gateway") ? "MonitorCog" : "MonitorCog",
      parent,
      description: "Dispositivo operativo",
      status: id.includes("salida") ? "offline" : id.includes("sensor") ? "alerta" : "online",
      properties: { identity: { Nombre: label, Tipo: "Dispositivo", Estado: id.includes("salida") ? "Offline" : "Online", Codigo: id.toUpperCase() } },
      actions: DEFAULT_ACTIONS.dispositivo,
      metadata: { category: "OBJETO", searchableTags: [label] },
    });
  });

  add(definitions, {
    id: "ubicacion-caseta-norte",
    type: "ubicacion",
    label: "Caseta Norte",
    icon: "Map",
    parent: "off-centro",
    description: "Ubicacion operativa",
    status: "ok",
    properties: {
      identity: { Nombre: "Caseta Norte", Tipo: "Ubicacion", Estado: "Operativa", Codigo: "UBI-CN-01" },
      location: { Empresa: "Inmobiliaria 5Q", Estacionamiento: "Estacionamiento Centro", "Sector / Nivel / Caseta": "Caseta Norte" },
    },
    metadata: { category: "OBJETO" },
  });

  addRelationshipBranches(definitions, "device-pos-tuu-01", [
    { key: "ubicacion", label: "Ubicacion", icon: "Map", targets: [{ label: "Caja Principal", icon: "Landmark", targetObjectId: "caja-principal" }] },
    { key: "asignado", label: "Asignado a", icon: "UserCog", targets: [{ label: "Juan Perez", icon: "UserCog", targetObjectId: "operador-juan-perez" }] },
    { key: "turno", label: "Turno actual", icon: "Clock3", targets: [{ label: "Turno Manana", icon: "Clock3", targetObjectId: "turno-manana" }] },
    { key: "plan", label: "Plan Comercial", icon: "BadgeDollarSign", targets: [{ label: "Enterprise", icon: "BadgeDollarSign", targetObjectId: "plan-enterprise" }] },
    { key: "historial", label: "Historial", icon: "History", targets: [{ label: "Ver historial", icon: "History", targetObjectId: "device-pos-tuu-01" }] },
  ]);

  addRelationshipBranches(definitions, "caja-principal", [
    { key: "ubicacion", label: "Ubicacion", icon: "Map", targets: [{ label: "Caseta Norte", icon: "Map", targetObjectId: "ubicacion-caseta-norte" }] },
    { key: "operador", label: "Operador", icon: "UserCog", targets: [{ label: "Juan Perez", icon: "UserCog", targetObjectId: "operador-juan-perez" }] },
    { key: "turno", label: "Turno actual", icon: "Clock3", targets: [{ label: "Turno Manana", icon: "Clock3", targetObjectId: "turno-manana" }] },
    {
      key: "dispositivos",
      label: "Dispositivos",
      icon: "MonitorCog",
      targets: [
        { label: "POS TUU-01", icon: "CreditCard", targetObjectId: "device-pos-tuu-01" },
        { label: "PC Webpay-01", icon: "MonitorCog", targetObjectId: "device-pc-webpay-01" },
        { label: "Impresora Epson TM-T20", icon: "MonitorCog", targetObjectId: "device-printer-epson" },
        { label: "Lector QR", icon: "ScanLine", targetObjectId: "device-reader-qr" },
      ],
    },
  ]);

  addRelationshipBranches(definitions, "turno-manana", [
    { key: "operador", label: "Operador", icon: "UserCog", targets: [{ label: "Juan Perez", icon: "UserCog", targetObjectId: "operador-juan-perez" }] },
    { key: "caja", label: "Caja", icon: "Landmark", targets: [{ label: "Caja Principal", icon: "Landmark", targetObjectId: "caja-principal" }] },
    { key: "dispositivo", label: "Dispositivo", icon: "CreditCard", targets: [{ label: "POS TUU-01", icon: "CreditCard", targetObjectId: "device-pos-tuu-01" }] },
    { key: "estacionamiento", label: "Estacionamiento", icon: "ParkingSquare", targets: [{ label: "Estacionamiento Centro", icon: "ParkingSquare", targetObjectId: "off-centro" }] },
  ]);

  addRelationshipBranches(definitions, "operador-juan-perez", [
    { key: "caja", label: "Caja actual", icon: "Landmark", targets: [{ label: "Caja Principal", icon: "Landmark", targetObjectId: "caja-principal" }] },
    { key: "turno", label: "Turno actual", icon: "Clock3", targets: [{ label: "Turno Manana", icon: "Clock3", targetObjectId: "turno-manana" }] },
    { key: "dispositivo", label: "Dispositivo asignado", icon: "CreditCard", targets: [{ label: "POS TUU-01", icon: "CreditCard", targetObjectId: "device-pos-tuu-01" }] },
    { key: "plan", label: "Plan Comercial", icon: "BadgeDollarSign", targets: [{ label: "Enterprise", icon: "BadgeDollarSign", targetObjectId: "plan-enterprise" }] },
  ]);

  addRelationshipBranches(definitions, "plan-enterprise", [
    {
      key: "incluidos",
      label: "Dispositivos incluidos",
      icon: "MonitorCog",
      targets: [
        { label: "POS TUU-01", icon: "CreditCard", targetObjectId: "device-pos-tuu-01" },
        { label: "POS TUU-02", icon: "CreditCard", targetObjectId: "device-pos-tuu-02" },
        { label: "PC Webpay-01", icon: "MonitorCog", targetObjectId: "device-pc-webpay-01" },
        { label: "Gateway Principal", icon: "MonitorCog", targetObjectId: "device-gateway-principal" },
      ],
    },
    {
      key: "adicionales",
      label: "Dispositivos adicionales",
      icon: "MonitorCog",
      targets: [
        { label: "LPR Entrada Norte", icon: "ScanLine", targetObjectId: "device-lpr-entrada-norte" },
      ],
    },
  ]);
}

export function createParkFacilObjectModel() {
  const definitions = [];
  addCompany(definitions);
  addParkingHierarchy(definitions);
  addCoreOperationalTree(definitions);
  addCoreObjects(definitions);
  return definitions;
}

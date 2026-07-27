import { getCredenciales, getTextoVigencia, getVehiculos } from "@/data/abonados.mjs";
import { validarRutEstructural } from "@/data/empresas.mjs";
import { PAISES_TELEFONO, getPaisTelefono } from "@/lib/paisesTelefono";

export const ABONADOS_REFERENCE_DATE = "2026-08-01";

const ABONADO_ESTADOS = new Set(["active", "inactive", "suspended", "pending", "blocked"]);
const ABONADO_TIPOS = new Set(["individual", "company_employee", "resident", "tenant", "supplier", "courtesy", "temporary", "other"]);
const VEHICULO_ESTADOS = new Set(["authorized", "pending", "blocked", "inactive"]);
const VEHICULO_TIPOS = new Set(["car", "motorcycle", "van", "truck", "bicycle", "other"]);
const CREDENCIAL_TIPOS = new Set(["rfid_card", "qr_code", "qr_plate", "mobile", "barcode", "pin", "other"]);

export const TELEFONO_PAISES = PAISES_TELEFONO;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function trimText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanRutNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanRutDv(value) {
  return String(value || "").replace(/[^0-9kK]/g, "").slice(0, 1).toUpperCase();
}

function splitRut(rut) {
  const cleaned = String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (cleaned.length < 2) {
    return { numero: "", dv: "" };
  }

  return {
    numero: cleaned.slice(0, -1),
    dv: cleaned.slice(-1),
  };
}

function normalizeRut(value) {
  const { numero, dv } = splitRut(value);
  return numero && dv ? `${numero}${dv}` : "";
}

export function buildNombreCompleto({ nombres, apellidoPaterno, apellidoMaterno, nombre } = {}) {
  const fullName = [nombres, apellidoPaterno, apellidoMaterno].map(trimText).filter(Boolean).join(" ");
  return fullName || trimText(nombre);
}

export function formatRut(numero, dv) {
  const rutNumero = cleanRutNumber(numero);
  const rutDv = cleanRutDv(dv);

  if (!rutNumero || !rutDv) {
    return "";
  }

  return `${Number(rutNumero).toLocaleString("es-CL")}-${rutDv}`;
}

export function normalizeTelefonoNumero(value) {
  return String(value || "").replace(/[^0-9 +()-]/g, "").replace(/\s+/g, " ").trim();
}

export function formatTelefono(codigo, numero) {
  const phoneCode = trimText(codigo);
  const phoneNumber = normalizeTelefonoNumero(numero);
  return [phoneCode, phoneNumber].filter(Boolean).join(" ");
}

export function generateCredentialIdentifier(tipo = "rfid_card") {
  const prefixByType = {
    qr_code: "QR",
    qr_plate: "QRP",
    barcode: "BAR",
    pin: "PIN",
    mobile: "MOV",
    other: "ACC",
    rfid_card: "RFID",
  };
  const prefix = prefixByType[tipo] || "ACC";
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
}

function getCredentialStateByAbonadoState(estado, explicitStatus) {
  if (explicitStatus) return explicitStatus;
  if (estado === "active") return "active";
  if (estado === "inactive") return "inactive";
  if (estado === "suspended") return "suspended";
  if (estado === "blocked") return "blocked";
  return "pending_activation";
}

function validateEmail(value) {
  if (!value) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeLicensePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .trim();
}

export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export function sanitizeResponsableInput(values = {}) {
  const telefonoPais = values.telefonoPais || "CL";
  const country = getPaisTelefono(telefonoPais);

  return {
    id: values.id || null,
    nombres: trimText(values.nombres),
    apellidoPaterno: trimText(values.apellidoPaterno),
    apellidoMaterno: trimText(values.apellidoMaterno),
    correo: trimText(values.correo),
    telefonoPais: country.iso,
    telefonoCodigo: values.telefonoCodigo || country.codigo,
    telefonoNumero: normalizeTelefonoNumero(values.telefonoNumero),
    estado: values.estado || "active",
  };
}

export function validateResponsableInput(values = {}) {
  const data = sanitizeResponsableInput(values);
  const errors = {};

  if (!data.nombres) errors.responsableNombres = "Ingrese los nombres del responsable.";
  if (!data.apellidoPaterno) errors.responsableApellidoPaterno = "Ingrese el apellido paterno del responsable.";
  if (data.correo && !validateEmail(data.correo)) errors.responsableCorreo = "El correo del responsable no tiene un formato valido.";

  return errors;
}

export function sanitizeAbonadoInput(values = {}) {
  const legacyRut = splitRut(values.rut);
  const rutNumero = cleanRutNumber(values.rutNumero || legacyRut.numero);
  const rutDv = cleanRutDv(values.rutDv || legacyRut.dv);
  const telefonoPais = values.telefonoPais || "CL";
  const country = getPaisTelefono(telefonoPais);
  const telefonoCodigo = values.telefonoCodigo || country.codigo;
  const telefonoNumero = normalizeTelefonoNumero(values.telefonoNumero || values.telefono);
  const credencialTipo = values.credencialTipo || "rfid_card";
  const shouldAutoCredential = ["qr_code", "qr_plate", "barcode", "pin", "mobile"].includes(credencialTipo);
  const credencialNumero = trimText(values.credencialNumero) || (shouldAutoCredential ? generateCredentialIdentifier(credencialTipo) : "");

  return {
    nombres: trimText(values.nombres || values.nombre),
    apellidoPaterno: trimText(values.apellidoPaterno),
    apellidoMaterno: trimText(values.apellidoMaterno),
    nombre: buildNombreCompleto({ nombres: values.nombres || values.nombre, apellidoPaterno: values.apellidoPaterno, apellidoMaterno: values.apellidoMaterno }),
    rutNumero,
    rutDv,
    rut: rutNumero && rutDv ? `${rutNumero}${rutDv}` : "",
    rutNormalizado: rutNumero && rutDv ? `${rutNumero}${rutDv}` : normalizeRut(values.rut),
    correo: trimText(values.correo),
    telefonoPais: country.iso,
    telefonoCodigo,
    telefonoNumero,
    telefono: formatTelefono(telefonoCodigo, telefonoNumero),
    empresaId: values.empresaId || null,
    responsableId: values.responsableId || null,
    responsableNuevo: values.responsableNuevo ? sanitizeResponsableInput(values.responsableNuevo) : null,
    tipo: values.tipo || "resident",
    estado: values.estado || "active",
    estacionamientoId: values.estacionamientoId || null,
    fechaInicio: normalizeDate(values.fechaInicio),
    fechaTermino: normalizeDate(values.fechaTermino),
    patente: normalizeLicensePlate(values.patente),
    marca: trimText(values.marca),
    modelo: trimText(values.modelo),
    color: trimText(values.color),
    tipoVehiculo: values.tipoVehiculo || "car",
    estadoVehiculo: values.estadoVehiculo || "authorized",
    credencialNumero,
    credencialTipo,
    vehiculoId: values.vehiculoId || null,
    credencialEstado: values.credencialEstado || null,
    accesoBloqueado: Boolean(values.accesoBloqueado),
    observaciones: trimText(values.observaciones),
  };
}

export function validateAbonadoInput(values = {}) {
  const data = sanitizeAbonadoInput(values);
  const errors = {};

  if (!data.nombres) errors.nombres = "Ingrese los nombres del abonado.";
  if (!data.apellidoPaterno) errors.apellidoPaterno = "Ingrese el apellido paterno.";

  if (!data.rutNumero) {
    errors.rutNumero = "Ingrese el numero del RUT.";
  }

  if (!data.rutDv) {
    errors.rutDv = "Ingrese el digito verificador.";
  }

  if (data.rutNumero && data.rutDv && !validarRutEstructural(data.rutNumero, data.rutDv)) {
    errors.rutNumero = "El RUT ingresado no es valido.";
    errors.rutDv = "El RUT ingresado no es valido.";
  }

  if (!data.tipo) errors.tipo = "Selecciona un tipo de abonado.";
  else if (!ABONADO_TIPOS.has(data.tipo)) errors.tipo = "El tipo de abonado no es valido.";

  if (!data.estado) errors.estado = "Selecciona un estado.";
  else if (!ABONADO_ESTADOS.has(data.estado)) errors.estado = "El estado del abonado no es valido.";

  if (!data.fechaInicio) errors.fechaInicio = "Debes ingresar la fecha de inicio.";
  if (!data.fechaTermino) errors.fechaTermino = "Debes ingresar la fecha de vencimiento.";
  if (data.fechaInicio && data.fechaTermino && data.fechaTermino < data.fechaInicio) errors.fechaTermino = "La fecha de vencimiento debe ser igual o posterior a la fecha de inicio.";

  if (data.correo && !validateEmail(data.correo)) errors.correo = "El correo no tiene un formato valido.";
  if (data.tipoVehiculo && !VEHICULO_TIPOS.has(data.tipoVehiculo)) errors.tipoVehiculo = "El tipo de vehiculo no es valido.";
  if (data.estadoVehiculo && !VEHICULO_ESTADOS.has(data.estadoVehiculo)) errors.estadoVehiculo = "El estado del vehiculo no es valido.";
  if (data.credencialNumero && data.credencialTipo && !CREDENCIAL_TIPOS.has(data.credencialTipo)) errors.credencialTipo = "El tipo de credencial no es valido.";
  if (data.patente && !/^[A-Z0-9-]{2,16}$/.test(data.patente)) errors.patente = "La patente debe usar letras, numeros o guion.";
  if (data.credencialTipo === "qr_plate" && !data.patente) errors.vehiculoId = "QR + Patente requiere un vehículo del abonado.";
  if (!data.patente && !data.credencialNumero) {
    errors.patente = "Debes registrar al menos una patente o una credencial.";
    errors.credencialNumero = "Debes registrar al menos una patente o una credencial.";
  }

  if (data.responsableNuevo) {
    Object.assign(errors, validateResponsableInput(data.responsableNuevo));
  }

  return errors;
}

export function mapResponsableRow(row) {
  if (!row) return null;
  const nombreCompleto = buildNombreCompleto({ nombres: row.nombres, apellidoPaterno: row.apellido_paterno, apellidoMaterno: row.apellido_materno });
  return {
    id: row.id,
    nombres: row.nombres,
    apellidoPaterno: row.apellido_paterno,
    apellidoMaterno: row.apellido_materno || "",
    nombreCompleto,
    correo: row.correo || "",
    telefonoPais: row.telefono_pais || "CL",
    telefonoCodigo: row.telefono_codigo || "+56",
    telefonoNumero: row.telefono_numero || "",
    telefono: formatTelefono(row.telefono_codigo, row.telefono_numero),
    estado: row.estado,
  };
}

export function mapDbRowToAbonado(row, vehiculos = [], credenciales = [], responsable = null) {
  const nombreCompleto = buildNombreCompleto({ nombres: row.nombres, apellidoPaterno: row.apellido_paterno, apellidoMaterno: row.apellido_materno, nombre: row.nombre });
  const rutNumero = row.rut_numero || splitRut(row.rut).numero;
  const rutDv = row.rut_dv || splitRut(row.rut).dv;
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: nombreCompleto,
    nombres: row.nombres || nombreCompleto,
    apellidoPaterno: row.apellido_paterno || "",
    apellidoMaterno: row.apellido_materno || "",
    identificador: row.codigo,
    empresaId: row.empresa_id,
    contratoId: row.contrato_id,
    responsableId: row.responsable_id,
    responsable: mapResponsableRow(responsable),
    tipo: row.tipo,
    estado: row.estado,
    correo: row.correo,
    telefonoPais: row.telefono_pais || "CL",
    telefonoCodigo: row.telefono_codigo || "+56",
    telefonoNumero: row.telefono_numero || row.telefono || "",
    telefono: formatTelefono(row.telefono_codigo || "+56", row.telefono_numero || row.telefono),
    rutNumero,
    rutDv,
    rut: formatRut(rutNumero, rutDv) || row.rut,
    rutNormalizado: rutNumero && rutDv ? `${rutNumero}${rutDv}` : row.rut,
    fechaInicio: row.fecha_inicio,
    fechaTermino: row.fecha_termino,
    estacionamientos: Array.isArray(row.estacionamientos) ? row.estacionamientos : [],
    vehiculos: vehiculos.map((vehiculo) => ({
      id: vehiculo.id,
      licensePlate: vehiculo.license_plate,
      brand: vehiculo.brand,
      model: vehiculo.model,
      color: vehiculo.color,
      year: vehiculo.year,
      vehicleType: vehiculo.vehicle_type,
      isPrimary: Boolean(vehiculo.is_primary),
      status: vehiculo.status,
      notes: vehiculo.notes,
    })),
    credenciales: credenciales.map((credencial) => ({
      id: credencial.id,
      numero: credencial.numero,
      tipo: credencial.tipo,
      estado: credencial.status,
      fechaInicio: credencial.fecha_inicio,
      fechaTermino: credencial.fecha_termino,
      estacionamientos: Array.isArray(credencial.estacionamientos) ? credencial.estacionamientos : [],
      vehiculoId: credencial.vehiculo_id || null,
      accesoBloqueado: Boolean(credencial.acceso_bloqueado),
      observaciones: credencial.observaciones,
    })),
    permisos: [],
    observaciones: row.observaciones,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    historial: Array.isArray(row.historial) ? row.historial : [],
    incidencias: Array.isArray(row.incidencias) ? row.incidencias : [],
    auditoria: Array.isArray(row.auditoria) ? row.auditoria : [],
    documentos: Array.isArray(row.documentos) ? row.documentos : [],
  };
}

export function mapDbRowsToAbonados(rows, vehiculos = [], credenciales = [], responsables = []) {
  const vehiculosByAbonado = new Map();
  const credencialesByAbonado = new Map();
  const responsablesById = new Map(responsables.map((responsable) => [responsable.id, responsable]));

  vehiculos.forEach((vehiculo) => {
    const list = vehiculosByAbonado.get(vehiculo.abonado_id) || [];
    list.push(vehiculo);
    vehiculosByAbonado.set(vehiculo.abonado_id, list);
  });

  credenciales.forEach((credencial) => {
    const list = credencialesByAbonado.get(credencial.abonado_id) || [];
    list.push(credencial);
    credencialesByAbonado.set(credencial.abonado_id, list);
  });

  return rows.map((row) => mapDbRowToAbonado(row, vehiculosByAbonado.get(row.id) || [], credencialesByAbonado.get(row.id) || [], responsablesById.get(row.responsable_id) || null));
}

export function buildAbonadoRowInput(values) {
  return {
    ...(values.codigo ? { codigo: values.codigo } : {}),
    nombre: values.nombre,
    nombres: values.nombres,
    apellido_paterno: values.apellidoPaterno,
    apellido_materno: values.apellidoMaterno || null,
    rut: values.rutNormalizado,
    rut_numero: values.rutNumero,
    rut_dv: values.rutDv,
    correo: values.correo || null,
    telefono: values.telefono || null,
    telefono_pais: values.telefonoPais,
    telefono_codigo: values.telefonoCodigo,
    telefono_numero: values.telefonoNumero || null,
    empresa_id: values.empresaId,
    contrato_id: null,
    responsable_id: values.responsableId,
    tipo: values.tipo,
    estado: values.estado,
    fecha_inicio: values.fechaInicio,
    fecha_termino: values.fechaTermino,
    estacionamientos: values.estacionamientoId ? [values.estacionamientoId] : [],
    observaciones: values.observaciones || null,
  };
}

export function buildResponsableRowInput(values) {
  return {
    nombres: values.nombres,
    apellido_paterno: values.apellidoPaterno,
    apellido_materno: values.apellidoMaterno || null,
    correo: values.correo || null,
    telefono_pais: values.telefonoPais || "CL",
    telefono_codigo: values.telefonoCodigo || "+56",
    telefono_numero: values.telefonoNumero || null,
    estado: values.estado || "active",
  };
}

export function buildVehiculoRowInput(values, abonadoId, existingId = null) {
  if (!values.patente) return null;
  return {
    ...(existingId ? { id: existingId } : {}),
    abonado_id: abonadoId,
    license_plate: values.patente,
    brand: values.marca || null,
    model: values.modelo || null,
    color: values.color || null,
    year: null,
    vehicle_type: values.tipoVehiculo,
    is_primary: true,
    status: values.estadoVehiculo,
    notes: "Vehiculo principal del abonado.",
  };
}

export function buildCredencialRowInput(values, abonadoId, existingId = null) {
  if (!values.credencialNumero) return null;
  return {
    ...(existingId ? { id: existingId } : {}),
    abonado_id: abonadoId,
    numero: values.credencialNumero,
    tipo: values.credencialTipo,
    vehiculo_id: values.vehiculoId || null,
    status: getCredentialStateByAbonadoState(values.estado, values.credencialEstado),
    fecha_inicio: values.fechaInicio,
    fecha_termino: values.fechaTermino,
    estacionamientos: values.estacionamientoId ? [values.estacionamientoId] : [],
    acceso_bloqueado: values.accesoBloqueado,
    observaciones: "Credencial asociada al abonado.",
  };
}

export function resolveEmpresaName(abonado) {
  if (!abonado?.empresaId) return "Sin empresa";
  return abonado.empresaId;
}

export function resolveResponsableName(abonado) {
  return abonado?.responsable?.nombreCompleto || abonado?.responsableId || "Sin responsable";
}

export function searchAbonadosInList(abonados, query) {
  const normalized = normalizeText(query);
  if (!normalized) return abonados;

  return abonados.filter((abonado) => {
    const fields = [
      abonado.nombre,
      abonado.nombres,
      abonado.apellidoPaterno,
      abonado.apellidoMaterno,
      abonado.codigo,
      abonado.identificador,
      abonado.rut,
      abonado.rutNormalizado,
      abonado.correo,
      abonado.telefono,
      abonado.responsable?.nombreCompleto,
      ...getVehiculos(abonado).map((vehiculo) => vehiculo.licensePlate),
      ...getCredenciales(abonado).map((credencial) => credencial.numero),
    ];
    return fields.some((field) => normalizeText(field).includes(normalized));
  });
}

export function getAbonadosSummary(abonados, referenceDate = ABONADOS_REFERENCE_DATE) {
  const activos = abonados.filter((abonado) => abonado.estado === "active").length;
  const suspendidos = abonados.filter((abonado) => abonado.estado === "suspended").length;
  const bloqueados = abonados.filter((abonado) => abonado.estado === "blocked" || getCredenciales(abonado).some((credencial) => credencial.accesoBloqueado)).length;
  const vehiculosAutorizados = abonados.reduce((acc, abonado) => acc + getVehiculos(abonado).filter((vehiculo) => vehiculo.status === "authorized").length, 0);
  const credencialesVigentes = abonados.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => credencial.estado === "active").length, 0);
  const credencialesPorVencer = abonados.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => getTextoVigencia({ fechaInicio: credencial.fechaInicio, fechaTermino: credencial.fechaTermino }, referenceDate) === "Proximo a vencer").length, 0);
  const accesosBloqueados = abonados.reduce((acc, abonado) => acc + getCredenciales(abonado).filter((credencial) => credencial.accesoBloqueado).length, 0);

  return { total: abonados.length, activos, suspendidos, bloqueados, vehiculosAutorizados, credencialesVigentes, credencialesPorVencer, accesosBloqueados };
}

export function getCredencialesPorVencerIds(abonados, referenceDate = ABONADOS_REFERENCE_DATE) {
  return new Set(
    abonados
      .filter((abonado) => getCredenciales(abonado).some((credencial) => getTextoVigencia({ fechaInicio: credencial.fechaInicio, fechaTermino: credencial.fechaTermino }, referenceDate) === "Proximo a vencer"))
      .map((abonado) => abonado.id),
  );
}

export function getAbonadoFormInitialValues(abonado = null) {
  const vehiculoPrincipal = abonado?.vehiculos?.find((vehiculo) => vehiculo.isPrimary) || abonado?.vehiculos?.[0] || null;
  const credencialPrincipal = abonado?.credenciales?.[0] || null;
  return {
    nombres: abonado?.nombres || abonado?.nombre || "",
    apellidoPaterno: abonado?.apellidoPaterno || "",
    apellidoMaterno: abonado?.apellidoMaterno || "",
    nombre: abonado?.nombre || "",
    rutNumero: abonado?.rutNumero || "",
    rutDv: abonado?.rutDv || "",
    rut: abonado?.rutNormalizado || "",
    correo: abonado?.correo || "",
    telefonoPais: abonado?.telefonoPais || "CL",
    telefonoCodigo: abonado?.telefonoCodigo || "+56",
    telefonoNumero: abonado?.telefonoNumero || "",
    telefono: abonado?.telefono || "",
    empresaId: abonado?.empresaId || "",
    responsableId: abonado?.responsableId || "",
    responsableNuevo: null,
    tipo: abonado?.tipo || "resident",
    estado: abonado?.estado || "active",
    estacionamientoId: abonado?.estacionamientos?.[0] || "",
    fechaInicio: abonado?.fechaInicio || "",
    fechaTermino: abonado?.fechaTermino || "",
    patente: vehiculoPrincipal?.licensePlate || "",
    marca: vehiculoPrincipal?.brand || "",
    modelo: vehiculoPrincipal?.model || "",
    color: vehiculoPrincipal?.color || "",
    tipoVehiculo: vehiculoPrincipal?.vehicleType || "car",
    estadoVehiculo: vehiculoPrincipal?.status || "authorized",
    credencialNumero: credencialPrincipal?.numero || "",
    credencialTipo: credencialPrincipal?.tipo || "rfid_card",
    vehiculoId: credencialPrincipal?.vehiculoId || vehiculoPrincipal?.id || "",
    credencialEstado: credencialPrincipal?.estado || "active",
    accesoBloqueado: Boolean(credencialPrincipal?.accesoBloqueado),
    observaciones: abonado?.observaciones || "",
  };
}








import "server-only";

import ExcelJS from "exceljs";
import { getEstadoAbonadoLabel, getEstadoCredencialLabel, getTipoCredencialLabel } from "@/data/abonados.mjs";
import { formatRut, normalizeLicensePlate, sanitizeAbonadoInput, validateAbonadoInput } from "@/lib/abonados";

export const ABONADOS_SHEET = "Abonados";
export const INSTRUCTIONS_SHEET = "Instrucciones";
export const MAX_IMPORT_ROWS = 5000;

export const EXCEL_COLUMNS = [
  { header: "ID interno", key: "id", width: 38 },
  { header: "Codigo abonado", key: "codigo", width: 16 },
  { header: "Nombres", key: "nombres", width: 24 },
  { header: "Apellido paterno", key: "apellidoPaterno", width: 20 },
  { header: "Apellido materno", key: "apellidoMaterno", width: 20 },
  { header: "RUT numero", key: "rutNumero", width: 16 },
  { header: "DV", key: "rutDv", width: 8 },
  { header: "RUT formateado", key: "rut", width: 18 },
  { header: "Pais telefono", key: "telefonoPais", width: 16 },
  { header: "Codigo pais", key: "telefonoCodigo", width: 14 },
  { header: "Telefono", key: "telefonoNumero", width: 18 },
  { header: "Correo", key: "correo", width: 28 },
  { header: "Responsable ID", key: "responsableId", width: 38 },
  { header: "Responsable", key: "responsable", width: 28 },
  { header: "Estado", key: "estado", width: 14 },
  { header: "Fecha inicio", key: "fechaInicio", width: 14 },
  { header: "Fecha termino", key: "fechaTermino", width: 14 },
  { header: "Patentes", key: "patentes", width: 24 },
  { header: "Credenciales", key: "credenciales", width: 34 },
  { header: "Creado", key: "createdAt", width: 20 },
  { header: "Ultima actualizacion", key: "updatedAt", width: 22 },
];

function formatDate(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  const [year, month, day] = text.split("-");
  return year && month && day ? `${day}-${month}-${year}` : text;
}

function normalizeEstadoVisible(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["activo", "active"].includes(text)) return "active";
  if (["inactivo", "inactive"].includes(text)) return "inactive";
  if (["suspendido", "suspended"].includes(text)) return "suspended";
  if (["pendiente", "pending"].includes(text)) return "pending";
  if (["bloqueado", "blocked"].includes(text)) return "blocked";
  return text || "active";
}

function parseDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

function getCellText(row, headerMap, header) {
  const index = headerMap.get(header.toLowerCase());
  if (!index) return "";
  const value = row.getCell(index).value;
  if (value && typeof value === "object" && "text" in value) return String(value.text || "").trim();
  if (value && typeof value === "object" && "result" in value) return String(value.result || "").trim();
  return String(value ?? "").trim();
}

export function abonadoToExcelRow(abonado) {
  const patentes = (abonado.vehiculos || []).map((vehiculo) => vehiculo.licensePlate).filter(Boolean).join("; ");
  const credenciales = (abonado.credenciales || [])
    .map((credencial) => `${getTipoCredencialLabel(credencial.tipo)}: ${credencial.numero} (${getEstadoCredencialLabel(credencial.estado)})`)
    .join("; ");

  return {
    id: abonado.id,
    codigo: abonado.codigo,
    nombres: abonado.nombres,
    apellidoPaterno: abonado.apellidoPaterno,
    apellidoMaterno: abonado.apellidoMaterno,
    rutNumero: abonado.rutNumero,
    rutDv: abonado.rutDv,
    rut: formatRut(abonado.rutNumero, abonado.rutDv) || abonado.rut,
    telefonoPais: abonado.telefonoPais,
    telefonoCodigo: abonado.telefonoCodigo,
    telefonoNumero: abonado.telefonoNumero,
    correo: abonado.correo,
    responsableId: abonado.responsableId,
    responsable: abonado.responsable?.nombreCompleto || "",
    estado: getEstadoAbonadoLabel(abonado.estado),
    fechaInicio: formatDate(abonado.fechaInicio),
    fechaTermino: formatDate(abonado.fechaTermino),
    patentes,
    credenciales,
    createdAt: formatDate(abonado.createdAt),
    updatedAt: formatDate(abonado.updatedAt),
  };
}

function prepareWorksheet(worksheet) {
  worksheet.columns = EXCEL_COLUMNS;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: `${worksheet.getColumn(EXCEL_COLUMNS.length).letter}1` };
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF4FF" } };
  worksheet.getColumn("A").numFmt = "@";
  worksheet.getColumn("F").numFmt = "@";
  worksheet.getColumn("G").numFmt = "@";
  worksheet.getColumn("J").numFmt = "@";
  worksheet.getColumn("K").numFmt = "@";
}

export async function buildAbonadosWorkbook(abonados) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParkFacil 2027";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(ABONADOS_SHEET);
  prepareWorksheet(worksheet);
  abonados.map(abonadoToExcelRow).forEach((row) => worksheet.addRow(row));
  return workbook;
}

export async function buildTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParkFacil 2027";
  const worksheet = workbook.addWorksheet(ABONADOS_SHEET);
  prepareWorksheet(worksheet);
  worksheet.addRow({
    codigo: "Ejemplo nuevo",
    nombres: "Nombre Ejemplo",
    apellidoPaterno: "Apellido",
    apellidoMaterno: "Opcional",
    rutNumero: "11111111",
    rutDv: "1",
    telefonoPais: "CL",
    telefonoCodigo: "+56",
    telefonoNumero: "912345678",
    correo: "ejemplo@parkfacil.test",
    estado: "Activo",
    fechaInicio: "27-07-2026",
    fechaTermino: "27-07-2027",
    patentes: "ABCD12",
    credenciales: "RFID: EJEMPLO-001",
  });

  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  instructions.columns = [{ header: "Tema", key: "topic", width: 28 }, { header: "Instruccion", key: "description", width: 100 }];
  instructions.addRows([
    { topic: "Campos obligatorios", description: "Nombres, Apellido paterno, RUT numero, DV, Estado, Fecha inicio y Fecha termino." },
    { topic: "Actualizar", description: "Mantenga el ID interno sin cambios para actualizar un abonado exportado." },
    { topic: "Crear", description: "Deje ID interno vacio para crear un abonado nuevo." },
    { topic: "RUT", description: "Ingrese numero sin puntos y DV separado. El DV K se normaliza en mayuscula." },
    { topic: "Telefono", description: "Use Pais telefono, Codigo pais y Telefono como texto." },
    { topic: "Patentes", description: "Separe varias patentes con punto y coma. No use simbolos arbitrarios." },
    { topic: "Estado", description: "Use Activo o Inactivo para operaciones basicas." },
    { topic: "Columnas", description: "No cambie los nombres de columnas." },
  ]);
  instructions.getRow(1).font = { bold: true };
  return workbook;
}

export async function workbookToBuffer(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseImportWorkbook(buffer, currentAbonados = []) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(ABONADOS_SHEET);
  if (!worksheet) {
    return { summary: { total: 0, valid: 0, warnings: 0, errors: 1, create: 0, update: 0, unchanged: 0, ignored: 0 }, rows: [], errors: [{ row: 0, field: "Hoja", value: "", message: "El archivo no contiene la hoja Abonados." }] };
  }

  if (worksheet.rowCount - 1 > MAX_IMPORT_ROWS) {
    return { summary: { total: worksheet.rowCount - 1, valid: 0, warnings: 0, errors: 1, create: 0, update: 0, unchanged: 0, ignored: 0 }, rows: [], errors: [{ row: 0, field: "Archivo", value: String(worksheet.rowCount - 1), message: `El archivo supera el limite de ${MAX_IMPORT_ROWS} filas.` }] };
  }

  const headerMap = new Map();
  worksheet.getRow(1).eachCell((cell, colNumber) => headerMap.set(String(cell.value || "").trim().toLowerCase(), colNumber));
  const required = ["Nombres", "Apellido paterno", "RUT numero", "DV", "Estado", "Fecha inicio", "Fecha termino"];
  const missing = required.filter((header) => !headerMap.has(header.toLowerCase()));
  if (missing.length > 0) {
    return { summary: { total: 0, valid: 0, warnings: 0, errors: missing.length, create: 0, update: 0, unchanged: 0, ignored: 0 }, rows: [], errors: missing.map((field) => ({ row: 1, field, value: "", message: `Falta la columna ${field}.` })) };
  }

  const byId = new Map(currentAbonados.map((abonado) => [abonado.id, abonado]));
  const byCodigo = new Map(currentAbonados.map((abonado) => [abonado.codigo, abonado]));
  const byRut = new Map(currentAbonados.map((abonado) => [abonado.rutNormalizado, abonado]));
  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = getCellText(row, headerMap, "ID interno");
    const codigo = getCellText(row, headerMap, "Codigo abonado");
    const rutNumero = getCellText(row, headerMap, "RUT numero").replace(/\D/g, "");
    const rutDv = getCellText(row, headerMap, "DV").replace(/[^0-9kK]/g, "").slice(0, 1).toUpperCase();
    const patentes = getCellText(row, headerMap, "Patentes").split(";").map(normalizeLicensePlate).filter(Boolean);
    const duplicatePatentes = patentes.filter((patente, index) => patentes.indexOf(patente) !== index);
    const payload = sanitizeAbonadoInput({
      codigo,
      nombres: getCellText(row, headerMap, "Nombres"),
      apellidoPaterno: getCellText(row, headerMap, "Apellido paterno"),
      apellidoMaterno: getCellText(row, headerMap, "Apellido materno"),
      rutNumero,
      rutDv,
      telefonoPais: getCellText(row, headerMap, "Pais telefono") || "CL",
      telefonoCodigo: getCellText(row, headerMap, "Codigo pais") || "+56",
      telefonoNumero: getCellText(row, headerMap, "Telefono"),
      correo: getCellText(row, headerMap, "Correo").toLowerCase(),
      responsableId: getCellText(row, headerMap, "Responsable ID") || null,
      estado: normalizeEstadoVisible(getCellText(row, headerMap, "Estado")),
      fechaInicio: parseDate(getCellText(row, headerMap, "Fecha inicio")),
      fechaTermino: parseDate(getCellText(row, headerMap, "Fecha termino")),
      patente: patentes[0] || "",
      credencialNumero: "IMPORT-PREVIEW",
    });

    const rowErrors = Object.entries(validateAbonadoInput(payload)).map(([field, message]) => ({ row: rowNumber, field, value: "", message }));
    if (duplicatePatentes.length > 0) rowErrors.push({ row: rowNumber, field: "Patentes", value: duplicatePatentes.join(", "), message: "La patente esta repetida en la misma fila." });

    const existing = (id && byId.get(id)) || (codigo && byCodigo.get(codigo)) || byRut.get(payload.rutNormalizado) || null;
    const action = rowErrors.length > 0 ? "Error" : existing ? "Actualizar" : "Crear";
    const message = rowErrors.length > 0 ? rowErrors.map((item) => item.message).join(" ") : existing ? "Registro existente identificado de forma segura." : "Registro nuevo listo para crear.";
    errors.push(...rowErrors);
    rows.push({ row: rowNumber, id, codigo, nombre: payload.nombre, rut: formatRut(payload.rutNumero, payload.rutDv), action, status: rowErrors.length > 0 ? "error" : "valid", message, payload: { ...payload, id: existing?.id || null } });
  });

  const summary = {
    total: rows.length,
    valid: rows.filter((row) => row.status === "valid").length,
    warnings: 0,
    errors: rows.filter((row) => row.status === "error").length,
    create: rows.filter((row) => row.action === "Crear").length,
    update: rows.filter((row) => row.action === "Actualizar").length,
    unchanged: 0,
    ignored: 0,
  };

  return { summary, rows, errors };
}

export async function buildImportErrorsWorkbook(errors = []) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Errores");
  worksheet.columns = [
    { header: "Fila", key: "row", width: 10 },
    { header: "Campo", key: "field", width: 24 },
    { header: "Valor", key: "value", width: 24 },
    { header: "Mensaje", key: "message", width: 80 },
  ];
  worksheet.addRows(errors);
  worksheet.getRow(1).font = { bold: true };
  return workbook;
}

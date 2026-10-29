import "server-only";

import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "./releasedPlateCore.mjs";

// Pago liberado gestionado por el cliente (SOL-2026-10-28-003): plantilla y
// lectura de la carga masiva desde Excel.

const pad = (n) => String(n).padStart(2, "0");

// Excel guarda la fecha/hora escrita como si fuera UTC: se lee con getters UTC.
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${pad(value.getUTCDate())}-${pad(value.getUTCMonth() + 1)}-${value.getUTCFullYear()} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return cellText(value.result);
  }
  return String(value);
}

export async function buildImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patentes");
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.addRow(["ABCD-12", "01-11-2026 08:00", "30-11-2026 20:00", "Juan Soto", "12.345.678-5", "+56 9 1234 5678", "juan@correo.cl", "Convenio", "multiple", ""]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Filas (sin encabezado) como texto, máximo MAX_IMPORT_ROWS + 1 para detectar exceso.
export async function readImportWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1 || rows.length > MAX_IMPORT_ROWS) return;
    rows.push(IMPORT_COLUMNS.map((_, index) => cellText(row.getCell(index + 1).value).trim()));
  });
  return rows;
}

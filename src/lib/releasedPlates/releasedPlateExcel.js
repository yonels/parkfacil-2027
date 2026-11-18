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

// Plantilla (SOL-2026-11-04-001): la hoja de carga va primero y vacía (el
// importador lee worksheets[0]); el ejemplo y las reglas van en «Instrucciones».
// Fechas como texto (Excel no las convierte) y lista desplegable en «Uso».
export const USAGE_OPTIONS = Object.freeze(["multiple", "unica", "maximo"]);

export async function buildImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patentes");
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row += 1) {
    for (const column of [1, 2, 3, 5, 6]) sheet.getCell(row, column).numFmt = "@";
    sheet.getCell(row, 9).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"' + USAGE_OPTIONS.join(",") + '"'],
      showErrorMessage: true,
      errorTitle: "Uso no válido",
      error: "Elige multiple, unica o maximo.",
    };
  }

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 30 }, { width: 90 }];
  help.addRow(["Cómo completar la hoja «Patentes»"]).font = { bold: true };
  help.addRow(["1", "Escribe una patente por fila, desde la fila 2. No cambies ni muevas los encabezados."]);
  help.addRow(["2", "Inicio y Término: texto «dd-mm-aaaa hh:mm», hora de Chile. Ej.: 01-12-2026 08:00."]);
  help.addRow(["3", "Uso: elige multiple (entradas ilimitadas), unica (una sola entrada) o maximo (indica «Maximo de usos», 2 o más)."]);
  help.addRow(["4", "RUT con dígito verificador y celular chileno (+56 9 XXXX XXXX). Todas las patentes quedan «Sin costo»."]);
  help.addRow([]);
  help.addRow(["Ejemplo (no se importa)"]).font = { bold: true };
  help.addRow([...IMPORT_COLUMNS]).font = { bold: true };
  help.addRow(["ABCD-12", "01-12-2026 08:00", "31-12-2026 20:00", "Juan Soto", "12.345.678-5", "+56 9 1234 5678", "juan@correo.cl", "Convenio", "multiple", ""]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Encabezado y filas como texto, máximo MAX_IMPORT_ROWS + 1 para detectar
// exceso. El encabezado se devuelve para compararlo con la plantilla.
export async function readImportWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { header: [], rows: [] };
  const header = [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    const cells = IMPORT_COLUMNS.map((_, index) => cellText(row.getCell(index + 1).value).trim());
    if (number === 1) { header.push(...cells); return; }
    if (rows.length > MAX_IMPORT_ROWS) return;
    rows.push(cells);
  });
  return { header, rows };
}

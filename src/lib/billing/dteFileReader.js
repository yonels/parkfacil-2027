import "server-only";
import ExcelJS from "exceljs";
import { DteImportError } from "./dteRegistryCore.mjs";

// Lee la planilla subida (SOL-2026-11-05-005, F2b) como matriz de textos. Excel (.xlsx) con exceljs; .csv con
// separador «;» o «,» (el Registro de Compras y Ventas del SII se descarga como CSV).
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const separator = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

export async function readSpreadsheet(buffer, fileName = "") {
  if (!buffer?.length) throw new DteImportError("DTE_FILE_EMPTY", "El archivo está vacío.");
  if (buffer.length > MAX_IMPORT_BYTES) throw new DteImportError("DTE_FILE_TOO_LARGE", "El archivo supera 5 MB.");
  const name = String(fileName).toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    // El SII entrega el CSV en Latin-1 cuando hay tildes o eñes; si no es UTF-8 válido, se lee como Latin-1.
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { text = new TextDecoder("latin1").decode(buffer); }
    text = text.replace(/^﻿/, "");
    return parseCsv(text);
  }
  if (!name.endsWith(".xlsx")) throw new DteImportError("DTE_FILE_TYPE", "Formato no admitido: suba un Excel (.xlsx) o un CSV.");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new DteImportError("DTE_FILE_UNREADABLE", "No fue posible leer el Excel."); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DteImportError("DTE_FILE_EMPTY", "El Excel no tiene hojas.");
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let col = 1; col <= sheet.columnCount; col += 1) values.push(cellText(row.getCell(col).value));
    rows.push(values);
  });
  return rows;
}

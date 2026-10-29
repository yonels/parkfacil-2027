// Motor común de reportes (SOL-2026-10-28-005, E2): exportación a Excel
// auténtico (.xlsx con exceljs, nunca CSV renombrado). Recibe el resultado
// estándar de un reporte y arma:
// - «Resumen»: título, empresa, estacionamientos, período, emisión, KPI y
//   valores no calculables.
// - «Detalle»: todas las filas autorizadas según los filtros (no solo las
//   visibles en pantalla), con formatos, totales, filtro automático y
//   encabezado fijo.
// - «Gráficos»: los datos con que se dibujan los gráficos.
// Protecciones: celdas de texto que empiezan con = + - @ (inyección de
// fórmulas) se anteponen con apóstrofo; límites de filas y de largo de texto.

export const MAX_EXPORT_ROWS = 50000;
export const MAX_CELL_TEXT = 2000;
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export const NUMBER_FORMATS = Object.freeze({
  int: "#,##0",
  clp: '"$"#,##0',
  uf: '"UF" #,##0.00',
  pct: "0.0%",
  decimal: "#,##0.00",
  datetime: "dd-mm-yyyy hh:mm",
  date: "dd-mm-yyyy",
});

export function safeCellText(value) {
  const text = String(value ?? "").slice(0, MAX_CELL_TEXT);
  return FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix)) ? `'${text}` : text;
}

// Valor de celda según el formato de la columna. Fechas: se escriben como la
// hora local (America/Santiago) para que Excel muestre lo mismo que la pantalla.
export function cellValue(value, format, toLocalParts) {
  if (value === null || value === undefined || value === "") return null;
  if (["int", "clp", "uf", "pct", "decimal"].includes(format)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : safeCellText(value);
  }
  if (format === "datetime" || format === "date") {
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) return safeCellText(value);
    const p = toLocalParts(ms);
    return new Date(Date.UTC(p.year, p.month - 1, p.day, format === "date" ? 0 : p.hour, format === "date" ? 0 : p.minute));
  }
  return safeCellText(value);
}

/**
 * result: { title, meta: { companyName, parkings, periodLabel, generatedAt, timeZone, filters },
 *           kpis: [{ label, value, format, note }], charts: [{ title, data: [{ label, value }], format }],
 *           columns: [{ key, label, format, width }], rows: [...], totals: { key: value },
 *           notCalculable: [string] }
 * Se escribe en flujo (WorkbookWriter): cada fila se confirma y se libera, para
 * no mantener el libro completo en memoria con 50.000 filas.
 */
export async function buildReportWorkbook(ExcelJS, result, { toLocalParts, formatGenerated }) {
  if ((result.rows || []).length > MAX_EXPORT_ROWS) {
    const error = new Error("EXPORT_TOO_LARGE");
    error.limit = MAX_EXPORT_ROWS;
    throw error;
  }
  const { PassThrough } = await import("node:stream");
  const output = new PassThrough();
  const chunks = [];
  output.on("data", (chunk) => chunks.push(chunk));
  const book = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
  book.creator = "ParkFacil";
  book.created = new Date(result.meta.generatedAt);
  const bold = { bold: true };
  const add = (sheet, values, { font, formats } = {}) => {
    const row = sheet.addRow(values);
    if (font) row.font = font;
    (formats || []).forEach((format, index) => { if (format && NUMBER_FORMATS[format]) row.getCell(index + 1).numFmt = NUMBER_FORMATS[format]; });
    row.commit();
  };

  const summary = book.addWorksheet("Resumen");
  summary.columns = [{ width: 34 }, { width: 28 }, { width: 50 }];
  add(summary, [safeCellText(result.title)], { font: { bold: true, size: 14 } });
  const metaRows = [
    ["Empresa", result.meta.companyName || "—"],
    ["Estacionamientos", (result.meta.parkings || []).join(", ") || "Todos"],
    ["Período", result.meta.periodLabel],
    ["Emitido", formatGenerated(result.meta.generatedAt)],
    ["Zona horaria", result.meta.timeZone],
    ...Object.entries(result.meta.filters || {}).filter(([, value]) => value).map(([key, value]) => [key, String(value)]),
  ];
  for (const [label, value] of metaRows) {
    const row = summary.addRow([safeCellText(label), safeCellText(value)]);
    row.getCell(1).font = bold;
    row.commit();
  }
  add(summary, []);
  add(summary, ["Indicador", "Valor", "Nota"], { font: bold });
  for (const kpi of result.kpis || []) {
    const missing = kpi.value === null || kpi.value === undefined;
    add(summary, [safeCellText(kpi.label), missing ? "No calculable" : cellValue(kpi.value, kpi.format, toLocalParts), safeCellText(kpi.note || "")], { formats: [null, missing ? null : kpi.format] });
  }
  if ((result.notCalculable || []).length) {
    add(summary, []);
    add(summary, ["No calculable"], { font: bold });
    result.notCalculable.forEach((item) => add(summary, [safeCellText(item)]));
  }
  summary.commit();

  const detail = book.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = result.columns || [];
  const formats = columns.map((column) => column.format);
  detail.columns = columns.map((column) => ({ header: column.label, key: column.key, width: column.width || 20 }));
  if (columns.length) detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  detail.getRow(1).font = bold;
  detail.getRow(1).commit();
  for (const item of result.rows || []) add(detail, columns.map((column) => cellValue(item[column.key], column.format, toLocalParts)), { formats });
  if (result.totals && Object.keys(result.totals).length) {
    add(detail, columns.map((column, index) => (column.key in result.totals ? cellValue(result.totals[column.key], column.format, toLocalParts) : index === 0 ? "Total" : null)), { font: bold, formats });
  }
  detail.commit();

  if ((result.charts || []).length) {
    const charts = book.addWorksheet("Gráficos");
    charts.columns = [{ width: 36 }, { width: 18 }];
    for (const chart of result.charts) {
      add(charts, [safeCellText(chart.title)], { font: bold });
      add(charts, ["Categoría", "Valor"], { font: bold });
      for (const point of chart.data || []) add(charts, [safeCellText(point.label), cellValue(point.value, chart.format || "int", toLocalParts)], { formats: [null, chart.format || "int"] });
      add(charts, []);
    }
    charts.commit();
  }
  await book.commit();
  return Buffer.concat(chunks);
}

export function exportFileName(reportId, period) {
  const safe = String(reportId).replace(/[^a-z0-9-]/gi, "");
  return `parkfacil-${safe}-${period.fromDate}_${period.toDate}.xlsx`;
}

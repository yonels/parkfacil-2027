import test from "node:test";
import assert from "node:assert/strict";
import { groupedSpreadsheetRows, normalizeColumnView, numericTotals, spreadsheetRows } from "./offStreetSpreadsheetCore.mjs";

const columns = [{ key: "operator", value: (row) => row.operator }, { key: "amount", value: (row) => row.amount, total: true }];
test("filtra y ordena el conjunto completo, incluidos registros posteriores a la página 50", () => {
  const rows = Array.from({ length: 120 }, (_, id) => ({ id, operator: id === 119 ? "Ana" : "Beto", amount: id }));
  assert.equal(spreadsheetRows(rows, columns, { search: "Ana" })[0].id, 119);
  assert.equal(spreadsheetRows(rows, columns, { sort: { key: "amount", direction: "desc" } })[0].id, 119);
  assert.equal(spreadsheetRows(rows, columns, { filters: { operator: "Beto", amount: "119" } }).length, 0);
});
test("grupos y total usan todas las filas filtradas, con cero y nulos", () => {
  const rows = [{ operator: "Ana", amount: 0 }, { operator: "Ana", amount: 1500 }, { operator: "Beto", amount: 2500 }, { operator: "Ana", amount: null }];
  const matching = spreadsheetRows(rows, columns, { filters: { operator: "Ana" }, group: "operator" });
  assert.equal(numericTotals(matching, columns).amount, 1500);
  assert.deepEqual(groupedSpreadsheetRows(matching, "operator", columns).map((group) => [group.label, group.rows.length, group.totals.amount]), [["Ana", 3, 1500]]);
});
test("las columnas ocultas siguen ocultas al restaurar; columnas nuevas se incorporan una vez", () => {
  const view = normalizeColumnView(["a", "b", "c"], { order: ["b", "a", "a", "removed"], visible: ["b"], widths: { b: 900, removed: 120 } });
  assert.deepEqual(view.order, ["b", "a", "c"]);
  assert.deepEqual(view.visible, ["b", "c"]);
  assert.deepEqual(view.widths, { b: 600 });
});

test("fechas operativas se ordenan cronológicamente al cruzar meses y años", () => {
  const rows = [{ date: "02-01-2026" }, { date: "31-12-2025" }, { date: "01-02-2026" }];
  const columns = [{ key: "date", value: (row) => row.date }];
  assert.deepEqual(spreadsheetRows(rows, columns, { sort: { key: "date", direction: "asc" } }).map((row) => row.date), ["31-12-2025", "02-01-2026", "01-02-2026"]);
});

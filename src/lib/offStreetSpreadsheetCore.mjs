export function normalizeColumnView(keys, saved = {}) {
  const order = [...new Set((saved.order || []).filter((key) => keys.includes(key)))];
  const fresh = keys.filter((key) => !order.includes(key));
  return {
    order: [...order, ...fresh],
    visible: Array.isArray(saved.visible) ? [...new Set([...saved.visible.filter((key) => keys.includes(key)), ...fresh])] : keys,
    widths: Object.fromEntries(Object.entries(saved.widths || {}).filter(([key, value]) => keys.includes(key) && Number.isFinite(value)).map(([key, value]) => [key, Math.max(100, Math.min(600, value))])),
  };
}

export function spreadsheetRows(rows, columns, { search = "", filters = {}, sort = {}, group = "" } = {}) {
  const text = (value) => String(value ?? "").toLocaleLowerCase("es");
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const get = (row, key) => byKey.get(key)?.value(row);
  const needle = text(search).trim();
  const filtered = rows.filter((row) => (!needle || columns.some((column) => text(column.value(row)).includes(needle))) && Object.entries(filters).every(([key, value]) => !value || text(get(row, key)).includes(text(value))));
  const compare = (a, b, key) => {
    const av = get(a, key), bv = get(b, key);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    const operationalDate = (value) => { const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})(.*)$/); return match ? `${match[3]}-${match[2]}-${match[1]}${match[4]}` : String(value); };
    return operationalDate(av).localeCompare(operationalDate(bv), "es", { numeric: true });
  };
  return [...filtered].sort((a, b) => (group ? compare(a, b, group) : 0) || (sort.key ? compare(a, b, sort.key) * (sort.direction === "desc" ? -1 : 1) : 0));
}

export function numericTotals(rows, columns) {
  return Object.fromEntries(columns.filter((column) => column.total).map((column) => [column.key, rows.reduce((sum, row) => sum + (Number.isFinite(column.value(row)) ? column.value(row) : 0), 0)]));
}

export function groupedSpreadsheetRows(rows, group, columns) {
  if (!group) return [];
  const column = columns.find((item) => item.key === group);
  const groups = new Map();
  for (const row of rows) {
    const value = String(column?.value(row) ?? "Sin dato");
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return [...groups].map(([label, items]) => ({ label, rows: items, totals: numericTotals(items, columns) }));
}

export const MODULE_PRICING_IDS = [
  "dashboard", "operacion", "estacionamientos", "seguridad", "tarifas",
  "simulador", "recaudacion", "abonados", "operadores", "dispositivos",
  "reportes", "alertas",
];

export function sanitizeModulePricing(input) {
  const source = Array.isArray(input?.items) ? input.items : [];
  return source.map((item) => ({
    moduleId: String(item?.moduleId || "").trim(),
    monthlyUf: Number(item?.monthlyUf),
  }));
}

export function validateModulePricing(items) {
  const errors = [];
  const seen = new Set();
  if (!Array.isArray(items) || items.length !== MODULE_PRICING_IDS.length) {
    errors.push("Debe informar el tarifario completo.");
    return errors;
  }
  for (const item of items) {
    if (!MODULE_PRICING_IDS.includes(item.moduleId)) errors.push(`Módulo inválido: ${item.moduleId || "vacío"}.`);
    if (seen.has(item.moduleId)) errors.push(`Módulo duplicado: ${item.moduleId}.`);
    seen.add(item.moduleId);
    if (!Number.isFinite(item.monthlyUf) || item.monthlyUf < 0 || item.monthlyUf > 10000) {
      errors.push(`Valor UF inválido para ${item.moduleId || "el módulo"}.`);
    } else if (Math.abs(Math.round(item.monthlyUf * 100) - item.monthlyUf * 100) > 1e-8) {
      errors.push(`El valor de ${item.moduleId} admite máximo dos decimales.`);
    }
  }
  return errors;
}

export function pricingRowsToMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [row.module_id ?? row.moduleId, Number(row.monthly_uf ?? row.monthlyUf)]));
}

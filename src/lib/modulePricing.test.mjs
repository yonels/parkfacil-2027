import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_PRICING_IDS, pricingRowsToMap, sanitizeModulePricing, validateModulePricing } from "./modulePricing.mjs";

test("normaliza y valida el tarifario completo", () => {
  const items = sanitizeModulePricing({ items: MODULE_PRICING_IDS.map((moduleId, index) => ({ moduleId, monthlyUf: index + 0.5 })) });
  assert.deepEqual(validateModulePricing(items), []);
});

test("rechaza módulos incompletos, duplicados y valores fuera de rango", () => {
  assert.ok(validateModulePricing([]).length);
  const items = MODULE_PRICING_IDS.map((moduleId) => ({ moduleId, monthlyUf: 1 }));
  items[1] = { moduleId: items[0].moduleId, monthlyUf: -1 };
  assert.ok(validateModulePricing(items).length >= 2);
});

test("convierte filas persistentes a mapa de precios", () => {
  assert.deepEqual(pricingRowsToMap([{ module_id: "dashboard", monthly_uf: "1.80" }]), { dashboard: 1.8 });
});

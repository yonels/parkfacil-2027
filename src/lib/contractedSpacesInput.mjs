// Entrada de la API de plazas contratadas, separada de route.js (que importa
// "next/server") para poder probarla con node:test sin depender del runtime de Next —
// mismo patrón que parkingRateInput.mjs.
export function sanitizeContractedSpacesInput(input = {}) {
  const contractedSpaces = Number(input.contractedSpaces);
  return {
    contractedSpaces: Number.isFinite(contractedSpaces) ? Math.trunc(contractedSpaces) : null,
    notes: String(input.notes || "").trim().slice(0, 500),
  };
}

// Un estacionamiento puede tener filas de contrato y una manual (contract_id nulo): manda
// la del contrato más reciente, y la manual solo si no hay ninguna de contrato.
export function pickContractedSpacesRow(rows = []) {
  const byRecency = [...rows].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return byRecency.find((row) => row.contract_id) || byRecency[0] || null;
}

export function validateContractedSpacesInput(input) {
  const errors = {};
  if (!Number.isInteger(input.contractedSpaces) || input.contractedSpaces <= 0) {
    errors.contractedSpaces = "Ingresa una cantidad de plazas contratadas mayor que 0.";
  }
  return errors;
}

// Código de plan comercial asignado por el sistema (2026-10-28, pedido del
// usuario): PF-PLAN-NNN, correlativo sobre el máximo existente. El índice
// único commercial_plans_code_key es la garantía final; quien inserta
// reintenta con el siguiente número si dos creaciones chocan.
export const PREFIJO_PLAN = "PF-PLAN-";

export function siguienteCodigoPlan(codigosExistentes = [], salto = 0) {
  const maximo = codigosExistentes.reduce((max, codigo) => {
    const texto = String(codigo || "").toUpperCase();
    if (!texto.startsWith(PREFIJO_PLAN)) return max;
    const numero = Number.parseInt(texto.slice(PREFIJO_PLAN.length), 10);
    return Number.isInteger(numero) && numero > max ? numero : max;
  }, 0);
  return `${PREFIJO_PLAN}${String(maximo + 1 + salto).padStart(3, "0")}`;
}

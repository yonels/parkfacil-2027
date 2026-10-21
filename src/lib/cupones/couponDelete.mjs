// Eliminar cupones no utilizados (SOL-2026-10-20-002). La pantalla solo ofrece la
// acción a los cupones sin canje; la base vuelve a decidir al eliminar
// (delete_unused_coupon: estadía asociada y pago con tarjeta en curso).

export const COUPON_PAGE_MODES = Object.freeze({ LIST: "listado", CREATE: "crear", DELETE: "eliminar" });

export function couponDeletable(coupon) {
  return Boolean(coupon) && !coupon.redeemedAt && coupon.status !== "REDEEMED";
}

// Mensaje de la respuesta del servidor; ante un fallo de red, uno propio en español.
export function couponDeleteErrorMessage(body, { network = false } = {}) {
  if (network) return "No hay conexión con el servidor. El cupón no se eliminó; intenta nuevamente.";
  return String(body?.error || "").trim() || "No fue posible eliminar el cupón. Intenta nuevamente.";
}

// Después de eliminar: el cupón sale del listado, del lote seleccionado, de la vista
// previa y del envío por correo.
export function removeDeletedCoupon({ coupons = [], selectedBatch = [], selected = null, emailCoupon = null }, id) {
  return {
    coupons: coupons.filter((coupon) => coupon.id !== id),
    selectedBatch: selectedBatch.filter((coupon) => coupon.id !== id),
    selected: selected?.id === id ? null : selected,
    emailCoupon: emailCoupon?.id === id ? null : emailCoupon,
  };
}

// Impresión de cupones (SOL-2026-10-19-001). Antes se abría una ventana emergente
// que llamaba window.print() al cargar: comparte el hilo de la pestaña principal, así
// que si quedaba detrás del navegador la pantalla de Cupones parecía "pegada" y los
// cupones ya se habían marcado como entregados. Ahora se imprime desde un iframe
// oculto en la misma pestaña y solo se informa "abierto" si el diálogo se abrió.

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);

export function couponBenefitLabel(coupon) {
  if (coupon?.benefitType === "FREE_MINUTES") return `${coupon.value} minutos gratis`;
  if (coupon?.benefitType === "FIXED_AMOUNT") return `$${Number(coupon.value).toLocaleString("es-CL")} de descuento`;
  return `${coupon?.value}% de descuento`;
}

const PRINT_STYLES = "@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#041e42}.sheet{display:grid;grid-template-columns:repeat(2,1fr);gap:7mm}.coupon{height:128mm;border:1.5px solid #3150d8;border-radius:14px;overflow:hidden;text-align:center;break-inside:avoid}.head{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#3150d8;color:white;padding:9px 14px;text-align:left}.brand{font-size:18px;font-weight:800;line-height:1}.title{font-size:10px;line-height:1.2;text-align:right}.body{padding:10px}.body h2{margin:2px 0 5px;font-size:17px}.identity{margin:0 auto 3px;font-size:11px;line-height:1.35}.identity p{margin:1px 0}.qr{display:block;width:50mm;height:50mm;margin:4px auto}.code{margin:2px;font-size:17px;font-weight:900;letter-spacing:2px}.benefit{margin:4px;font-size:16px;font-weight:800;color:#3150d8}.expiry{margin:4px;font-size:10px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}";

// Documento A4 del lote. Sin script de autoimpresión: la impresión la dispara
// printHtmlInFrame cuando el documento (y sus QR) terminó de cargar.
export function couponPrintDocument(batch, qrImages, formatDateTime = (value) => String(value ?? "")) {
  const coupons = (Array.isArray(batch) ? batch : []).map((item, index) => `<article class="coupon"><header class="head"><span class="brand">ParkFacil</span><span class="title">Cupón de estacionamiento de un solo uso</span></header><div class="body"><h2>${escapeHtml(item.name)}</h2><div class="identity"><p><b>Generado por:</b> ${escapeHtml(item.companyName)}</p><p><b>Para:</b> ${escapeHtml(item.redeemingMerchantName || item.merchantName)}</p></div><img class="qr" src="${escapeHtml(qrImages?.[index])}" alt="Código QR del cupón ${escapeHtml(item.code)}"><p class="code">${escapeHtml(item.code)}</p><p class="benefit">${escapeHtml(couponBenefitLabel(item))}</p><p class="expiry"><b>Expira:</b> ${escapeHtml(formatDateTime(item.expiresAt))}</p></div></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Lote de cupones</title><style>${PRINT_STYLES}</style></head><body><main class="sheet">${coupons}</main></body></html>`;
}

// Imprime `html` desde un iframe oculto de la misma pestaña. Resuelve
// { opened: true } solo si el navegador emitió "beforeprint" (el diálogo se abrió);
// { opened: false } si no se pudo cargar o imprimir. El iframe se retira al terminar.
export function printHtmlInFrame(doc, html, { loadTimeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let frame;
    let settled = false;
    const finish = (opened) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Se retira después: en algunos navegadores print() vuelve antes de que el
      // diálogo termine de leer el documento.
      setTimeout(() => frame?.remove(), 1000);
      resolve({ opened });
    };
    const timer = setTimeout(() => finish(false), loadTimeoutMs);
    try {
      frame = doc.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("tabindex", "-1");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.onload = () => {
        const view = frame.contentWindow;
        if (!view) return finish(false);
        let opened = false;
        try {
          view.addEventListener("beforeprint", () => { opened = true; });
          view.focus();
          view.print();
        } catch {
          return finish(false);
        }
        finish(opened);
      };
      frame.srcdoc = html;
      doc.body.appendChild(frame);
    } catch {
      finish(false);
    }
  });
}

"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, X } from "lucide-react";

// Vista previa del QR físico de una ubicación On Street. El QR codifica
// únicamente la URL pública /estacionar/[qrCode] (misma familia que
// CredentialQrPreview.js, pero exclusiva de este módulo) — no incluye
// teléfono, IDs internos ni ningún otro dato sensible.
function sanitizeFileName(value) {
  return String(value || "qr-on-street")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qr-on-street";
}

export default function OnStreetQrPreview({ open, onClose, publicCode, url, title, parkingName, streetSegment, physicalReference }) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");
  const qrValue = useMemo(() => String(url || "").trim(), [url]);

  useEffect(() => {
    let active = true;
    if (!open || !qrValue) return undefined;
    QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8,
      type: "image/png",
      color: { dark: "#041E42", light: "#FFFFFF" },
    })
      .then((next) => {
        if (!active) return;
        setDataUrl(next);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setDataUrl("");
        setError("No fue posible generar el QR.");
      });
    return () => {
      active = false;
    };
  }, [open, qrValue]);

  if (!open) return null;

  function handleDownload() {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFileName(publicCode)}.png`;
    link.click();
  }

  function handlePrint() {
    if (!dataUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=520,height=680");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${title || publicCode}</title><style>body{font-family:Arial,sans-serif;margin:32px;text-align:center;color:#041E42}img{width:280px;height:280px}.name{margin-top:16px;font-size:18px;font-weight:700}.meta{margin-top:8px;font-size:13px;color:#475569}</style></head><body><img src="${dataUrl}" alt="Código QR"/><div class="name">${title || "Ubicación On Street"}</div><p class="meta">${[parkingName, streetSegment].filter(Boolean).join(" · ")}</p><p class="meta">${physicalReference || ""}</p><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
    printWindow.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">{title || "Código QR"}</h3>
            <p className="mt-1 text-sm text-slate-500">{[parkingName, streetSegment].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-[#041E42]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
          {dataUrl ? <img src={dataUrl} alt={`Código QR de ${title || publicCode}`} className="h-52 w-52 object-contain" /> : <span className="text-sm text-slate-500">Generando QR…</span>}
        </div>

        {physicalReference ? <p className="mt-3 text-sm text-slate-600"><b>Referencia física:</b> {physicalReference}</p> : null}
        <p className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{qrValue}</p>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={handleDownload} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)] disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" />Descargar PNG
          </button>
          <button type="button" onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)] disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" />Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

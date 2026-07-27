"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Copy, Download, Mail, MessageCircle, Printer, Send, Share2, X } from "lucide-react";

const QR_DESCRIPTION = "El código QR contiene únicamente un identificador interno seguro. Puede descargarse, imprimirse o compartirse desde un dispositivo compatible.";

function sanitizeFileName(value) {
  return String(value || "credencial")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "credencial";
}

async function dataUrlToPngFile(dataUrl, fileName) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: "image/png" });
}

export default function CredentialQrPreview({ identifier, title = "Código QR", className = "", emailConfig = null }) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [mailValues, setMailValues] = useState({ destinatario: "", asunto: "Credencial de acceso ParkFacil", mensaje: "" });
  const [mailStatus, setMailStatus] = useState("idle");
  const [mailMessage, setMailMessage] = useState("");
  const shareSupported = useSyncExternalStore(() => () => {}, () => typeof navigator !== "undefined" && typeof navigator.share === "function", () => false);
  const qrValue = useMemo(() => String(identifier || "").trim(), [identifier]);
  const canSendEmail = Boolean(emailConfig?.endpoint);

  useEffect(() => {
    let active = true;
    if (!qrValue) return undefined;

    QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8,
      type: "image/png",
      color: { dark: "#041E42", light: "#FFFFFF" },
    })
      .then((nextDataUrl) => {
        if (!active) return;
        setDataUrl(nextDataUrl);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setDataUrl("");
        setError("No fue posible generar la vista previa del QR.");
      });

    return () => {
      active = false;
    };
  }, [qrValue]);

  const handleDownload = () => {
    if (!dataUrl || !qrValue) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFileName(qrValue)}.png`;
    link.click();
  };

  const handlePrint = () => {
    if (!dataUrl || !qrValue) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=520,height=680");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${qrValue}</title><style>body{font-family:Arial,sans-serif;margin:32px;text-align:center;color:#041E42}img{width:280px;height:280px;image-rendering:pixelated}.id{margin-top:16px;font-size:16px;font-weight:700;letter-spacing:.04em}.note{margin:18px auto 0;max-width:360px;font-size:13px;color:#475569}</style></head><body><img src="${dataUrl}" alt="Código QR"/><div class="id">${qrValue}</div><p class="note">${QR_DESCRIPTION}</p><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
    printWindow.document.close();
  };

  const handleCopy = async () => {
    if (!qrValue || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(qrValue);
    setCopyStatus("Identificador copiado.");
  };

  const handleShare = async () => {
    if (!qrValue || !shareSupported) return;
    await navigator.share({ title, text: qrValue });
  };

  const handleWhatsApp = async () => {
    if (!qrValue) return;
    const text = `Credencial de acceso ParkFacil: ${qrValue}`;
    const fileName = `${sanitizeFileName(qrValue)}.png`;

    if (dataUrl && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
      const file = await dataUrlToPngFile(dataUrl, fileName);
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return;
      }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const openMailModal = () => {
    if (!canSendEmail) return;
    setMailValues({
      destinatario: emailConfig.destinatario || "",
      asunto: emailConfig.asunto || "Credencial de acceso ParkFacil",
      mensaje: emailConfig.mensaje || "Adjuntamos su credencial de acceso ParkFacil.",
    });
    setMailStatus("idle");
    setMailMessage("");
    setMailOpen(true);
  };

  const submitMail = async (event) => {
    event.preventDefault();
    if (!canSendEmail || mailStatus === "sending") return;
    setMailStatus("preparing");
    setMailMessage("Preparando...");
    try {
      setMailStatus("sending");
      setMailMessage("Enviando...");
      const response = await fetch(emailConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mailValues),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "No fue posible enviar la credencial.");
      setMailStatus("sent");
      setMailMessage("Correo enviado correctamente.");
    } catch (sendError) {
      setMailStatus("failed");
      setMailMessage(sendError?.message || "No fue posible enviar la credencial.");
    }
  };

  if (!qrValue) return null;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
          {dataUrl ? <img src={dataUrl} alt={`QR de credencial ${qrValue}`} className="h-full w-full object-contain" /> : <span className="text-center text-xs text-slate-500">Generando QR...</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#041E42]">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-600">{qrValue}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">{QR_DESCRIPTION}</p>
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          {copyStatus ? <p className="mt-2 text-xs font-medium text-emerald-700">{copyStatus}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleDownload} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8] disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />Descargar PNG</button>
            <button type="button" onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8] disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" />Imprimir</button>
            <button type="button" onClick={handleCopy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]"><Copy className="h-4 w-4" />Copiar identificador</button>
            {shareSupported ? <button type="button" onClick={handleShare} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]"><Share2 className="h-4 w-4" />Compartir</button> : null}
            <button type="button" onClick={handleWhatsApp} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#128C7E] transition hover:border-[#128C7E] disabled:cursor-not-allowed disabled:opacity-50"><MessageCircle className="h-4 w-4" />Enviar por WhatsApp</button>
            {canSendEmail ? <button type="button" onClick={openMailModal} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#3150D8] transition hover:border-[#3150D8]"><Mail className="h-4 w-4" />Enviar por correo</button> : null}
          </div>
        </div>
      </div>

      {mailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold text-[#041E42]">Enviar credencial por correo</h3><p className="mt-1 text-sm text-slate-500">El servidor recupera la credencial y adjunta el QR seguro.</p></div>
              <button type="button" onClick={() => setMailOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-[#041E42]"><X className="h-4 w-4" /></button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={submitMail}>
              <label className="block text-sm text-slate-600"><span className="font-medium">Destinatario</span><input type="email" value={mailValues.destinatario} onChange={(event) => setMailValues((current) => ({ ...current, destinatario: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#3150D8]" required /></label>
              <label className="block text-sm text-slate-600"><span className="font-medium">Asunto</span><input value={mailValues.asunto} maxLength={120} onChange={(event) => setMailValues((current) => ({ ...current, asunto: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#3150D8]" /></label>
              <label className="block text-sm text-slate-600"><span className="font-medium">Mensaje</span><textarea value={mailValues.mensaje} maxLength={1000} rows={4} onChange={(event) => setMailValues((current) => ({ ...current, mensaje: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#3150D8]" /></label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-xs font-semibold text-slate-500">Vista previa del QR</p>{dataUrl ? <img src={dataUrl} alt={`QR de credencial ${qrValue}`} className="h-28 w-28 rounded-lg bg-white p-2" /> : null}</div>
              {mailMessage ? <p className={`text-sm font-medium ${mailStatus === "sent" ? "text-emerald-700" : mailStatus === "failed" ? "text-rose-700" : "text-slate-600"}`}>{mailMessage}</p> : null}
              <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setMailOpen(false)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42]">Cancelar</button><button type="submit" disabled={mailStatus === "sending" || mailStatus === "preparing"} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"><Send className="h-4 w-4" />{mailStatus === "sending" || mailStatus === "preparing" ? "Enviando..." : "Enviar"}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

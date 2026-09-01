"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, Download, ExternalLink, Printer } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";

const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo" };

function subscribeOrigin() {
  return () => {};
}

function sanitizeFileName(value) {
  return String(value || "qr-on-street").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "qr-on-street";
}

// QR individual generado a partir del qrCode real de este punto (nunca un
// QR de demostración): la imagen se produce en el navegador con el paquete
// `qrcode` a partir de la URL pública real, en el momento de abrir esta
// página.
export default function OnStreetQrIndividualClient({ id }) {
  const router = useRouter();
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [qrError, setQrError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/locations/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar la ubicación QR.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  const publicUrl = useMemo(() => (data && origin ? `${publicOriginFor(origin)}/estacionar/${data.publicCode}` : ""), [data, origin]);

  useEffect(() => {
    let active = true;
    if (!publicUrl) return undefined;
    QRCode.toDataURL(publicUrl, { errorCorrectionLevel: "M", margin: 2, scale: 10, type: "image/png", color: { dark: "#041E42", light: "#FFFFFF" } })
      .then((next) => { if (active) { setDataUrl(next); setQrError(""); } })
      .catch(() => { if (active) { setDataUrl(""); setQrError("No fue posible generar el QR."); } });
    return () => { active = false; };
  }, [publicUrl]);

  function handleDownload() {
    if (!dataUrl || !data) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFileName(data.label || data.publicCode)}.png`;
    link.click();
  }

  function handlePrint() {
    if (!dataUrl || !data) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=520,height=680");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${data.label || data.publicCode}</title><style>body{font-family:Arial,sans-serif;margin:32px;text-align:center;color:#041E42}img{width:280px;height:280px}.name{margin-top:16px;font-size:18px;font-weight:700}.meta{margin-top:8px;font-size:13px;color:#475569}</style></head><body><img src="${dataUrl}" alt="Código QR"/><div class="name">${data.label || "Punto QR On Street"}</div><p class="meta">${data.parking.name} · ${data.segment?.name || ""}</p><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
    printWindow.document.close();
  }

  if (loading) return <AppShell title="QR" description="Cargando"><div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600">Cargando…</div></AppShell>;

  if (!data || error) {
    const sessionExpired = error === "SESSION_EXPIRED";
    return (
      <AppShell title="QR" description="No encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">{sessionExpired ? "Tu sesión expiró." : "No se encontró el punto QR solicitado."}</p>
          <div className="mt-4">
            {sessionExpired ? (
              <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]"><ArrowLeft className="h-4 w-4" /> Volver</Link>
            ) : (
              <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]"><ArrowLeft className="h-4 w-4" /> Volver</button>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`QR · ${data.label || data.publicCode}`} description="Código QR individual">
      <div className="space-y-6">
        <PageHeader title="Código QR" description={data.label || data.publicCode} onBack={() => router.back()} backLabel="Volver" />

        <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
            {dataUrl ? <img src={dataUrl} alt={`Código QR de ${data.label || data.publicCode}`} className="h-64 w-64 object-contain" /> : <span className="text-sm text-slate-500">Generando QR…</span>}
          </div>
          {qrError ? <p className="mt-2 text-center text-xs text-rose-600">{qrError}</p> : null}

          <dl className="mt-5 space-y-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Ubicación</dt><dd className="mt-1 font-semibold text-[#041E42]">{data.parking.name} · {data.segment?.name || "—"}</dd></div>
            <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Estado</dt><dd className="mt-1"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${data.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{ESTADO_LABEL[data.status] || data.status}</span></dd></div>
            <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">URL pública</dt><dd className="mt-1 break-all font-mono text-xs text-slate-700">{publicUrl}</dd></div>
          </dl>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]"><ExternalLink className="h-4 w-4" />Abrir</a>
            <button type="button" onClick={handleDownload} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />Descargar QR</button>
            <button type="button" onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" />Imprimir</button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

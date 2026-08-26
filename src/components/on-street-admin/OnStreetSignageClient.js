"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Download, Printer, Car, Clock, CreditCard, ShieldCheck, Mail, MapPin, Building2, Phone, Smartphone } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";

function subscribeOrigin() {
  return () => {};
}

function sanitizeFileName(value) {
  return String(value || "qr-on-street").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "qr-on-street";
}

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);

// Paso de la columna "Escanea y comienza tu estadía": ícono + título + detalle.
// El paso de pago referencia Webpay real explícitamente — este letrero nunca
// debe volver a decir "piloto", "pago simulado" ni "sin transacción real"
// (ver también el comentario original más abajo).
function Step({ Icon, title, detail }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary)]"><Icon className="h-4.5 w-4.5" /></span>
      <div>
        <p className="text-sm font-bold text-[#041E42]">{title}</p>
        <p className="text-sm text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

// Letrero imprimible completo, construido en el navegador a partir de los
// datos reales del punto (empresa, ubicación, tarifa, contacto) y del QR
// real generado en vivo — no es una imagen estática ni una maqueta. Listo
// para el flujo definitivo con Webpay: no menciona piloto, pago simulado ni
// "sin transacción real".
export default function OnStreetSignageClient({ id }) {
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataUrl, setDataUrl] = useState("");

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
    QRCode.toDataURL(publicUrl, { errorCorrectionLevel: "H", margin: 1, scale: 12, type: "image/png", color: { dark: "#041E42", light: "#FFFFFF" } })
      .then((next) => { if (active) setDataUrl(next); })
      .catch(() => { if (active) setDataUrl(""); });
    return () => { active = false; };
  }, [publicUrl]);

  function handleDownloadQr() {
    if (!dataUrl || !data) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `letrero-${sanitizeFileName(data.label || data.publicCode)}-qr.png`;
    link.click();
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <AppShell title="Letrero" description="Cargando"><div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600">Cargando…</div></AppShell>;

  if (!data || error) {
    const sessionExpired = error === "SESSION_EXPIRED";
    return (
      <AppShell title="Letrero" description="No encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">{sessionExpired ? "Tu sesión expiró." : "No se encontró el punto QR solicitado."}</p>
          <div className="mt-4"><Link href={sessionExpired ? "/login" : "/on-street-qr/ubicaciones"} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]"><ArrowLeft className="h-4 w-4" /> Volver</Link></div>
        </div>
      </AppShell>
    );
  }

  const location = [data.area?.name, data.street?.name, data.segment?.name].filter(Boolean).join(" · ");
  const contactPhone = data.operator.phone || null;
  const contactEmail = data.operator.email || null;

  return (
    <AppShell title={`Letrero · ${data.label || data.publicCode}`} description="Letrero imprimible">
      <div className="space-y-6 print:hidden">
        <PageHeader title="Letrero para instalar en terreno" description="Vista previa generada con los datos reales de este punto. Descarga o imprime desde aquí." backHref={`/on-street-qr/ubicaciones/${id}`} backLabel="Volver a la ficha" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Printer className="h-4 w-4" />Imprimir letrero</button>
          <button type="button" onClick={handleDownloadQr} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] disabled:opacity-60"><Download className="h-4 w-4" />Descargar QR</button>
        </div>
        <p className="text-xs text-slate-500">&quot;Imprimir letrero&quot; abre el diálogo de impresión del navegador — desde ahí también puedes elegir &quot;Guardar como PDF&quot;. &quot;Descargar QR&quot; descarga únicamente la imagen del código.</p>
      </div>

      {/* Letrero: esto es lo que se imprime. Mismo contenido en pantalla y en papel. */}
      <section className="mx-auto mt-6 max-w-2xl overflow-hidden rounded-[28px] border border-[#DCE6FA] bg-white text-[#041E42] shadow-xl print:mt-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="p-8 sm:p-10">
          {/* Encabezado: marca a la izquierda, badge del producto a la derecha */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--pf-color-onstreet-primary)] text-white"><span className="text-lg font-black leading-none">P</span></span>
              <span className="text-2xl font-black tracking-tight">ParkFacil</span>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-xs font-bold text-white">
              <Car className="h-4 w-4" /> Estacionamiento por minutos
            </span>
          </div>

          <h1 className="mt-8 text-3xl font-black uppercase tracking-tight sm:text-4xl">Estacionamiento por minutos</h1>
          <p className="mt-1 text-base text-slate-500">Rápido, seguro y sin efectivo</p>

          <hr className="my-7 border-slate-200" />

          {/* QR + pasos, en dos columnas */}
          <div className="grid gap-8 sm:grid-cols-[220px_1fr]">
            <div>
              <div className="overflow-hidden rounded-2xl border-2 border-[var(--pf-color-onstreet-primary)]">
                <div className="grid aspect-square place-items-center bg-white p-3">
                  {dataUrl ? <img src={dataUrl} alt={`Código QR de ${data.label || data.publicCode}`} className="h-full w-full" /> : <div className="grid h-full w-full place-items-center text-xs text-slate-400">Generando QR…</div>}
                </div>
                <div className="flex items-center justify-center gap-2 bg-[var(--pf-color-onstreet-primary)] py-2.5 text-xs font-bold text-white">
                  <Smartphone className="h-3.5 w-3.5" /> Escanea para estacionar
                </div>
              </div>
              {data.rate ? (
                <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Valor por minuto</p>
                  <p className="text-lg font-black text-emerald-700">{money(data.rate.minuteAmount)}</p>
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-wide text-[#041E42]">Escanea y comienza tu estadía</p>
              <div className="mt-4 space-y-4">
                <Step Icon={Clock} title="Selecciona tu tiempo" detail="Elige los minutos que necesitas." />
                <Step Icon={CreditCard} title="Paga con Webpay" detail="Tarjetas de crédito y débito, de forma segura." />
                <Step Icon={ShieldCheck} title="Fácil y seguro" detail="Todo desde tu teléfono, sin apps ni registro." />
                <Step Icon={Mail} title="¿Dudas o consultas?" detail="Contacta al operador." />
              </div>
            </div>
          </div>

          {/* Ubicación */}
          <div className="mt-7 flex items-start gap-3 rounded-2xl bg-[var(--pf-color-onstreet-tint)] p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--pf-color-onstreet-primary)] text-white"><MapPin className="h-4.5 w-4.5" /></span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-[var(--pf-color-onstreet-primary)]">Ubicación</p>
              <p className="text-base font-bold text-[#041E42]">{data.parking.name}</p>
              {location ? <p className="text-sm text-slate-500">{location}{data.segment?.side && data.segment.side !== "—" ? ` · Lado ${data.segment.side}` : ""}</p> : null}
            </div>
          </div>

          {/* Operador */}
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Building2 className="h-4.5 w-4.5" /></span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Operador</p>
                <p className="text-base font-bold text-[#041E42]">{data.operator.tradeName}</p>
                <p className="text-sm text-slate-500">{data.operator.businessName}{data.operator.rut ? ` · RUT ${data.operator.rut}` : ""}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {contactEmail ? <p className="flex items-center gap-2 text-[#041E42]"><Mail className="h-4 w-4 text-emerald-700" /> {contactEmail}</p> : null}
              {contactPhone ? <p className="flex items-center gap-2 text-[#041E42]"><Phone className="h-4 w-4 text-emerald-700" /> {contactPhone}</p> : null}
              {!contactEmail && !contactPhone ? <p className="text-slate-500">Contacto no informado</p> : null}
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#041E42] px-8 py-5 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#7C9CE0]" />
            <div>
              <p className="text-sm font-black">ParkFacil</p>
              <p className="text-xs text-[#9BB0D9]">Operación segura · Pago real vía Webpay</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p className="text-[#9BB0D9]">Más información</p>
            <p className="font-bold text-white">www.parkfacil.cl</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

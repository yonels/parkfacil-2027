"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EstadoTicketBadge from "@/components/operacion/EstadoTicketBadge";
import PermanenciaBadge from "@/components/operacion/PermanenciaBadge";

function money(value) {
  return value == null ? "—" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

const ORIGIN_LABELS = { WEB: "Web", POS: "POS", MOBILE: "Móvil", TABLET: "Tablet", OTHER: "Otro" };
function originLabel(source) {
  return ORIGIN_LABELS[source] || source || "—";
}

function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}

function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900 text-right">{value ?? "—"}</dd>
    </div>
  );
}

export default function OperacionDetailClient({ id }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Fase 6 — fotografía de patente: se resuelve aparte (nunca viaja junto al
  // detalle general) y siempre como signed URL de corta duración, nunca una
  // URL pública permanente (§10/§11 del encargo).
  const [platePhoto, setPlatePhoto] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/operacion/${id}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setDetail(null);
          setError(payload?.error || "No se encontró el movimiento solicitado.");
          return;
        }
        setDetail(payload?.data || null);
      } catch {
        if (!cancelled) setError("No fue posible conectar con el servidor. Intenta nuevamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/operacion/${id}/plate-photo`)
      .then((response) => response.json().catch(() => null))
      .then((payload) => { if (!cancelled) setPlatePhoto(payload?.data || null); })
      .catch(() => { if (!cancelled) setPlatePhoto(null); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm text-slate-500">Cargando…</div>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Movimiento no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "El identificador solicitado no existe o no está autorizado para tu sesión."}</p>
          <Link href="/operacion" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white"><ArrowLeft className="h-4 w-4" />Volver a Operación</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de operación</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{detail.ticket}</h1>
              <p className="mt-2 text-sm text-slate-600">Patente {detail.plate} · {detail.entry.date} {detail.entry.time}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/operacion" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Volver</Link>
              <EstadoTicketBadge estado={detail.status} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Empresa / Estacionamiento</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{detail.company?.name || "—"}</p>
            <p className="text-sm text-slate-600">{detail.parking?.name || "—"}{detail.parking?.code ? ` · ${detail.parking.code}` : ""}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Origen</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{originLabel(detail.origin)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Permanencia</p>
            <div className="mt-2"><PermanenciaBadge permanencia={detail.billing?.minutes} /></div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Ingreso</h2>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              <Field label="Fecha/hora" value={`${detail.entry.date} ${detail.entry.time}`} />
              <Field label="Operador" value={detail.entry.operator} />
              <Field label="Turno" value={detail.entry.shiftDate ? `Turno ${detail.entry.shiftDate}` : "—"} />
            </dl>

            {platePhoto ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-500">Fotografía patente</p>
                <img
                  src={platePhoto.url}
                  alt={`Fotografía de la patente ${detail.plate}`}
                  className="mt-2 w-full max-w-xs rounded-2xl border border-slate-200 object-cover"
                />
              </div>
            ) : null}

            <h2 className="mt-6 text-lg font-semibold text-[#041E42]">Salida</h2>
            {detail.exit ? (
              <dl className="mt-4 divide-y divide-slate-100 text-sm">
                <Field label="Fecha/hora" value={`${detail.exit.date} ${detail.exit.time}`} />
                <Field label="Operador" value={detail.exit.operator} />
                <Field label="Turno" value={detail.exit.shiftDate ? `Turno ${detail.exit.shiftDate}` : "—"} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Sin salida registrada.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Cobro</h2>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              <Field label="Duración" value={detail.billing.minutes != null ? `${detail.billing.minutes} min` : "—"} />
              <Field label="Tarifa" value={detail.billing.rateName || "—"} />
              <Field label="Subtotal" value={money(detail.billing.subtotalAmount)} />
              {detail.coupon ? <Field label="Beneficio (cupón)" value={detail.coupon.code} /> : null}
              {detail.billing.discountAmount > 0 ? <Field label="Descuento" value={money(-detail.billing.discountAmount)} /> : null}
              <Field label="Neto" value={money(detail.billing.netAmount)} />
              <Field label="IVA" value={money(detail.billing.taxAmount)} />
              <Field label="Total" value={money(detail.billing.totalAmount)} />
              <Field label="Medio de pago" value={paymentMethodLabel(detail.billing.paymentMethod)} />
              <Field label="Código de transacción" value={detail.billing.paymentCode || "—"} />
            </dl>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

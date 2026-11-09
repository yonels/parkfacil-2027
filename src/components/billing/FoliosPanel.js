"use client";
import { useEffect, useState } from "react";

// Folios disponibles (SOL-2026-11-05-005). «full»: cuadro completo en Configuración. «alert»: solo un aviso cuando
// faltan o vencen folios de factura, nota de crédito o nota de débito (Ciclo y Facturar en lote).
const TONE = { ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", err: "bg-red-100 text-red-800" };
const dmy = (iso) => (iso ? String(iso).split("-").reverse().join("-") : "—");

export default function FoliosPanel({ variant = "full" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/folios", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (!active) return; if (ok) { setData(body.data); setError(""); } else setError(body.error || "No fue posible consultar los folios."); })
      .catch(() => { if (active) setError("No fue posible consultar los folios."); });
    return () => { active = false; };
  }, [reloadKey]);

  if (variant === "alert") {
    if (!data || data.provider !== "HAULMER" || !data.alerts?.length) return null;
    return (
      <div role="alert" className={`rounded-2xl border px-4 py-3 text-sm ${data.worst === "err" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <b>Folios:</b> {data.alerts.map((a) => `${a.label}: ${a.message}`).join(" · ")} Revise «Folios disponibles» en Configuración.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-[#041E42]">Folios disponibles</h3>
          <p className="mt-1 text-sm text-slate-600">Cantidad de folios (CAF) que quedan por tipo de documento y su vencimiento, según Haulmer. Aviso en amarillo si quedan menos de 50 o vencen en 30 días o menos; en rojo si se agotaron o vencieron.</p>
        </div>
        <button type="button" onClick={() => { setData(null); setReloadKey((k) => k + 1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Actualizar</button>
      </div>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!data && !error ? <p className="mt-3 text-sm text-slate-500">Consultando a Haulmer…</p> : null}
      {data?.provider === "SIMULATED" ? <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Modo simulado: no hay folios reales. Al elegir Haulmer como proveedor se muestran aquí.</p> : null}
      {data?.provider === "HAULMER" ? (
        <>
          {data.environment === "TEST" ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ambiente de pruebas: los folios son de la empresa de prueba de Haulmer (compartida), no de ParkFacil SpA.</p> : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4">Documento</th><th className="py-2 pr-4 text-right">Disponibles</th><th className="py-2 pr-4">Vencen</th><th className="py-2 pr-4">Estado</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.dte} className="border-b last:border-0">
                    <td className="py-2 pr-4"><b>{r.dte}</b> · {r.label}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{r.available.toLocaleString("es-CL")}</td>
                    <td className="py-2 pr-4">{dmy(r.expires)}{r.daysLeft != null ? <span className="text-slate-500"> · {r.daysLeft} día(s)</span> : null}</td>
                    <td className="py-2 pr-4"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[r.level]}`}>{r.level === "ok" ? "Suficientes" : r.level === "warn" ? "Atención" : "Sin folios"}</span>{r.message ? <span className="ml-2 text-xs text-slate-600">{r.message}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Consultado {new Date(data.checkedAt).toLocaleString("es-CL")} · Los folios se solicitan y cargan en el portal de OpenFactura; ParkFacil solo los consulta.</p>
        </>
      ) : null}
    </section>
  );
}

"use client";

// Plan de la empresa (SOL-2026-10-28-002): contratos con su plan vigente,
// asignar/cambiar plan con fecha de vigencia, quitarlo e historial. Solo Root.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History, LoaderCircle, RefreshCw, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const ESTADO_CONTRATO = { draft: "Borrador", pending_signature: "Pendiente de firma", active: "Activo", suspended: "Suspendido", expired: "Vencido", terminated: "Terminado", cancelled: "Cancelado" };
const CERRADOS = ["expired", "terminated", "cancelled"];

function hoyChile() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function fecha(valor) {
  if (!valor) return "—";
  const [a, m, d] = String(valor).split("-");
  return `${d}-${m}-${a}`;
}

function valoresResumen(v = {}, moneda) {
  const items = [["Mensual", v.monthly_fee], ["Por transacción", v.transaction_fee], ["Implementación", v.implementation_fee], ["Por estacionamiento", v.parking_fee], ["Mínimo mensual", v.minimum_monthly_charge]]
    .filter(([, monto]) => Number(monto) > 0)
    .map(([etiqueta, monto]) => `${etiqueta}: ${moneda} ${Number(monto).toLocaleString("es-CL")}`);
  return items.length ? items.join(" · ") : "Sin cargos informados";
}

export default function PlanEmpresaPanel({ companyId }) {
  const [estado, setEstado] = useState({ cargando: true, error: "", data: null });
  const [formulario, setFormulario] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState({ tipo: "", texto: "" });

  const cargar = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/planes/empresas/${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los planes de la empresa.");
      setEstado({ cargando: false, error: "", data: body.data });
    } catch (error) {
      setEstado({ cargando: false, error: error instanceof Error ? error.message : "No fue posible cargar los planes.", data: null });
    }
  }, [companyId]);

  useEffect(() => { const t = window.setTimeout(() => void cargar(), 0); return () => window.clearTimeout(t); }, [cargar]);

  async function enviar(event) {
    event.preventDefault();
    const { contrato, accion, planId, fechaAccion, motivo } = formulario;
    if (accion === "quitar" && !window.confirm(`¿Quitar el plan del contrato ${contrato.numero}? Quedará registrado en el historial.`)) return;
    setEnviando(true);
    setAviso({ tipo: "", texto: "" });
    try {
      const body = accion === "asignar"
        ? { accion, planId, validFrom: fechaAccion, reason: motivo }
        : { accion, validTo: fechaAccion, reason: motivo };
      const response = await authenticatedFetch(`/api/planes/contratos/${contrato.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const resultado = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(resultado.error || "No fue posible actualizar el plan.");
      setAviso({ tipo: "exito", texto: accion === "asignar" ? `Plan asignado al contrato ${contrato.numero}.` : `Plan quitado del contrato ${contrato.numero}.` });
      setFormulario(null);
      await cargar();
    } catch (error) {
      setAviso({ tipo: "error", texto: error instanceof Error ? error.message : "No fue posible actualizar el plan." });
    } finally {
      setEnviando(false);
    }
  }

  if (estado.cargando) return <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando planes de la empresa…</p>;
  if (estado.error) return <p role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">{estado.error}</p>;

  const { empresa, contratos, planesActivos } = estado.data;
  const rut = [empresa.rut_number, empresa.rut_dv].filter(Boolean).join("-");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">Empresa</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#041E42]">{empresa.business_name}</h2>
        <p className="mt-1 text-sm text-slate-600">{empresa.trade_name}{rut ? ` · RUT ${rut}` : ""}</p>
      </section>

      {aviso.texto ? (
        <p role={aviso.tipo === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${aviso.tipo === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {aviso.texto}
        </p>
      ) : null}

      {contratos.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Esta empresa no tiene contratos.</p>
          <p className="mt-1">El plan se asigna a un contrato. Crea primero el contrato de la empresa en <Link href="/contratos" className="font-semibold underline">Contratos</Link>.</p>
        </section>
      ) : contratos.map((contrato) => {
        const cerrado = CERRADOS.includes(contrato.estado);
        const planesMoneda = planesActivos.filter((p) => p.moneda === contrato.moneda);
        const abierto = formulario?.contrato?.id === contrato.id;
        return (
          <section key={contrato.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#041E42]">Contrato {contrato.numero}</h3>
                <p className="text-sm text-slate-600">{ESTADO_CONTRATO[contrato.estado] || contrato.estado} · {fecha(contrato.desde)} → {fecha(contrato.hasta)} · Moneda {contrato.moneda}</p>
              </div>
              {!cerrado ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setFormulario({ contrato, accion: "asignar", planId: "", fechaAccion: hoyChile(), motivo: "" })} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E5EFF]">
                    <RefreshCw className="h-4 w-4" /> {contrato.planVigente ? "Cambiar plan" : "Asignar plan"}
                  </button>
                  {contrato.planVigente ? (
                    <button type="button" onClick={() => setFormulario({ contrato, accion: "quitar", fechaAccion: hoyChile(), motivo: "" })} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                      <X className="h-4 w-4" /> Quitar plan
                    </button>
                  ) : null}
                </div>
              ) : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Contrato cerrado: solo lectura</span>}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-500">Plan vigente</p>
              {contrato.planVigente ? (
                <>
                  <p className="mt-1 text-base font-semibold text-[#041E42]">{contrato.planVigente.codigo} · {contrato.planVigente.nombre} <span className="text-sm font-normal text-slate-500">(versión {contrato.planVigente.version}, desde {fecha(contrato.planVigente.desde)})</span></p>
                  <p className="mt-1 text-slate-600">{valoresResumen(contrato.planVigente.valores, contrato.planVigente.moneda)}</p>
                </>
              ) : <p className="mt-1 text-slate-600">Sin plan asignado.</p>}
            </div>

            {abierto ? (
              <form onSubmit={enviar} className="mt-4 grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm sm:grid-cols-3">
                {formulario.accion === "asignar" ? (
                  <label className="font-semibold text-slate-600 sm:col-span-1">Plan
                    <select required value={formulario.planId} onChange={(e) => setFormulario({ ...formulario, planId: e.target.value })} className="input mt-1">
                      <option value="">Selecciona un plan activo</option>
                      {planesMoneda.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                    </select>
                    {planesMoneda.length === 0 ? <span className="mt-1 block font-normal text-amber-800">No hay planes activos en {contrato.moneda}.</span> : null}
                  </label>
                ) : null}
                <label className="font-semibold text-slate-600">{formulario.accion === "asignar" ? "Rige desde" : "Rige hasta"}
                  <input type="date" required value={formulario.fechaAccion} onChange={(e) => setFormulario({ ...formulario, fechaAccion: e.target.value })} className="input mt-1" />
                </label>
                <label className="font-semibold text-slate-600">Motivo (opcional)
                  <input value={formulario.motivo} maxLength={500} onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })} className="input mt-1" placeholder={formulario.accion === "asignar" ? "Ej.: upgrade solicitado por el cliente" : "Ej.: término del servicio"} />
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button type="submit" disabled={enviando} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 font-bold text-white disabled:opacity-60">
                    {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{formulario.accion === "asignar" ? "Guardar plan" : "Quitar plan"}
                  </button>
                  <button type="button" onClick={() => setFormulario(null)} className="rounded-xl border bg-white px-4 py-2 font-semibold">Cancelar</button>
                </div>
              </form>
            ) : null}

            <div className="mt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#041E42]"><History className="h-4 w-4 text-[#3150D8]" /> Historial de planes</p>
              {contrato.historial.length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin historial.</p> : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-2">Plan</th><th className="p-2">Versión</th><th className="p-2">Desde</th><th className="p-2">Hasta</th><th className="p-2">Valores</th><th className="p-2">Motivo</th></tr></thead>
                    <tbody>{contrato.historial.map((t) => (
                      <tr key={t.id} className="border-b align-top">
                        <td className="p-2 font-semibold text-[#041E42]">{t.codigo} · {t.nombre}</td>
                        <td className="p-2">v{t.version}</td>
                        <td className="p-2">{fecha(t.desde)}</td>
                        <td className="p-2">{t.hasta ? fecha(t.hasta) : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Vigente</span>}</td>
                        <td className="p-2 text-slate-600">{valoresResumen(t.valores, t.moneda)}</td>
                        <td className="p-2 text-slate-600">{[t.motivo, t.motivoTermino].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

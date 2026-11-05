"use client";

import { useEffect, useState } from "react";
import { Power, X } from "lucide-react";
import EstadoEmpresaBadge from "./EstadoEmpresaBadge";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { canManageCompanyStatus, COMPANY_REASON_LABELS, COMPANY_SUSPENSION_REASONS } from "@/lib/companyServiceStatus.mjs";

const dateTime = (value) => new Date(value).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

export default function EmpresaEstadoControl({ empresa, onChanged }) {
  const [open, setOpen] = useState(false);
  if (!canManageCompanyStatus(empresa)) return <EstadoEmpresaBadge estado={empresa.estado} />;
  const deactivating = empresa.estado === "active";
  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid={`empresa-estado-${empresa.id}`} title={deactivating ? "Desactivar empresa" : "Reactivar empresa"} className="group inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8]">
      <EstadoEmpresaBadge estado={empresa.estado} />
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3150D8] group-hover:underline"><Power className="h-3.5 w-3.5" />{deactivating ? "Desactivar" : "Activar"}</span>
    </button>
    {open ? <EstadoDialog empresa={empresa} deactivating={deactivating} onClose={() => setOpen(false)} onChanged={(status) => { setOpen(false); onChanged?.(empresa.id, status); }} /> : null}
  </>;
}

function EstadoDialog({ empresa, deactivating, onClose, onChanged }) {
  const [reasonCode, setReasonCode] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/empresas/${empresa.id}/estado`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setHistory(body?.data || []); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [empresa.id]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/empresas/${empresa.id}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: deactivating ? "inactive" : "active", reasonCode, detail }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cambiar el estado.");
      onChanged(body.data.status);
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  };

  const last = history?.[0];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="empresa-estado-titulo">
    <form onSubmit={submit} className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white text-left text-sm font-normal normal-case shadow-xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div><h2 id="empresa-estado-titulo" className="text-lg font-bold text-[#041E42]">{deactivating ? "Desactivar" : "Reactivar"} {empresa.nombreFantasia}</h2><p className="mt-1 text-slate-500">{empresa.razonSocial}</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-4 p-5">
        {deactivating ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
          <p className="font-semibold">Se apagan todos los servicios de la empresa, de inmediato:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Administradores y operadores no podrán entrar.</li>
            <li>El POS deja de operar, incluso con turnos abiertos: no podrá registrar salidas ni cobrar.</li>
            <li>Los QR y pagos públicos no aceptan cobros nuevos.</li>
            <li>Se detienen los avisos SMS de On Street.</li>
          </ul>
          <p className="mt-2">Los pagos ya iniciados se terminan de registrar y los datos se conservan.</p>
        </div> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">La empresa vuelve a operar: sus cuentas, el POS y los servicios públicos quedan habilitados de inmediato. Los SMS cancelados no se reenvían.</p>}
        {deactivating ? <label className="block font-semibold text-slate-700">Motivo
          <select required value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
            <option value="">Selecciona…</option>
            {COMPANY_SUSPENSION_REASONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select></label> : null}
        <label className="block font-semibold text-slate-700">{deactivating ? `Detalle${reasonCode === "OTHER" ? "" : " (opcional)"}` : "Motivo de la reactivación"}
          <textarea value={detail} maxLength={500} rows={3} required={!deactivating || reasonCode === "OTHER"} minLength={!deactivating || reasonCode === "OTHER" ? 5 : undefined} onChange={(event) => setDetail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
        {last ? <p className="text-xs text-slate-500" data-testid="empresa-estado-ultimo">Último cambio: {COMPANY_REASON_LABELS[last.reason_code] || last.reason_code}{last.reason_detail ? ` (${last.reason_detail})` : ""}, {dateTime(last.created_at)}{last.actor_email ? `, ${last.actor_email}` : ""}.</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4">
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700">Cancelar</button>
        <button type="submit" disabled={saving} className={`rounded-full px-4 py-2 font-semibold text-white disabled:opacity-60 ${deactivating ? "bg-rose-700 hover:bg-rose-800" : "bg-emerald-700 hover:bg-emerald-800"}`}>{saving ? "Guardando…" : deactivating ? "Desactivar empresa" : "Reactivar empresa"}</button>
      </footer>
    </form>
  </div>;
}

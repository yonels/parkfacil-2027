"use client";

import { PAISES_TELEFONO, getPaisTelefono } from "@/lib/paisesTelefono";
import { normalizeTelefonoNumero } from "@/lib/abonados";

export default function SelectorTelefonoInternacional({ label = "Telefono", pais, codigo, numero, onChange, errors = {}, field = "telefonoNumero" }) {
  const selected = getPaisTelefono(pais);

  const updatePais = (nextIso) => {
    const next = getPaisTelefono(nextIso);
    onChange({ pais: next.iso, codigo: next.codigo, numero });
  };

  return (
    <label className="text-sm text-slate-600">
      <span className="font-medium">{label}</span>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_72px] gap-2 sm:grid-cols-[minmax(150px,0.9fr)_72px_minmax(180px,1.2fr)]">
        <select value={selected.iso} onChange={(event) => updatePais(event.target.value)} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100" aria-label="Pais telefonico">
          {PAISES_TELEFONO.map((item) => <option key={item.iso} value={item.iso}>{item.nombre} ({item.codigo})</option>)}
        </select>
        <input value={codigo || selected.codigo} readOnly aria-label="Codigo de pais" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center font-semibold text-slate-700 outline-none" />
        <input value={numero || ""} onChange={(event) => onChange({ pais: selected.iso, codigo: codigo || selected.codigo, numero: normalizeTelefonoNumero(event.target.value) })} aria-label="Numero telefonico" className="col-span-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100 sm:col-span-1" />
      </div>
      {errors[field] ? <p className="mt-1 text-xs text-rose-600">{errors[field]}</p> : null}
    </label>
  );
}

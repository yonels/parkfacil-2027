"use client";
// Barra de filtros combinables del Centro de Control SMS. El estado vive en
// la URL (?desde=&hasta=&empresa=...) para poder compartir o recargar la vista.
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { SMS_MODULE_LABELS, SMS_STATUS_LABELS } from "@/lib/sms/smsCenterCore.mjs";

const FIELD = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#3150D8] focus:outline-none focus:ring-2 focus:ring-[#3150D8]/20";
const KEYS = ["desde", "hasta", "empresa", "establecimiento", "modulo", "estado", "simulados", "agrupar"];

export function useSmsQuery() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) if (value) params.set(key, value);
    return params;
  }, [searchParams]);
}

export default function SmsFilters({ showBucket = false, showSearch = false, defaultBucket = "day" }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSmsQuery();
  const [options, setOptions] = useState({ companies: [], parkings: [] });
  const [search, setSearch] = useState(query.get("q") || "");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/centro-sms/opciones", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { data: null }))
      .then((body) => { if (active && body?.data) setOptions(body.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function update(changes) {
    const next = new URLSearchParams(query.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value == null || value === false) next.delete(key);
      else next.set(key, value === true ? "1" : String(value));
    }
    if (!("pagina" in changes)) next.delete("pagina");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }

  const companyId = query.get("empresa") || "";
  const parkings = companyId && options.viewer !== "COMPANY" ? options.parkings.filter((p) => p.companyId === companyId) : options.parkings;
  const hasFilters = KEYS.some((key) => query.get(key)) || query.get("q");

  return (
    <section aria-label="Filtros" className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        <label className="text-xs font-medium text-slate-500">Desde
          <input type="date" className={`${FIELD} mt-1`} value={query.get("desde") || ""} onChange={(e) => update({ desde: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-500">Hasta
          <input type="date" className={`${FIELD} mt-1`} value={query.get("hasta") || ""} onChange={(e) => update({ hasta: e.target.value })} />
        </label>
        {options.viewer !== "ROOT" ? null : (
          <label className="text-xs font-medium text-slate-500">Cliente
            <select className={`${FIELD} mt-1`} value={companyId} onChange={(e) => update({ empresa: e.target.value, establecimiento: "" })}>
              <option value="">Todos</option>
              {options.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-500">Establecimiento
          <select className={`${FIELD} mt-1`} value={query.get("establecimiento") || ""} onChange={(e) => update({ establecimiento: e.target.value })}>
            <option value="">Todos</option>
            {parkings.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">Módulo
          <select className={`${FIELD} mt-1`} value={query.get("modulo") || ""} onChange={(e) => update({ modulo: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(SMS_MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">Estado
          <select className={`${FIELD} mt-1`} value={query.get("estado") || ""} onChange={(e) => update({ estado: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(SMS_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {showBucket ? (
          <label className="text-xs font-medium text-slate-500">Agrupar por
            <select className={`${FIELD} mt-1`} value={query.get("agrupar") || defaultBucket} onChange={(e) => update({ agrupar: e.target.value === defaultBucket ? "" : e.target.value })}>
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </label>
        ) : null}
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#3150D8]" checked={query.get("simulados") === "1"} onChange={(e) => update({ simulados: e.target.checked })} />
            Incluir simulados
          </label>
          {hasFilters ? (
            <button type="button" onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }} className="inline-flex items-center gap-1 text-sm font-medium text-[#3150D8] hover:underline">
              <RotateCcw className="h-4 w-4" /> Limpiar filtros
            </button>
          ) : null}
        </div>
      </div>
      {showSearch ? (
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); update({ q: search.trim() }); }}>
          <input type="search" className={FIELD} placeholder="Buscar por últimos dígitos del teléfono, ID interno o ID de Sentraland" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={60} aria-label="Buscar mensajes" />
          <button type="submit" className="rounded-xl bg-[#3150D8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2741b5]">Buscar</button>
        </form>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">Sin fechas se muestran los últimos 30 días (hora de Chile). Los envíos simulados no se cuentan como reales salvo que se incluyan.</p>
    </section>
  );
}

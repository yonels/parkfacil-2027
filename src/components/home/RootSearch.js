"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const labels = { module: "Sección", company: "Empresa", parking: "Estacionamiento", user: "Usuario" };
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function RootSearch({ modules }) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const term = query.trim();
  const matchingModules = useMemo(() => term.length >= 2 ? modules.filter((item) =>
    normalize(`${item.title} ${item.description}`).includes(normalize(term))
  ).map((item) => ({ ...item, type: "module", detail: item.description })) : [], [modules, term]);

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await authenticatedFetch(`/api/root-search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible completar la búsqueda.");
        setRecords(body.data || []);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);

  const results = [...matchingModules, ...records];
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Búsqueda global Root">
      <h2 className="text-lg font-semibold text-[#041E42]">Buscar en ParkFacil</h2>
      <p className="mt-1 text-sm text-slate-600">Encuentra secciones, empresas, estacionamientos y usuarios.</p>
      <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 focus-within:border-[#3150D8] focus-within:ring-2 focus-within:ring-[#3150D8]/20">
        <Search className="h-5 w-5 shrink-0 text-[#3150D8]" aria-hidden="true" />
        <span className="sr-only">Buscar por nombre, código, RUT o correo</span>
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setRecords([]); setError(""); setLoading(event.target.value.trim().length >= 2); }} placeholder="Buscar por nombre, código, RUT o correo…" className="w-full bg-transparent text-sm text-[#041E42] outline-none placeholder:text-slate-500" />
      </label>
      {term.length === 1 && <p className="mt-3 text-sm text-slate-500">Escribe al menos 2 caracteres.</p>}
      {term.length >= 2 && <div className="mt-4" aria-live="polite">
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Buscando registros…</p>}
        {!loading && !error && !results.length && <p className="text-sm text-slate-500">No se encontraron resultados.</p>}
        {!!results.length && <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => <Link key={`${item.type}:${item.href}`} href={item.href} className="rounded-xl border border-slate-200 px-4 py-3 transition hover:border-[#3150D8] hover:bg-[#F5F9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#3150D8]">{labels[item.type]}</span>
            <span className="mt-1 block font-semibold text-[#041E42]">{item.title}</span>
            <span className="mt-1 block text-xs text-slate-600">{item.detail}</span>
          </Link>)}
        </div>}
      </div>}
    </section>
  );
}

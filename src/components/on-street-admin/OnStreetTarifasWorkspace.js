"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeDollarSign } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkingRatesManager from "@/components/estacionamientos/ParkingRatesManager";

// No se construye un motor tarifario nuevo: On Street reutiliza tal cual
// ParkingRatesManager.js, ya usado por el resto de ParkFacil. Esta vista lo
// monta dentro de /on-street-qr para no atravesar la superficie visual
// /estacionamientos/*, cuya navegación corresponde al producto Off Street.
export default function OnStreetTarifasWorkspace() {
  const [parkings, setParkings] = useState([]);
  const [selectedParking, setSelectedParking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations/options", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los estacionamientos On Street.");
      setParkings(body.data?.parkings || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  if (selectedParking) {
    return (
      <section className="space-y-5">
        <button type="button" onClick={() => setSelectedParking(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]">
          <ArrowLeft className="h-4 w-4" /> Volver a estacionamientos On Street
        </button>
        <div className="rounded-2xl border border-[var(--pf-color-onstreet-border)] bg-[var(--pf-color-onstreet-tint)] px-4 py-3 text-sm text-[var(--pf-color-onstreet-primary-700)]">
          Configuración tarifaria QR On Street · {selectedParking.companyName}
        </div>
        <ParkingRatesManager key={selectedParking.id} parking={selectedParking} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-600">Las tarifas On Street se administran con el mismo motor tarifario del resto de ParkFacil (modalidad &quot;Minuto efectivo&quot;). Selecciona un estacionamiento para configurar su tarifa.</p>

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error === "SESSION_EXPIRED" ? "Tu sesión expiró. Vuelve a iniciar sesión." : error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>
      ) : parkings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No tienes estacionamientos On Street disponibles.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {parkings.map((p) => (
            <button type="button" key={p.id} onClick={() => setSelectedParking(p)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--pf-color-onstreet-primary)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F5F9FF] text-[var(--pf-color-onstreet-primary)]"><BadgeDollarSign className="h-5 w-5" /></span>
                <div>
                  <p className="font-semibold text-[#041E42]">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.companyName} · pestaña Tarifas</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

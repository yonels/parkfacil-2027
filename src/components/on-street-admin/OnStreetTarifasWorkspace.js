"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeDollarSign } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkingRatesManager from "@/components/estacionamientos/ParkingRatesManager";

// No se construye un motor tarifario nuevo: On Street reutiliza tal cual
// ParkingRatesManager.js, ya usado por el resto de ParkFacil. Esta vista lo
// monta dentro de /on-street-qr para no atravesar la superficie visual
// /estacionamientos/*, cuya navegación corresponde al producto Off Street.
export default function OnStreetTarifasWorkspace() {
  const router = useRouter();
  // Corrección UX/funcional "Proyectos On Street" (2026-08-29): al llegar
  // desde la ficha de un Proyecto (/on-street-qr/proyectos/[id]?parkingId=),
  // esta pantalla debe abrir DIRECTO la tarifa de ESE estacionamiento -- sin
  // volver a mostrar el selector genérico (que antes obligaba a re-elegir y
  // fue la causa real de perder el contexto del Proyecto). Si parkingId no
  // existe, no es ON_STREET o no está autorizado para este usuario, se
  // muestra un error explícito: JAMÁS cae de vuelta al selector ni a "el
  // primer estacionamiento" en silencio.
  // Se lee directamente de window.location (en vez de useSearchParams(), que
  // exige un límite Suspense y rompía el prerender estático de esta ruta) --
  // mismo patrón ya usado en OnStreetWorkspace.js para ?segmentId=/?parkingId=.
  const [parkingIdParam, setParkingIdParam] = useState(undefined); // undefined = aún no leído
  useEffect(() => {
    const timer = window.setTimeout(() => setParkingIdParam(new URLSearchParams(window.location.search).get("parkingId")), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [parkings, setParkings] = useState([]);
  const [selectedParking, setSelectedParking] = useState(null);
  const [contextError, setContextError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (parkingIdParam === undefined) return; // aún no se leyó window.location -- evita una carga extra
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations/options", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los estacionamientos On Street.");
      const loaded = body.data?.parkings || [];
      setParkings(loaded);
      if (parkingIdParam) {
        const match = loaded.find((p) => p.id === parkingIdParam);
        if (match) { setSelectedParking(match); setContextError(""); }
        else setContextError("Este Proyecto no existe, no es On Street, o no tienes autorización para administrarlo.");
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [parkingIdParam]);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  if (parkingIdParam && contextError) {
    return (
      <section className="space-y-4">
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{contextError}</p>
      </section>
    );
  }

  // parkingIdParam: undefined = aún no se leyó window.location; string = viene
  // de un Proyecto; null = confirmado sin contexto (picker genérico de abajo).
  if (parkingIdParam !== null && loading) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>;
  }

  if (selectedParking) {
    return (
      <section className="space-y-5">
        {parkingIdParam ? (
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
        ) : (
          <button type="button" onClick={() => setSelectedParking(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)]">
            <ArrowLeft className="h-4 w-4" /> Volver a estacionamientos On Street
          </button>
        )}
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

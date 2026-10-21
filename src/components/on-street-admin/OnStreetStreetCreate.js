"use client";
// "Nueva calle" 100% On Street (2026-08-28): antes, tanto llegando con
// contexto precargado (desde la ficha de un Área) como sin él (desde el
// listado de Calles), el flujo terminaba en /estacionamientos/.../calles/
// nueva -- el usuario salía visualmente de On Street. Ahora todo el flujo
// (elegir estacionamiento/área si falta, completar el formulario, guardar)
// ocurre dentro de esta misma pantalla bajo /on-street-qr/calles/nueva.
//
// NO se duplica lógica: se reutiliza tal cual OnStreetQuickCreate (el mismo
// picker de Estacionamiento/Área que ya usan Área y Tramo) vía su nuevo prop
// onReady, y StructureEntityForm (kind="street") -- el mismo formulario,
// validación y endpoint PATCH/POST que ya usa Off Street -- vía sus props
// cancelHref/onSaved (ver StructureEntityForm.js).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import OnStreetQuickCreate from "./OnStreetQuickCreate";
import StructureEntityForm from "@/components/estacionamientos/StructureEntityForm";

export default function OnStreetStreetCreate({ initialParkingId = "", initialSectorId = "" }) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    initialParkingId && initialSectorId ? { parkingId: initialParkingId, sectorId: initialSectorId } : null,
  );
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Se pide una sola vez: tanto el picker (OnStreetQuickCreate, reutilizado)
  // como el formulario final necesitan la misma lista de estacionamientos/
  // áreas -- sin este fetch propio, el formulario no tendría cómo resolver
  // parking.code/area.id a partir de los ids ya elegidos.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch("/api/on-street-qr/locations/options", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
        if (!response.ok) throw new Error(body.error || "No fue posible cargar los estacionamientos On Street.");
        if (active) setOptions(body.data);
      } catch (cause) {
        if (active) setError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const parking = useMemo(() => (options?.parkings || []).find((p) => p.id === selected?.parkingId) || null, [options, selected]);
  const area = useMemo(() => (options?.areas || []).find((a) => a.id === selected?.sectorId) || null, [options, selected]);

  // Cancelar (§6): si llegó con contexto precargado desde la ficha del
  // Área, vuelve a esa Área; si venía del listado de Calles (sin contexto),
  // vuelve al listado. Nunca al árbol Off Street.
  const cancelHref = initialSectorId ? `/on-street-qr/areas/${initialSectorId}` : "/on-street-qr/calles";

  if (loading) return <AppShell title="Nueva calle" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;
  if (error) return <AppShell title="Nueva calle" description="Error"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p></AppShell>;

  return (
    <AppShell title="Nueva calle" description="On Street">
      <div className="space-y-6">
        {/* Breadcrumb On Street (§4): distinto según el punto de entrada,
            pero el árbol activo siempre es On Street, nunca Off Street. */}
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
          <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
          <span>/</span>
          <Link href="/on-street-qr/areas" className="hover:text-[var(--pf-color-onstreet-primary)]">Ubicaciones</Link>
          <span>/</span>
          {initialSectorId ? (
            <>
              <Link href="/on-street-qr/areas" className="hover:text-[var(--pf-color-onstreet-primary)]">Áreas</Link>
              <span>/</span>
              <Link href={`/on-street-qr/areas/${initialSectorId}`} className="hover:text-[var(--pf-color-onstreet-primary)]">{area?.name || "Área"}</Link>
            </>
          ) : (
            <Link href="/on-street-qr/calles" className="hover:text-[var(--pf-color-onstreet-primary)]">Calles</Link>
          )}
          <span>/</span>
          <span className="text-slate-700">Nueva calle</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-black text-[#041E42]">Nueva calle</h1>
          {/* "Volver" real de historial (2026-08-30) -- ver nota en OnStreetAdminPage.js. */}
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
        </div>

        {!selected ? (
          <OnStreetQuickCreate kind="street" onReady={(parkingId, sectorId) => setSelected({ parkingId, sectorId })} />
        ) : !parking || !area ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">No fue posible resolver el estacionamiento/área seleccionados.</p>
        ) : (
          <div className="space-y-4">
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <strong className="text-slate-800">{parking.companyName || parking.operator?.tradeName}</strong> · {parking.name} · Área <strong className="text-slate-800">{area.code} · {area.name}</strong>
            </p>
            <StructureEntityForm
              kind="street"
              parking={parking}
              parent={area}
              entity={null}
              cancelHref={cancelHref}
              onSaved={(data) => router.push(`/on-street-qr/calles/${data.id}`)}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

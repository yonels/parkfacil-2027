"use client";

// Acceso directo (Root únicamente — ver ROOT_ONLY_PREFIXES en permissions.mjs)
// para crear Áreas/Calles/Tramos sin recorrer manualmente la jerarquía
// completa de /estacionamientos. No duplica formularios ni validación: solo
// elige el estacionamiento On Street (y área/calle padre si corresponde) y
// redirige a la ruta de creación real ya existente (StructureEntityForm /
// StreetSegmentsManager), que sigue siendo la única fuente de verdad.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const DESCRIPTIONS = {
  area: "Elige el estacionamiento On Street donde se creará la nueva área.",
  street: "Elige el estacionamiento y el área donde se creará la nueva calle.",
  segment: "Elige el estacionamiento, el área y la calle donde se creará el nuevo tramo.",
};

export default function OnStreetQuickCreate({ kind }) {
  const router = useRouter();
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [streetId, setStreetId] = useState("");

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

  const parkings = useMemo(() => options?.parkings || [], [options]);
  const areas = useMemo(() => (options?.areas || []).filter((a) => a.parkingId === parkingId), [options, parkingId]);
  const streets = useMemo(() => (options?.streets || []).filter((s) => s.sectorId === sectorId), [options, sectorId]);
  const parkingSeleccionado = useMemo(() => parkings.find((p) => p.id === parkingId) || null, [parkings, parkingId]);

  function actualizarParking(value) {
    setParkingId(value);
    setSectorId("");
    setStreetId("");
  }

  function actualizarArea(value) {
    setSectorId(value);
    setStreetId("");
  }

  const listo = kind === "area" ? Boolean(parkingId) : kind === "street" ? Boolean(parkingId && sectorId) : Boolean(parkingId && sectorId && streetId);

  function continuar() {
    if (!parkingSeleccionado) return;
    if (kind === "area") {
      router.push(`/estacionamientos/${parkingSeleccionado.code}/sectores/nuevo`);
      return;
    }
    if (kind === "street") {
      router.push(`/estacionamientos/${parkingSeleccionado.code}/sectores/${sectorId}/calles/nueva`);
      return;
    }
    router.push(`/estacionamientos/${parkingSeleccionado.code}/sectores/${sectorId}/calles/${streetId}`);
  }

  if (loading) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>;
  }
  if (error) {
    return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>;
  }
  if (!parkings.length) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No tienes estacionamientos On Street disponibles.</div>;
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{DESCRIPTIONS[kind]}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5 text-sm text-slate-700">
          <span className="font-medium text-slate-500">Estacionamiento</span>
          <select value={parkingId} onChange={(event) => actualizarParking(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
            <option value="">Selecciona un estacionamiento</option>
            {parkings.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.companyName})</option>)}
          </select>
        </label>

        {kind !== "area" ? (
          <label className="block space-y-1.5 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Área</span>
            <select value={sectorId} onChange={(event) => actualizarArea(event.target.value)} disabled={!parkingId} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)] disabled:bg-slate-100">
              <option value="">Selecciona un área</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </label>
        ) : null}

        {kind === "segment" ? (
          <label className="block space-y-1.5 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Calle</span>
            <select value={streetId} onChange={(event) => setStreetId(event.target.value)} disabled={!sectorId} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)] disabled:bg-slate-100">
              <option value="">Selecciona una calle</option>
              {streets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {kind === "segment" && listo ? (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Te llevaremos a la ficha de la calle, donde el botón &quot;Crear tramo&quot; ya está disponible.
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button type="button" disabled={!listo} onClick={continuar} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          Continuar
        </button>
      </div>
    </section>
  );
}

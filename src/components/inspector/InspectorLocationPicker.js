"use client";
// Contexto territorial del Inspector (Etapa 3, §13/§14): NO restringe la
// consulta global de patentes (§3) -- solo permite declarar dónde está
// fiscalizando, para atribuir parking_id/qr_location_id en fiscalizaciones
// NO_SESSION/OTHER (que de otro modo quedan "Sin estacionamiento asignado",
// caso real detectado en Etapa 2). Persistido en sessionStorage: se
// mantiene mientras el Inspector siga fiscalizando en el mismo lugar, sin
// tener que volver a elegirlo por cada patente -- "CAMBIAR UBICACIÓN" lo
// limpia explícitamente.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { areasForParking, streetsForArea, segmentsForStreet } from "@/lib/inspector/inspectorContextCore.mjs";

const STORAGE_KEY = "parkfacil:inspector:context";

export function readStoredContext() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredContext(context) {
  try {
    if (context) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Almacenamiento no disponible (modo privado, etc.): el contexto
    // simplemente no persiste entre patentes -- no bloquea fiscalizar.
  }
}

export default function InspectorLocationPicker({ context, onChange }) {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [segmentId, setSegmentId] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch("/api/inspector/context", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
        if (!response.ok) throw new Error(body.error || "No fue posible cargar los estacionamientos.");
        if (active) setOptions(body.data);
      } catch (cause) {
        if (active) setError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const areas = useMemo(() => areasForParking(options?.areas, parkingId), [options, parkingId]);
  const streets = useMemo(() => streetsForArea(options?.streets, areaId), [options, areaId]);
  const segments = useMemo(() => segmentsForStreet(options?.segments, streetId), [options, streetId]);

  const confirmar = useCallback(() => {
    const parking = (options?.parkings || []).find((p) => p.id === parkingId);
    if (!parking) return;
    const area = areas.find((a) => a.id === areaId) || null;
    const street = streets.find((s) => s.id === streetId) || null;
    const segment = segments.find((s) => s.id === segmentId) || null;
    const next = {
      parkingId: parking.id,
      parkingName: parking.name,
      areaId: area?.id || null,
      areaName: area?.name || null,
      streetId: street?.id || null,
      streetName: street?.name || null,
      segmentId: segment?.id || null,
      segmentName: segment?.name || null,
      qrLocationId: segment?.qrLocationId || null,
    };
    writeStoredContext(next);
    onChange(next);
  }, [options, parkingId, areaId, streetId, segmentId, areas, streets, segments, onChange]);

  function cambiarUbicacion() {
    writeStoredContext(null);
    onChange(null);
    setParkingId(""); setAreaId(""); setStreetId(""); setSegmentId("");
  }

  if (context?.parkingId) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-2xl border-2 border-[var(--pf-color-onstreet-primary,#3150D8)] bg-[#EEF4FF] p-4">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#3150D8]" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-black text-[#041E42]">{context.parkingName}</p>
            <p className="text-slate-600">
              {[context.areaName, context.streetName, context.segmentName].filter(Boolean).join(" · ") || "Sin área/calle/tramo específico"}
            </p>
          </div>
        </div>
        <button type="button" onClick={cambiarUbicacion} className="flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
          <X className="h-3.5 w-3.5" aria-hidden="true" />CAMBIAR UBICACIÓN
        </button>
      </div>
    );
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando estacionamientos…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-slate-300 p-4">
      <p className="text-sm font-bold text-[#041E42]">¿Dónde estás fiscalizando? (opcional, ayuda a atribuir la fiscalización)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Estacionamiento
          <select value={parkingId} onChange={(e) => { setParkingId(e.target.value); setAreaId(""); setStreetId(""); setSegmentId(""); }} className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-sm">
            <option value="">Selecciona…</option>
            {(options?.parkings || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Área
          <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setStreetId(""); setSegmentId(""); }} disabled={!parkingId} className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-sm disabled:bg-slate-100">
            <option value="">Selecciona…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Calle
          <select value={streetId} onChange={(e) => { setStreetId(e.target.value); setSegmentId(""); }} disabled={!areaId} className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-sm disabled:bg-slate-100">
            <option value="">Selecciona…</option>
            {streets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Tramo
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} disabled={!streetId} className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-sm disabled:bg-slate-100">
            <option value="">Selecciona…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} · ${s.name}` : s.name}</option>)}
          </select>
        </label>
      </div>
      <button type="button" disabled={!parkingId} onClick={confirmar} className="min-h-12 w-full rounded-2xl bg-[#3150D8] text-sm font-black text-white disabled:opacity-40">
        USAR ESTA UBICACIÓN
      </button>
    </div>
  );
}

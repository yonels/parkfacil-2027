"use client";

// Fiscalizaciones dentro de la Administración On Street (§20 del brief,
// completado Etapa 3 §30-32): integra on_street_inspections (Etapa 2 de
// Inspectores) sin duplicar esa infraestructura -- mismos filtros de
// período/lugar/empresa y misma grilla (ParkFacilDataGrid) que el resto
// del módulo. Doble clic abre el detalle READ ONLY (§31), con evidencia
// fotográfica vía signed URL (§32) -- nunca un bucket público.
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const TYPE_LABELS = { OVERSTAY: "Exceso de tiempo", NO_SESSION: "Sin sesión", OTHER: "Otro" };
const SMS_LABELS = { NOT_REQUIRED: "No requerido", PENDING: "Pendiente", SENDING: "Enviando", SENT: "Enviado", FAILED: "Fallido" };

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Personalizado" },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }

const columns = [
  { key: "inspected_at", label: "Fecha/hora", render: dt },
  { key: "license_plate_normalized", label: "Patente" },
  { key: "company", label: "Empresa", getValue: (r) => (r.unassigned ? null : r.location?.companyName), render: (v) => v || "—" },
  { key: "location", label: "Lugar", getValue: (r) => (r.unassigned ? "Sin estacionamiento asignado" : r.location?.label), render: (v, r) => v || (r.unassigned ? "Sin estacionamiento asignado" : "Sin sesión asociada") },
  { key: "inspection_type", label: "Motivo", render: (v) => TYPE_LABELS[v] || v, filterType: "select", filterOptions: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })) },
  { key: "vehicle_still_present", label: "Vehículo presente", render: (v) => (v ? "Sí" : "No") },
  { key: "inspectorEmail", label: "Inspector" },
  { key: "sms_status", label: "Estado SMS", render: (v) => SMS_LABELS[v] || v },
  { key: "sms_sent_at", label: "SMS enviado", render: dt },
  { key: "observations", label: "Observaciones", render: (v) => v || "—" },
];

function DetalleFiscalizacion({ row, onClose }) {
  const [evidence, setEvidence] = useState(null);
  const [evidenceError, setEvidenceError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch(`/api/on-street-qr/fiscalizaciones/${row.id}/evidence`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible cargar la evidencia.");
        if (active) setEvidence(body.data || []);
      } catch (cause) {
        if (active) setEvidenceError(cause.message);
      }
    })();
    return () => { active = false; };
  }, [row.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#041E42]">Fiscalización · {row.license_plate_normalized}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Consulta de solo lectura — no es posible modificar un hecho histórico desde esta ficha.</p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Campo label="Patente" valor={row.license_plate_normalized} />
          <Campo label="Fecha/hora" valor={dt(row.inspected_at)} />
          <Campo label="Motivo" valor={TYPE_LABELS[row.inspection_type] || row.inspection_type} />
          <Campo label="Vehículo presente" valor={row.vehicle_still_present ? "Sí" : "No"} />
          <Campo label="Inspector" valor={row.inspectorEmail} />
          <Campo label="Empresa" valor={row.unassigned ? "—" : row.location?.companyName || "—"} />
          <Campo label="Estacionamiento" valor={row.unassigned ? "Sin estacionamiento asignado" : row.location?.parkingName || "—"} />
          <Campo label="Área" valor={row.location?.sectorName || "—"} />
          <Campo label="Calle" valor={row.location?.streetName || "—"} />
          <Campo label="Tramo" valor={row.location?.segmentName || "—"} />
          <Campo label="GPS" valor={row.latitude != null && row.longitude != null ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}` : "No capturado"} />
          <Campo label="Estado SMS" valor={SMS_LABELS[row.sms_status] || row.sms_status} />
          {row.sms_sent_at ? <Campo label="SMS enviado" valor={dt(row.sms_sent_at)} /> : null}
          <Campo label="ID fiscalización" valor={row.id} span />
          {row.session_id ? <Campo label="ID sesión" valor={row.session_id} span /> : null}
        </dl>

        {row.observations ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observaciones</p>
            <p className="mt-1 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{row.observations}</p>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidencia fotográfica</p>
          {evidenceError ? (
            <p className="mt-2 text-sm text-rose-700">{evidenceError}</p>
          ) : evidence === null ? (
            <p className="mt-2 text-sm text-slate-500">Cargando…</p>
          ) : evidence.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Sin evidencia fotográfica registrada.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-3">
              {evidence.map((item) => (
                item.url ? (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-2xl border border-slate-200">
                    <img src={item.url} alt="Evidencia de fiscalización" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div key={item.id} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-slate-300 text-xs text-slate-400">Enlace no disponible</div>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, valor, span = false }) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-800">{valor}</dd>
    </div>
  );
}

export default function OnStreetFiscalizaciones() {
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch("/api/on-street-qr/companies", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (active && response.ok) setCompanies(body.data || []);
      } catch {
        // Selector Empresa simplemente no aparece.
      }
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period });
      if (period === "custom") { params.set("from", customFrom); params.set("to", customTo); }
      if (companyId) params.set("companyId", companyId);
      if (parkingId) params.set("parkingId", parkingId);
      const response = await authenticatedFetch(`/api/on-street-qr/fiscalizaciones?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las fiscalizaciones.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, companyId, parkingId]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-700)] to-[var(--pf-color-onstreet-primary-800)] p-6 text-white shadow-sm">
        <h1 className="text-xl font-black">Fiscalizaciones On Street</h1>
        <p className="mt-1 text-sm text-white/85">Registro real de fiscalizaciones de Inspectores en terreno.</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${period === p.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">Desde<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">Hasta<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {companies.length > 1 ? (
            <label className="block max-w-xs text-xs font-semibold text-slate-600">
              Empresa
              <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setParkingId(""); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Todas</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ) : null}
          {data?.options?.parkings?.length ? (
            <label className="block max-w-xs text-xs font-semibold text-slate-600">
              Estacionamiento
              <select value={parkingId} onChange={(e) => setParkingId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Todos</option>
                {data.options.parkings.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p> : null}

      {kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Fiscalizaciones del período", kpis.total],
            ["Vehículos vencidos fiscalizados", kpis.overstay],
            ["Patentes observadas (distintas)", kpis.distinctPlates],
            ["Reincidencias", kpis.reincidences],
            ["SMS enviados", kpis.smsSent],
            ["SMS fallidos", kpis.smsFailed],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
            </article>
          ))}
        </div>
      ) : null}

      {/* unassignedCount solo llega distinto de undefined para platform_admin
          (ver listOnStreetInspections) -- company_admin nunca ve este aviso,
          porque nunca puede ver esos registros (sin parking_id no hay forma
          de saber a qué empresa pertenecen). */}
      {typeof data?.unassignedCount === "number" && data.unassignedCount > 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{data.unassignedCount}</strong> fiscalización(es) sin sesión ni estacionamiento asignado (tipo «Sin sesión»/«Otro» registradas sin que el Inspector seleccionara una ubicación) — incluidas en la tabla como «Sin estacionamiento asignado». Solo visibles para platform_admin. Desde la Etapa 3, la app de Inspectores ya permite seleccionar un estacionamiento al fiscalizar sin sesión — este aviso solo aplicará a registros donde el Inspector no lo haya seleccionado.
        </p>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
        ) : (
          <ParkFacilDataGrid
            storageKey="on-street:fiscalizaciones"
            columns={columns}
            rows={data?.rows || []}
            onRowDoubleClick={setSelected}
            emptyMessage="Sin fiscalizaciones para el período y filtros seleccionados."
            exportFilename="on_street_fiscalizaciones"
            exportSheetName="Fiscalizaciones"
          />
        )}
      </section>

      {selected ? <DetalleFiscalizacion row={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

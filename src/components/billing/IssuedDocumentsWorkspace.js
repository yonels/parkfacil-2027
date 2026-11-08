"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, RefreshCcw, Search } from "lucide-react";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { DTE_SOURCES, DTE_TYPE_LABELS } from "@/lib/billing/dteRegistryCore.mjs";

// «Documentos emitidos» como en EasyDoc (SOL-2026-11-05-005, F2b; D10): facturas y notas de ParkFacil, importadas
// desde EasyDoc o el Registro de Ventas del SII y sincronizadas con Haulmer.
const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

const COLUMNS = [
  { key: "dteType", label: "Tipo DTE", width: 90, required: true },
  { key: "folio", label: "Folio SII", width: 100, required: true },
  { key: "issueDate", label: "Fecha", width: 110, render: (value) => date(value), exportValue: (row) => date(row.issueDate) },
  { key: "receiverRut", label: "RUT", width: 120 },
  { key: "receiverName", label: "Razón social", width: 260 },
  { key: "net", label: "Monto neto", width: 120, render: (value) => money(value), exportValue: (row) => row.net },
  { key: "exempt", label: "Monto exento", width: 120, render: (value) => money(value), exportValue: (row) => row.exempt },
  { key: "tax", label: "IVA", width: 110, render: (value) => money(value), exportValue: (row) => row.tax },
  { key: "total", label: "Monto total", width: 120, render: (value) => money(value), exportValue: (row) => row.total },
  { key: "siiStatus", label: "Estado SII", width: 130, render: (value, row) => (row.voided ? "Anulado" : value || "-"), exportValue: (row) => (row.voided ? "Anulado" : row.siiStatus) },
  { key: "customerResponse", label: "Respuesta cliente", width: 170 },
  { key: "reference", label: "Referencia", width: 120 },
  { key: "companyName", label: "Empresa ParkFacil", width: 200, render: (value) => value || "Sin empresa" },
  { key: "source", label: "Origen", width: 150, render: (value) => DTE_SOURCES[value] || value, exportValue: (row) => DTE_SOURCES[row.source] || row.source },
];

const EMPTY_FILTERS = { dteType: "", folio: "", rut: "", name: "", from: "", to: "", response: "", source: "" };
const RESPONSES = ["Aceptado x Omisión", "Otorga Recibo", "Acepta Contenido", "Reclamo al Contenido", "SIN_RESPUESTA"];
const inputClass = "w-full rounded-lg border border-slate-300 p-2 text-sm";

async function fetchDocuments(current) {
  const params = new URLSearchParams(Object.entries(current).filter(([, value]) => value));
  const response = await fetch(`/api/billing/dte-registry?${params}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No fue posible cargar los documentos.");
  return body.data || {};
}

function Field({ label, children }) {
  return <label className="block text-sm"><span className="font-semibold text-slate-700">{label}</span><div className="mt-1">{children}</div></label>;
}

export default function IssuedDocumentsWorkspace() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sync, setSync] = useState(null);
  // Resultado visible de la última búsqueda (pedido del usuario 2026-11-09: «como se sabe que ejecutó la operación?»).
  const [searchInfo, setSearchInfo] = useState(null);
  const [badDate, setBadDate] = useState({ from: false, to: false });

  const load = useCallback(async (current) => {
    try {
      const data = await fetchDocuments(current);
      setRows(data.rows || []); setImports(data.imports || []); setError("");
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    fetchDocuments(applied)
      .then((data) => { if (active) { setRows(data.rows || []); setImports(data.imports || []); setError(""); setSearchInfo({ count: (data.rows || []).length, at: new Date().toLocaleTimeString("es-CL"), filtered: Object.values(applied).some(Boolean) }); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied]);

  const totals = useMemo(() => rows.filter((row) => !row.voided).reduce((acc, row) => {
    const sign = row.dteType === 61 ? -1 : 1;
    return { net: acc.net + sign * row.net, tax: acc.tax + sign * row.tax, total: acc.total + sign * row.total };
  }, { net: 0, tax: 0, total: 0 }), [rows]);

  async function upload(commit) {
    if (!file) { setError("Seleccione la planilla de EasyDoc o el CSV de ventas del SII."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/billing/dte-registry/import?commit=${commit}`, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible leer la planilla.");
      if (commit) { setPreview(null); setFile(null); setMessage(`Importación lista: ${body.data.inserted} nuevos, ${body.data.updated} actualizados, ${body.data.unchanged} sin cambios.`); await load(applied); }
      else setPreview(body.data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function runSync() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing/dte-registry/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sync || {}) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible sincronizar con Haulmer.");
      const d = body.data;
      setMessage(`Haulmer (${d.environment === "TEST" ? "pruebas" : "producción"}) ${date(d.range.from)} a ${date(d.range.to)}: ${d.inserted} nuevos, ${d.updated} actualizados, ${d.unchanged} sin cambios${d.truncated ? " (se alcanzó el máximo de consultas; repita para continuar)" : ""}.`);
      setSync(null); await load(applied);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function openPdf(row) {
    if (row.origin === "parkfacil") { window.open(`/api/billing/documents/${row.id}/provider?value=pdf`, "_blank", "noopener"); return; }
    if (!row.providerToken) { setMessage(`El PDF del folio ${row.folio} está en ${DTE_SOURCES[row.source] || row.source}: se emitió fuera de ParkFacil.`); return; }
    window.open(`/api/billing/dte-registry/${row.id}/pdf`, "_blank", "noopener");
  }

  const set = (key) => (event) => {
    // Un input de fecha con una fecha imposible (p. ej. 31 de noviembre) queda vacío: se avisa en vez de ignorarla.
    if (key === "from" || key === "to") setBadDate((current) => ({ ...current, [key]: Boolean(event.target.validity?.badInput) }));
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };
  function search() {
    if (badDate.from || badDate.to) { setError("Hay una fecha que no existe (por ejemplo, 31 de noviembre). Corríjala y vuelva a buscar."); return; }
    if (filters.from && filters.to && filters.from > filters.to) { setError("La fecha de inicio es posterior a la fecha de fin."); return; }
    setError(""); setSearchInfo(null); setLoading(true); setApplied({ ...filters });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">Consulta de documentos</h3>
            <p className="mt-1 text-sm text-slate-600">Facturas, notas de crédito y notas de débito emitidas por ParkFacil SpA, de cualquier origen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setSync(sync ? null : { from: "", to: "" })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCcw className="h-4 w-4" />Sincronizar con Haulmer</button>
            <button type="button" disabled={busy} onClick={() => { setPreview(null); setFile(null); document.getElementById("dte-import-file")?.click(); }} className="inline-flex items-center gap-2 rounded-lg bg-[#3150D8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileUp className="h-4 w-4" />Importar planilla</button>
            <input id="dte-import-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); event.target.value = ""; }} />
          </div>
        </div>

        {sync ? (
          <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
            <Field label="Desde"><input type="date" value={sync.from} onChange={(e) => setSync({ ...sync, from: e.target.value })} className={inputClass} /></Field>
            <Field label="Hasta"><input type="date" value={sync.to} onChange={(e) => setSync({ ...sync, to: e.target.value })} className={inputClass} /></Field>
            <p className="self-end text-xs text-slate-500 md:col-span-1">Sin fechas: últimos 7 días. Se ejecuta solo cada día a las 08:15.</p>
            <div className="self-end"><button type="button" disabled={busy} onClick={runSync} className="rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sincronizando…" : "Sincronizar ahora"}</button></div>
          </div>
        ) : null}

        {file ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
            <p><span className="font-semibold">Archivo:</span> {file.name}</p>
            <p className="mt-1 text-xs text-slate-600">EasyDoc: «Descarga Excel» de Documentos Emitidos. SII: pestaña VENTA → «Descargar Detalles» (un archivo por tipo; no le cambie el nombre).</p>
            {!preview ? <button type="button" disabled={busy} onClick={() => upload(false)} className="mt-3 rounded-lg bg-[#3150D8] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Revisando…" : "Revisar planilla"}</button> : null}
            {preview ? (
              <div className="mt-3 space-y-2">
                <p>Origen: <span className="font-semibold">{DTE_SOURCES[preview.source] || preview.source}</span>. <span className="font-semibold">{preview.valid}</span> documentos válidos de {preview.totalRows} filas ({Object.entries(preview.byType).map(([type, count]) => `${count} ${DTE_TYPE_LABELS[type]?.toLowerCase() || `tipo ${type}`}`).join(", ")}).</p>
                <p><span className="font-semibold">{preview.inserted}</span> nuevos · <span className="font-semibold">{preview.updated}</span> con cambios (estado, respuesta del cliente…) · <span className="font-semibold">{preview.unchanged}</span> ya registrados sin cambios.</p>
                <p>{preview.matchedCompanies} documentos corresponden a empresas creadas en ParkFacil; {preview.unmatchedReceivers.length} clientes aún no están creados (se importan igual, asociados por RUT).</p>
                {preview.errors.length ? <div className="rounded-lg bg-red-50 p-2 text-red-700"><p className="font-semibold">{preview.errors.length} fila(s) con errores no se importarán:</p><ul className="ml-4 list-disc">{preview.errors.slice(0, 10).map((e, i) => <li key={i}>Fila {e.row}: {e.message}</li>)}</ul></div> : null}
                {preview.skipped ? <p className="text-slate-600">{preview.skipped} fila(s) de otros tipos de documento se omiten.</p> : null}
                <div className="flex gap-2 pt-1">
                  <button type="button" disabled={busy || !preview.inserted && !preview.updated} onClick={() => upload(true)} className="rounded-lg bg-[#3150D8] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Importando…" : "Confirmar importación"}</button>
                  <button type="button" disabled={busy} onClick={() => { setPreview(null); setFile(null); }} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Cancelar</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Tipo DTE"><select value={filters.dteType} onChange={set("dteType")} className={inputClass}><option value="">Todos</option>{Object.entries(DTE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</select></Field>
          <Field label="Folio SII"><input value={filters.folio} onChange={set("folio")} inputMode="numeric" className={inputClass} /></Field>
          <Field label="RUT cliente"><input value={filters.rut} onChange={set("rut")} placeholder="76540968-3" className={inputClass} /></Field>
          <Field label="Razón social"><input value={filters.name} onChange={set("name")} className={inputClass} /></Field>
          <Field label="Fecha inicio"><input type="date" value={filters.from} onChange={set("from")} onBlur={(e) => setBadDate((c) => ({ ...c, from: Boolean(e.target.validity?.badInput) }))} className={`${inputClass} ${badDate.from ? "border-red-500 bg-red-50" : ""}`} />{badDate.from ? <span className="mt-1 block text-xs font-semibold text-red-600">Fecha que no existe</span> : null}</Field>
          <Field label="Fecha fin"><input type="date" value={filters.to} onChange={set("to")} onBlur={(e) => setBadDate((c) => ({ ...c, to: Boolean(e.target.validity?.badInput) }))} className={`${inputClass} ${badDate.to ? "border-red-500 bg-red-50" : ""}`} />{badDate.to ? <span className="mt-1 block text-xs font-semibold text-red-600">Fecha que no existe</span> : null}</Field>
          <Field label="Respuesta cliente"><select value={filters.response} onChange={set("response")} className={inputClass}><option value="">Todas</option>{RESPONSES.map((r) => <option key={r} value={r}>{r === "SIN_RESPUESTA" ? "Sin respuesta" : r}</option>)}</select></Field>
          <Field label="Origen"><select value={filters.source} onChange={set("source")} className={inputClass}><option value="">Todos</option>{Object.entries(DTE_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={loading} onClick={search} className="inline-flex items-center gap-2 rounded-lg bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2741b5] active:scale-95 disabled:cursor-wait disabled:opacity-60"><Search className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />{loading ? "Buscando…" : "Buscar"}</button>
          <button type="button" disabled={loading} onClick={() => { setError(""); setSearchInfo(null); setBadDate({ from: false, to: false }); setLoading(true); setFilters(EMPTY_FILTERS); setApplied({ ...EMPTY_FILTERS }); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-60">Limpiar</button>
          {searchInfo && !loading ? <span role="status" className={`self-center rounded-full px-3 py-1 text-sm font-semibold ${searchInfo.count ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{searchInfo.count ? `✓ ${searchInfo.count.toLocaleString("es-CL")} documento(s) encontrado(s)` : "Sin resultados para estos filtros"} · {searchInfo.at}</span> : null}
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Documentos", rows.length.toLocaleString("es-CL")], ["Neto (NC restan)", money(totals.net)], ["IVA", money(totals.tax)], ["Total", money(totals.total)]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold text-[#041E42]">{value}</p></div>
        ))}
      </div>

      <ParkFacilDataGrid storageKey="facturacion:documentos-emitidos" columns={COLUMNS} rows={rows} rowIdKey="id" onRowDoubleClick={openPdf} globalSearchPlaceholder="Buscar en documentos emitidos..." emptyMessage={loading ? "Cargando…" : "Sin documentos. Importe la planilla de EasyDoc o sincronice con Haulmer."} exportFilename="documentos_emitidos" exportSheetName="Documentos emitidos" />
      <p className="text-xs text-slate-500">Doble clic en una fila para ver el PDF (documentos de ParkFacil o Haulmer).</p>

      {imports.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <h4 className="font-semibold text-[#041E42]">Últimas cargas</h4>
          <ul className="mt-2 space-y-1 text-slate-700">
            {imports.map((item) => (
              <li key={item.id}>{new Date(item.created_at).toLocaleString("es-CL")} · {DTE_SOURCES[item.source] || item.source}{item.file_name ? ` · ${item.file_name}` : ""} · {item.status === "FAILED" ? `Falló: ${item.message || ""}` : `${item.inserted} nuevos, ${item.updated} actualizados`}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

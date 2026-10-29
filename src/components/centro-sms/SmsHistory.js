"use client";
// Historial completo de mensajes (SOL-2026-10-29-007): búsqueda, orden,
// paginación en servidor, filtros combinables y ficha con línea de tiempo.
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import SmsFilters, { useSmsQuery } from "./SmsFilters";
import { formatDateTime, formatNumber, SimulatedBadge, SmsCenterTabs, SmsNotice, SmsStatusBadge } from "./smsUi";

const COLUMNS = [
  { key: "created_at", label: "Creación", sortable: true },
  { key: "sent_at", label: "Envío", sortable: true },
  { key: "delivered_at", label: "Entrega", sortable: true },
  { key: "phone", label: "Teléfono" },
  { key: "company", label: "Cliente / establecimiento" },
  { key: "module", label: "Módulo / tipo", sortable: true },
  { key: "origin", label: "Originado por" },
  { key: "status", label: "Estado", sortable: true },
  { key: "provider", label: "ID Sentraland" },
  { key: "attempts", label: "Intentos", sortable: true },
];

function Field({ label, children }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{children ?? "—"}</dd>
    </div>
  );
}

function DetailDrawer({ target, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const base = `/api/centro-sms/historial/${encodeURIComponent(target.source)}/${encodeURIComponent(target.sourceId)}`;

  useEffect(() => {
    let active = true;
    authenticatedFetch(base, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible obtener el detalle del SMS.");
        if (active) setDetail(body.data);
      })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [base]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function reveal() {
    if (!window.confirm("Se mostrará el teléfono completo y la consulta quedará registrada en la auditoría. ¿Continuar?")) return;
    setRevealing(true);
    try {
      const response = await authenticatedFetch(`${base}/telefono`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el teléfono.");
      setPhone(body.data.phone || "No registrado");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setRevealing(false);
    }
  }

  const m = detail?.message;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Detalle del SMS" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#041E42]">Detalle del SMS</h2>
            {m ? <p className="text-sm text-slate-500">{m.sourceLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        {error ? <SmsNotice tone="error">{error}</SmsNotice> : null}
        {!m && !error ? <p className="py-10 text-center text-sm text-slate-500">Cargando…</p> : null}
        {m ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <SmsStatusBadge label={m.statusLabel} variant={m.statusVariant} />
              {m.isSimulated ? <SimulatedBadge /> : null}
              {m.redacted ? <span className="text-xs text-slate-500">Datos personales anonimizados por retención</span> : null}
            </div>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Teléfono de destino">
                <span className="inline-flex items-center gap-2">{phone || m.phone}
                  {!phone && detail.permissions?.canRevealPhone && m.phoneMasked && !m.redacted && m.phone !== "No registrado" ? (
                    <button type="button" onClick={reveal} disabled={revealing} className="inline-flex items-center gap-1 text-xs font-medium text-[#3150D8] hover:underline"><Eye className="h-3.5 w-3.5" />Ver completo</button>
                  ) : null}
                </span>
              </Field>
              <Field label="Cliente">{m.companyName}</Field>
              <Field label="Establecimiento">{m.parkingName}</Field>
              <Field label="Módulo">{m.moduleLabel}</Field>
              <Field label="Tipo de mensaje">{m.messageTypeLabel}</Field>
              <Field label="Originado por">{m.originUserName}</Field>
              <Field label="Creado">{formatDateTime(m.createdAt)}</Field>
              <Field label="Enviado">{formatDateTime(m.sentAt)}</Field>
              <Field label="Aceptado por proveedor">{formatDateTime(m.acceptedAt)}</Field>
              <Field label="Entregado">{formatDateTime(m.deliveredAt)}</Field>
              <Field label="Identificador interno"><span className="font-mono text-xs">{m.sourceId}</span></Field>
              <Field label="Identificador Sentraland"><span className="font-mono text-xs">{m.providerMessageId || "—"}</span></Field>
              <Field label="Proveedor">{m.provider || "—"}</Field>
              <Field label="Intentos">{m.attempts}</Field>
              <Field label="Código / descripción del proveedor">{[m.providerCode, m.providerDescription].filter(Boolean).join(" · ") || "—"}</Field>
              <Field label="Error">{m.errorCode ? `${m.errorCode}${m.errorCategoryLabel ? ` · ${m.errorCategoryLabel}` : ""}` : "—"}</Field>
            </dl>
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500">Contenido del SMS</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {m.bodyHidden ? "No tienes permiso para ver el contenido." : m.body ?? (m.messageType === "INSPECTION_OVERDUE" ? "Texto estándar de fiscalización (no se guarda por mensaje)." : "No registrado.")}
              </p>
            </div>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-[#041E42]">Historial de eventos</h3>
            {detail.timeline.some((e) => e.reconstructed) ? (
              <p className="mb-2 text-xs text-amber-700">Registro heredado de On Street: la línea de tiempo se reconstruye con las fechas guardadas; no existe un historial de eventos completo para este mensaje.</p>
            ) : null}
            <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
              {detail.timeline.map((event, index) => (
                <li key={`${event.toStatus}-${index}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#3150D8]" aria-hidden />
                  <p className="text-sm font-medium text-slate-800">{event.label}</p>
                  <p className="text-xs text-slate-500">{event.at ? formatDateTime(event.at) : "Fecha no registrada"} · {event.source}</p>
                  {event.providerCode || event.providerDescription ? <p className="text-xs text-slate-600">Proveedor: {[event.providerCode, event.providerDescription].filter(Boolean).join(" · ")}</p> : null}
                  {event.detail?.errorCode ? <p className="text-xs text-rose-700">{event.detail.errorCode}</p> : null}
                </li>
              ))}
            </ol>
            {detail.related?.length ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-[#041E42]">Reenvíos relacionados</h3>
                <ul className="space-y-1 text-sm text-slate-700">{detail.related.map((r) => <li key={r.id} className="font-mono text-xs">{r.id} · {r.status} · {formatDateTime(r.created_at)}</li>)}</ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function HistoryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSmsQuery();
  const queryString = query.toString();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/centro-sms/historial${queryString ? `?${queryString}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el historial de SMS.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  function setParams(changes) {
    const next = new URLSearchParams(queryString);
    for (const [key, value] of Object.entries(changes)) { if (value == null || value === "") next.delete(key); else next.set(key, String(value)); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  const sort = query.get("orden") || "created_at";
  const dir = query.get("dir") === "asc" ? "asc" : "desc";
  const toggleSort = (key) => setParams({ orden: key, dir: sort === key && dir === "desc" ? "asc" : "desc", pagina: "" });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const [exporting, setExporting] = useState("");
  const [includeContent, setIncludeContent] = useState(false);

  // Descarga autenticada (Bearer) del archivo generado en el servidor.
  async function download(format) {
    setExporting(format); setError("");
    try {
      const params = new URLSearchParams(queryString);
      params.set("formato", format);
      if (includeContent) params.set("contenido", "1");
      const response = await authenticatedFetch(`/api/centro-sms/exportar?${params}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "No fue posible generar la exportación."); }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || `historial-sms.${format}`;
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setExporting("");
    }
  }

  return (
    <>
      <SmsFilters showSearch />
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4" checked={includeContent} onChange={(e) => setIncludeContent(e.target.checked)} />Incluir contenido del SMS</label>
        {["xlsx", "csv"].map((format) => (
          <button key={format} type="button" onClick={() => download(format)} disabled={Boolean(exporting)} className="inline-flex items-center gap-2 rounded-xl border border-[#3150D8] px-4 py-2 text-sm font-semibold text-[#3150D8] hover:bg-[#EEF4FF] disabled:opacity-50">
            <Download className="h-4 w-4" />{exporting === format ? "Generando…" : format === "xlsx" ? "Exportar Excel" : "Exportar CSV"}
          </button>
        ))}
      </div>
      {error ? <SmsNotice tone="error" title="No se pudo cargar el historial">{error}</SmsNotice> : null}
      {data && !data.rows.length ? (
        <EmptyState title="Sin mensajes" description="No hay SMS registrados con los filtros seleccionados." />
      ) : null}
      {data?.rows.length ? (
        <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${loading ? "opacity-60" : ""}`}>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-3 font-semibold" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                      {c.sortable ? (
                        <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-[#3150D8]">
                          {c.label}{sort === c.key ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.key} className="cursor-pointer border-b border-slate-100 hover:bg-[#EEF4FF]/60" onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(row); }}>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(row.sentAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(row.deliveredAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{row.phone}</td>
                    <td className="px-3 py-2.5"><p className="text-slate-800">{row.companyName}</p><p className="text-xs text-slate-500">{row.parkingName}</p></td>
                    <td className="px-3 py-2.5"><p className="text-slate-800">{row.moduleLabel}</p><p className="text-xs text-slate-500">{row.messageTypeLabel}</p></td>
                    <td className="px-3 py-2.5 text-slate-700">{row.originUserName}</td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap items-center gap-1"><SmsStatusBadge label={row.statusLabel} variant={row.statusVariant} />{row.isSimulated ? <SimulatedBadge /> : null}</div>{row.errorCode ? <p className="mt-1 text-xs text-rose-700">{row.errorCode}</p> : null}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 font-mono text-xs" title={row.providerMessageId || ""}>{row.providerMessageId || "—"}</td>
                    <td className="px-3 py-2.5 text-center">{row.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600 sm:flex-row">
            <p>{formatNumber(data.total)} mensaje(s) · página {data.page} de {pages}</p>
            <div className="flex items-center gap-2">
              <select aria-label="Filas por página" className="rounded-lg border border-slate-200 px-2 py-1" value={data.pageSize} onChange={(e) => setParams({ tamano: e.target.value, pagina: "" })}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
              </select>
              <button type="button" aria-label="Página anterior" disabled={data.page <= 1} onClick={() => setParams({ pagina: data.page - 1 })} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" aria-label="Página siguiente" disabled={data.page >= pages} onClick={() => setParams({ pagina: data.page + 1 })} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ) : null}
      {loading && !data ? <p className="py-10 text-center text-sm text-slate-500">Cargando historial…</p> : null}
      {selected ? <DetailDrawer target={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default function SmsHistory() {
  return (
    <AppShell title="Historial de mensajes" description="Todos los SMS registrados por ParkFacil, con su estado real de envío y entrega.">
      <SmsCenterTabs />
      <Suspense fallback={<p className="py-10 text-center text-sm text-slate-500">Cargando…</p>}>
        <HistoryContent />
      </Suspense>
    </AppShell>
  );
}

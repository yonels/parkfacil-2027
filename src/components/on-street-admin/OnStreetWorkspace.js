"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import OnStreetFilters from "./OnStreetFilters";
import { formatDuration, remainingSeconds } from "@/lib/onStreetPilot.mjs";
const dt=(v)=>v?new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—";
const money=(v)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(v||0);
// expires_at puede ser null en sesiones antiguas del piloto sin cobro: no se
// interpreta como "0 s" (vencida) ni como "sesión pagada indefinida", se
// representa explícitamente como "Sin vencimiento" solo en esta vista.
// remainingSeconds() no se modifica: sigue siendo correcto para sesiones con
// expires_at real.
const restante=(r)=>{if(r.status!=="ACTIVE")return r.status==="EXPIRED"?"Vencido":"—";if(!r.expires_at)return "Sin vencimiento";return formatDuration(remainingSeconds(r.expires_at,Date.now()));};
const PAYMENT_STATUS_LABEL={CREATED:"Iniciado",REDIRECTED:"En Webpay",COMMITTING:"Confirmando",COMMITTED:"Pagado",REJECTED:"Rechazado",ABORTED:"Abortado",FAILED:"Fallido"};
const PAGE_SIZE_OPTIONS=[25,50,100,200];
const PAYMENT_STATUS_OPTIONS=Object.entries(PAYMENT_STATUS_LABEL).map(([value,label])=>({value,label}));

// Exportación Excel completa (§ corrección "eliminar límite de 1000"
// 2026-08-28): recorre TODAS las páginas server-side (mismo endpoint
// paginado, pageSize grande) y arma un único Excel con el universo
// filtrado completo -- nunca solo la página visible. Mismo criterio que
// exportReportExcel en OnStreetReports.js (reutilizado conceptualmente,
// no importado, porque las columnas/reglas de fecha de Sesiones/Pagos son
// propias de este componente).
async function fetchAllPages(path, baseParams, totalRows) {
  const pageSize = 500;
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  const all = [];
  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const response = await authenticatedFetch(`/api/on-street-qr/${path}?${params}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No fue posible generar la exportación.");
    all.push(...(body.data.rows || []));
  }
  return all;
}

async function exportWorkspaceExcel({ rows, columns, filename, sheetName }) {
  const exceljs = await import("exceljs");
  const Workbook = exceljs.default?.Workbook || exceljs.Workbook;
  const workbook = new Workbook();
  workbook.creator = "ParkFacil 2027";
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const exportColumns = columns.filter((c) => c.key !== "_selection" && c.key !== "_actions");
  sheet.columns = exportColumns.map((c) => ({ header: c.label, key: c.key, width: 22 }));
  const cellValue = (column, row) => {
    const raw = typeof column.getValue === "function" ? column.getValue(row) : row[column.key];
    if (raw == null) return "—";
    if (/^(started_at|expires_at|ended_at|created_at|committed_at)$/.test(column.key)) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? String(raw) : d;
    }
    return raw;
  };
  rows.forEach((row) => {
    const item = {};
    exportColumns.forEach((column) => { item[column.key] = cellValue(column, row); });
    sheet.addRow(item);
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Usado solo para kind = "dashboard" | "sessions" | "payments". "locations",
// "crear" y "tarifas" tienen sus propios componentes (ver OnStreetAdminPage.js).
export default function OnStreetWorkspace({ kind }) {
  const router=useRouter();
  const [data,setData]=useState({rows:[],options:{},pagination:{page:1,pageSize:50,totalRows:0,totalPages:1}}),[filters,setFilters]=useState({period:"today"}),[error,setError]=useState("");
  // Paginación/orden REAL server-side (§ corrección "eliminar límite de
  // 1000" 2026-08-28) -- mismo patrón ya probado en OnStreetReports.js.
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(50);
  const [sort,setSort]=useState({key:null,direction:null});
  const [exporting,setExporting]=useState(false);
  // Empresas del alcance (§16/§19): fetch propio, independiente del listado
  // filtrado -- así el selector conserva SIEMPRE la lista completa de
  // empresas aunque el usuario ya haya filtrado por una en particular (evita
  // que la lista de opciones se reduzca a 1 tras elegir, ver
  // listOnStreetCompanies/companies/route.js, ya usado por Áreas/Calles/
  // Tramos y por el wizard "Generar QR" con el mismo criterio). Vacío para
  // company_admin/operator (una sola empresa, backend nunca la envía más de
  // una), así OnStreetFilters no muestra el selector.
  const [companies,setCompanies]=useState([]);
  useEffect(()=>{let active=true;(async()=>{try{const response=await authenticatedFetch("/api/on-street-qr/companies",{cache:"no-store"});const body=await response.json().catch(()=>({}));if(active&&response.ok)setCompanies(body.data||[]);}catch{/* selector Empresa simplemente no aparece */}})();return()=>{active=false;};},[]);

  const path=kind==="dashboard"?"dashboard":kind==="sessions"?"sessions":"payments";

  const buildParams=useCallback((overrides={})=>{
    const params=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
    const effective={page,pageSize,sortKey:sort.key,sortDirection:sort.direction,...overrides};
    if(effective.page)params.set("page",effective.page);
    if(effective.pageSize)params.set("pageSize",effective.pageSize);
    if(effective.sortKey){params.set("sortKey",effective.sortKey);params.set("sortDirection",effective.sortDirection||"asc");}
    return params;
  },[filters,page,pageSize,sort]);

  const load=useCallback(async()=>{const response=await authenticatedFetch(`/api/on-street-qr/${path}?${buildParams()}`),body=await response.json();if(!response.ok)throw new Error(body.error);setData(body.data);},[path,buildParams]);
  // "Ver sesiones de este punto" (ficha del punto QR) enlaza aquí con
  // ?segmentId=... — se lee directamente de window.location (en vez de
  // useSearchParams(), que exige un límite Suspense y aquí no llegaba a
  // resolver con Turbopack) y, si viene, reemplaza el filtro de fecha por
  // defecto para ver todo el historial del punto, no solo el día de hoy.
  // parkingId (§23 "Operación" del constructor de Proyecto On Street,
  // 2026-08-28): contexto precargado desde la ficha de un Proyecto -- mismo
  // patrón que ?segmentId= (ficha de un punto QR), sin obligar a
  // re-seleccionar el estacionamiento del período por defecto.
  useEffect(()=>{const timer=window.setTimeout(()=>{const params=new URLSearchParams(window.location.search);const segmentId=params.get("segmentId");const parkingId=params.get("parkingId");if(segmentId)setFilters({segmentId});else if(parkingId)setFilters((current)=>({...current,parkingId}));},0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{const timer=setTimeout(()=>void load().catch((cause)=>setError(cause.message)),0);return()=>clearTimeout(timer);},[load]);
  // Cambiar cualquier filtro/orden/tamaño de página vuelve a página 1 --
  // mismo criterio que Reportes (§7.3). El período (filters) ya dispara
  // esto porque cambia la referencia de "filters".
  useEffect(()=>{const timer=window.setTimeout(()=>setPage(1),0);return()=>window.clearTimeout(timer);},[filters,pageSize,sort.key,sort.direction]);
  // IMPORTANTE: ParkFacilDataGrid invoca cada celda como render(value,row),
  // con "value" ya derivado (getValue(row) si existe, si no row[key]) — no la
  // fila completa. Los render de abajo deben leer ese "value", no volver a
  // navegar propiedades de "row" en el primer parámetro.
  const sessionColumns=useMemo(()=>[{key:"operational_number",label:"N° Sesión"},{key:"license_plate_normalized",label:"Patente",render:value=>value||"—"},{key:"company",label:"Empresa",getValue:r=>r.location?.parking?.company_name,render:value=>value||"—"},{key:"parking",label:"Estacionamiento",getValue:r=>r.location?.parking?.name,render:value=>value||"—"},{key:"phone",label:"Teléfono"},{key:"started_at",label:"Inicio",render:value=>dt(value)},{key:"purchased_minutes",label:"Minutos comprados",render:value=>value?`${value} min`:"—"},{key:"expires_at",label:"Vencimiento",render:value=>value?dt(value):"Sin vencimiento"},{key:"remaining",label:"Tiempo restante",getValue:restante,render:value=>value},{key:"amount",label:"Monto",render:value=>money(value)},{key:"paymentStatus",label:"Estado de pago",getValue:r=>r.transaction?.status,render:value=>value?PAYMENT_STATUS_LABEL[value]||value:"Sin pago"},{key:"status",label:"Estado"},{key:"extensionCount",label:"Extensiones"},{key:"location",label:"Ubicación",getValue:r=>r.location?.label,render:value=>value}],[]);
  const paymentColumns=useMemo(()=>[{key:"created_at",label:"Fecha/hora",render:(_,row)=>dt(row.committed_at||row.created_at)},{key:"operationNumber",label:"N° operación"},{key:"sessionNumber",label:"Sesión/intención"},{key:"location",label:"Ubicación",getValue:r=>r.location?.label,render:value=>value},{key:"amount",label:"Monto",render:value=>money(value)},{key:"paymentType",label:"Medio"},{key:"provider",label:"Proveedor",render:()=>"Transbank Webpay"},{key:"status",label:"Estado"},{key:"buy_order",label:"Buy Order"}],[]);
  const columns=kind==="payments"?paymentColumns:sessionColumns;

  const exportFull=useCallback(async()=>{
    setExporting(true);setError("");
    try{
      const totalRows=data.pagination?.totalRows||0;
      const rows=await fetchAllPages(path,buildParams({page:undefined,pageSize:undefined}),totalRows);
      await exportWorkspaceExcel({rows,columns,filename:kind==="payments"?"on_street_pagos":"on_street_sesiones",sheetName:kind==="payments"?"Pagos":"Sesiones"});
    }catch(cause){setError(cause.message);}finally{setExporting(false);}
  },[data.pagination,path,buildParams,columns,kind]);

  const pagination=data.pagination||{page:1,pageSize,totalRows:0,totalPages:1};
  return <div className="space-y-5">
    <OnStreetFilters filters={filters} setFilters={setFilters} options={data.options} companies={companies} statusOptions={kind==="payments"?PAYMENT_STATUS_OPTIONS:undefined}/>
    {error?<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:null}
    {kind==="sessions"||kind==="payments"?<div className="flex justify-end"><button type="button" onClick={exportFull} disabled={exporting||!pagination.totalRows} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{exporting?"Generando Excel…":`EXPORTAR A EXCEL (${pagination.totalRows.toLocaleString("es-CL")} filas)`}</button></div>:null}
    {kind==="dashboard"&&data.kpis?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Sesiones activas",data.kpis.activeSessions],["Operaciones del día",data.kpis.operations],["Recaudación del día",money(data.kpis.revenue)],["Tiempo promedio",`${data.kpis.averageMinutes} min`]].map(([label,value])=><article key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#041E42]">{value}</p></article>)}</div>:null}
    {kind==="sessions"?<ParkFacilDataGrid storageKey="on-street:sessions" columns={sessionColumns} rows={data.rows||[]} onRowDoubleClick={r=>router.push(`/on-street-qr/sesiones/${r.id}`)} emptyMessage="Sin sesiones para los filtros seleccionados." serverMode serverSort={sort} onSortChange={(key,direction)=>setSort({key,direction})} pagination={pagination} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS}/>:null}
    {kind==="payments"?<ParkFacilDataGrid storageKey="on-street:payments" columns={paymentColumns} rows={data.rows||[]} emptyMessage="Sin pagos para los filtros seleccionados." serverMode serverSort={sort} onSortChange={(key,direction)=>setSort({key,direction})} pagination={pagination} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS}/>:null}
    {kind==="dashboard"?<ParkFacilDataGrid storageKey="on-street:dashboard" columns={sessionColumns} rows={data.rows||[]} onRowDoubleClick={r=>router.push(`/on-street-qr/sesiones/${r.id}`)} emptyMessage="Sin sesiones para los filtros seleccionados." exportFilename="on_street_sesiones"/>:null}
  </div>;
}

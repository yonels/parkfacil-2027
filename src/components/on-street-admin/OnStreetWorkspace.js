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
// Usado solo para kind = "dashboard" | "sessions" | "payments". "locations",
// "crear" y "tarifas" tienen sus propios componentes (ver OnStreetAdminPage.js).
export default function OnStreetWorkspace({ kind }) {
  const router=useRouter();
  const [data,setData]=useState({rows:[],options:{},kpis:null}),[filters,setFilters]=useState({date:new Date().toISOString().slice(0,10)}),[error,setError]=useState("");
  const load=useCallback(async()=>{const path=kind==="dashboard"?"dashboard":kind==="sessions"?"sessions":"payments",query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));const response=await authenticatedFetch(`/api/on-street-qr/${path}?${query}`),body=await response.json();if(!response.ok)throw new Error(body.error);setData(body.data);},[kind,filters]);
  // "Ver sesiones de este punto" (ficha del punto QR) enlaza aquí con
  // ?segmentId=... — se lee directamente de window.location (en vez de
  // useSearchParams(), que exige un límite Suspense y aquí no llegaba a
  // resolver con Turbopack) y, si viene, reemplaza el filtro de fecha por
  // defecto para ver todo el historial del punto, no solo el día de hoy.
  useEffect(()=>{const timer=window.setTimeout(()=>{const segmentId=new URLSearchParams(window.location.search).get("segmentId");if(segmentId)setFilters({segmentId});},0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{const timer=setTimeout(()=>void load().catch((cause)=>setError(cause.message)),0);return()=>clearTimeout(timer);},[load]);
  // IMPORTANTE: ParkFacilDataGrid invoca cada celda como render(value,row),
  // con "value" ya derivado (getValue(row) si existe, si no row[key]) — no la
  // fila completa. Los render de abajo deben leer ese "value", no volver a
  // navegar propiedades de "row" en el primer parámetro.
  const sessionColumns=useMemo(()=>[{key:"operational_number",label:"N° Sesión"},{key:"company",label:"Empresa",getValue:r=>r.location?.parking?.company_name,render:value=>value||"—"},{key:"parking",label:"Estacionamiento",getValue:r=>r.location?.parking?.name,render:value=>value||"—"},{key:"phone",label:"Teléfono"},{key:"started_at",label:"Inicio",render:value=>dt(value)},{key:"purchased_minutes",label:"Minutos comprados",render:value=>value?`${value} min`:"—"},{key:"expires_at",label:"Vencimiento",render:value=>value?dt(value):"Sin vencimiento"},{key:"remaining",label:"Tiempo restante",getValue:restante,render:value=>value},{key:"amount",label:"Monto",render:value=>money(value)},{key:"paymentStatus",label:"Estado de pago",getValue:r=>r.transaction?.status,render:value=>value?PAYMENT_STATUS_LABEL[value]||value:"Sin pago"},{key:"status",label:"Estado"},{key:"extensionCount",label:"Extensiones"},{key:"location",label:"Ubicación",getValue:r=>r.location?.label,render:value=>value}],[]);
  const paymentColumns=useMemo(()=>[{key:"created_at",label:"Fecha/hora",render:(_,row)=>dt(row.committed_at||row.created_at)},{key:"operationNumber",label:"N° operación"},{key:"sessionNumber",label:"Sesión/intención"},{key:"location",label:"Ubicación",getValue:r=>r.location?.label,render:value=>value},{key:"amount",label:"Monto",render:value=>money(value)},{key:"paymentType",label:"Medio"},{key:"provider",label:"Proveedor",render:()=>"Transbank Webpay"},{key:"status",label:"Estado"},{key:"buy_order",label:"Buy Order"}],[]);
  return <div className="space-y-5"><OnStreetFilters filters={filters} setFilters={setFilters} options={data.options}/>{error?<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:null}{kind==="dashboard"&&data.kpis?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Sesiones activas",data.kpis.activeSessions],["Operaciones del día",data.kpis.operations],["Recaudación del día",money(data.kpis.revenue)],["Tiempo promedio",`${data.kpis.averageMinutes} min`]].map(([label,value])=><article key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#041E42]">{value}</p></article>)}</div>:null}{kind==="dashboard"||kind==="sessions"?<ParkFacilDataGrid storageKey={`on-street:${kind}`} columns={sessionColumns} rows={data.rows||[]} onRowDoubleClick={r=>router.push(`/on-street-qr/sesiones/${r.id}`)} emptyMessage="Sin sesiones para los filtros seleccionados." exportFilename="on_street_sesiones"/>:null}{kind==="payments"?<ParkFacilDataGrid storageKey="on-street:payments" columns={paymentColumns} rows={data.rows||[]} emptyMessage="Sin pagos para los filtros seleccionados." exportFilename="on_street_pagos"/>:null}</div>;
}

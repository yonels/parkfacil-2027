"use client";
// Resumen general del Centro de Control SMS (SOL-2026-10-29-007). Solo
// muestra datos registrados (sms_history_v); sin registros, estados vacíos.
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Clock3, Inbox, MessageSquareText, Send, ShieldAlert, Wallet, XCircle, HelpCircle, Hourglass } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { SMS_MODULE_LABELS } from "@/lib/sms/smsCenterCore.mjs";
import SmsFilters, { useSmsQuery } from "./SmsFilters";
import SmsTrendChart from "./SmsTrendChart";
import { formatDateTime, formatNumber, SmsCenterTabs, SmsNotice } from "./smsUi";

function Kpi({ title, value, hint, icon: Icon, href }) {
  const body = (
    <div className={`h-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ${href ? "transition hover:border-[#3150D8]" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {Icon ? <span className="rounded-xl bg-[#EEF4FF] p-2 text-[#3150D8]"><Icon className="h-4 w-4" aria-hidden /></span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-[#041E42]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8]">{body}</Link> : body;
}

function balanceText(lastBalance) {
  const bags = lastBalance?.balance?.bags;
  if (!Array.isArray(bags)) return { value: "Sin consulta", hint: "Se obtiene desde Diagnóstico (bolsa Sentraland)." };
  const total = bags.reduce((sum, bag) => sum + (Number(bag.saldo) || 0), 0);
  return { value: formatNumber(total), hint: `SMS en bolsa · consultado ${formatDateTime(lastBalance.checked_at)}` };
}

function DashboardContent() {
  const query = useSmsQuery();
  const queryString = query.toString();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/centro-sms/resumen${queryString ? `?${queryString}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el resumen de SMS.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  const k = data?.kpis || {};
  const historyLink = (estado) => `/centro-sms/historial?${new URLSearchParams({ ...Object.fromEntries(query.entries()), ...(estado ? { estado } : {}) })}`;
  const isEmpty = data && !Object.values(data.by_status || {}).some(Boolean);
  const balance = balanceText(data?.last_balance);
  const isRoot = data?.viewer === "ROOT";

  return (
    <>
      <SmsFilters showBucket />
      {error ? <SmsNotice tone="error" title="No se pudo cargar el resumen">{error}</SmsNotice> : null}
      {loading && !data ? <p className="py-10 text-center text-sm text-slate-500">Cargando indicadores…</p> : null}
      {data ? (
        <div className={loading ? "opacity-60 transition" : "transition"}>
          {data.simulated > 0 && !data.filters?.includeSimulated ? (
            <div className="mb-4"><SmsNotice title={`${formatNumber(data.simulated)} envío(s) simulado(s) excluido(s)`}>No salieron por Sentraland. Marca «Incluir simulados» para verlos.</SmsNotice></div>
          ) : null}
          {isEmpty ? (
            <EmptyState title="Sin SMS en el período" description="No hay mensajes registrados con los filtros seleccionados. Los indicadores se completan automáticamente cuando ParkFacil envía SMS." />
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            <Kpi title="SMS enviados" value={formatNumber(k.total)} hint="Intentos que llegaron al proveedor" icon={Send} href={historyLink()} />
            <Kpi title="Aceptados por Sentraland" value={formatNumber(k.accepted)} hint="Aceptado no significa entregado" icon={MessageSquareText} />
            <Kpi title="Entregados" value={formatNumber(k.delivered)} hint="Confirmados por el proveedor (DELIVRD)" icon={CheckCheck} href={historyLink("DELIVERED")} />
            <Kpi title="Tasa de entrega" value={data.deliveryRate == null ? "—" : `${data.deliveryRate.toLocaleString("es-CL")} %`} hint={data.deliveryRate == null ? "Sin aceptados en el período" : "Entregados / aceptados"} icon={CheckCheck} />
            <Kpi title="Pendientes" value={formatNumber(k.pending)} hint="En cola o enviándose" icon={Clock3} href={historyLink("QUEUED")} />
            <Kpi title="Sin confirmación de entrega" value={formatNumber(k.unconfirmed)} hint={`Aceptados hace más de ${data.unconfirmed_after_hours} h sin DLR`} icon={Hourglass} />
            <Kpi title="Fallidos" value={formatNumber(k.failed)} hint="Error técnico, no entregado o expirado" icon={XCircle} href={historyLink("FAILED")} />
            <Kpi title="Rechazados" value={formatNumber(k.rejected)} hint="Rechazados por Sentraland" icon={ShieldAlert} href={historyLink("REJECTED")} />
            <Kpi title="Estado desconocido" value={formatNumber(k.unknown)} hint="Sin respuesta clara del proveedor" icon={HelpCircle} href={historyLink("UNKNOWN")} />
            {isRoot ? <Kpi title="SMS recibidos" value={data.inbound_enabled ? formatNumber(data.inbound) : "No habilitado"} hint={data.inbound_enabled ? "En el período" : "Recepción de SMS no habilitada por el proveedor"} icon={Inbox} /> : null}
            <Kpi title="Consumo del período" value={formatNumber(k.consumed)} hint="SMS reales aceptados (descuentan bolsa)" icon={Wallet} />
            {isRoot ? <Kpi title="Saldo disponible" value={balance.value} hint={balance.hint} icon={Wallet} /> : null}
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-base font-semibold text-[#041E42]">Evolución por {data.filters?.bucket === "month" ? "mes" : data.filters?.bucket === "week" ? "semana" : "día"}</h2>
              {data.series?.length ? <SmsTrendChart series={data.series} bucket={data.filters?.bucket} /> : <p className="py-10 text-center text-sm text-slate-500">Sin datos para graficar en el período.</p>}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-[#041E42]">Por módulo de origen</h2>
              {Object.keys(data.by_module || {}).length ? (
                <ul className="space-y-2 text-sm">
                  {Object.entries(data.by_module).sort((a, b) => b[1] - a[1]).map(([module, count]) => (
                    <li key={module} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-slate-700">{SMS_MODULE_LABELS[module] || module}</span>
                      <span className="font-semibold text-[#041E42]">{formatNumber(count)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Sin mensajes en el período.</p>}
              {isRoot ? <p className="mt-4 text-xs text-slate-500">Off Street, Mesa de Ayuda y Alertas aparecerán aquí cuando envíen SMS mediante el servicio central.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default function SmsCenterDashboard() {
  return (
    <AppShell title="Centro de Control SMS" description="Resumen general de los SMS enviados por ParkFacil a través de Sentraland.">
      <SmsCenterTabs />
      <Suspense fallback={<p className="py-10 text-center text-sm text-slate-500">Cargando…</p>}>
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}

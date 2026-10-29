"use client";
// Mensajes recibidos (SOL-2026-10-29-007). La API implementada de Sentraland
// (token, envío, smsstatus, bolsa) no incluye recepción de SMS; la bandeja
// queda preparada (tabla sms_inbound_messages) y deshabilitada. Nunca se
// muestran mensajes simulados como si fueran reales.
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { formatDateTime, SmsCenterTabs, SmsNotice } from "./smsUi";

const ATTENTION = { NEW: "Nuevo", IN_PROGRESS: "En atención", RESOLVED: "Resuelto", DISCARDED: "Descartado" };

export default function SmsInbound() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/centro-sms/recibidos", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible obtener los mensajes recibidos.");
        if (active) setData(body.data);
      })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  return (
    <AppShell title="Mensajes recibidos" description="Bandeja de SMS entrantes, cuando el proveedor lo permita.">
      <SmsCenterTabs />
      {error ? <SmsNotice tone="error">{error}</SmsNotice> : null}
      {!data && !error ? <p className="py-10 text-center text-sm text-slate-500">Cargando…</p> : null}
      {data && !data.enabled ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Inbox className="mx-auto h-10 w-10 text-[#3150D8]" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-[#041E42]">Recepción de SMS no habilitada por el proveedor.</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            Los servicios de Sentraland integrados en ParkFacil (token, envío, estado de entrega y bolsa) no incluyen la recepción de mensajes.
            El módulo ya tiene su bandeja preparada (remitente, fecha, contenido, cliente asociado y estado de atención) y se habilitará cuando
            Sentraland confirme por escrito un servicio de mensajes entrantes y se integre.
          </p>
        </div>
      ) : null}
      {data?.enabled ? (
        data.rows.length ? (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Remitente</th><th className="px-3 py-3">Contenido</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Atención</th></tr></thead>
              <tbody>{data.rows.map((r) => <tr key={r.id} className="border-b border-slate-100"><td className="px-3 py-2">{formatDateTime(r.received_at)}</td><td className="px-3 py-2 font-mono text-xs">{r.from_phone}</td><td className="px-3 py-2">{r.body || "—"}</td><td className="px-3 py-2">{r.company_id || "—"}</td><td className="px-3 py-2">{ATTENTION[r.attention_status] || r.attention_status}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <SmsNotice>No hay mensajes recibidos.</SmsNotice>
      ) : null}
    </AppShell>
  );
}

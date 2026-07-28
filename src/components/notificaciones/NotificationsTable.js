"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import NotificationChannelBadge from "./NotificationChannelBadge";
import NotificationStatusBadge from "./NotificationStatusBadge";

function formatDate(value) {
  if (!value) return "No registrada";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function fallback(value) {
  return value || "No registrado";
}

export default function NotificationsTable({ notifications }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1050px] w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Canal</th>
            <th className="px-3 py-2">Destinatario</th>
            <th className="px-3 py-2">Asunto</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Intentos</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 text-slate-700 transition hover:bg-[#EEF4FF]">
              <td className="whitespace-nowrap px-3 py-2">{formatDate(item.created_at)}</td>
              <td className="min-w-[180px] px-3 py-2 font-semibold text-[#041E42]">{fallback(item.typeLabel)}</td>
              <td className="px-3 py-2"><NotificationChannelBadge channel={item.channel} upcoming={item.whatsappUpcoming} /></td>
              <td className="max-w-[220px] truncate px-3 py-2" title={item.recipient_name || item.recipient || ""}>{fallback(item.recipient_name || item.recipient)}</td>
              <td className="max-w-[260px] truncate px-3 py-2" title={item.subject || ""}>{fallback(item.subject)}</td>
              <td className="px-3 py-2"><NotificationStatusBadge status={item.status} /></td>
              <td className="px-3 py-2 font-semibold">{item.attempt_count || 0}</td>
              <td className="whitespace-nowrap px-3 py-2"><Link href={`/notificaciones/${item.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-[#3150D8]"><Eye className="h-3.5 w-3.5" />Ver detalle</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

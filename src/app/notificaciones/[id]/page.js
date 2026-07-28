import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import NotificationChannelBadge from "@/components/notificaciones/NotificationChannelBadge";
import NotificationStatusBadge from "@/components/notificaciones/NotificationStatusBadge";

function formatDate(value) {
  if (!value) return "No registrada";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function valueOrEmpty(value) {
  return value || "No registrado";
}

async function getNotification(id) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/notificaciones/${id}`, { cache: "no-store" }).catch(() => null);
  if (!response) return { data: null, error: "No fue posible conectar con la API de notificaciones." };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { data: null, error: body.error || "No fue posible cargar la notificación." };
  return { data: body.data, error: null };
}

function DetailRow({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[#041E42]">{valueOrEmpty(value)}</p></div>;
}

export default async function NotificacionDetallePage({ params }) {
  const { id } = await params;
  const { data, error } = await getNotification(id);

  return (
    <AppShell title="Notificaciones" description="Detalle y trazabilidad de comunicación">
      <div className="space-y-5">
        <nav className="flex flex-wrap gap-2 text-sm text-slate-500"><Link href="/" className="font-semibold text-[#3150D8]">Inicio</Link><span>/</span><Link href="/notificaciones" className="font-semibold text-[#3150D8]">Notificaciones</Link><span>/</span><span>Detalle</span></nav>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h1 className="text-2xl font-semibold text-[#041E42]">Detalle de notificación</h1><p className="mt-1 text-sm text-slate-600">Identificación, estado, proveedor e intentos asociados.</p></div>
            <Link href="/notificaciones" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42]">Volver</Link>
          </div>

          {error ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

          {data ? (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap gap-2"><NotificationChannelBadge channel={data.channel} upcoming={data.whatsappUpcoming} /><NotificationStatusBadge status={data.status} /></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <DetailRow label="ID" value={data.id} />
                <DetailRow label="Tipo" value={data.typeLabel} />
                <DetailRow label="Canal" value={data.channelLabel} />
                <DetailRow label="Estado" value={data.statusLabel} />
                <DetailRow label="Destinatario" value={data.recipient_name || data.recipient} />
                <DetailRow label="Asunto" value={data.subject} />
                <DetailRow label="Proveedor" value={data.provider} />
                <DetailRow label="Mensaje proveedor" value={data.provider_message_id} />
                <DetailRow label="Intentos" value={String(data.attempt_count || 0)} />
                <DetailRow label="Abonado" value={data.subscriber_id} />
                <DetailRow label="Estacionamiento" value={data.parking_id} />
                <DetailRow label="Usuario" value={data.user_id} />
                <DetailRow label="Creada" value={formatDate(data.created_at)} />
                <DetailRow label="Actualizada" value={formatDate(data.updated_at)} />
                <DetailRow label="Enviada" value={formatDate(data.sent_at)} />
                <DetailRow label="Entregada" value={formatDate(data.delivered_at)} />
              </div>

              {data.error_message ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><strong>Error técnico:</strong> {data.error_code ? `${data.error_code}: ` : ""}{data.error_message}</div> : null}

              <section>
                <h2 className="text-lg font-semibold text-[#041E42]">Historial de intentos</h2>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-[780px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Intento</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Inicio</th><th className="px-3 py-2">Fin</th><th className="px-3 py-2">Error</th></tr></thead><tbody>{data.attempts?.length ? data.attempts.map((attempt) => <tr key={attempt.id} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{attempt.attempt_number}</td><td className="px-3 py-2">{valueOrEmpty(attempt.provider)}</td><td className="px-3 py-2"><NotificationStatusBadge status={attempt.status} /></td><td className="px-3 py-2">{formatDate(attempt.started_at)}</td><td className="px-3 py-2">{formatDate(attempt.finished_at)}</td><td className="px-3 py-2">{valueOrEmpty(attempt.error_message || attempt.error_code)}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin intentos registrados.</td></tr>}</tbody></table>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
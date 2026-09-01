"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, MapPin, ShieldAlert, ShieldX } from "lucide-react";
import { INSPECTOR_PLATE_STATUS } from "@/lib/inspector/inspectorMocks.mjs";
import { formatInspectorDuration, overdueInspectorSeconds, relativeTimeFromNow, remainingInspectorSeconds } from "@/lib/inspector/inspectorTime.mjs";

const money = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);
const time = (iso) => (iso ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const locationLine = (l) => (l ? `${l.sectorName} · ${l.streetName} · ${l.segmentName}` : "—");

function Row({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-bold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-bold text-[#041E42]">{value}</dd>
    </div>
  );
}

const FRANJA = {
  [INSPECTOR_PLATE_STATUS.VIGENTE]: { bg: "bg-emerald-600", label: "ESTACIONAMIENTO VIGENTE", Icon: ShieldAlert },
  [INSPECTOR_PLATE_STATUS.VENCIDO]: { bg: "bg-rose-600", label: "ESTACIONAMIENTO VENCIDO", Icon: ShieldX },
  [INSPECTOR_PLATE_STATUS.OBSERVADO]: { bg: "bg-amber-500", label: "PATENTE OBSERVADA", Icon: AlertTriangle },
  [INSPECTOR_PLATE_STATUS.SIN_SESION]: { bg: "bg-slate-500", label: "SIN SESIÓN VIGENTE", Icon: ShieldAlert },
};

// Contador vivo para VIGENTE/VENCIDO -- mismo criterio que el contador de
// comprobantes On-Street (arranca de un expiresAt real y tickea cada
// segundo), reimplementado aquí en vocabulario propio de Inspectores para no
// acoplar el módulo a onStreetPilot.mjs (ver inspectorTime.mjs).
function LiveTime({ expiresAt, overdue }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = overdue ? overdueInspectorSeconds(expiresAt, now) : remainingInspectorSeconds(expiresAt, now);
  return <span className="tabular-nums">{formatInspectorDuration(seconds)}</span>;
}

export default function InspectorResultado({ result, onNuevaConsulta, onFiscalizar, onVerEnMapa }) {
  const franja = FRANJA[result.status] || FRANJA[INSPECTOR_PLATE_STATUS.SIN_SESION];
  const { Icon } = franja;

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <div className={`flex items-center gap-3 rounded-3xl ${franja.bg} p-5 text-white shadow-sm`}>
        <Icon className="h-8 w-8 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xl font-black leading-tight">{franja.label}</p>
          <p className="text-2xl font-black tracking-widest">{result.plate}</p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        {result.status === INSPECTOR_PLATE_STATUS.VIGENTE ? (
          <>
            <div className="rounded-2xl bg-[#041E42] p-5 text-center text-white">
              <p className="text-sm text-slate-300">Tiempo restante</p>
              <p className="mt-1 text-4xl font-black"><LiveTime expiresAt={result.expiresAt} /></p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              {result.vehicleType ? <Row label="Vehículo" value={result.vehicleType} /> : null}
              <Row label="Vence" value={time(result.expiresAt)} />
              <div className="col-span-2"><Row label="Ubicación" value={locationLine(result.location)} /></div>
              <Row label="Inicio" value={time(result.startedAt)} />
              <Row label="Duración contratada" value={`${result.purchasedMinutes} min`} />
              <Row label="Monto pagado" value={money(result.amountPaid)} />
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={onVerEnMapa} className="min-h-14 rounded-2xl border-2 border-[#3150D8] font-black text-[#3150D8]">
                <span className="inline-flex items-center gap-2"><MapPin className="h-5 w-5" aria-hidden="true" />VER EN MAPA</span>
              </button>
              <button onClick={onNuevaConsulta} className="min-h-14 rounded-2xl bg-[#3150D8] font-black text-white">NUEVA CONSULTA</button>
            </div>
          </>
        ) : result.status === INSPECTOR_PLATE_STATUS.VENCIDO ? (
          <>
            <div className="rounded-2xl bg-[#041E42] p-5 text-center text-white">
              <p className="text-sm text-slate-300">Tiempo vencido</p>
              <p className="mt-1 text-4xl font-black"><LiveTime expiresAt={result.expiresAt} overdue /></p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <Row label="Venció a las" value={time(result.expiresAt)} />
              <div className="col-span-2"><Row label="Ubicación" value={locationLine(result.location)} /></div>
              <Row label="Inicio" value={time(result.startedAt)} />
              <Row label="Duración contratada" value={`${result.purchasedMinutes} min`} />
              <Row label="Monto pagado" value={money(result.amountPaid)} />
            </dl>
            <button onClick={onFiscalizar} className="mt-5 min-h-16 w-full rounded-2xl bg-rose-600 text-lg font-black text-white">FISCALIZAR</button>
            <button onClick={onNuevaConsulta} className="mt-3 block w-full text-center text-sm font-bold text-[#3150D8]">Nueva consulta</button>
          </>
        ) : result.status === INSPECTOR_PLATE_STATUS.OBSERVADO ? (
          <>
            <dl className="grid grid-cols-1 gap-2">
              <Row label="Motivo" value={result.motivo} />
              <Row label="Último evento" value={`${result.ultimoEvento?.tipo} · ${relativeTimeFromNow(result.ultimoEvento?.at)}`} />
              <Row label="Ubicación" value={locationLine(result.location)} />
            </dl>
            {result.historial?.length ? (
              <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Historial básico</p>
                <ul className="mt-2 space-y-2">
                  {result.historial.map((h, i) => (
                    <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
                      <p className="font-bold text-[#041E42]">{h.tipo} <span className="font-normal text-slate-500">· {relativeTimeFromNow(h.at)}</span></p>
                      <p className="text-slate-600">{h.detalle}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {/* OBSERVADO es solo informativo -- nada vigente/vencido que
                accionar ahora mismo (si lo hubiera, el estado sería VIGENTE
                o VENCIDO, ver inspectorPlateStateCore.mjs). No se ofrece
                FISCALIZAR aquí: la API igual lo rechazaría con 409 al
                re-verificar, pero la UI no debe invitar una acción que
                siempre fallaría. */}
            <button onClick={onNuevaConsulta} className="mt-5 min-h-16 w-full rounded-2xl bg-[#3150D8] text-lg font-black text-white">NUEVA CONSULTA</button>
          </>
        ) : (
          <>
            <p className="text-slate-600">No existe una sesión de estacionamiento vigente para esta patente.</p>
            <button onClick={onNuevaConsulta} className="mt-5 min-h-16 w-full rounded-2xl bg-[#3150D8] text-lg font-black text-white">NUEVA CONSULTA</button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

// POS — pagos con tarjeta sin cerrar (reserva central, SOL-2026-10-11-001):
// aprobados pendientes de registro, con resultado incierto o en curso en otro
// equipo. Componentes de presentación: no llaman a TUU ni al servidor por su
// cuenta; todas las acciones llegan por props desde PosTerminal.js.
//
// Ninguno ofrece volver a cobrar, y el operador NO puede declarar por su
// cuenta que un resultado incierto fue aprobado o no se realizó: eso es una
// regularización de un administrador (Pagos con tarjeta, en ParkFacil).

import { TUU_PENDING_STATUS } from "@/lib/pos/tuuPendingPayments.mjs";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const dateTime = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
  } catch {
    return String(value);
  }
};
const cardTypeLabel = (cardType) => (cardType === "DEBIT" ? "Débito" : cardType === "CREDIT" ? "Crédito" : "-");

function Detail({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-sm font-bold text-slate-900">{value || "-"}</p>
    </div>
  );
}

function PaymentDetails({ record }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Detail label="Patente" value={record.plate} />
      <Detail label="Monto" value={money.format(record.amount)} />
      <Detail label="Medio de pago" value={cardTypeLabel(record.cardType)} />
      <Detail label="Ticket" value={record.ticketCode} />
      <Detail label={record.status === TUU_PENDING_STATUS.PENDING_REGISTRATION ? "Pago aprobado" : "Pago iniciado"} value={dateTime(record.approvedAt || record.startedAt)} />
      <Detail label="Operador" value={record.operatorName} />
      {record.status === TUU_PENDING_STATUS.PENDING_REGISTRATION ? (
        <div className="col-span-2"><Detail label="Referencia TUU" value={record.sequenceNumber || "Sin referencia informada por TUU"} /></div>
      ) : null}
      <div className="col-span-2"><Detail label="Intento" value={String(record.attemptId || "").slice(0, 8).toUpperCase()} /></div>
    </div>
  );
}

const closeButton = "min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100 disabled:opacity-60";
const refreshButton = "min-h-12 rounded-xl border border-sky-400 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-sky-900 transition hover:bg-sky-50 disabled:opacity-60";

// Tarjeta de un pago con tarjeta sin cerrar. Acciones:
// - Pago aprobado pendiente: REGISTRAR PAGO (solo registra en ParkFacil) / CERRAR.
// - Resultado incierto: ACTUALIZAR ESTADO / CERRAR. Lo resuelve un administrador.
// - En curso en otro equipo: ACTUALIZAR ESTADO / CERRAR.
export function TuuPendingPaymentCard({ record, busy = false, message = "", onRegister, onRefresh, onClose }) {
  if (!record) return null;

  if (record.status === TUU_PENDING_STATUS.PENDING_REGISTRATION) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-400 bg-amber-50 p-4">
        <p className="text-lg font-black text-amber-950">PAGO TUU APROBADO — PENDIENTE DE REGISTRO</p>
        <p className="text-sm font-semibold text-amber-950">
          Este ticket ya tiene un pago TUU aprobado pendiente de registro. No vuelva a cobrar: solo falta registrar el pago en ParkFacil.
          {record.otherDevice ? " El pago se aprobó en otro equipo." : ""}
        </p>
        <PaymentDetails record={record} />
        {message ? <p role="status" className="whitespace-pre-line text-sm font-bold text-amber-950">{message}</p> : null}
        {!message && record.lastRegistrationError ? (
          <p className="text-xs font-semibold text-amber-900">Último intento de registro: {record.lastRegistrationError}</p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => onRegister?.(record.stayId)} disabled={busy} className="min-h-12 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "REGISTRANDO..." : "REGISTRAR PAGO"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={closeButton}>CERRAR</button>
        </div>
      </div>
    );
  }

  if (record.status === TUU_PENDING_STATUS.UNCERTAIN) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-400 bg-red-50 p-4">
        <p className="text-lg font-black text-red-950">RESULTADO DEL PAGO INCIERTO</p>
        <p className="text-sm font-semibold text-red-950">
          No vuelva a cobrar hasta confirmar el estado de la transacción. Este ticket queda bloqueado para un nuevo pago.
        </p>
        <p className="text-sm font-semibold text-red-950">
          Avise a su administrador: debe revisar el pago en TUU y regularizarlo en ParkFacil (Pagos con tarjeta).
        </p>
        <PaymentDetails record={record} />
        {record.uncertainDetail ? <p className="text-xs font-semibold text-red-900">TUU informó: {record.uncertainDetail}</p> : null}
        {message ? <p role="status" className="whitespace-pre-line text-sm font-bold text-red-950">{message}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => onRefresh?.(record.stayId)} disabled={busy} className={refreshButton}>
            {busy ? "CONSULTANDO..." : "ACTUALIZAR ESTADO"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={closeButton}>CERRAR</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sky-400 bg-sky-50 p-4">
      <p className="text-lg font-black text-sky-950">PAGO CON TARJETA EN CURSO</p>
      <p className="text-sm font-semibold text-sky-950">
        {record.otherDevice
          ? "Este ticket se está pagando con tarjeta en otro equipo. No lo cobre aquí."
          : "Este ticket tiene un pago con tarjeta en curso. No vuelva a cobrar."}
      </p>
      <PaymentDetails record={record} />
      {message ? <p role="status" className="whitespace-pre-line text-sm font-bold text-sky-950">{message}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => onRefresh?.(record.stayId)} disabled={busy} className={refreshButton}>
          {busy ? "CONSULTANDO..." : "ACTUALIZAR ESTADO"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={closeButton}>CERRAR</button>
      </div>
    </div>
  );
}

// Alerta compacta en INICIO (QA PRO2 2026-10-18): una sola línea con la cantidad
// de pagos con tarjeta por resolver; la lista completa vive en la pantalla
// «Pagos por resolver» del menú, para no desplazar los botones del inicio.
export function TuuPendingPaymentsAlert({ count, onOpen }) {
  const total = Number(count) || 0;
  if (total <= 0) return null;
  return (
    <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-400 bg-amber-50 px-4 py-2">
      <p className="min-w-0 truncate text-sm font-black text-amber-950">
        ⚠ {total} {total === 1 ? "pago con tarjeta por resolver" : "pagos con tarjeta por resolver"}
      </p>
      <button type="button" onClick={onOpen} className="min-h-10 shrink-0 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-amber-600">
        VER
      </button>
    </div>
  );
}

// Lista de pagos con tarjeta sin cerrar del estacionamiento (de este u otro
// equipo, según el servidor) y los guardados en este equipo. Se muestra en la
// pantalla «Pagos por resolver».
export function TuuPendingPaymentsBanner({ records, onOpen }) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return null;
  const label = (record) => record.status === TUU_PENDING_STATUS.PENDING_REGISTRATION ? "Pago aprobado, pendiente de registro"
    : record.status === TUU_PENDING_STATUS.UNCERTAIN ? "Resultado del pago incierto"
      : record.otherDevice ? "Pago en curso en otro equipo" : "Pago en curso";
  return (
    <section className="mb-4 space-y-2 rounded-2xl border border-amber-400 bg-amber-50 p-4">
      <p className="text-sm font-black uppercase tracking-[0.08em] text-amber-950">Pagos con tarjeta por resolver ({list.length})</p>
      {list.map((record) => (
        <div key={record.attemptId || record.stayId} className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">{record.plate || record.ticketCode || "Ticket"} · {money.format(record.amount)} · {cardTypeLabel(record.cardType)}</p>
            <p className="truncate text-xs font-semibold text-slate-600">{label(record)}</p>
          </div>
          <button type="button" onClick={() => onOpen?.(record.stayId)} className="min-h-11 shrink-0 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-amber-600">
            VER
          </button>
        </div>
      ))}
    </section>
  );
}

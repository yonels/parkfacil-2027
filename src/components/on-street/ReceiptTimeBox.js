"use client";
import { useEffect, useState } from "react";
import { remainingSeconds } from "@/lib/onStreetPilot.mjs";
import LiveRemainingTime from "./LiveRemainingTime";

// Tiempo restante del comprobante de pago. Al llegar a cero avisa que el tiempo
// terminó, sin que el conductor tenga que recargar la página. Una sesión ya
// vencida no se puede extender: se ofrece pagar un tiempo nuevo en el mismo QR.
export default function ReceiptTimeBox({ expiresAt, closed = false, qrCode = null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (closed || remainingSeconds(expiresAt, now) > 0) {
    return (
      <div className="mt-4 rounded-3xl bg-[#041E42] p-6 text-center text-white">
        <p className="text-sm text-slate-300">Tiempo restante</p>
        <p suppressHydrationWarning className="mt-1 text-5xl font-black tabular-nums"><LiveRemainingTime expiresAt={expiresAt} /></p>
      </div>
    );
  }
  return (
    <div role="alert" className="mt-4 rounded-3xl bg-rose-50 p-6 text-center text-rose-800">
      <p className="text-3xl font-black">Tiempo vencido</p>
      <p className="mt-2 text-sm font-semibold">Tu tiempo de estacionamiento terminó. Si sigues estacionado, paga un nuevo tiempo o retira tu vehículo.</p>
      {qrCode ? <a href={`/estacionar/${qrCode}`} className="mt-4 block min-h-12 rounded-xl bg-rose-700 p-3 font-black text-white">PAGAR NUEVO TIEMPO</a> : null}
    </div>
  );
}

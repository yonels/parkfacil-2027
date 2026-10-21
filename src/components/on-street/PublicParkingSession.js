"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { MIN_PURCHASED_MINUTES, MAX_PURCHASED_MINUTES, formatDuration, normalizePurchasedMinutes, remainingSeconds, simulatedAmount } from "@/lib/onStreetPilot.mjs";

const money = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);
const time = (v) => (v ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—");

function redirectToWebpay(url, token) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "token_ws";
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

function Box({ l, v }) {
  return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{l}</dt><dd className="font-black">{v}</dd></div>;
}

export default function PublicParkingSession({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(0);
  const [extend, setExtend] = useState(false);
  const [extraMinutesInput, setExtraMinutesInput] = useState("");
  const intentKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/on-street/sessions/${token}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setData(b.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (busy && !data) return <main className="grid min-h-dvh place-items-center">Cargando…</main>;
  if (!data) return <main className="grid min-h-dvh place-items-center">{error}</main>;

  const s = data.session;
  const active = s.status === "ACTIVE";
  const subject = encodeURIComponent(`Consulta estacionamiento - ${data.location.sectorName} - ${data.location.streetName} - ${data.location.segmentName}`);

  async function close() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/public/on-street/sessions/${token}/close`, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Única vía de sesión pública: pagada vía Webpay. La rama de sesión
  // gratuita (piloto sin cobro) se eliminó junto con el resto del módulo —
  // ver §23 de la auditoría de producción. token no se usa directamente en
  // este render; queda disponible para depuración si hiciera falta.
  const left = remainingSeconds(s.expiresAt, now);
  const extra = normalizePurchasedMinutes(extraMinutesInput);
  const extraAmount = simulatedAmount(extra, s.ratePerMinute);
  const newExpiry = extra ? new Date(Math.max(new Date(s.expiresAt).getTime(), now) + extra * 60000) : null;

  async function payExtension() {
    if (busy) return;
    setBusy(true);
    setError("");
    // Cada intento de extensión es una operación financiera nueva: nuevo
    // intent, nueva payment_transaction, nuevo buy_order/token_ws (ver
    // createExtensionPaymentIntent/startWebpayPayment). Las claves de
    // idempotencia se regeneran aquí -- si quedaran fijas por el ciclo de
    // vida del componente, un segundo intento con un monto de minutos
    // distinto (p. ej. el conductor cambia de 10 a 20 min sin recargar la
    // página) devolvería silenciosamente el intent/transacción del primer
    // intento en vez de uno nuevo. El guard "if (busy) return" de arriba ya
    // impide un doble envío del MISMO click, así que regenerar aquí no
    // reintroduce ningún riesgo de doble cobro.
    intentKey.current = crypto.randomUUID();
    paymentKey.current = crypto.randomUUID();
    try {
      const ir = await fetch(`/api/public/on-street/sessions/${token}/extension-intents`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": intentKey.current }, body: JSON.stringify({ minutes: extra }) });
      const ib = await ir.json();
      if (!ir.ok) throw new Error(ib.error);
      const pr = await fetch(`/api/public/on-street/payment-intents/${ib.data.token}/webpay`, { method: "POST", headers: { "idempotency-key": paymentKey.current } });
      const pb = await pr.json();
      if (!pr.ok) throw new Error(pb.error);
      redirectToWebpay(pb.data.url, pb.data.token);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#EEF4FF] p-4 text-[#041E42] sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <p className="font-black text-[#3150D8]">ParkFacil</p>
        <h1 className="text-3xl font-black">{active ? "Estacionamiento activo" : s.status === "EXPIRED" ? "Estacionamiento vencido" : "Estacionamiento finalizado"}</h1>
        <p className="mt-3 text-sm"><b>Ubicación:</b> {data.location.sectorName} · {data.location.streetName} · {data.location.segmentName}</p>
        <div className="mt-5 rounded-3xl bg-[#041E42] p-6 text-center text-white">
          <p className="text-sm text-slate-300">Tiempo restante</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{active ? formatDuration(left) : "0 s"}</p>
          <p className="mt-2">Inicio: <b>{time(s.startedAt)}</b></p>
          <p>Vence: <b>{time(s.expiresAt)}</b></p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Box l="Patente" v={s.licensePlate || "No registrada"} />
          <Box l="Tiempo contratado" v={`${s.purchasedMinutes || 0} min`} />
          <Box l="Valor por minuto" v={money(s.ratePerMinute)} />
          <Box l="Monto pagado" v={money(s.amountPaid)} />
          <Box l="Extensiones" v={s.extensionCount} />
        </dl>
        {active ? (
          <>
            <button onClick={() => setExtend(!extend)} className="mt-4 min-h-14 w-full rounded-2xl bg-[#3150D8] font-black text-white">EXTENDER ESTADÍA</button>
            {extend ? (
              <div className="mt-3 rounded-2xl border p-4">
                <label className="block text-sm font-bold">
                  ¿Cuántos minutos desea agregar?
                  <input type="number" inputMode="numeric" min={MIN_PURCHASED_MINUTES} max={MAX_PURCHASED_MINUTES} value={extraMinutesInput} onChange={(e) => setExtraMinutesInput(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border-2 p-3 text-lg" placeholder="Ej: 45" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Mínimo: {MIN_PURCHASED_MINUTES} · Máximo: {MAX_PURCHASED_MINUTES}</span>
                </label>
                <p className="mt-3 text-sm">Tiempo restante: <b>{active ? formatDuration(left) : "0 s"}</b><br />Extensión: <b>{extra || 0} min</b><br />Nuevo vencimiento: <b>{time(newExpiry)}</b><br />Valor adicional: <b>{money(extraAmount)}</b></p>
                <button disabled={!extra || busy} onClick={payExtension} className="mt-3 min-h-12 w-full rounded-xl bg-emerald-600 font-black text-white">PAGAR EXTENSIÓN CON WEBPAY</button>
              </div>
            ) : null}
            <button disabled={busy} onClick={() => window.confirm("Finalizar antes no genera devolución. ¿Continuar?") && close()} className="mt-3 min-h-12 w-full rounded-2xl border-2 font-bold">FINALIZAR ESTACIONAMIENTO</button>
          </>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        {data.location.operatorEmail ? (
          <a href={`mailto:${data.location.operatorEmail}?subject=${subject}`} className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-[#3150D8]">
            <Mail className="h-4 w-4" />Contactar al operador
          </a>
        ) : null}
      </section>
    </main>
  );
}

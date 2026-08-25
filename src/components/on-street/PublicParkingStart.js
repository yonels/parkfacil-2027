"use client";
import { useRef, useState } from "react";
import { Mail, MapPin } from "lucide-react";
import { MIN_PURCHASED_MINUTES, MAX_PURCHASED_MINUTES, normalizePurchasedMinutes, simulatedAmount } from "@/lib/onStreetPilot.mjs";

const money = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);

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

// Flujo comercial definitivo: QR -> ubicación -> teléfono -> minutos (campo
// numérico libre, sin dropdown) -> precio -> Webpay. El importe mostrado aquí
// es solo informativo: el servidor vuelve a calcular el monto real al crear
// la intención de pago (createInitialPaymentIntent), nunca confía en lo que
// llega del navegador.
export default function PublicParkingStart({ qrCode, location }) {
  const [licensePlate, setLicensePlate] = useState("");
  const [phone, setPhone] = useState("");
  const [minutesInput, setMinutesInput] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const intentKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());

  const minutes = normalizePurchasedMinutes(minutesInput);
  const total = simulatedAmount(minutes, location.ratePerMinute);
  const subject = encodeURIComponent(`Consulta estacionamiento - ${location.sectorName} - ${location.streetName} - ${location.segmentName}`);

  async function submit(event) {
    event.preventDefault();
    if (busy || !minutes) return;
    setBusy(true);
    setError("");
    try {
      const intentResponse = await fetch("/api/public/on-street/payment-intents", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": intentKey.current },
        body: JSON.stringify({ qrCode, licensePlate, phone, accepted, minutes }),
      });
      const intentBody = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intentBody.error);
      const paymentResponse = await fetch(`/api/public/on-street/payment-intents/${intentBody.data.token}/webpay`, {
        method: "POST",
        headers: { "idempotency-key": paymentKey.current },
      });
      const paymentBody = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(paymentBody.error);
      if (paymentBody.data.completed) throw new Error("Este pago ya fue procesado.");
      redirectToWebpay(paymentBody.data.url, paymentBody.data.token);
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#EEF4FF] p-4 text-[#041E42] sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-lg font-black text-[#3150D8]">ParkFacil</p>
        <h1 className="text-3xl font-black">Estacionamiento por minutos</h1>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Operador</p>
          <p className="font-black">{location.operator.tradeName}</p>
          {location.operator.businessName !== location.operator.tradeName ? <p>{location.operator.businessName}</p> : null}
          <p>RUT {location.operator.rut || "No informado"}</p>
        </div>

        <div className="mt-3 flex gap-3 rounded-2xl bg-[#F5F9FF] p-4">
          <MapPin className="h-5 w-5 shrink-0 text-[#3150D8]" />
          <div>
            <b>{location.parkingName}</b>
            <p className="text-sm">{location.sectorName} · {location.streetName} · {location.segmentName}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
          <span className="font-bold">Valor por minuto</span>
          <b className="text-2xl text-emerald-700">{money(location.ratePerMinute)}</b>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-bold">
            PATENTE DEL VEHÍCULO
            <input
              required
              autoCapitalize="characters"
              value={licensePlate}
              onChange={(event) => setLicensePlate(event.target.value.toUpperCase())}
              placeholder="ABCD12"
              className="mt-2 min-h-14 w-full rounded-2xl border-2 px-4 text-lg uppercase"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Ingresa la patente del vehículo que estás estacionando.</span>
          </label>

          <label className="block text-sm font-bold">
            ¿Cuántos minutos desea estacionar?
            <input
              required
              type="number"
              inputMode="numeric"
              min={MIN_PURCHASED_MINUTES}
              max={MAX_PURCHASED_MINUTES}
              value={minutesInput}
              onChange={(event) => setMinutesInput(event.target.value)}
              placeholder="Ej: 75"
              className="mt-2 min-h-14 w-full rounded-2xl border-2 px-4 text-lg"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Mínimo: {MIN_PURCHASED_MINUTES} minuto · Máximo: {MAX_PURCHASED_MINUTES} minutos</span>
          </label>

          <label className="block text-sm font-bold">
            Número de teléfono móvil
            <input
              required
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+56 9 XXXX XXXX"
              className="mt-2 min-h-14 w-full rounded-2xl border-2 px-4 text-lg"
            />
          </label>

          <div className="rounded-2xl bg-[#041E42] p-5 text-white">
            <p>Tiempo: <b>{minutes || 0} minutos</b></p>
            <p>Tarifa: <b>{money(location.ratePerMinute)}/min</b></p>
            <p className="mt-2 flex justify-between text-lg"><span>Total</span><b className="text-2xl">{money(total || 0)}</b></p>
            <p className="mt-2 text-xs text-cyan-200">El precio definitivo se valida en el servidor.</p>
          </div>

          <label className="flex gap-3 text-xs">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>Acepto las condiciones y el tratamiento de datos necesario.</span>
          </label>

          {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

          <button disabled={busy || !accepted || !minutes || !phone || !licensePlate.trim()} className="min-h-16 w-full rounded-2xl bg-[#3150D8] font-black text-white disabled:opacity-60">
            {busy ? "CONECTANDO CON WEBPAY…" : `CONTINUAR A WEBPAY · ${money(total || 0)}`}
          </button>
        </form>

        {location.operator.email ? (
          <a className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-[#3150D8]" href={`mailto:${location.operator.email}?subject=${subject}`}>
            <Mail className="h-4 w-4" />Contactar al operador
          </a>
        ) : null}
      </section>
    </main>
  );
}

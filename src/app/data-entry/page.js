"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Camera, CarFront, CheckCircle2, CircleParking, Home, LoaderCircle, LogOut, Menu, Printer, QrCode, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const actions = [
  { key: "ENTRY", label: "Ingresar", detail: "Registrar vehículo", icon: ArrowDownToLine, color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "EXIT", label: "Salida", detail: "Calcular y pagar", icon: ArrowUpFromLine, color: "bg-rose-600 hover:bg-rose-700" },
  { key: "PARKED", label: "Vehículos", detail: "Dentro del parking", icon: CircleParking, color: "bg-[#3150D8] hover:bg-[#243FC0]" },
  { key: "QR", label: "Código QR", detail: "Leer y generar pago", icon: QrCode, color: "bg-amber-500 hover:bg-amber-600" },
];

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
const dateTime = (value) => new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
const roleLabel = (role) => role === "operator" ? "Operador" : "Administrador";

function ticketHtml({ kind, stay, parking, quote, qrImage, actor }) {
  const isEntry = kind === "ENTRY";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${stay.code}</title><style>@page{size:80mm auto;margin:4mm}body{width:72mm;margin:0;font:12px Arial;color:#111}.center{text-align:center}.brand{font-size:22px;font-weight:800;color:#041E42}.rule{border-top:1px dashed #555;margin:10px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.plate{font-size:25px;font-weight:900;letter-spacing:2px;margin:10px}.total{font-size:18px;font-weight:900}img{width:35mm;height:35mm}</style></head><body><div class="center"><div class="brand">ParkFacil</div><b>${parking.company_name || "Empresa"}</b><br>${parking.name}<br>${parking.address || ""} ${parking.city || ""}<div class="rule"></div><b>TICKET DE ${isEntry ? "INGRESO" : "SALIDA Y PAGO"}</b><div class="plate">${stay.license_plate}</div></div><div class="row"><span>Código</span><b>${isEntry ? stay.code : stay.payment_code}</b></div><div class="row"><span>Fecha ingreso</span><b>${dateTime(stay.entry_at)}</b></div>${isEntry ? "" : `<div class="row"><span>Fecha salida</span><b>${dateTime(stay.exit_at)}</b></div><div class="row"><span>Tiempo</span><b>${stay.elapsed_minutes} minutos</b></div><div class="row"><span>Tarifa</span><b>${stay.rate_name}</b></div><div class="rule"></div>${stay.coupon_code ? `<div class="row"><span>Subtotal</span><b>${money(stay.subtotal_amount)}</b></div><div class="row"><span>Cupón ${stay.coupon_code}</span><b>-${money(stay.discount_amount)}</b></div>` : ""}<div class="row"><span>Neto</span><b>${money(stay.net_amount)}</b></div><div class="row"><span>IVA 19%</span><b>${money(stay.tax_amount)}</b></div><div class="row total"><span>TOTAL</span><b>${money(stay.total_amount)}</b></div>`}<div class="rule"></div><div class="row"><span>Operador</span><b>${actor.name}</b></div><div class="center"><img src="${qrImage}"/><br>${isEntry ? stay.qr_token : stay.payment_code}<p>${isEntry ? "Conserve este ticket para registrar su salida." : "Pago registrado. Gracias por su visita."}</p></div></body></html>`;
}

async function printTicket(payload) {
  const qrValue = payload.kind === "ENTRY" ? payload.stay.qr_token : payload.stay.payment_code;
  const qrImage = await QRCode.toDataURL(qrValue, { width: 320, margin: 1, color: { dark: "#041E42", light: "#FFFFFF" } });
  const popup = window.open("", "parkfacil-ticket", "width=420,height=720");
  if (!popup) throw new Error("Permite ventanas emergentes para imprimir el ticket.");
  popup.document.write(ticketHtml({ ...payload, qrImage })); popup.document.close(); popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

export default function DataEntryPage() {
  const router = useRouter();
  const [view, setView] = useState("HOME");
  const [prefix, setPrefix] = useState(""); const [suffix, setSuffix] = useState("");
  const [parking, setParking] = useState(null); const [stays, setStays] = useState([]);
  const [selectedStayId, setSelectedStayId] = useState(""); const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [quote, setQuote] = useState(null); const [qrToken, setQrToken] = useState(""); const [actor, setActor] = useState(null);
  const [couponToken, setCouponToken] = useState("");
  const [busy, setBusy] = useState(true); const [message, setMessage] = useState(""); const [cameraOpen, setCameraOpen] = useState(false);
  const [posMenuOpen, setPosMenuOpen] = useState(true);
  const prefixRef = useRef(null); const suffixRef = useRef(null); const videoRef = useRef(null); const scannerRef = useRef(null);

  async function authFetch(url, options = {}) {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) } });
  }

  async function load() {
    setBusy(true); const response = await authFetch("/api/data-entry");
    if (response.status === 401 || response.status === 403) { router.replace("/login?next=/data-entry"); return; }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error || "No fue posible cargar la operación."); setBusy(false); return; }
    setParking(payload.data.parking); setStays(payload.data.stays); setActor(payload.data.actor); setMessage(payload.data.warning || ""); setBusy(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { scannerRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  function selectView(key) { setView(key); setMessage(""); setQuote(null); if (key === "ENTRY") window.setTimeout(() => prefixRef.current?.focus(), 50); }
  async function post(body) { setBusy(true); setMessage(""); const response = await authFetch("/api/data-entry", { method: "POST", body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) { setMessage(payload.error || "No fue posible completar la operación."); return null; } return payload.data; }

  async function registerEntry(event) {
    event.preventDefault(); const data = await post({ action: "ENTRY", platePrefix: prefix, plateSuffix: suffix, source: "WEB" }); if (!data) return;
    setMessage(`Ingreso guardado: ${data.stay.license_plate}`); await printTicket({ kind: "ENTRY", ...data, actor }); setPrefix(""); setSuffix(""); await load();
  }
  async function calculateExit(identifier = {}) { const data = await post({ action: "QUOTE", ...identifier }); if (data) { setQuote(data); setSelectedStayId(data.stay.id); if (identifier.couponToken) setCouponToken(identifier.couponToken); setView("EXIT"); } }
  async function finishExit() { if (!quote) return; const data = await post({ action: "EXIT", stayId: quote.stay.id, paymentMethod, couponToken: couponToken || undefined }); if (!data) return; setQuote(data); setCouponToken(""); setMessage(`Pago registrado: ${data.stay.payment_code}`); await printTicket({ kind: "EXIT", ...data, actor }); await load(); }
  async function processQr(value) {
    const token = String(value || "").trim();
    if (token.toUpperCase().startsWith("PFC-COUPON:")) {
      if (!selectedStayId) { setMessage("Selecciona primero el vehículo al que aplicarás el cupón."); setView("EXIT"); return; }
      await calculateExit({ stayId: selectedStayId, couponToken: token }); return;
    }
    await calculateExit({ qrToken: token });
  }

  async function startScanner() {
    setMessage("");
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { setMessage("Este navegador no admite lectura QR por cámara. Ingresa el código manualmente."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); scannerRef.current = stream; setCameraOpen(true);
      window.setTimeout(async () => {
        if (!videoRef.current) return; videoRef.current.srcObject = stream; await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const scan = async () => { if (!scannerRef.current || !videoRef.current) return; const codes = await detector.detect(videoRef.current).catch(() => []); if (codes[0]?.rawValue) { setQrToken(codes[0].rawValue); stopScanner(); await processQr(codes[0].rawValue); return; } requestAnimationFrame(scan); }; scan();
      }, 50);
    } catch { setMessage("No fue posible acceder a la cámara. Revisa el permiso del navegador."); }
  }
  function stopScanner() { scannerRef.current?.getTracks().forEach((track) => track.stop()); scannerRef.current = null; setCameraOpen(false); }
  async function logout() { await getSupabaseBrowserClient().auth.signOut(); router.replace("/login"); }
  return <div className="min-h-screen bg-[#EEF4FF] text-[#041E42]">
    <aside className={`${posMenuOpen ? "w-64" : "w-20"} fixed inset-y-0 left-0 z-30 flex flex-col bg-[#3150D8] p-3 text-white shadow-2xl transition-all`}>
      <div className="flex min-h-14 items-center gap-3 border-b border-white/25 px-1 pb-3"><button type="button" onClick={() => setPosMenuOpen((current) => !current)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 hover:bg-white/25"><Menu className="h-6 w-6" /></button>{posMenuOpen ? <div className="min-w-0"><p className="font-black">ParkFacil</p><p className="truncate text-xs text-blue-100">Terminal POS</p></div> : null}</div>
      {posMenuOpen ? <div className="mt-2 rounded-xl bg-white/15 p-2.5"><p className="text-[9px] font-black uppercase tracking-[.14em] text-blue-100">Estacionamiento</p><p className="mt-0.5 truncate text-xs font-bold">{parking?.name || "Cargando..."}</p><div className="mt-2 border-t border-white/20 pt-2"><p className="truncate text-[11px] font-bold">{actor?.name}</p><p className="text-[10px] text-blue-100">{roleLabel(actor?.role)}</p></div></div> : null}
      <nav className="mt-3 flex-1 space-y-1.5">
        <button type="button" onClick={() => selectView("HOME")} title="Inicio" className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition ${view === "HOME" ? "bg-white text-[#3150D8]" : "bg-white/10 hover:bg-white/20"}`}><Home className="h-4.5 w-4.5 shrink-0" />{posMenuOpen ? "Inicio" : null}</button>
        {actions.map((action) => { const Icon = action.icon; return <button key={action.key} type="button" onClick={() => selectView(action.key)} title={action.label} className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition ${view === action.key ? "bg-white text-[#3150D8]" : "bg-white/10 hover:bg-white/20"}`}><Icon className="h-4.5 w-4.5 shrink-0" />{posMenuOpen ? action.label : null}</button>; })}
      </nav>
      <button type="button" onClick={logout} title="Cerrar sesión" className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20"><LogOut className="h-4.5 w-4.5 shrink-0" />{posMenuOpen ? "Cerrar sesión" : null}</button>
    </aside>
    <main className={`min-h-screen bg-[#EEF4FF] transition-all ${posMenuOpen ? "ml-64" : "ml-20"}`}>
    <header className="flex min-h-16 items-center justify-between border-b border-[#BFD2FF] bg-white px-4 shadow-sm sm:px-5"><div className="flex items-center gap-3"><button type="button" onClick={() => router.push("/")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#BFD2FF] bg-[#EEF4FF] px-3 text-xs font-bold text-[#3150D8] transition hover:bg-[#DCE7FF]" title="Volver"><ArrowLeft className="h-4 w-4" />Volver</button><div><p className="text-xl font-black">Park<span className="text-[#3150D8]">Facil</span></p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Operación de estacionamiento</p></div></div><div className="flex items-center gap-2"><div className="hidden text-right sm:block"><p className="text-xs font-bold">{actor?.name || "Cargando..."}</p><p className="text-[10px] text-[#3150D8]">{roleLabel(actor?.role)}</p></div><button onClick={logout} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-rose-600" title="Cerrar sesión"><LogOut className="h-4 w-4" /></button></div></header>
    <div className="mx-auto max-w-6xl p-3 sm:p-4">
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{actions.map((action) => { const Icon = action.icon; return <button key={action.key} onClick={() => selectView(action.key)} className={`${action.color} min-h-20 rounded-2xl p-3 text-left text-white shadow-md transition active:scale-[.98] sm:min-h-24 sm:p-4`}><Icon className="h-6 w-6 sm:h-7 sm:w-7"/><span className="mt-1.5 block text-base font-black sm:text-lg">{action.label}</span><span className="block truncate text-[10px] text-white/80 sm:text-xs">{action.detail}</span></button>; })}</section>
      <section className="mt-3 rounded-3xl border border-[#BFD2FF] bg-white p-4 shadow-lg sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3150D8]">{parking?.company_name || "ParkFacil"}</p><h1 className="mt-0.5 text-xl font-black">{view === "HOME" ? (parking?.name || "Estacionamiento en operación") : actions.find((item) => item.key === view)?.label}</h1><p className="text-xs font-bold text-slate-500">{view === "HOME" ? `Parking en operación${parking?.code ? ` · ${parking.code}` : ""}` : (parking?.name || "Estacionamiento asignado")}</p></div>{view !== "HOME" ? <button onClick={() => selectView("HOME")} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><X className="h-4 w-4" /></button> : null}</div>
        {view === "HOME" ? <div className="grid min-h-40 place-items-center text-center"><div><CarFront className="mx-auto h-11 w-11 text-[#3150D8]"/><p className="mt-2 text-base font-black">Seleccione uno de los cuatro botones</p><p className="mt-1 text-xs text-slate-500">Toda la operación se realiza desde este panel.</p></div></div> : null}
        {view === "ENTRY" ? <form onSubmit={registerEntry} className="mx-auto max-w-2xl space-y-6"><div className="rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] p-4"><p className="text-xs font-black uppercase tracking-wide text-[#3150D8]">Estacionamiento asignado</p><p className="mt-1 text-lg font-black">{parking?.name || "Cargando asignación..."}</p></div><fieldset><legend className="text-sm font-black">PATENTE</legend><div className="mt-2 flex items-center justify-center gap-3"><input ref={prefixRef} required maxLength={4} value={prefix} onChange={(event) => { const value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");setPrefix(value);if(value.length===4)suffixRef.current?.focus(); }} placeholder="CXPY" className="min-h-24 w-48 min-w-0 rounded-3xl border-2 border-slate-200 bg-slate-50 text-center text-4xl font-black uppercase tracking-[.15em] outline-none focus:border-[#3150D8]"/><span className="text-4xl font-black">-</span><input ref={suffixRef} required maxLength={2} value={suffix} onChange={(event) => setSuffix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="93" className="min-h-24 w-28 min-w-0 rounded-3xl border-2 border-slate-200 bg-slate-50 text-center text-4xl font-black uppercase tracking-[.15em] outline-none focus:border-[#3150D8]"/></div></fieldset><button disabled={busy || !parking} className="flex min-h-18 w-full items-center justify-center gap-3 rounded-3xl bg-emerald-600 text-xl font-black text-white shadow-lg disabled:opacity-50">{busy?<LoaderCircle className="h-6 w-6 animate-spin"/>:<Printer className="h-6 w-6"/>}GUARDAR E IMPRIMIR INGRESO</button></form> : null}
        {view === "EXIT" ? <div className="mx-auto max-w-3xl space-y-5"><label className="block text-sm font-black">VEHÍCULO EN EL PARKING<select value={selectedStayId} onChange={(event) => { setSelectedStayId(event.target.value); setQuote(null); if(event.target.value)void calculateExit({stayId:event.target.value}); }} className="mt-2 min-h-16 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg font-bold outline-none"><option value="">Seleccione una patente</option>{stays.map((stay)=><option key={stay.id} value={stay.id}>{stay.license_plate} · ingreso {dateTime(stay.entry_at)}</option>)}</select></label>{quote?<PaymentSummary data={quote} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} onPay={finishExit} busy={busy}/>:<p className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">Seleccione un vehículo o utilice el botón Código QR.</p>}</div> : null}
        {view === "PARKED" ? <div className="overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[1fr_1.2fr_.8fr] bg-[#041E42] px-4 py-3 text-xs font-black uppercase text-white"><span>Patente</span><span>Ingreso</span><span>Operador</span></div>{stays.length?stays.map((stay)=><button key={stay.id} onClick={()=>{setSelectedStayId(stay.id);void calculateExit({stayId:stay.id});}} className="grid w-full grid-cols-[1fr_1.2fr_.8fr] border-t border-slate-100 px-4 py-4 text-left hover:bg-[#EEF4FF]"><b>{stay.license_plate}</b><span className="text-sm">{dateTime(stay.entry_at)}</span><span className="truncate text-sm">{stay.entry_operator_name}</span></button>):<p className="p-8 text-center text-slate-500">No hay vehículos dentro del parking.</p>}</div> : null}
        {view === "QR" ? <div className="mx-auto max-w-2xl space-y-5"><p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Para aplicar un cupón, selecciona primero el vehículo en Salida y luego lee su QR.</p><button onClick={startScanner} className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-amber-500 text-xl font-black text-[#041E42]"><Camera className="h-7 w-7"/>LEER QR CON CÁMARA</button>{cameraOpen?<div className="relative overflow-hidden rounded-3xl bg-black"><video ref={videoRef} className="aspect-video w-full object-cover"/><button onClick={stopScanner} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white"><X className="h-5 w-5"/></button></div>:null}<div className="flex gap-2"><input value={qrToken} onChange={(event)=>setQrToken(event.target.value.trim())} placeholder="Código QR manual" className="min-h-14 min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 font-mono outline-none focus:border-[#3150D8]"/><button onClick={()=>processQr(qrToken)} className="rounded-2xl bg-[#3150D8] px-5 font-black text-white">LEER QR</button></div></div> : null}
        {message?<div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-bold ${message.includes("guardado")||message.includes("registrado")?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700"}`}><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</div>:null}
      </section>
    </div>
    </main>
  </div>;
}

function PaymentSummary({ data, paymentMethod, setPaymentMethod, onPay, busy }) {
  return <div className="rounded-3xl border-2 border-[#BFD2FF] bg-[#EEF4FF] p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><Info label="Patente" value={data.stay.license_plate}/><Info label="Fecha ingreso" value={dateTime(data.stay.entry_at)}/><Info label="Minutos consumidos" value={data.quote.elapsedMinutes}/><Info label="Tarifa" value={`${data.quote.rate.name} · ${data.quote.rate.billingMode === "EFFECTIVE_MINUTE" ? "por minuto" : "por tramos"}`}/><Info label="Subtotal" value={money(data.quote.subtotal)}/><Info label="Descuento" value={`-${money(data.quote.discount)}`}/><Info label="Neto" value={money(data.quote.net)}/><Info label="IVA 19%" value={money(data.quote.tax)}/></div>{data.quote.coupon ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>Cupón aplicado: {data.quote.coupon.code}</strong><span className="ml-2">{data.quote.coupon.name}</span><p className="mt-1 text-xs">Se marcará como utilizado al confirmar el pago.</p></div> : null}<div className="mt-4 flex items-center justify-between rounded-2xl bg-[#041E42] p-5 text-white"><span className="font-bold">TOTAL A PAGAR</span><b className="text-3xl">{money(data.quote.total)}</b></div><fieldset className="mt-5"><legend className="text-sm font-black">FORMA DE PAGO</legend><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={()=>setPaymentMethod("CASH")} className={`min-h-14 rounded-2xl border-2 font-black ${paymentMethod==="CASH"?"border-[#3150D8] bg-white text-[#3150D8]":"border-slate-200 bg-transparent text-slate-500"}`}>CONTADO</button><button type="button" onClick={()=>setPaymentMethod("CARD")} className={`min-h-14 rounded-2xl border-2 font-black ${paymentMethod==="CARD"?"border-[#3150D8] bg-white text-[#3150D8]":"border-slate-200 bg-transparent text-slate-500"}`}>TARJETA</button></div></fieldset><button onClick={onPay} disabled={busy} className="mt-5 flex min-h-18 w-full items-center justify-center gap-3 rounded-3xl bg-emerald-600 text-xl font-black text-white shadow-lg disabled:opacity-50">{busy?<LoaderCircle className="h-6 w-6 animate-spin"/>:<Printer className="h-6 w-6"/>}PAGAR E IMPRIMIR SALIDA</button></div>;
}
function Info({ label, value }) { return <div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-[#041E42]">{value}</p></div>; }

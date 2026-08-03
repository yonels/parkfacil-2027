"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Eye, Mail, Plus, Printer, RefreshCw, Search, TicketPercent, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const emptyForm = { code: "", name: "", benefitType: "PERCENTAGE", value: "", validFrom: "", expiresAt: "", status: "ACTIVE" };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
const dateTime = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const generateCouponCode = () => `PF-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;

export default function CouponsClient() {
  const [coupons, setCoupons] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [emailCoupon, setEmailCoupon] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function loadCoupons() {
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/cupones", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los cupones.");
      setCoupons(body.data || []);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void loadCoupons(), 0); return () => window.clearTimeout(timer); }, []);

  async function createCoupon(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/cupones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible crear el cupón.");
      setCoupons((current) => [body.data, ...current]); setForm(emptyForm); setOpen(false);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function printCoupon(coupon) {
    const qrImage = await QRCode.toDataURL(coupon.qrPayload, { width: 420, margin: 2, errorCorrectionLevel: "M", color: { dark: "#041E42", light: "#FFFFFF" } });
    const popup = window.open("", "parkfacil-coupon", "width=760,height=900");
    if (!popup) return setMessage("Permite ventanas emergentes para imprimir el cupón.");
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cupón ${safe(coupon.code)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial;color:#041e42}.coupon{max-width:650px;margin:auto;border:2px solid #3150d8;border-radius:26px;overflow:hidden;text-align:center}.head{background:#3150d8;color:white;padding:25px}.body{padding:28px}.code{font-size:26px;font-weight:900;letter-spacing:3px}.qr{width:260px;height:260px}.benefit{font-size:23px;font-weight:800;color:#3150d8}.warning{font-size:12px;color:#64748b}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><main class="coupon"><div class="head"><h1>ParkFacil</h1><p>Cupón de un solo uso</p></div><div class="body"><h2>${safe(coupon.name)}</h2><img class="qr" src="${qrImage}"><p class="code">${safe(coupon.code)}</p><p class="benefit">${safe(benefitLabel(coupon))}</p><p><b>Expira:</b> ${safe(dateTime(coupon.expiresAt))}</p><p class="warning">Este QR se invalida inmediatamente después de utilizarse en el POS.</p></div></main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async function sendByEmail(event) {
    event.preventDefault(); setSending(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/cupones/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinatario: recipient, couponId: emailCoupon.id }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "No fue posible enviar el cupón.");
      setMessage(body.message); setEmailCoupon(null); setRecipient("");
    } catch (error) { setMessage(error.message); } finally { setSending(false); }
  }

  const visible = useMemo(() => coupons.filter((coupon) => `${coupon.code} ${coupon.name}`.toLowerCase().includes(query.toLowerCase())), [coupons, query]);
  return <AppShell title="Cupones" description="Cupones QR de un solo uso para descuentos en POS">
    <div className="space-y-6">
      <PageHeader title="Cupones" description="Crea, visualiza, imprime y envía cupones QR con expiración y canje único." actions={[<button key="create" type="button" onClick={() => { setMessage(""); setForm({ ...emptyForm, code: generateCouponCode() }); setOpen(true); }} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Crear cupón</button>]}/>
      {message ? <p className={`rounded-2xl p-3 text-sm font-semibold ${message.includes("correctamente") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p> : null}
      <label className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-3"><Search className="h-4 w-4 text-[#3150D8]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código o nombre" className="w-full outline-none"/></label>
      {busy && !coupons.length ? <p className="rounded-3xl border bg-white p-8 text-center text-slate-500">Cargando cupones...</p> : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} onView={setSelected} onPrint={printCoupon} onEmail={setEmailCoupon}/>)}</section>
    </div>
    {open ? <Modal onClose={() => setOpen(false)}><form onSubmit={createCoupon}><ModalTitle title="Crear cupón de un solo uso" onClose={() => setOpen(false)}/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Código generado automáticamente"><div className="flex gap-2"><input required readOnly value={form.code} className={`${inputClass} font-mono font-bold tracking-wider`}/><button type="button" onClick={() => setForm({...form,code:generateCouponCode()})} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#BFD2FF] text-[#3150D8]" title="Generar otro código"><RefreshCw className="h-4 w-4"/></button></div></Field><Field label="Nombre"><input required value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} className={inputClass}/></Field><Field label="Beneficio"><select value={form.benefitType} onChange={(event) => setForm({...form,benefitType:event.target.value})} className={inputClass}><option value="PERCENTAGE">Descuento porcentual</option><option value="FIXED_AMOUNT">Descuento fijo en pesos</option><option value="FREE_MINUTES">Minutos gratis</option></select></Field><Field label="Valor"><input required type="number" min="0.01" step="0.01" value={form.value} onChange={(event) => setForm({...form,value:event.target.value})} className={inputClass}/></Field><Field label="Inicio de vigencia"><input required type="datetime-local" value={form.validFrom} onChange={(event) => setForm({...form,validFrom:event.target.value})} className={inputClass}/></Field><Field label="Fecha y hora de expiración"><input required type="datetime-local" min={form.validFrom} value={form.expiresAt} onChange={(event) => setForm({...form,expiresAt:event.target.value})} className={inputClass}/></Field><Field label="Estado"><select value={form.status} onChange={(event) => setForm({...form,status:event.target.value})} className={inputClass}><option value="ACTIVE">Activo</option><option value="DRAFT">Borrador</option></select></Field></div><Actions onCancel={() => setOpen(false)} busy={busy} label="Crear cupón"/></form></Modal> : null}
    {selected ? <Modal onClose={() => setSelected(null)}><ModalTitle title={selected.name} onClose={() => setSelected(null)}/><div className="text-center"><CouponQr coupon={selected}/><p className="text-2xl font-black tracking-widest">{selected.code}</p><p className="mt-2 text-xl font-bold text-[#3150D8]">{benefitLabel(selected)}</p><p className="mt-3 text-sm">Expira: <strong>{dateTime(selected.expiresAt)}</strong></p><p className="mt-2 text-xs font-semibold text-amber-700">QR de un solo uso: quedará invalidado después del canje.</p><div className="mt-6 flex flex-wrap justify-center gap-2"><ActionButton onClick={() => printCoupon(selected)} icon={Printer} label="Imprimir PDF" primary/><ActionButton onClick={() => setEmailCoupon(selected)} icon={Mail} label="Enviar por correo"/></div></div></Modal> : null}
    {emailCoupon ? <Modal onClose={() => setEmailCoupon(null)}><form onSubmit={sendByEmail}><ModalTitle title="Enviar cupón por correo" onClose={() => setEmailCoupon(null)}/><div className="mt-5"><Field label="Correo destinatario"><input required type="email" autoFocus value={recipient} onChange={(event) => setRecipient(event.target.value)} className={inputClass} placeholder="cliente@correo.cl"/></Field></div><Actions onCancel={() => setEmailCoupon(null)} busy={sending} label="Enviar por correo"/></form></Modal> : null}
  </AppShell>;
}

function CouponCard({ coupon, onView, onPrint, onEmail }) { return <article className="flex flex-col rounded-3xl border bg-white p-5 shadow-sm"><div className="flex justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><TicketPercent/></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{statusLabel(coupon.status)}</span></div><CouponQr coupon={coupon} compact/><p className="text-xs font-black tracking-widest text-[#3150D8]">{coupon.code}</p><h2 className="mt-1 text-lg font-bold">{coupon.name}</h2><p className="mt-2 text-sm">{benefitLabel(coupon)}</p><p className="mt-2 text-xs text-slate-500">Expira: {dateTime(coupon.expiresAt)}</p><div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><ActionButton onClick={() => onView(coupon)} icon={Eye} label="Visualizar cupón"/><ActionButton onClick={() => onPrint(coupon)} icon={Printer} label="Imprimir PDF" primary/><ActionButton onClick={() => onEmail(coupon)} icon={Mail} label="Enviar por correo"/></div></article>; }
function CouponQr({ coupon, compact = false }) { const [src,setSrc]=useState(""); useEffect(() => { let active=true; QRCode.toDataURL(coupon.qrPayload,{width:compact?180:320,margin:2,errorCorrectionLevel:"M"}).then((value)=>{if(active)setSrc(value);}); return()=>{active=false;}; },[coupon.qrPayload,compact]); return src ? <Image src={src} width={compact ? 128 : 256} height={compact ? 128 : 256} unoptimized alt={`QR del cupón ${coupon.code}`} className={`${compact ? "my-3 h-32 w-32" : "mx-auto my-5 h-64 w-64"} rounded-xl border bg-white p-2`}/> : <div className="my-4 h-32 animate-pulse rounded-xl bg-slate-100"/>; }
function Modal({ children }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041E42]/60 p-4"><div className="mx-auto my-8 max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">{children}</div></div>; }
function ModalTitle({ title, onClose }) { return <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></div>; }
function Field({ label, children }) { return <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Actions({ onCancel, busy, label }) { return <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={busy} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Procesando..." : label}</button></div>; }
function ActionButton({ onClick, icon: Icon, label, primary = false }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${primary ? "bg-[#3150D8] text-white" : "border border-[#BFD2FF] text-[#3150D8]"}`}><Icon className="h-4 w-4"/>{label}</button>; }
function benefitLabel(coupon) { if (coupon.benefitType === "FREE_MINUTES") return `${coupon.value} minutos gratis`; if (coupon.benefitType === "FIXED_AMOUNT") return `$${coupon.value.toLocaleString("es-CL")} de descuento`; return `${coupon.value}% de descuento`; }
function statusLabel(status) { return ({ ACTIVE: "Activo", DRAFT: "Borrador", REDEEMED: "Utilizado", EXPIRED: "Vencido", CANCELLED: "Cancelado" })[status] || status; }

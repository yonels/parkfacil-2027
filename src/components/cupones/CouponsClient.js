"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Eye, Mail, Plus, Printer, RefreshCw, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const emptyForm = { code: "", name: "", merchantId: "", redeemingMerchantId: "", quantity: 1, benefitType: "PERCENTAGE", value: "", validFrom: "", expiresAt: "", status: "ACTIVE" };
const emptyMerchant = { companyId: "", code: "", name: "", contactName: "", contactEmail: "" };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]";
const dateTime = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const generateCouponCode = () => `PF-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;

export default function CouponsClient() {
  const [coupons, setCoupons] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState([]);
  const [emailCoupon, setEmailCoupon] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [merchantForm, setMerchantForm] = useState(emptyMerchant);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function loadCoupons() {
    setBusy(true);
    try {
      const [couponResponse, merchantResponse, companyResponse] = await Promise.all([authenticatedFetch("/api/cupones", { cache: "no-store" }), authenticatedFetch("/api/cupones/comercios", { cache: "no-store" }), authenticatedFetch("/api/empresas", { cache: "no-store" })]);
      const [couponBody, merchantBody, companyBody] = await Promise.all([couponResponse.json(), merchantResponse.json(), companyResponse.json()]);
      if (!couponResponse.ok) throw new Error(couponBody.error || "No fue posible cargar los cupones.");
      if (!merchantResponse.ok) throw new Error(merchantBody.error || "No fue posible cargar las tiendas.");
      setCoupons(couponBody.data || []); setMerchants(merchantBody.data || []); setCompanies(companyResponse.ok ? companyBody.data || [] : []);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void loadCoupons(), 0); return () => window.clearTimeout(timer); }, []);

  async function createCoupon(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const value = form.benefitType === "FREE_MINUTES" ? durationToMinutes(form.value) : Number(form.value);
      const response = await authenticatedFetch("/api/cupones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible crear el cupón.");
      let batch = [body.data];
      const quantity = Math.max(1, Math.min(100, Math.floor(Number(form.quantity) || 1)));
      if (quantity > 1) {
        const batchResponse = await authenticatedFetch("/api/cupones/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: body.data.id, quantity }) });
        const batchBody = await batchResponse.json();
        if (!batchResponse.ok) throw new Error(batchBody.error || "El cupón base fue creado, pero no fue posible completar el lote.");
        batch = batchBody.data;
      }
      setCoupons((current) => [...batch, ...current]); setForm(emptyForm); setOpen(false); setSelectedBatch(batch); setSelected(batch[0]); setMessage(`${batch.length} cupón${batch.length === 1 ? "" : "es"} creado${batch.length === 1 ? "" : "s"} correctamente para ${batch[0].redeemingMerchantName || batch[0].merchantName}.`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function createMerchant(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/cupones/comercios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(merchantForm) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No fue posible registrar la tienda.");
      setMerchants((current) => [...current, body.data].sort((a,b) => a.name.localeCompare(b.name))); setForm({ ...emptyForm, merchantId: body.data.id, redeemingMerchantId: body.data.id, code: generateCouponCode() }); setMerchantForm(emptyMerchant); setMerchantOpen(false); setOpen(true); setMessage("Tienda registrada correctamente. Completa ahora el cupón.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  function openCouponForMerchant(merchant) {
    setMessage("");
    setForm({ ...emptyForm, merchantId: merchant.id, redeemingMerchantId: merchant.id, code: generateCouponCode() });
    setOpen(true);
  }

  function hideDeliveredCoupons(ids, method) {
    const deliveredAt = new Date().toISOString();
    setCoupons((current) => current.map((coupon) => ids.includes(coupon.id) ? { ...coupon, deliveredAt, deliveryMethod: method } : coupon));
    setSelected(null);
    setSelectedBatch([]);
  }

  async function printCoupon(coupon, couponsToPrint = [coupon]) {
    const popup = window.open("", "parkfacil-coupon", "width=760,height=900");
    if (!popup) return setMessage("Permite ventanas emergentes para imprimir el cupón.");
    popup.document.write("<p style='font-family:Arial;padding:30px'>Generando cupones únicos...</p>");
    const batch = couponsToPrint.length ? couponsToPrint : [coupon];
    const qrImages = await Promise.all(batch.map((item) => QRCode.toDataURL(item.qrPayload, { width: 420, margin: 2, errorCorrectionLevel: "M", color: { dark: "#041E42", light: "#FFFFFF" } })));
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
    const couponHtml = batch.map((item,index) => `<article class="coupon"><header class="head"><span class="brand">ParkFacil</span><span class="title">Cupón de estacionamiento de un solo uso</span></header><div class="body"><h2>${safe(item.name)}</h2><div class="identity"><p><b>Generado por:</b> ${safe(item.companyName)}</p><p><b>Para:</b> ${safe(item.redeemingMerchantName || item.merchantName)}</p></div><img class="qr" src="${qrImages[index]}" alt="Código QR del cupón ${safe(item.code)}"><p class="code">${safe(item.code)}</p><p class="benefit">${safe(benefitLabel(item))}</p><p class="expiry"><b>Expira:</b> ${safe(dateTime(item.expiresAt))}</p></div></article>`).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lote de cupones</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#041e42}.sheet{display:grid;grid-template-columns:repeat(2,1fr);gap:7mm}.coupon{height:128mm;border:1.5px solid #3150d8;border-radius:14px;overflow:hidden;text-align:center;break-inside:avoid}.head{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#3150d8;color:white;padding:9px 14px;text-align:left}.brand{font-size:18px;font-weight:800;line-height:1}.title{font-size:10px;line-height:1.2;text-align:right}.body{padding:10px}.body h2{margin:2px 0 5px;font-size:17px}.identity{margin:0 auto 3px;font-size:11px;line-height:1.35}.identity p{margin:1px 0}.qr{display:block;width:50mm;height:50mm;margin:4px auto}.code{margin:2px;font-size:17px;font-weight:900;letter-spacing:2px}.benefit{margin:4px;font-size:16px;font-weight:800;color:#3150d8}.expiry{margin:4px;font-size:10px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><main class="sheet">${couponHtml}</main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
    const ids = batch.map((item) => item.id);
    const deliveryResponse = await authenticatedFetch("/api/cupones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, method: "PRINT" }) });
    if (deliveryResponse.ok) hideDeliveredCoupons(ids, "PRINT");
    else setMessage("La impresión se abrió, pero no fue posible ocultar los QR entregados.");
  }

  async function sendByEmail(event) {
    event.preventDefault(); setSending(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/cupones/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinatario: recipient, couponId: emailCoupon.id }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "No fue posible enviar el cupón.");
      const deliveredAt = new Date().toISOString();
      setCoupons((current) => current.map((coupon) => coupon.id === emailCoupon.id ? { ...coupon, deliveredAt, deliveryMethod: "EMAIL" } : coupon));
      setMessage(body.message); setEmailCoupon(null); setSelected(null); setSelectedBatch([]); setRecipient("");
    } catch (error) { setMessage(error.message); } finally { setSending(false); }
  }

  const visible = useMemo(() => coupons.filter((coupon) => `${coupon.code} ${coupon.name}`.toLowerCase().includes(query.toLowerCase())), [coupons, query]);
  const merchantStats = useMemo(() => merchants.map((merchant) => { const issued = coupons.filter((coupon) => coupon.merchantId === merchant.id); return { ...merchant, issued: issued.length, redeemed: issued.filter((coupon) => coupon.status === "REDEEMED").length }; }), [merchants, coupons]);
  return <AppShell title="Cupones" description="Cupones QR de un solo uso para descuentos en POS">
    <div className="space-y-6">
      <PageHeader title="Cupones" description="Crea, visualiza, imprime y envía cupones QR con expiración y canje único." actions={[<button key="merchant" type="button" onClick={() => { setMessage(""); setMerchantOpen(true); }} className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-4 py-2 text-sm font-semibold text-[#3150D8]"><Plus className="h-4 w-4"/>Registrar tienda</button>,<button key="create" type="button" onClick={() => { setMessage(""); setForm({ ...emptyForm, code: generateCouponCode() }); setOpen(true); }} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Crear cupón</button>]}/>
      {message ? <p className={`rounded-2xl p-3 text-sm font-semibold ${message.includes("correctamente") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p> : null}
      <label className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-3"><Search className="h-4 w-4 text-[#3150D8]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código o nombre" className="w-full outline-none"/></label>
      {merchantStats.length ? <section><div className="mb-3"><h2 className="text-lg font-bold text-[#041E42]">Tiendas registradas</h2><p className="text-sm text-slate-500">Genera nuevos cupones por demanda sin volver a registrar la tienda.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{merchantStats.map((merchant) => <div key={merchant.id} className="flex flex-col rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">{merchant.companyName}</p><h3 className="mt-1 font-bold">{merchant.name}</h3><div className="mt-3 flex gap-5 text-sm"><span>Emitidos: <strong>{merchant.issued}</strong></span><span>Utilizados: <strong>{merchant.redeemed}</strong></span></div><button type="button" onClick={() => openCouponForMerchant(merchant)} className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#3150D8] px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Generar cupones</button></div>)}</div></section> : null}
      {busy && !coupons.length ? <p className="rounded-3xl border bg-white p-8 text-center text-slate-500">Cargando cupones...</p> : null}
      <section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="text-lg font-bold text-[#041E42]">Registro de cupones</h2><p className="mt-1 text-sm text-slate-500">Registro administrativo tipo planilla. El QR no se muestra en pantalla.</p></div><div className="overflow-x-auto"><table className="min-w-full whitespace-nowrap text-left text-sm"><thead className="bg-[#041E42] text-white"><tr><th className="px-3 py-3">Código</th><th className="px-3 py-3">Generado por</th><th className="px-3 py-3">Para</th><th className="px-3 py-3">Campaña</th><th className="px-3 py-3">Beneficio</th><th className="px-3 py-3">Inicio</th><th className="px-3 py-3">Expiración</th><th className="px-3 py-3">Entrega</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Utilización</th><th className="px-3 py-3">Acciones</th></tr></thead><tbody>{visible.map((coupon) => <tr key={`record-${coupon.id}`} className="border-t hover:bg-slate-50"><td className="px-3 py-3 font-mono font-bold text-[#3150D8]">{coupon.code}</td><td className="px-3 py-3">{coupon.companyName || coupon.companyId}</td><td className="px-3 py-3 font-semibold">{coupon.redeemingMerchantName || coupon.merchantName || "—"}</td><td className="px-3 py-3">{coupon.name}</td><td className="px-3 py-3">{benefitLabel(coupon)}</td><td className="px-3 py-3">{dateTime(coupon.validFrom)}</td><td className="px-3 py-3">{dateTime(coupon.expiresAt)}</td><td className="px-3 py-3">{coupon.deliveredAt ? `${coupon.deliveryMethod === "EMAIL" ? "Correo" : "Impresión"} · ${dateTime(coupon.deliveredAt)}` : "Pendiente"}</td><td className="px-3 py-3">{statusLabel(coupon.status)}</td><td className="px-3 py-3">{coupon.redeemedAt ? dateTime(coupon.redeemedAt) : "Sin utilizar"}</td><td className="px-3 py-3"><ActionButton onClick={() => { setSelectedBatch([coupon]); setSelected(coupon); }} icon={Eye} label="Ver"/></td></tr>)}{!visible.length ? <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">No existen cupones para la búsqueda actual.</td></tr> : null}</tbody></table></div></section>
    </div>
    {open ? <Modal onClose={() => setOpen(false)}><form onSubmit={createCoupon}><ModalTitle title="Crear cupón de un solo uso" onClose={() => setOpen(false)}/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Generado por"><input readOnly value={merchants.find((merchant) => merchant.id === form.redeemingMerchantId)?.companyName || "Selecciona una tienda"} className={`${inputClass} bg-slate-50 font-semibold`}/></Field><Field label="Para"><select required value={form.redeemingMerchantId} onChange={(event) => setForm({...form,merchantId:event.target.value,redeemingMerchantId:event.target.value})} className={inputClass}><option value="">Seleccionar tienda</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></Field><Field label="Nombre de campaña o promoción"><input required value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} className={inputClass} placeholder="Ej.: Campaña Día de la Madre"/><small className="mt-1 block font-normal text-slate-500">Identifica el motivo comercial del cupón.</small></Field><Field label="Código generado automáticamente"><div className="flex gap-2"><input required readOnly value={form.code} className={`${inputClass} font-mono font-bold tracking-wider`}/><button type="button" onClick={() => setForm({...form,code:generateCouponCode()})} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#BFD2FF] text-[#3150D8]" title="Generar otro código"><RefreshCw className="h-4 w-4"/></button></div></Field><Field label="Beneficio"><select value={form.benefitType} onChange={(event) => setForm({...form,benefitType:event.target.value,value:event.target.value === "FREE_MINUTES" ? "00:30" : ""})} className={inputClass}><option value="PERCENTAGE">Descuento porcentual</option><option value="FIXED_AMOUNT">Descuento fijo en pesos</option><option value="FREE_MINUTES">Minutos gratis</option></select></Field><BenefitValueField form={form} setForm={setForm}/><Field label="Inicio de vigencia"><input required type="datetime-local" value={form.validFrom} onChange={(event) => setForm({...form,validFrom:event.target.value})} className={inputClass}/></Field><Field label="Fecha y hora de expiración"><input required type="datetime-local" min={form.validFrom} value={form.expiresAt} onChange={(event) => setForm({...form,expiresAt:event.target.value})} className={inputClass}/></Field><Field label="Estado"><select value={form.status} onChange={(event) => setForm({...form,status:event.target.value})} className={inputClass}><option value="ACTIVE">Activo</option><option value="DRAFT">Borrador</option></select></Field><Field label="Cantidad de cupones para esta tienda"><input required type="number" min="1" max="100" step="1" value={form.quantity} onChange={(event) => setForm({...form,quantity:event.target.value})} className={inputClass}/><small className="mt-1 block font-normal text-slate-500">Cada cupón tendrá un código y QR únicos.</small></Field></div><Actions onCancel={() => setOpen(false)} busy={busy} label="Generar QR y vista previa"/></form></Modal> : null}
    {merchantOpen ? <Modal onClose={() => setMerchantOpen(false)}><form onSubmit={createMerchant}><ModalTitle title="Registrar tienda emisora" onClose={() => setMerchantOpen(false)}/><div className="mt-5 grid gap-4 sm:grid-cols-2">{companies.length ? <Field label="Empresa administradora"><select required value={merchantForm.companyId} onChange={(event) => setMerchantForm({...merchantForm,companyId:event.target.value})} className={inputClass}><option value="">Seleccionar empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombreFantasia || company.razonSocial}</option>)}</select></Field> : null}<Field label="Código interno de tienda"><input required value={merchantForm.code} onChange={(event) => setMerchantForm({...merchantForm,code:event.target.value})} className={inputClass} placeholder="TDA-001"/></Field><Field label="Nombre de la tienda"><input required value={merchantForm.name} onChange={(event) => setMerchantForm({...merchantForm,name:event.target.value})} className={inputClass}/></Field><Field label="Persona de contacto"><input value={merchantForm.contactName} onChange={(event) => setMerchantForm({...merchantForm,contactName:event.target.value})} className={inputClass}/></Field><Field label="Correo de contacto"><input type="email" value={merchantForm.contactEmail} onChange={(event) => setMerchantForm({...merchantForm,contactEmail:event.target.value})} className={inputClass}/></Field></div><Actions onCancel={() => setMerchantOpen(false)} busy={busy} label="Registrar tienda"/></form></Modal> : null}
    {selected ? <Modal onClose={() => setSelected(null)}><ModalTitle title={`Vista previa · ${selected.name}`} onClose={() => setSelected(null)}/><div className="text-center"><div className="mt-3 space-y-1 text-sm text-slate-600"><p><strong>Generado por:</strong> {selected.companyName}</p><p><strong>Para:</strong> {selected.redeemingMerchantName || selected.merchantName}</p></div><p className="text-2xl font-black tracking-widest">{selected.code}</p><p className="mt-2 text-xl font-bold text-[#3150D8]">{benefitLabel(selected)}</p><p className="mt-3 text-sm">Expira: <strong>{dateTime(selected.expiresAt)}</strong></p><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">El QR se incorpora únicamente al documento de impresión o al correo enviado.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{!selected.deliveredAt ? <><ActionButton onClick={() => printCoupon(selected, selectedBatch)} icon={Printer} label="Imprimir" primary/><ActionButton onClick={() => setEmailCoupon(selected)} icon={Mail} label="Enviar por correo"/></> : null}</div></div></Modal> : null}
    {emailCoupon ? <Modal onClose={() => setEmailCoupon(null)}><form onSubmit={sendByEmail}><ModalTitle title="Enviar cupón por correo" onClose={() => setEmailCoupon(null)}/><div className="mt-5"><Field label="Correo destinatario"><input required type="email" autoFocus value={recipient} onChange={(event) => setRecipient(event.target.value)} className={inputClass} placeholder="cliente@correo.cl"/></Field></div><Actions onCancel={() => setEmailCoupon(null)} busy={sending} label="Enviar por correo"/></form></Modal> : null}
  </AppShell>;
}

function Modal({ children }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041E42]/60 p-4"><div className="mx-auto my-8 max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">{children}</div></div>; }
function ModalTitle({ title, onClose }) { return <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></div>; }
function Field({ label, children }) { return <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function BenefitValueField({ form, setForm }) {
  if (form.benefitType === "FREE_MINUTES") return <Field label="Tiempo gratis (HH:MM)"><input required type="time" min="00:01" step="60" value={form.value} onChange={(event) => setForm({...form,value:event.target.value})} className={inputClass}/></Field>;
  const percentage = form.benefitType === "PERCENTAGE";
  return <Field label={percentage ? "Porcentaje de descuento" : "Descuento fijo en pesos"}><div className="relative">{percentage ? null : <span className="pointer-events-none absolute left-3 top-2.5 font-bold text-slate-500">$</span>}<input required type="number" min="0.01" max={percentage ? "100" : undefined} step={percentage ? "0.01" : "1"} value={form.value} onChange={(event) => setForm({...form,value:event.target.value})} className={`${inputClass} ${percentage ? "pr-10" : "pl-8"}`}/>{percentage ? <span className="pointer-events-none absolute right-3 top-2.5 font-bold text-slate-500">%</span> : null}</div></Field>;
}
function Actions({ onCancel, busy, label }) { return <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={busy} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Procesando..." : label}</button></div>; }
function ActionButton({ onClick, icon: Icon, label, primary = false }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${primary ? "bg-[#3150D8] text-white" : "border border-[#BFD2FF] text-[#3150D8]"}`}><Icon className="h-4 w-4"/>{label}</button>; }
function benefitLabel(coupon) { if (coupon.benefitType === "FREE_MINUTES") return `${coupon.value} minutos gratis`; if (coupon.benefitType === "FIXED_AMOUNT") return `$${coupon.value.toLocaleString("es-CL")} de descuento`; return `${coupon.value}% de descuento`; }
function statusLabel(status) { return ({ ACTIVE: "Activo", DRAFT: "Borrador", REDEEMED: "Utilizado", EXPIRED: "Vencido", CANCELLED: "Cancelado" })[status] || status; }
function durationToMinutes(value) { const [hours, minutes] = String(value || "").split(":").map(Number); return Math.max(0, (hours || 0) * 60 + (minutes || 0)); }

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Camera, CarFront, CheckCircle2, CircleParking, Home, LoaderCircle, LogOut, Menu, Printer, QrCode, Search, UserRound, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { filteredSelectState } from "@/lib/dataEntrySelector.mjs";
import { rateDisplay, ticketHeaderData } from "@/lib/dataEntryPresentation.mjs";

const actions = [
  { key: "ENTRY", label: "Ingresar", detail: "Registrar vehículo", icon: ArrowDownToLine, color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "EXIT", label: "Salida", detail: "Calcular y pagar", icon: ArrowUpFromLine, color: "bg-rose-600 hover:bg-rose-700" },
  { key: "PARKED", label: "Vehículos", detail: "Dentro del parking", icon: CircleParking, color: "bg-[#3150D8] hover:bg-[#243FC0]" },
  { key: "QR", label: "Código QR", detail: "Leer y generar pago", icon: QrCode, color: "bg-amber-500 hover:bg-amber-600" },
];

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
const dateTime = (value) => new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
const roleLabel = (role) => role === "operator" ? "Operador" : role === "platform_admin" ? "Root" : "Administrador";
const normalizeSearchText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const matchesSearchText = (value, search) => !normalizeSearchText(search) || normalizeSearchText(value).includes(normalizeSearchText(search));

function ticketHtml({ kind, stay, parking, quote, qrImage, actor }) {
  const isEntry = kind === "ENTRY";
  const header = ticketHeaderData(parking, stay, isEntry);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${stay.code}</title><style>@page{size:80mm auto;margin:4mm}body{width:72mm;margin:0;font:12px Arial;color:#111}.center{text-align:center}.brand{font-size:22px;font-weight:800;color:#041E42}.rule{border-top:1px dashed #555;margin:10px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.plate{font-size:25px;font-weight:900;letter-spacing:2px;margin:10px}.total{font-size:18px;font-weight:900}.qr{width:35mm;height:35mm}.qr-paid{width:28mm;height:28mm}.footer{margin-top:12px;font-weight:700}</style></head><body><div class="center"><div class="brand">ParkFacil</div></div><div class="row"><span>Razón social</span><b>${header.businessName}</b></div><div class="row"><span>Dirección</span><b>${header.address}</b></div><div class="row"><span>RUT</span><b>${header.rut}</b></div><div class="row"><span>Teléfono de contacto</span><b>${header.phone}</b></div><div class="row"><span>Fecha y hora</span><b>${dateTime(header.issuedAt)}</b></div><div class="rule"></div><div class="center"><b>TICKET DE ${isEntry ? "INGRESO" : "SALIDA Y PAGO"}</b><br>${parking.name}<div class="plate">${stay.license_plate}</div></div><div class="row"><span>Código</span><b>${isEntry ? stay.code : stay.payment_code}</b></div><div class="row"><span>Fecha ingreso</span><b>${dateTime(stay.entry_at)}</b></div>${isEntry ? "" : `<div class="row"><span>Fecha salida</span><b>${dateTime(stay.exit_at)}</b></div><div class="row"><span>Tiempo</span><b>${stay.elapsed_minutes} minutos</b></div><div class="row"><span>Tarifa</span><b>${stay.rate_name}</b></div><div class="rule"></div>${stay.coupon_code ? `<div class="row"><span>Subtotal</span><b>${money(stay.subtotal_amount)}</b></div><div class="row"><span>Cupón ${stay.coupon_code}</span><b>-${money(stay.discount_amount)}</b></div>` : ""}<div class="row"><span>Neto</span><b>${money(stay.net_amount)}</b></div><div class="row"><span>IVA 19%</span><b>${money(stay.tax_amount)}</b></div><div class="row total"><span>TOTAL</span><b>${money(stay.total_amount)}</b></div>`}<div class="rule"></div><div class="row"><span>Operador</span><b>${actor.name}</b></div><div class="center">${qrImage ? `<img class="${isEntry ? "qr" : "qr-paid"}" src="${qrImage}"/><br>` : ""}${isEntry ? stay.qr_token : stay.payment_code}<p>${isEntry ? "Conserve este ticket para registrar su salida." : "Pago registrado. Gracias por su visita."}</p><p class="footer">parkfacilapp.cl</p></div></body></html>`;
}

async function printTicket(payload) {
  const qrValue = payload.kind === "ENTRY" ? payload.stay.qr_token : payload.stay.payment_code;
  const includeQr = payload.kind === "ENTRY" || payload.includeQr !== false;
  const qrImage = includeQr
    ? await QRCode.toDataURL(qrValue, { width: 320, margin: 1, color: { dark: "#041E42", light: "#FFFFFF" } })
    : null;
  const popup = window.open("", "parkfacil-ticket", "width=420,height=720");
  if (!popup) throw new Error("Permite ventanas emergentes para imprimir el ticket.");
  popup.document.write(ticketHtml({ ...payload, qrImage })); popup.document.close(); popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function pendingVehiclesHtml(list, parking, actor) {
  const rows = list.map((stay) => `<tr><td>${stay.license_plate}</td><td>${stay.code}</td><td>${dateTime(stay.entry_at)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vehículos pendientes</title><style>body{font:12px Arial;color:#111;margin:16px}h1{font-size:16px;color:#041E42}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}th{text-transform:uppercase;color:#555}</style></head><body><h1>ParkFacil Terminal · Vehículos pendientes</h1><p>${parking?.name || ""}${parking?.code ? ` · ${parking.code}` : ""} · ${dateTime(new Date().toISOString())} · ${actor?.name || ""}</p><table><thead><tr><th>Patente</th><th>Ticket</th><th>Ingreso</th></tr></thead><tbody>${rows || `<tr><td colspan="3">Sin vehículos pendientes.</td></tr>`}</tbody></table></body></html>`;
}

export default function DataEntryPage() {
  const router = useRouter();
  const [view, setView] = useState("HOME");
  const [prefix, setPrefix] = useState(""); const [suffix, setSuffix] = useState("");
  const [parking, setParking] = useState(null); const [stays, setStays] = useState([]);
  const [authorizedParkings, setAuthorizedParkings] = useState([]); const [activeParkingId, setActiveParkingId] = useState("");
  const [companyOptions, setCompanyOptions] = useState([]); const [activeCompanyId, setActiveCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [parkingSearch, setParkingSearch] = useState("");
  const [parkingSearchOpen, setParkingSearchOpen] = useState(false);
  const [selectedStayId, setSelectedStayId] = useState(""); const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [printExitQr, setPrintExitQr] = useState(true);
  const [quote, setQuote] = useState(null); const [qrToken, setQrToken] = useState(""); const [actor, setActor] = useState(null);
  const [couponToken, setCouponToken] = useState("");
  const [busy, setBusy] = useState(true); const [message, setMessage] = useState(""); const [cameraOpen, setCameraOpen] = useState(false);
  const [posMenuOpen, setPosMenuOpen] = useState(true);
  const loadSequenceRef = useRef(0);
  const operationRequestRef = useRef(false);
  const prefixRef = useRef(null); const suffixRef = useRef(null); const videoRef = useRef(null); const scannerRef = useRef(null);

  async function authFetch(url, options = {}) {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) } });
  }

  function hasActiveOperation() {
    return busy || (view === "EXIT" && Boolean(quote)) || (view === "ENTRY" && Boolean(prefix || suffix));
  }

  function resetWorkingState() {
    setView("HOME"); setStays([]); setQuote(null); setSelectedStayId(""); setCouponToken(""); setQrToken(""); setPrefix(""); setSuffix(""); setMessage(""); setParking(null);
  }

  async function load(parkingId) {
    const sequence = ++loadSequenceRef.current;
    setBusy(true);
    const query = parkingId ? `?parkingId=${encodeURIComponent(parkingId)}` : "";
    const response = await authFetch(`/api/data-entry${query}`);
    if (response.status === 401 || response.status === 403) { router.replace("/login?next=/data-entry"); return; }
    const payload = await response.json().catch(() => ({}));
    if (sequence !== loadSequenceRef.current) return;
    if (!response.ok) { setMessage(payload.error || "No fue posible cargar la operación."); setBusy(false); return; }
    setParking(payload.data.parking); setStays(payload.data.stays); setActor(payload.data.actor); setMessage(payload.data.warning || ""); setBusy(false);
    if (payload.data.parking?.id) setActiveParkingId(payload.data.parking.id);
  }

  async function bootstrap() {
    setBusy(true);
    // La autorización real vive en el servidor: esta llamada solo lista los estacionamientos
    // que el usuario ya tiene autorizados (misma lógica que usa /api/data-entry).
    const [response, companiesResponse] = await Promise.all([
      authFetch("/api/estacionamientos"),
      authFetch("/api/empresas"),
    ]);
    if (response.status === 401 || response.status === 403) { router.replace("/login?next=/data-entry"); return; }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error || "No fue posible cargar los estacionamientos autorizados."); setBusy(false); return; }

    const companiesPayload = companiesResponse.ok ? await companiesResponse.json().catch(() => ({})) : {};
    const active = (payload.data || []).filter((item) => item.status === "ACTIVE").sort((a, b) => a.code.localeCompare(b.code));
    setAuthorizedParkings(active);

    const companiesMap = new Map();
    (companiesPayload.data || []).forEach((company) => {
      if (!company?.id) return;
      companiesMap.set(company.id, { id: company.id, name: company.nombreFantasia || company.razonSocial || company.id });
    });
    active.forEach((item) => {
      if (!item.companyId || companiesMap.has(item.companyId)) return;
      companiesMap.set(item.companyId, { id: item.companyId, name: item.companyName || item.companyId });
    });
    const companyList = [...companiesMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    setCompanyOptions(companyList);

    const initialCompanyId = active[0]?.companyId || companyList[0]?.id || "";
    setActiveCompanyId(initialCompanyId);
    const initialParking = active.find((item) => item.companyId === initialCompanyId) || active[0];
    if (!initialParking?.id) { setMessage("El usuario no tiene un estacionamiento autorizado."); setBusy(false); return; }
    setActiveParkingId(initialParking.id);
    await load(initialParking.id);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void bootstrap(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { scannerRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  async function changeParking(nextId) {
    if (!nextId || nextId === activeParkingId || hasActiveOperation()) return;
    resetWorkingState();
    setActiveParkingId(nextId);
    await load(nextId);
  }

  async function changeCompany(nextCompanyId) {
    if (!nextCompanyId || nextCompanyId === activeCompanyId || hasActiveOperation()) return;
    setActiveCompanyId(nextCompanyId);
    const nextParking = authorizedParkings.find((item) => item.companyId === nextCompanyId) || null;
    if (!nextParking?.id) {
      // Invalida cualquier carga previa para que no repinte un parking antiguo.
      loadSequenceRef.current += 1;
      resetWorkingState();
      setActiveParkingId("");
      setBusy(false);
      const selectedCompany = companyOptions.find((item) => item.id === nextCompanyId);
      setMessage(`La empresa ${selectedCompany?.name || "seleccionada"} no tiene estacionamientos activos habilitados para Data Entry.`);
      return;
    }
    await changeParking(nextParking.id);
  }

  const hasCompanyOptions = companyOptions.length > 0;
  const canChooseCompany = companyOptions.length > 1;
  const filteredCompanyOptions = canChooseCompany
    ? companyOptions.filter((item) => {
      return matchesSearchText(item.name, companySearch);
    })
    : companyOptions;
  const companySelectState = filteredSelectState(activeCompanyId, filteredCompanyOptions);
  const visibleParkings = canChooseCompany && activeCompanyId
    ? authorizedParkings.filter((item) => item.companyId === activeCompanyId)
    : authorizedParkings;
  const canChooseParking = visibleParkings.length > 1;
  const filteredParkingOptions = canChooseParking
    ? visibleParkings.filter((item) => {
      const label = `${item.companyName || ""} ${item.name || ""} ${item.code || ""}`;
      return matchesSearchText(label, parkingSearch);
    })
    : visibleParkings;
  const parkingSelectState = filteredSelectState(activeParkingId, filteredParkingOptions);

  function renderSearchableSelector({
    title,
    buttonLabel,
    open,
    setOpen,
    search,
    setSearch,
    canSearch,
    disabled,
    value,
    showSelectionPrompt,
    onChange,
    options,
    emptyLabel,
    optionLabel,
    inputPlaceholder,
    selectTitle,
  }) {
    return <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[.14em] text-[#CFD8DC]">{title}</p>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-[.08em] text-white hover:bg-white/20"
        >
          <Search className="h-3.5 w-3.5" />
          {buttonLabel}
        </button>
      </div>
      {open ? <>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={inputPlaceholder}
          disabled={disabled || !canSearch}
          autoFocus
          className="mt-1 w-full rounded-lg border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-bold text-white placeholder:text-white/70 outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || !canSearch}
          title={selectTitle}
          className="mt-1 w-full truncate rounded-lg border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showSelectionPrompt ? <option value="" disabled className="text-[#263238]">Seleccione un resultado</option> : null}
          {!options.length ? <option value="" className="text-[#263238]">{emptyLabel}</option> : null}
          {options.map((item) => <option key={item.id} value={item.id} className="text-[#263238]">{optionLabel(item)}</option>)}
        </select>
      </> : null}
    </>;
  }

  function selectView(key) { setView(key); setMessage(""); setQuote(null); if (key === "ENTRY") window.setTimeout(() => prefixRef.current?.focus(), 50); }
  async function post(body) {
    if (operationRequestRef.current) return null;
    operationRequestRef.current = true;
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await authFetch("/api/data-entry", { method: "POST", signal: controller.signal, body: JSON.stringify({ parkingId: activeParkingId, ...body }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(payload.error || "No fue posible completar la operación."); return null; }
      return payload.data;
    } catch (error) {
      setMessage(error?.name === "AbortError" ? "La operación tardó demasiado. Intenta nuevamente." : "No fue posible conectar con el servicio de operación.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      operationRequestRef.current = false;
      setBusy(false);
    }
  }

  async function registerEntry(event) {
    event.preventDefault(); const data = await post({ action: "ENTRY", platePrefix: prefix, plateSuffix: suffix, source: "WEB" }); if (!data) return;
    setMessage(`Ingreso guardado: ${data.stay.license_plate}`); await printTicket({ kind: "ENTRY", ...data, actor }); setPrefix(""); setSuffix(""); await load(activeParkingId);
  }
  async function calculateExit(identifier = {}) { const data = await post({ action: "QUOTE", ...identifier }); if (data) { if (!quote || quote.stay.id !== data.stay.id) setPrintExitQr(true); setQuote(data); setSelectedStayId(data.stay.id); if (identifier.couponToken) setCouponToken(identifier.couponToken); setView("EXIT"); } }
  async function finishExit() { if (!quote) return; const data = await post({ action: "EXIT", stayId: quote.stay.id, paymentMethod, couponToken: couponToken || undefined }); if (!data) return; setQuote(data); setCouponToken(""); setMessage(`Pago registrado: ${data.stay.payment_code}`); await printTicket({ kind: "EXIT", ...data, actor, includeQr: printExitQr }); await load(activeParkingId); }
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
  function printPendingVehicles() {
    const popup = window.open("", "parkfacil-pendientes", "width=480,height=720");
    if (!popup) { setMessage("Permite ventanas emergentes para imprimir el listado."); return; }
    popup.document.write(pendingVehiclesHtml(stays, parking, actor)); popup.document.close(); popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }
  async function logout() { await getSupabaseBrowserClient().auth.signOut(); router.replace("/login"); }
  return <div className="min-h-screen bg-[#ECEFF1] text-[#263238]">
    <aside className={`${posMenuOpen ? "w-64" : "w-20"} fixed inset-y-0 left-0 z-30 flex flex-col bg-[#455A64] p-3 text-white shadow-2xl transition-all`}>
      <div className="flex min-h-14 items-center gap-3 border-b border-white/20 px-1 pb-3"><button type="button" onClick={() => setPosMenuOpen((current) => !current)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 hover:bg-white/25"><Menu className="h-6 w-6" /></button>{posMenuOpen ? <div className="min-w-0"><p className="font-black">ParkFacil Terminal</p></div> : null}</div>
      {posMenuOpen ? <div className="mt-2 rounded-xl bg-white/10 p-2.5">
        {renderSearchableSelector({
          title: "Empresa activa",
          buttonLabel: "Buscar",
          open: companySearchOpen,
          setOpen: setCompanySearchOpen,
          search: companySearch,
          setSearch: setCompanySearch,
          canSearch: canChooseCompany,
          disabled: hasActiveOperation(),
          value: companySelectState.value,
          showSelectionPrompt: companySelectState.showSelectionPrompt,
          onChange: changeCompany,
          options: filteredCompanyOptions,
          emptyLabel: "Sin resultados",
          optionLabel: (item) => item.name,
          inputPlaceholder: "Buscar empresa",
          selectTitle: hasActiveOperation() ? "Termina la operación en curso para cambiar de empresa" : "Cambiar empresa activa",
        })}
        <div className="mt-2">
          {renderSearchableSelector({
            title: "Estacionamiento activo",
            buttonLabel: "Buscar",
            open: parkingSearchOpen,
            setOpen: setParkingSearchOpen,
            search: parkingSearch,
            setSearch: setParkingSearch,
            canSearch: canChooseParking,
            disabled: hasActiveOperation(),
            value: parkingSelectState.value,
            showSelectionPrompt: parkingSelectState.showSelectionPrompt,
            onChange: changeParking,
            options: filteredParkingOptions,
            emptyLabel: "Sin resultados",
            optionLabel: (item) => `${item.companyName ? `${item.companyName} · ` : ""}${item.name}${item.code ? ` (${item.code})` : ""}`,
            inputPlaceholder: "Buscar estacionamiento",
            selectTitle: hasActiveOperation() ? "Termina la operación en curso para cambiar de estacionamiento" : "Cambiar estacionamiento activo",
          })}
        </div>
        <div className="mt-2 border-t border-white/15 pt-2"><p className="truncate text-[11px] font-bold">{actor?.name}</p><p className="text-[10px] text-[#CFD8DC]">{roleLabel(actor?.role)}</p></div>
      </div> : null}
      <nav className="mt-3 flex-1 space-y-1.5">
        <button type="button" onClick={() => selectView("HOME")} title="Inicio" className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition ${view === "HOME" ? "bg-white text-[#455A64]" : "bg-white/10 hover:bg-white/20"}`}><Home className="h-4.5 w-4.5 shrink-0" />{posMenuOpen ? "Inicio" : null}</button>
      </nav>
      <button type="button" onClick={logout} title="Cerrar sesión" className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20"><LogOut className="h-4.5 w-4.5 shrink-0" />{posMenuOpen ? "Cerrar sesión" : null}</button>
    </aside>
    <main className={`min-h-screen bg-[#ECEFF1] transition-all ${posMenuOpen ? "ml-64" : "ml-20"}`}>
    <header className="flex min-h-16 items-center justify-between border-b border-[#CFD8DC] bg-[#F8F9FA] px-4 shadow-sm sm:px-5"><div className="flex items-center gap-3"><button type="button" onClick={() => router.push("/")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#CFD8DC] bg-[#ECEFF1] px-3 text-xs font-bold text-[#455A64] transition hover:bg-[#CFD8DC]" title="Volver"><ArrowLeft className="h-4 w-4" />Volver</button><div><p className="text-xl font-black text-[#263238]">Park<span className="text-[#455A64]">Facil</span> Terminal</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#78909C]">Inicio de operación</p></div></div><div className="flex items-center gap-2"><div className="hidden text-right sm:block"><p className="text-xs font-bold">{actor?.name || "Cargando..."}</p><p className="text-[10px] text-[#455A64]">{roleLabel(actor?.role)}</p></div><button onClick={logout} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-rose-600" title="Cerrar sesión"><LogOut className="h-4 w-4" /></button></div></header>
    <div className="mx-auto max-w-6xl p-3 sm:p-4">
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{actions.map((action) => { const Icon = action.icon; return <button key={action.key} onClick={() => selectView(action.key)} className={`${action.color} min-h-20 rounded-2xl p-3 text-left text-white shadow-md transition active:scale-[.98] sm:min-h-24 sm:p-4`}><Icon className="h-6 w-6 sm:h-7 sm:w-7"/><span className="mt-1.5 block text-base font-black sm:text-lg">{action.label}</span><span className="block truncate text-[10px] text-white/80 sm:text-xs">{action.detail}</span></button>; })}</section>
      <section className="mt-3 rounded-3xl border border-[#CFD8DC] bg-[#F8F9FA] p-4 shadow-lg sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#455A64]">{parking?.company_name || "ParkFacil"}</p><h1 className="mt-0.5 text-xl font-black text-[#263238]">{view === "HOME" ? (parking?.name || "Estacionamiento en operación") : actions.find((item) => item.key === view)?.label}</h1><p className="text-xs font-bold text-[#78909C]">{view === "HOME" ? `Parking en operación${parking?.code ? ` · ${parking.code}` : ""}` : (parking?.name || "Estacionamiento asignado")}</p></div>{view === "PARKED" ? <div className="flex items-center gap-2"><button onClick={() => selectView("HOME")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ECEFF1] px-3 text-xs font-bold text-[#263238]"><ArrowLeft className="h-4 w-4" />Volver</button><button onClick={printPendingVehicles} title="Imprimir listado de vehículos pendientes" className="grid h-9 w-9 place-items-center rounded-lg border border-[#CFD8DC] bg-white text-[#455A64]"><Printer className="h-4 w-4" /></button></div> : view !== "HOME" ? <button onClick={() => selectView("HOME")} className="grid h-9 w-9 place-items-center rounded-lg bg-[#ECEFF1] text-[#263238]"><X className="h-4 w-4" /></button> : null}</div>
        {view === "HOME" ? <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <HomeStat icon={CarFront} label="Estacionamiento" value={parking?.name || "Cargando..."} />
            <HomeStat icon={UserRound} label="Operador" value={actor?.name || "Cargando..."} sub={actor ? roleLabel(actor.role) : ""} />
            <HomeStat icon={CheckCircle2} label="Estado" value={parking && !busy ? "Operativo" : "Cargando..."} tone={parking && !busy ? "ok" : "muted"} />
            <HomeStat icon={CircleParking} label="Vehículos dentro" value={String(stays.length)} />
          </div>
          <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-[#CFD8DC] p-6 text-center"><div><p className="text-base font-black text-[#263238]">Seleccione una de las cuatro acciones</p><p className="mt-1 text-xs text-[#607D8B]">Toda la operación se realiza desde este panel.</p></div></div>
        </div> : null}
        {view === "ENTRY" ? <form onSubmit={registerEntry} className="mx-auto max-w-2xl space-y-6"><div className="rounded-2xl border border-[#CFD8DC] bg-[#ECEFF1] p-4"><p className="text-xs font-black uppercase tracking-wide text-[#455A64]">Estacionamiento asignado</p><p className="mt-1 text-lg font-black text-[#263238]">{parking?.name || "Cargando asignación..."}</p></div><fieldset><legend className="text-sm font-black text-[#263238]">PATENTE</legend><div className="mt-2 flex items-center justify-center gap-3"><input ref={prefixRef} required maxLength={4} value={prefix} onChange={(event) => { const value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");setPrefix(value);if(value.length===4)suffixRef.current?.focus(); }} placeholder="CXPY" className="min-h-24 w-48 min-w-0 rounded-3xl border-2 border-slate-200 bg-slate-50 text-center text-4xl font-black uppercase tracking-[.15em] text-[#263238] outline-none focus:border-[#455A64]"/><span className="text-4xl font-black text-[#263238]">-</span><input ref={suffixRef} required maxLength={2} value={suffix} onChange={(event) => setSuffix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="93" className="min-h-24 w-28 min-w-0 rounded-3xl border-2 border-slate-200 bg-slate-50 text-center text-4xl font-black uppercase tracking-[.15em] text-[#263238] outline-none focus:border-[#455A64]"/></div></fieldset><button disabled={busy || !parking} className="flex min-h-18 w-full items-center justify-center gap-3 rounded-3xl bg-emerald-600 text-xl font-black text-white shadow-lg disabled:opacity-50">{busy?<LoaderCircle className="h-6 w-6 animate-spin"/>:<Printer className="h-6 w-6"/>}GUARDAR E IMPRIMIR INGRESO</button></form> : null}
        {view === "EXIT" ? <div className="mx-auto max-w-3xl space-y-5"><label className="block text-sm font-black text-[#263238]">VEHÍCULO EN EL PARKING<select value={selectedStayId} onChange={(event) => { setSelectedStayId(event.target.value); setQuote(null); if(event.target.value)void calculateExit({stayId:event.target.value}); }} className="mt-2 min-h-16 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg font-bold text-[#263238] outline-none"><option value="">Seleccione una patente</option>{stays.map((stay)=><option key={stay.id} value={stay.id}>{stay.license_plate} · ingreso {dateTime(stay.entry_at)}</option>)}</select></label>{quote?<PaymentSummary data={quote} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} printQr={printExitQr} setPrintQr={setPrintExitQr} onPay={finishExit} busy={busy}/>:<p className="rounded-2xl bg-white p-6 text-center text-[#607D8B]">Seleccione un vehículo o utilice el botón Código QR.</p>}</div> : null}
        {view === "PARKED" ? <div className="overflow-hidden rounded-2xl border border-[#CFD8DC]"><div className="grid grid-cols-[1fr_1.2fr_.8fr] bg-[#263238] px-4 py-3 text-xs font-black uppercase text-white"><span>Patente</span><span>Ingreso</span><span>Operador</span></div>{stays.length?stays.map((stay)=><button key={stay.id} onClick={()=>{setSelectedStayId(stay.id);void calculateExit({stayId:stay.id});}} className="grid w-full grid-cols-[1fr_1.2fr_.8fr] border-t border-[#ECEFF1] px-4 py-4 text-left text-[#263238] hover:bg-[#ECEFF1]"><b>{stay.license_plate}</b><span className="text-sm">{dateTime(stay.entry_at)}</span><span className="truncate text-sm">{stay.entry_operator_name}</span></button>):<p className="p-8 text-center text-[#607D8B]">No hay vehículos dentro del parking.</p>}</div> : null}
        {view === "QR" ? <div className="mx-auto max-w-2xl space-y-5"><p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Para aplicar un cupón, selecciona primero el vehículo en Salida y luego lee su QR.</p><button onClick={startScanner} className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-amber-500 text-xl font-black text-[#263238]"><Camera className="h-7 w-7"/>LEER QR CON CÁMARA</button>{cameraOpen?<div className="relative overflow-hidden rounded-3xl bg-black"><video ref={videoRef} className="aspect-video w-full object-cover"/><button onClick={stopScanner} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white"><X className="h-5 w-5"/></button></div>:null}<div className="flex gap-2"><input value={qrToken} onChange={(event)=>setQrToken(event.target.value.trim())} placeholder="Código QR manual" className="min-h-14 min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 font-mono text-[#263238] outline-none focus:border-[#455A64]"/><button onClick={()=>processQr(qrToken)} className="rounded-2xl bg-[#455A64] px-5 font-black text-white">LEER QR</button></div></div> : null}
        {message?<div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-bold ${message.includes("guardado")||message.includes("registrado")?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700"}`}><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</div>:null}
      </section>
    </div>
    </main>
  </div>;
}

function PaymentSummary({ data, paymentMethod, setPaymentMethod, printQr, setPrintQr, onPay, busy }) {
  // Sin tarifa válida: la operación queda bloqueada, pero el vehículo/ticket/permanencia
  // siguen visibles para el operador. No se ofrece cobro ni botón de pago en este estado.
  if (data.quote.blocked) {
    return <div className="rounded-3xl border-2 border-[#CFD8DC] bg-[#ECEFF1] p-5 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Patente" value={data.stay.license_plate}/>
        <Info label="Ticket" value={data.stay.code}/>
        <Info label="Fecha ingreso" value={dateTime(data.stay.entry_at)}/>
        <Info label="Permanencia" value={`${data.quote.elapsedMinutes} minutos`}/>
        <Info label="Estado" value={data.stay.status}/>
      </div>
      <div className="mt-4 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-800">
        <p className="text-lg font-black uppercase tracking-wide">Operación bloqueada</p>
        <p className="mt-1 text-sm font-semibold">No existe una tarifa activa.<br/>No es posible calcular el cobro.<br/>Contacte al administrador.</p>
      </div>
    </div>;
  }
  return <div className="rounded-3xl border-2 border-[#CFD8DC] bg-[#ECEFF1] p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><Info label="Patente" value={data.stay.license_plate}/><Info label="Fecha ingreso" value={dateTime(data.stay.entry_at)}/><Info label="Minutos consumidos" value={data.quote.elapsedMinutes}/><Info label="Tarifa" value={rateDisplay(data.quote.rate, money)}/><Info label="Subtotal" value={money(data.quote.subtotal)}/><Info label="Descuento" value={`-${money(data.quote.discount)}`}/><Info label="Neto" value={money(data.quote.net)}/><Info label="IVA 19%" value={money(data.quote.tax)}/></div>{data.quote.coupon ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>Cupón aplicado: {data.quote.coupon.code}</strong><span className="ml-2">{data.quote.coupon.name}</span><p className="mt-1 text-xs">Se marcará como utilizado al confirmar el pago.</p></div> : null}<div className="mt-4 flex items-center justify-between rounded-2xl bg-[#263238] p-5 text-white"><span className="font-bold">TOTAL A PAGAR</span><b className="text-3xl">{money(data.quote.total)}</b></div><fieldset className="mt-5"><legend className="text-sm font-black text-[#263238]">FORMA DE PAGO</legend><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={()=>setPaymentMethod("CASH")} className={`min-h-14 rounded-2xl border-2 font-black ${paymentMethod==="CASH"?"border-[#455A64] bg-white text-[#455A64]":"border-slate-200 bg-transparent text-slate-500"}`}>CONTADO</button><button type="button" onClick={()=>setPaymentMethod("CARD")} className={`min-h-14 rounded-2xl border-2 font-black ${paymentMethod==="CARD"?"border-[#455A64] bg-white text-[#455A64]":"border-slate-200 bg-transparent text-slate-500"}`}>TARJETA</button></div></fieldset><fieldset className="mt-5 rounded-2xl border-2 border-transparent p-3"><legend className="px-1 text-sm font-black text-[#263238]">¿IMPRIMIR QR EN EL TICKET?</legend><div className="mt-1 grid grid-cols-2 gap-3"><button type="button" onClick={()=>setPrintQr(true)} aria-pressed={printQr === true} className={`min-h-12 rounded-2xl border-2 font-black ${printQr === true?"border-[#455A64] bg-white text-[#455A64]":"border-slate-200 bg-transparent text-slate-500"}`}>SÍ</button><button type="button" onClick={()=>setPrintQr(false)} aria-pressed={printQr === false} className={`min-h-12 rounded-2xl border-2 font-black ${printQr === false?"border-[#455A64] bg-white text-[#455A64]":"border-slate-200 bg-transparent text-slate-500"}`}>NO</button></div></fieldset><button type="button" onClick={onPay} disabled={busy} className="mt-5 flex min-h-18 w-full items-center justify-center gap-3 rounded-3xl bg-emerald-600 text-xl font-black text-white shadow-lg disabled:opacity-50">{busy?<LoaderCircle className="h-6 w-6 animate-spin"/>:<Printer className="h-6 w-6"/>}PAGAR E IMPRIMIR SALIDA</button></div>;
}
function Info({ label, value }) { return <div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#78909C]">{label}</p><p className="mt-1 text-lg font-black text-[#263238]">{value}</p></div>; }
function HomeStat({ icon: Icon, label, value, sub, tone = "neutral" }) {
  const toneClass = tone === "ok" ? "text-emerald-600" : tone === "muted" ? "text-[#78909C]" : "text-[#455A64]";
  return <div className="rounded-2xl border border-[#CFD8DC] bg-white p-3.5"><div className="flex items-center gap-2"><Icon className={`h-4.5 w-4.5 shrink-0 ${toneClass}`} /><p className="text-[10px] font-black uppercase tracking-wide text-[#78909C]">{label}</p></div><p className="mt-1.5 truncate text-sm font-black text-[#263238]">{value}</p>{sub ? <p className="text-[10px] font-bold text-[#90A4AE]">{sub}</p> : null}</div>;
}

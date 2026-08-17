"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Menu, RefreshCw, X } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { toOperationalDateTimeParts } from "@/lib/dataEntry.mjs";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";

const POS_VIEWS = {
  HOME: "HOME",
  INGRESO: "INGRESO",
  SALIDA: "SALIDA",
  VEHICULOS: "VEHICULOS",
  VEHICULO_DETALLE: "VEHICULO_DETALLE",
  QR: "QR",
  BUSCAR: "BUSCAR",
  IMPRIMIR_LISTADO: "IMPRIMIR_LISTADO",
  CIERRE_CAJA: "CIERRE_CAJA",
  ESTADO_DISPOSITIVO: "ESTADO_DISPOSITIVO",
  PAGOS_DEL_DIA: "PAGOS_DEL_DIA",
};

const POS_PLATE_REGEX = /^[A-Z0-9]{4}-[0-9]{2}$/;

function formatPosPlateInput(value) {
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const prefix = compact.slice(0, 4);
  const suffix = compact.slice(4).replace(/[^0-9]/g, "").slice(0, 2);
  if (!prefix) return "";
  if (prefix.length < 4) return prefix;
  return suffix ? `${prefix}-${suffix}` : `${prefix}-`;
}

function toBackendPlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizePlateInput(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function formatEntryDate(value) {
  const parts = toOperationalDateTimeParts(value);
  if (!parts) return { date: "-", time: "-" };
  return {
    date: parts.entryDate,
    time: parts.entryTime,
  };
}

function formatBridgeEntryDateTime(value) {
  return toOperationalDateTimeParts(value);
}

function formatTicketPlate(value) {
  const normalized = normalizePlateInput(value);
  if (normalized.length === 6) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  }
  return String(value ?? "").toUpperCase();
}

function buildEntryPrintPayload(stay, parkingResponse) {
  if (!stay || !parkingResponse) return null;
  const normalizedDateTime = formatBridgeEntryDateTime(stay.entry_at);
  if (!normalizedDateTime) return null;

  const payload = {
    type: "ENTRY",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    parkingName: String(parkingResponse?.name || "").trim(),
    operator: String(stay?.entry_operator_name || "").trim(),
    plate: formatTicketPlate(stay?.license_plate),
    entryDate: normalizedDateTime.entryDate,
    entryTime: normalizedDateTime.entryTime,
    ticketNumber: String(stay?.code || "").trim(),
    qrValue: String(stay?.qr_token || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.operator || !payload.ticketNumber || !payload.qrValue) {
    return null;
  }

  return payload;
}

// Arma el payload del recibo de pago EFECTIVO usando exclusivamente los datos
// que el backend devolvió tras confirmar el pago (stay/quote/parking del
// EXIT) — nunca el monto u otros valores que haya tenido el frontend antes
// de esa respuesta.
function buildPaymentReceiptPayload(stay, quote, parkingResponse) {
  if (!stay || !quote || !parkingResponse) return null;
  const entryDateTime = formatBridgeEntryDateTime(stay.entry_at);
  const exitDateTime = formatBridgeEntryDateTime(stay.exit_at);
  if (!entryDateTime || !exitDateTime) return null;

  const payload = {
    type: "PAYMENT_RECEIPT",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    parkingName: String(parkingResponse?.name || "").trim(),
    plate: formatTicketPlate(stay?.license_plate),
    ticketNumber: String(stay?.code || "").trim(),
    entryDate: entryDateTime.entryDate,
    entryTime: entryDateTime.entryTime,
    exitDate: exitDateTime.entryDate,
    exitTime: exitDateTime.entryTime,
    minutes: Number.isFinite(Number(quote?.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
    rateDescription: String(quote?.rate?.name || stay?.rate_name || "").trim(),
    amount: Number(quote?.total ?? stay?.total_amount ?? 0),
    paymentMethod: "CASH",
    paymentId: String(stay?.payment_code || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.ticketNumber || !payload.paymentId) {
    return null;
  }

  return payload;
}

function getNativePrinterBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window?.ParkFacilDevice;
  if (!bridge || typeof bridge.print !== "function") return null;
  return bridge;
}

async function executeNativePrint(payload) {
  const bridge = getNativePrinterBridge();
  if (!bridge || !payload) return { attempted: false, ok: false };

  try {
    const raw = await bridge.print(JSON.stringify(payload));
    let response = raw;
    if (typeof raw === "string") {
      try {
        response = JSON.parse(raw);
      } catch {
        return {
          attempted: true,
          ok: false,
          code: "INVALID_BRIDGE_RESPONSE",
          message: `Respuesta no JSON: ${raw}`,
        };
      }
    }

    return {
      attempted: true,
      ok: Boolean(response?.ok),
      code: response?.code ? String(response.code) : "",
      message: response?.message ? String(response.message) : "",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      code: "PRINT_EXCEPTION",
      message: error instanceof Error ? error.message : String(error ?? "Error desconocido"),
    };
  }
}

async function getSessionContext() {
  const response = await fetch("/api/auth/session", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, payload: {} };
  const payload = await response.json().catch(() => ({}));
  return { ok: true, status: response.status, payload };
}

async function getPosVehicleSummary() {
  const response = await fetch("/api/pos/stays", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function getPosVehicleQuote(stayId) {
  const response = await fetch(`/api/pos/stays/${encodeURIComponent(stayId)}/quote`, {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function getPosPaymentsToday() {
  const response = await fetch("/api/pos/payments", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value));
}

function formatQuoteAmount(quote) {
  if (!quote || quote.blocked) return "—";
  return formatCurrency(quote.total);
}

function formatMinuteCount(quote) {
  if (!quote || !Number.isFinite(Number(quote.elapsedMinutes))) return "—";
  return String(Number(quote.elapsedMinutes));
}

function formatPaymentMethodLabel(method) {
  if (method === "CASH") return "EFECTIVO";
  if (method === "CARD") return "TARJETA";
  return method || "-";
}

export default function PosTerminal() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState(POS_VIEWS.HOME);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [parking, setParking] = useState(null);
  const [vehiclesInside, setVehiclesInside] = useState(0);
  const [activeStays, setActiveStays] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedVehicleLoading, setSelectedVehicleLoading] = useState(false);
  const [selectedVehicleError, setSelectedVehicleError] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState("MENU");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPlate, setEntryPlate] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entrySuccess, setEntrySuccess] = useState(null);
  const [entryPrintPayload, setEntryPrintPayload] = useState(null);
  const [entryPrintBusy, setEntryPrintBusy] = useState(false);
  const [entryPrintStatus, setEntryPrintStatus] = useState("");
  const [nativePrintAvailable, setNativePrintAvailable] = useState(false);
  const [receiptPrintPayload, setReceiptPrintPayload] = useState(null);
  const [receiptPrintBusy, setReceiptPrintBusy] = useState(false);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState("");
  const [paymentsToday, setPaymentsToday] = useState([]);
  const [paymentsTodayTotals, setPaymentsTodayTotals] = useState(null);
  const [paymentsTodayLoading, setPaymentsTodayLoading] = useState(false);
  const [paymentsTodayError, setPaymentsTodayError] = useState("");

  const loadTerminalState = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const session = await getSessionContext();
      if (!session.ok) {
        if (session.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        setError("No fue posible validar la sesión del terminal.");
        return;
      }

      const summary = await getPosVehicleSummary();
      if (!summary.ok) {
        if (summary.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        if (summary.status === 403) {
          setError(summary.payload?.error || "Tu cuenta no tiene permisos operativos POS.");
          return;
        }
        setError(summary.payload?.error || "No fue posible cargar el estacionamiento asignado.");
        return;
      }

  const stays = Array.isArray(summary.payload?.data?.stays) ? summary.payload.data.stays : [];
      setContext(session.payload?.data || null);
      setParking(summary.payload?.data?.parking || null);
      setVehiclesInside(stays.length);
      setActiveStays(stays);
    } catch {
      setError("Error de red al cargar el terminal POS.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  const loadPaymentsToday = useCallback(async () => {
    setPaymentsTodayLoading(true);
    setPaymentsTodayError("");

    try {
      const result = await getPosPaymentsToday();
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        setPaymentsTodayError(result.payload?.error || "No fue posible cargar los pagos del día.");
        return;
      }

      setPaymentsToday(Array.isArray(result.payload?.data?.payments) ? result.payload.data.payments : []);
      setPaymentsTodayTotals(result.payload?.data?.totals || null);
    } catch {
      setPaymentsTodayError("Error de red al cargar los pagos del día.");
    } finally {
      setPaymentsTodayLoading(false);
    }
  }, [router]);

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    router.replace("/pos/login");
  }

  function openSidebar() {
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function goToSection(section) {
    setCurrentView(section);
    setSidebarOpen(false);

    if (section !== POS_VIEWS.VEHICULO_DETALLE) {
      setSelectedVehicle(null);
      setSelectedVehicleLoading(false);
      setSelectedVehicleError("");
      setPaymentModalOpen(false);
      setPaymentStep("MENU");
      setPaymentSubmitting(false);
      setPaymentMessage("");
      setPaymentResult(null);
    }

    if (section !== POS_VIEWS.INGRESO) {
      setEntryOpen(false);
      setEntryError("");
      setEntrySuccess(null);
      setEntryPrintStatus("");
    }

    if (section === POS_VIEWS.PAGOS_DEL_DIA) {
      void loadPaymentsToday();
    }
  }

  function openEntryForm() {
    setCurrentView(POS_VIEWS.INGRESO);
    setEntrySuccess(null);
    setEntryPrintPayload(null);
    setEntryPrintStatus("");
    setEntryError("");
    setEntryPlate("");
    setEntryOpen(true);
    setSidebarOpen(false);
  }

  function closeEntryForm() {
    setEntryOpen(false);
    setEntryError("");
    setEntrySuccess(null);
    setEntryPrintStatus("");
    setCurrentView(POS_VIEWS.HOME);
  }

  async function openVehicleDetail(stay) {
    if (!stay?.id) return;
    setCurrentView(POS_VIEWS.VEHICULO_DETALLE);
    setSidebarOpen(false);
    setSelectedVehicleLoading(true);
    setSelectedVehicleError("");
    setPaymentModalOpen(false);
    setPaymentStep("MENU");
    setPaymentSubmitting(false);
    setPaymentMessage("");
    setPaymentResult(null);
    setSelectedVehicle({ stay, quote: stay.quote || null, parking: parking || null, serverNow: stay.serverNow || null });

    try {
      const response = await getPosVehicleQuote(stay.id);
      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        setSelectedVehicleError(response.payload?.error || "No fue posible actualizar la cotización del vehículo.");
        return;
      }

      const detail = response.payload?.data || null;
      setSelectedVehicle(detail);
    } catch {
      setSelectedVehicleError("Error de red al cotizar el vehículo.");
    } finally {
      setSelectedVehicleLoading(false);
    }
  }

  function openPaymentModal() {
    setPaymentModalOpen(true);
    setPaymentStep("MENU");
    setPaymentMessage("");
    setPaymentResult(null);
  }

  function closePaymentModal() {
    setPaymentModalOpen(false);
    setPaymentStep("MENU");
    setPaymentSubmitting(false);
    setPaymentMessage("");
    setPaymentResult(null);
    setReceiptPrintPayload(null);
    setReceiptPrintStatus("");
  }

  async function confirmCashPayment() {
    if (!selectedVehicle?.stay?.id || paymentSubmitting) return;

    setPaymentSubmitting(true);
    setPaymentMessage("");

    try {
      const refreshedQuote = await getPosVehicleQuote(selectedVehicle.stay.id);
      if (!refreshedQuote.ok) {
        setPaymentMessage(refreshedQuote.payload?.error || "No fue posible recalcular la cotización del vehículo.");
        return;
      }

      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkfacil-portal": "terminal",
        },
        cache: "no-store",
        body: JSON.stringify({ action: "EXIT", stayId: selectedVehicle.stay.id, paymentMethod: "CASH" }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPaymentMessage(payload?.error || "No fue posible registrar el pago en efectivo.");
        return;
      }

      // A partir de aquí el pago YA quedó registrado y la permanencia YA
      // quedó cerrada en el backend (respuesta 2xx de /api/data-entry). Lo
      // que sigue —armar el recibo e intentar imprimirlo— es un efecto
      // secundario: si la impresión falla, el pago no se revierte ni se
      // vuelve a cobrar.
      const stay = payload?.data?.stay || null;
      const quote = payload?.data?.quote || null;
      const parkingResponse = payload?.data?.parking || parking;
      const amount = Number(quote?.total || 0);
      setPaymentResult({
        plate: stay?.license_plate || selectedVehicle.stay.license_plate,
        total: amount,
        paymentMethod: payload?.data?.stay?.payment_method || "CASH",
      });
      await loadTerminalState(true);

      const receiptPayload = buildPaymentReceiptPayload(stay, quote, parkingResponse);
      setReceiptPrintPayload(receiptPayload);
      setReceiptPrintStatus("");

      const printResult = receiptPayload ? await printLastReceipt(receiptPayload) : null;
      // Igual que en INGRESO: solo se bloquea el retorno a HOME cuando existe
      // bridge nativo y la impresión se intentó pero falló (regla 6). Sin
      // bridge (PC/navegador) o con impresión exitosa, el pago ya es un
      // flujo de negocio completo.
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (!printFailedOnDevice) {
        closePaymentModal();
        setSelectedVehicle(null);
        setCurrentView(POS_VIEWS.HOME);
      }
    } catch {
      setPaymentMessage("Error de red al registrar el pago en efectivo.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  function handlePaymentSelection(method) {
    if (method === "CASH") {
      setPaymentStep("CASH_CONFIRM");
      setPaymentMessage("");
      return;
    }

    if (method === "CARD") {
      setPaymentStep("CARD_NOTICE");
      setPaymentMessage("Pago con tarjeta pendiente de integración TUU.");
    }
  }

  async function printLastEntryTicket(payload) {
    const printPayload = payload || entryPrintPayload;
    if (!printPayload) {
      setEntryPrintStatus("No hay un ticket disponible para reimpresión.");
      return { attempted: false, ok: false, code: "NO_TICKET", message: "No hay ticket disponible." };
    }

    const bridge = getNativePrinterBridge();
    if (!bridge) {
      setEntryPrintStatus("Impresión disponible solo desde el dispositivo POS.");
      return { attempted: false, ok: false, code: "BRIDGE_UNAVAILABLE", message: "Bridge no disponible." };
    }

    setEntryPrintBusy(true);
    setEntryPrintStatus("Imprimiendo...");

    try {
      const result = await executeNativePrint(printPayload);

      if (result.ok) {
        setEntryPrintStatus("Ticket impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setEntryPrintStatus([
          "Entrada registrada. No fue posible imprimir el ticket.",
          ...details,
        ].join("\n"));
      }

      return result;
    } finally {
      setEntryPrintBusy(false);
    }
  }

  // Impresión del recibo de pago EFECTIVO. Es un efecto secundario del pago,
  // ya registrado y cerrado en el backend antes de llegar aquí: si esta
  // llamada falla, no se reintenta el cobro ni se vuelve a cerrar la
  // permanencia — solo se reutiliza el mismo receiptPrintPayload.
  async function printLastReceipt(payload) {
    const printPayload = payload || receiptPrintPayload;
    if (!printPayload) {
      setReceiptPrintStatus("No hay un recibo disponible para reimpresión.");
      return { attempted: false, ok: false, code: "NO_RECEIPT", message: "No hay recibo disponible." };
    }

    const bridge = getNativePrinterBridge();
    if (!bridge) {
      setReceiptPrintStatus("Impresión disponible solo desde el dispositivo POS.");
      return { attempted: false, ok: false, code: "BRIDGE_UNAVAILABLE", message: "Bridge no disponible." };
    }

    setReceiptPrintBusy(true);
    setReceiptPrintStatus("Imprimiendo...");

    try {
      const result = await executeNativePrint(printPayload);

      if (result.ok) {
        setReceiptPrintStatus("Recibo impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setReceiptPrintStatus([
          "Pago registrado. No fue posible imprimir el recibo.",
          ...details,
        ].join("\n"));
      }

      return result;
    } finally {
      setReceiptPrintBusy(false);
    }
  }

  async function submitEntry(event) {
    event.preventDefault();
    const formattedPlate = formatPosPlateInput(entryPlate);
    if (!POS_PLATE_REGEX.test(formattedPlate)) {
      setEntryError("Ingresa una patente válida. Ejemplo: CXPY-93.");
      return;
    }
    const plate = toBackendPlate(formattedPlate);

    setEntrySubmitting(true);
    setEntryError("");

    try {
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkfacil-portal": "terminal",
        },
        cache: "no-store",
        body: JSON.stringify({ action: "ENTRY", plate, source: "POS" }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setEntryError(payload?.error || "No fue posible registrar el ingreso.");
        return;
      }

      const stay = payload?.data?.stay || null;
      const parkingResponse = payload?.data?.parking || parking;
      setEntrySuccess(stay ? { stay, parking: parkingResponse } : null);
      const printPayload = buildEntryPrintPayload(stay, parkingResponse);
      setEntryPrintPayload(printPayload);
      setEntryPlate("");
      setEntryOpen(false);
      setCurrentView(POS_VIEWS.INGRESO);
      setVehiclesInside((current) => current + 1);
      void loadTerminalState(true);

      const printResult = printPayload ? await printLastEntryTicket(printPayload) : null;
      // Solo se bloquea el retorno a HOME cuando existe bridge nativo y la
      // impresión se intentó pero falló (regla 3). Sin bridge (PC/navegador,
      // regla 2) o con impresión exitosa (regla 1), el ingreso ya es un
      // flujo de negocio completo y se vuelve a HOME.
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (!printFailedOnDevice) {
        setEntryOpen(false);
        setEntryError("");
        setEntrySuccess(null);
        setEntryPrintStatus("");
        setCurrentView(POS_VIEWS.HOME);
      }
    } catch {
      setEntryError("Error de red al registrar el ingreso.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  const navItems = [
    { label: "INICIO", onSelect: () => goToSection(POS_VIEWS.HOME) },
    { label: "INGRESO DE VEHÍCULO", onSelect: openEntryForm },
    { label: "SALIDA DE VEHÍCULO", onSelect: () => goToSection(POS_VIEWS.SALIDA) },
    { label: "VEHÍCULOS EN EL PARKING", onSelect: () => goToSection(POS_VIEWS.VEHICULOS) },
    { label: "CÓDIGO QR", onSelect: () => goToSection(POS_VIEWS.QR) },
    { label: "BUSCAR TICKET", onSelect: () => goToSection(POS_VIEWS.BUSCAR) },
    {
      label: "REIMPRIMIR TICKET",
      onSelect: () => {
        goToSection(POS_VIEWS.INGRESO);
        void printLastEntryTicket(entryPrintPayload);
      },
    },
    { label: "IMPRIMIR VEHÍCULOS EN EL PARKING", onSelect: () => goToSection(POS_VIEWS.IMPRIMIR_LISTADO) },
    { label: "PAGOS DEL DÍA", onSelect: () => goToSection(POS_VIEWS.PAGOS_DEL_DIA) },
    { label: "CIERRE DE CAJA", onSelect: () => goToSection(POS_VIEWS.CIERRE_CAJA) },
    {
      label: "ACTUALIZAR APLICACIÓN",
      onSelect: () => {
        closeSidebar();
        void loadTerminalState(true);
      },
    },
    { label: "ESTADO DEL DISPOSITIVO", onSelect: () => goToSection(POS_VIEWS.ESTADO_DISPOSITIVO) },
    {
      label: "CERRAR SESIÓN",
      onSelect: () => {
        closeSidebar();
        void logout();
      },
    },
  ];

  function renderHomePanel() {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={openEntryForm}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500"
          >
            INGRESO
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.SALIDA)}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-rose-200 transition hover:bg-rose-500"
          >
            SALIDA
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.VEHICULOS)}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-rose-900 px-4 py-4 text-center text-base font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-rose-200 transition hover:bg-rose-800 sm:text-lg"
          >
            VEHÍCULOS EN EL PARKING
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.QR)}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-amber-500 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-slate-900 shadow-lg shadow-amber-200 transition hover:bg-amber-400"
          >
            CÓDIGO QR
          </button>
        </div>
      </section>
    );
  }

  function renderIngresoPanel() {
    if (entrySuccess) {
      return (
        <article className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Ingreso registrado</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Patente</p>
              <p className="mt-1 text-lg font-black">{entrySuccess.stay?.license_plate || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ticket / operación</p>
              <p className="mt-1 text-lg font-black">{entrySuccess.stay?.code || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Fecha de ingreso</p>
              <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).date}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Hora de ingreso</p>
              <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).time}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Estacionamiento</p>
              <p className="mt-1 font-bold">{entrySuccess.parking?.name || parking?.name || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Operador</p>
              <p className="mt-1 font-bold">{entrySuccess.stay?.entry_operator_name || context?.email || "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Empresa</p>
              <p className="mt-1 font-bold">{entrySuccess.parking?.company?.business_name || entrySuccess.parking?.company_name || "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">QR</p>
              <p className="mt-1 break-all font-mono text-sm font-bold">{entrySuccess.stay?.qr_token || "-"}</p>
            </div>
          </div>

          {entryPrintStatus ? (
            <div className="mt-4 whitespace-pre-line rounded-2xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">
              {entryPrintStatus}
            </div>
          ) : null}

          {entryPrintPayload ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void printLastEntryTicket(entryPrintPayload)}
                disabled={entryPrintBusy}
                className="rounded-2xl border border-emerald-400 bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entryPrintBusy ? "Reimprimiendo..." : "REIMPRIMIR TICKET"}
              </button>
            </div>
          ) : null}
        </article>
      );
    }

    if (entryOpen) {
      return (
        <form onSubmit={submitEntry} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Ingreso</p>
              <h2 className="mt-1 text-xl font-black text-slate-800">Registrar vehículo</h2>
              <p className="mt-1 text-sm text-slate-600">Se usará el estacionamiento asignado a tu sesión.</p>
            </div>
            <button
              type="button"
              onClick={closeEntryForm}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white"
            >
              Cancelar
            </button>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Patente</span>
            <input
              value={entryPlate}
              onChange={(event) => setEntryPlate(formatPosPlateInput(event.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="CXPY-93"
              maxLength={7}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-2xl font-black tracking-[0.16em] text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-500"
            />
          </label>

          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Formato sugerido: CXPY-93
          </p>

          {entryError ? (
            <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {entryError}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={entrySubmitting}
              className="rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {entrySubmitting ? "Registrando..." : "Confirmar ingreso"}
            </button>
            <button
              type="button"
              onClick={closeEntryForm}
              disabled={entrySubmitting}
              className="rounded-2xl border border-slate-300 px-4 py-4 text-lg font-black text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </form>
      );
    }

    return (
      <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Ingreso de vehículo</h2>
        <p className="mt-2 text-sm font-semibold">Selecciona comenzar para registrar un ingreso nuevo.</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={openEntryForm}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Comenzar ingreso
          </button>
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.HOME)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            Volver
          </button>
        </div>
      </section>
    );
  }

  function renderVehiclesPreparedList() {
    if (!activeStays.length) {
      return (
        <div className="rounded-2xl border border-dashed border-rose-300 bg-white p-4 text-sm font-semibold text-rose-900">
          No hay vehículos para mostrar en este momento.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="hidden rounded-2xl border border-rose-200 bg-white md:block">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-rose-100">
              <tr>
                <th className="rounded-tl-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Patente</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Hora ingreso</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Minutos consumidos</th>
                <th className="rounded-tr-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Monto actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-100">
              {activeStays.map((stay, index) => {
                const entry = formatEntryDate(stay?.entry_at);
                return (
                  <tr
                    key={String(stay?.id || stay?.code || stay?.qr_token || `stay-${index}`)}
                    onClick={() => void openVehicleDetail(stay)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openVehicleDetail(stay);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir detalle de ${stay?.license_plate || "vehículo"}`}
                    className="cursor-pointer bg-white transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-inset"
                  >
                    <td className="px-3 py-3 font-black text-rose-950">{stay?.license_plate || "-"}</td>
                    <td className="px-3 py-3 font-semibold text-rose-900">{entry.time}</td>
                    <td className="px-3 py-3 font-semibold text-rose-900">{formatMinuteCount(stay?.quote)}</td>
                    <td className="px-3 py-3 font-black text-rose-950">{formatQuoteAmount(stay?.quote)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {activeStays.map((stay, index) => {
            const entry = formatEntryDate(stay?.entry_at);
            return (
              <button
                key={String(stay?.id || stay?.code || stay?.qr_token || `stay-${index}`)}
                type="button"
                onClick={() => void openVehicleDetail(stay)}
                  className="rounded-2xl border border-rose-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-400 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Patente</p>
                    <p className="mt-1 text-xl font-black text-rose-950">{stay?.license_plate || "-"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Monto</p>
                    <p className="mt-1 text-lg font-black text-rose-950">{formatQuoteAmount(stay?.quote)}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Ingreso</p>
                    <p className="mt-1 font-semibold text-rose-900">{entry.time}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Minutos</p>
                    <p className="mt-1 font-semibold text-rose-900">{formatMinuteCount(stay?.quote)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPagosDelDiaPanel() {
    if (paymentsTodayLoading && !paymentsToday.length) {
      return (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />
            <p className="text-sm font-semibold">Cargando pagos del día...</p>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Pagos del día</h2>
        <p className="mt-2 text-sm font-semibold">Pagos confirmados hoy en el estacionamiento asignado.</p>

        {paymentsTodayError ? (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {paymentsTodayError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total pagos del día</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalAmount ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total efectivo</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalCash ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total débito</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalDebit ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total crédito</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalCredit ?? 0)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!paymentsToday.length ? (
                <div className="rounded-2xl border border-dashed border-emerald-300 bg-white p-4 text-sm font-semibold text-emerald-900">
                  Todavía no hay pagos confirmados hoy en este estacionamiento.
                </div>
              ) : (
                <>
                  <div className="hidden rounded-2xl border border-emerald-200 bg-white md:block">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead className="bg-emerald-100">
                        <tr>
                          <th className="rounded-tl-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Patente</th>
                          <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Hora</th>
                          <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Medio de pago</th>
                          <th className="rounded-tr-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                        {paymentsToday.map((payment, index) => (
                          <tr key={String(payment?.id || payment?.paymentCode || `payment-${index}`)} className="bg-white">
                            <td className="px-3 py-3 font-black text-emerald-950">{payment?.plate || "-"}</td>
                            <td className="px-3 py-3 font-semibold text-emerald-900">{payment?.time || "-"}</td>
                            <td className="px-3 py-3 font-semibold text-emerald-900">{formatPaymentMethodLabel(payment?.paymentMethod)}</td>
                            <td className="px-3 py-3 font-black text-emerald-950">{formatCurrency(payment?.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:hidden">
                    {paymentsToday.map((payment, index) => (
                      <div
                        key={String(payment?.id || payment?.paymentCode || `payment-${index}`)}
                        className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Patente</p>
                            <p className="mt-1 text-xl font-black text-emerald-950">{payment?.plate || "-"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Monto</p>
                            <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(payment?.amount)}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Hora</p>
                            <p className="mt-1 font-semibold text-emerald-900">{payment?.time || "-"}</p>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Medio de pago</p>
                            <p className="mt-1 font-semibold text-emerald-900">{formatPaymentMethodLabel(payment?.paymentMethod)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.HOME)}
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
          >
            Volver
          </button>
        </div>
      </section>
    );
  }

  function renderVehicleDetailPanel() {
    if (selectedVehicleLoading && !selectedVehicle) {
      return (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-rose-700" />
            <p className="text-sm font-semibold">Cotizando vehículo seleccionado...</p>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.VEHICULOS)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              VOLVER
            </button>
          </div>
        </section>
      );
    }

    const stay = selectedVehicle?.stay;
    const quote = selectedVehicle?.quote;
    const entry = formatEntryDate(stay?.entry_at);
    const tariffName = quote?.rate?.name || stay?.rate_name || "Sin tarifa vigente";
    const amount = formatQuoteAmount(quote);

    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Vehículo seleccionado</h2>
        <div className="mt-4 grid gap-4 rounded-2xl border border-rose-200 bg-white p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Patente</p>
            <p className="mt-1 text-2xl font-black text-rose-950">{stay?.license_plate || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Ticket</p>
            <p className="mt-1 font-bold text-rose-900">{stay?.code || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Ingreso</p>
            <p className="mt-1 font-bold text-rose-900">{entry.date} {entry.time}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Tiempo consumido</p>
            <p className="mt-1 font-bold text-rose-900">{formatMinuteCount(quote)} minutos</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Tarifa aplicada</p>
            <p className="mt-1 font-bold text-rose-900">{tariffName}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">TOTAL A PAGAR</p>
            <p className="mt-1 text-3xl font-black text-rose-950">{amount}</p>
          </div>
          {selectedVehicleError ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {selectedVehicleError}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openPaymentModal}
            disabled={selectedVehicleLoading || !quote || quote.blocked}
            className="rounded-xl bg-rose-900 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            PAGAR
          </button>
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            {quote?.blocked ? "No existe una tarifa activa para esta estadía." : "Preparado para seleccionar medio de pago."}
          </div>
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.VEHICULOS)}
            className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-rose-800 hover:bg-rose-100"
          >
            VOLVER
          </button>
        </div>
      </section>
    );
  }

  function renderPaymentModal() {
    if (!paymentModalOpen || !selectedVehicle) return null;

    const stay = selectedVehicle.stay;
    const quote = selectedVehicle.quote;

    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-rose-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closePaymentModal(); }}>
        <section className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-rose-900 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-semibold text-rose-200">Pago operacional</p>
              <h3 className="mt-1 text-xl font-black">Seleccione medio de pago</h3>
            </div>
            <button type="button" onClick={closePaymentModal} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar pago">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Patente</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{stay?.license_plate || "-"}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Total a pagar: <span className="font-black text-slate-900">{formatQuoteAmount(quote)}</span></p>
            </div>

            {paymentStep === "MENU" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => handlePaymentSelection("CASH")} className="min-h-20 rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-black text-white transition hover:bg-emerald-500">
                  EFECTIVO
                </button>
                <button type="button" onClick={() => handlePaymentSelection("CARD")} className="min-h-20 rounded-2xl bg-sky-600 px-4 py-5 text-lg font-black text-white transition hover:bg-sky-500">
                  DÉBITO
                </button>
                <button type="button" onClick={() => handlePaymentSelection("CARD")} className="min-h-20 rounded-2xl bg-indigo-600 px-4 py-5 text-lg font-black text-white transition hover:bg-indigo-500">
                  CRÉDITO
                </button>
              </div>
            ) : null}

            {paymentStep === "CASH_CONFIRM" ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-lg font-black text-emerald-950">¿CONFIRMA PAGO EN EFECTIVO?</p>
                <div className="grid gap-2 text-sm font-semibold text-emerald-950 sm:grid-cols-2">
                  <div><span className="block text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Patente</span>{stay?.license_plate || "-"}</div>
                  <div><span className="block text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Total</span>{formatQuoteAmount(quote)}</div>
                </div>
                {paymentMessage ? <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-rose-700">{paymentMessage}</p> : null}
                {paymentResult ? (
                  <div className="rounded-xl border border-emerald-300 bg-white px-3 py-3 text-sm font-black text-emerald-900">
                    PAGO REGISTRADO ({formatPaymentMethodLabel(paymentResult.paymentMethod)})<br />SALIDA COMPLETADA
                  </div>
                ) : null}
                {paymentResult && receiptPrintStatus ? (
                  <div className="whitespace-pre-line rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                    {receiptPrintStatus}
                  </div>
                ) : null}
                {paymentResult && receiptPrintPayload ? (
                  <button
                    type="button"
                    onClick={() => void printLastReceipt(receiptPrintPayload)}
                    disabled={receiptPrintBusy}
                    className="rounded-xl border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-black text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {receiptPrintBusy ? "Reimprimiendo..." : "REIMPRIMIR RECIBO"}
                  </button>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void confirmCashPayment()}
                    disabled={paymentSubmitting || Boolean(paymentResult)}
                    className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {paymentSubmitting ? "Procesando..." : "CONFIRMAR PAGO"}
                  </button>
                  <button type="button" onClick={() => setPaymentStep("MENU")} disabled={paymentSubmitting} className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
                    CANCELAR
                  </button>
                </div>
              </div>
            ) : null}

            {paymentStep === "CARD_NOTICE" ? (
              <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-lg font-black text-sky-950">{paymentMessage || "Pago con tarjeta pendiente de integración TUU."}</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => { setPaymentStep("MENU"); setPaymentMessage(""); }} className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-sky-600">
                    VOLVER
                  </button>
                  <button type="button" onClick={closePaymentModal} className="rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-sky-900 transition hover:bg-sky-100">
                    CERRAR
                  </button>
                </div>
              </div>
            ) : null}

            {paymentStep === "MENU" ? (
              <button type="button" onClick={closePaymentModal} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100">
                VOLVER
              </button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  function renderOperationalPanel() {
    if (currentView === POS_VIEWS.VEHICULO_DETALLE) {
      return renderVehicleDetailPanel();
    }

    if (currentView === POS_VIEWS.SALIDA) {
      return (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Salida de vehículo</h2>
          <p className="mt-2 text-sm font-semibold">Módulo preparado. El flujo de cobro se implementará en una fase posterior.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.VEHICULOS) {
      return (
        <section className="rounded-3xl border border-rose-300 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Vehículos en el parking</h2>
          <p className="mt-2 text-sm font-semibold">Permanencias OPEN reales del estacionamiento asignado al operador.</p>
          <p className="mt-3 text-sm font-bold">Vehículos actualmente dentro: {vehiclesInside}</p>
          <div className="mt-4 space-y-4">
            {renderVehiclesPreparedList()}
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.QR) {
      return (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Código QR</h2>
          <p className="mt-2 text-sm font-semibold">Acceso visual preparado. La lectura QR futura mostrará ticket y permitirá decisión del operador sin ejecutar salida automática.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.BUSCAR) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Buscar ticket</h2>
          <p className="mt-2 text-sm font-semibold">Módulo preparado para búsqueda operacional de tickets.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.IMPRIMIR_LISTADO) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Imprimir vehículos en parking</h2>
          <p className="mt-2 text-sm font-semibold">Acción preparada para impresión de listado operacional en una fase posterior.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.PAGOS_DEL_DIA) {
      return renderPagosDelDiaPanel();
    }

    if (currentView === POS_VIEWS.CIERRE_CAJA) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Cierre de caja</h2>
          <p className="mt-2 text-sm font-semibold">Pantalla preparada. El cierre de caja operativo se integrará en su etapa correspondiente.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.ESTADO_DISPOSITIVO) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Estado del dispositivo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bridge Android</p>
              <p className="mt-1 text-sm font-black text-slate-800">{nativePrintAvailable ? "Disponible" : "No disponible"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Versión POS</p>
              <p className="mt-1 text-sm font-black text-slate-800">{POS_FRONTEND_VERSION}</p>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    return null;
  }

  function renderActiveView() {
    if (currentView === POS_VIEWS.HOME) return renderHomePanel();
    if (currentView === POS_VIEWS.INGRESO) return renderIngresoPanel();
    return renderOperationalPanel();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTerminalState(false);
  }, [loadTerminalState]);

  useEffect(() => {
    // Se detecta después del montaje: leer window.ParkFacilDevice durante el
    // render podría diferir entre SSR y el primer render del cliente (p. ej.
    // en el dispositivo SUNMI, donde el bridge nativo puede quedar disponible
    // antes de que React hidrate).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativePrintAvailable(Boolean(getNativePrinterBridge()));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {paymentModalOpen ? renderPaymentModal() : null}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" onClick={closeSidebar}>
          <aside className="h-full w-[84%] max-w-xs overflow-y-auto border-r border-slate-300 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Menú POS</p>
              <button type="button" onClick={closeSidebar} className="rounded-lg border border-slate-300 p-2 text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.onSelect()}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="hidden w-80 shrink-0 border-r border-slate-300 bg-white p-4 shadow-sm lg:block">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ParkFacil POS</p>
          <h2 className="mt-2 text-xl font-black text-slate-800">Navegación</h2>
          <div className="mt-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.onSelect()}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Versión {POS_FRONTEND_VERSION}</p>
        </aside>

        <section className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">
          <div className="rounded-3xl border border-slate-300 bg-white p-4 shadow-xl sm:p-5">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">ParkFacil POS</p>
                <h1 className="mt-2 text-xl font-black text-slate-800 sm:text-2xl">Terminal operativo</h1>
                <p className="mt-1 text-sm text-slate-600">Operador y estacionamiento asignado.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openSidebar}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 p-2 text-slate-700 lg:hidden"
                  aria-label="Abrir menú"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Cerrar sesión</span>
                </button>
              </div>
            </header>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Cargando terminal POS...
              </div>
            ) : error ? (
              <div className="mt-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Operador</p>
                    <p className="mt-1 break-all text-sm font-bold text-slate-800">{context?.email || "-"}</p>
                    <p className="text-xs text-slate-600">Rol: {context?.role || "-"}</p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estacionamiento activo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{parking?.name || "Sin asignación"}</p>
                    <p className="text-xs text-slate-600">Código: {parking?.code || "-"}</p>
                  </article>
                </div>

                {renderActiveView()}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void loadTerminalState(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Actualizar
                  </button>
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              ParkFacil POS · Versión 0.1.1
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

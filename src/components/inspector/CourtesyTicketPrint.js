"use client";
// "IMPRIMIR MULTA DE CORTESÍA" (Inspector, Etapa 3 final -- Capacitor/
// Android, 2026-08-31). Se monta ÚNICAMENTE desde InspectorFiscalizacion.js,
// en la pantalla de éxito, y solo cuando la fiscalización recién
// confirmada por el servidor es de tipo OVERSTAY (exceso de tiempo =
// sesión VENCIDO) -- nunca antes de esa confirmación, nunca para otros
// motivos.
//
// Transporte real, dos caminos (corrección 2026-08-31 -- antes esta
// pantalla mostraba "requiere la app Android" también en PC, lo cual era
// incorrecto: ver informe de esta corrección):
//  - Android (Capacitor): plugin nativo "ParkFacilPrinter" (Bluetooth
//    Classic SPP, ver printerAdapter.js y capacitor-inspector-android/) --
//    requiere elegir/conectar la impresora emparejada primero.
//  - PC (navegador de escritorio): ParkFacil Print Agent, el MISMO agente
//    HTTP local que ya usa POS (ver printerAdapter.printCourtesyFineViaPcAgent)
//    -- sin paso de "conectar": cada impresión es una llamada HTTP
//    independiente al agente, que puede fallar (AGENT_UNREACHABLE) si no
//    está abierto en este equipo.
// En navegador/PWA MÓVIL y en iOS se sigue mostrando el motivo real (ver
// printerAdapter.UNAVAILABLE_MESSAGE) en vez de un botón que no podría
// funcionar -- nunca se simula compatibilidad que no existe.
//
// Ambos transportes son 100% locales a este equipo (JS <-> plugin nativo
// <-> Bluetooth, o JS <-> agente HTTP en 127.0.0.1 <-> COM/Bluetooth):
// ningún click de este componente llama a un endpoint de ParkFacil ni
// vuelve a tocar la fiscalización ya registrada. Reintentar/reimprimir
// (clic de nuevo) repite la misma operación local con los MISMOS datos ya
// recibidos por props -- nunca crea una segunda fiscalización, nunca
// cambia patente/fecha/folio.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bluetooth, Printer, RefreshCw } from "lucide-react";
import { buildCourtesyTicketEscPos, courtesyTicketAgentPayload, courtesyTicketLines } from "@/lib/inspector/courtesyTicketEscPos.mjs";
import {
  clearSavedPrinter, connectPrinter, detectPlatform, disconnectPrinter, getPrinterStatus, getSavedPrinter,
  isPrintingAvailable, listPairedPrinters, PLATFORM, printBytes, printCourtesyFineViaPcAgent, saveSelectedPrinter,
  unavailableReason, UNAVAILABLE_MESSAGE,
} from "@/lib/inspector/printerAdapter";

// onStatusChange (2026-09-03, "decouple printing + sms copy"): callback
// OPCIONAL (nunca cambia el comportamiento propio de este componente si no
// se pasa) que reporta hacia arriba un resumen {label, tone} del estado de
// impresión -- para que InspectorFiscalizacion.js lo muestre como una fila
// más en la lista de estados separados de la pantalla de éxito (§7 de la
// tarea), sin duplicar la lógica de disponibilidad/estado que ya vive
// aquí.
function printSummaryFor({ available, printerState, isAndroid, printStatus }) {
  if (!available) return { label: "No disponible", tone: "neutral" };
  if (printStatus === "done") return { label: "Realizada", tone: "success" };
  if (printStatus === "error") return { label: "Error", tone: "error" };
  if (isAndroid && printerState !== "connected") return { label: "Pendiente (conectar impresora)", tone: "neutral" };
  return { label: "Pendiente", tone: "neutral" };
}

export default function CourtesyTicketPrint({ plate, inspectedAt, inspectionId, onStatusChange }) {
  const lines = useMemo(() => courtesyTicketLines({ plate, inspectedAt, inspectionId }), [plate, inspectedAt, inspectionId]);
  const [platform] = useState(() => detectPlatform());
  const isAndroid = platform === PLATFORM.ANDROID;
  const [available] = useState(() => isPrintingAvailable());
  const [reason] = useState(() => (available ? null : unavailableReason()));

  // Estado de la impresora (independiente del estado de impresión):
  // disconnected -> connecting -> connected. Se consulta al montar (§7:
  // "Estado: ● Conectada / No conectada") y se reintenta con la impresora
  // guardada (§8) si existe, sin pedir al inspector que la elija de nuevo
  // cada vez.
  const [printerState, setPrinterState] = useState(() => (available ? "checking" : "disconnected")); // checking | disconnected | connecting | connected
  const [printer, setPrinter] = useState(null); // { deviceId, deviceName }
  const [pairedDevices, setPairedDevices] = useState(null); // null = no cargados todavía
  const [pickerOpen, setPickerOpen] = useState(false);
  const [printerError, setPrinterError] = useState("");

  // Impresión (separada de la conexión): idle -> printing -> done | error.
  const [printStatus, setPrintStatus] = useState("idle");
  const [printError, setPrintError] = useState("");

  useEffect(() => {
    onStatusChange?.(printSummaryFor({ available, printerState, isAndroid, printStatus }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStatusChange es un callback del padre, no un dato propio a re-observar; available/isAndroid son fijos por montaje.
  }, [printerState, printStatus]);

  const refreshStatus = useCallback(async () => {
    const status = await getPrinterStatus();
    if (status.connected) {
      setPrinterState("connected");
      setPrinter({ deviceId: status.deviceId, deviceName: status.deviceName });
    } else {
      setPrinterState("disconnected");
    }
    return status;
  }, []);

  useEffect(() => {
    // El paso de "conectar impresora" (estado/reconexión guardada) solo
    // existe para el plugin Android -- el agente de PC no expone pairing
    // ni estado, cada impresión es una llamada HTTP independiente (ver
    // handlePrint).
    if (!available || !isAndroid) return undefined;
    const timer = window.setTimeout(async () => {
      const status = await refreshStatus();
      // Reconexión automática (§8) con la última impresora autorizada,
      // solo si no hay ya una conexión viva y el inspector no la
      // desconectó explícitamente en esta misma sesión.
      if (!status.connected) {
        const saved = getSavedPrinter();
        if (saved?.deviceId) void handleConnect(saved.deviceId, saved.deviceName);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se ejecuta una sola vez al montar, igual criterio que el resto del módulo Inspector.
  }, []);

  async function handleOpenPicker() {
    setPrinterError("");
    setPickerOpen(true);
    if (!pairedDevices) {
      try {
        const devices = await listPairedPrinters();
        setPairedDevices(devices);
      } catch (cause) {
        setPrinterError(cause?.message === "PRINTER_PLUGIN_MISSING" ? UNAVAILABLE_MESSAGE.PRINTER_PLUGIN_MISSING : "No fue posible listar las impresoras emparejadas.");
        setPairedDevices([]);
      }
    }
  }

  async function handleConnect(deviceId, deviceName) {
    setPrinterError("");
    setPrinterState("connecting");
    try {
      const result = await connectPrinter(deviceId);
      if (!result.ok) {
        setPrinterState("disconnected");
        setPrinterError(result.message || "No fue posible conectar con la impresora.");
        return;
      }
      setPrinter({ deviceId, deviceName });
      setPrinterState("connected");
      setPickerOpen(false);
      saveSelectedPrinter({ deviceId, deviceName });
    } catch (cause) {
      setPrinterState("disconnected");
      setPrinterError(cause?.message === "PRINTER_PLUGIN_MISSING" ? UNAVAILABLE_MESSAGE.PRINTER_PLUGIN_MISSING : "No fue posible conectar con la impresora.");
    }
  }

  async function handleDisconnect() {
    await disconnectPrinter();
    setPrinterState("disconnected");
    setPrinter(null);
    clearSavedPrinter();
  }

  async function handlePrint() {
    setPrintError("");
    setPrintStatus("printing");
    try {
      // Dos transportes reales (ver cabecera del archivo): Android manda
      // los bytes ESC/POS crudos al plugin nativo; PC manda campos ya
      // formateados al agente HTTP local existente, que arma sus propios
      // bytes -- ninguno de los dos vuelve a llamar a un endpoint de
      // ParkFacil ni recalcula nada de la fiscalización ya confirmada.
      const result = isAndroid
        ? await printBytes(buildCourtesyTicketEscPos({ plate, inspectedAt, inspectionId }))
        : await printCourtesyFineViaPcAgent(courtesyTicketAgentPayload({ plate, inspectedAt, inspectionId }));
      if (!result.ok) {
        setPrintStatus("error");
        // §6 / §7: un fallo de impresión NUNCA revierte, duplica ni
        // vuelve a tocar la fiscalización -- solo se informa, con la
        // acción de reintentar disponible de inmediato.
        setPrintError(result.message || "No fue posible imprimir. La fiscalización ya fue registrada.");
        return;
      }
      setPrintStatus("done");
    } catch (cause) {
      setPrintStatus("error");
      setPrintError("No fue posible imprimir. La fiscalización ya fue registrada.");
      // Desconexión detectada al intentar imprimir (impresora apagada,
      // fuera de rango) -- refleja el estado real en vez de seguir
      // mostrando "Conectada" cuando ya no lo está. Solo aplica al plugin
      // Android: el agente de PC no tiene un "estado de conexión" propio
      // que refrescar (ver nota del efecto de reconexión automática).
      if (isAndroid && cause?.message === "PRINTER_PLUGIN_MISSING") void refreshStatus();
    }
  }

  if (!available) {
    return (
      <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 p-4 text-left">
        {/* Tono neutral, no de advertencia (2026-09-03, §7): la impresión es
           opcional y su ausencia no es un fallo del flujo -- ver resumen de
           estados separados en InspectorFiscalizacion.js. */}
        <p className="rounded-xl bg-slate-100 p-3 text-xs font-semibold text-slate-600">{UNAVAILABLE_MESSAGE[reason]}</p>
      </div>
    );
  }

  const printLabel = printStatus === "error" ? "REINTENTAR IMPRESIÓN" : printStatus === "done" ? "IMPRIMIR NUEVAMENTE" : "IMPRIMIR MULTA DE CORTESÍA";

  return (
    <div className="mt-6 space-y-3 rounded-2xl border-2 border-dashed border-slate-300 p-4 text-left">
      {/* Vista previa en pantalla -- MISMO contenido exacto que se envía a
          la impresora (courtesyTicketLines es la única fuente de verdad). */}
      <div className="mx-auto w-full max-w-[220px] rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-tight text-black shadow-inner">
        <p className="text-center font-bold">{lines.header}</p>
        <p className="mt-2">{lines.plateLine}</p>
        <p>{lines.dateTimeLine}</p>
        <p className="mt-2 text-center text-sm font-black">{lines.title}</p>
        <p className="text-center text-sm font-black">{lines.subtitle}</p>
        {lines.messageLines.map((line) => <p key={line} className="text-center font-bold">{line}</p>)}
        <p className="mt-2">{lines.folioLine}</p>
        <p className="mt-2 text-center">{lines.footer}</p>
      </div>

      {/* Impresora (§7): estado + conectar/cambiar -- SOLO Android
          (Bluetooth Classic requiere elegir/conectar el dispositivo
          emparejado primero). El agente de PC no tiene paso de conexión:
          cada impresión es una llamada HTTP independiente al agente local
          ya existente, ver handlePrint. */}
      {isAndroid ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-[#041E42]">Impresora</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${printerState === "connected" ? "text-emerald-700" : "text-slate-500"}`}>
              <span className={`h-2 w-2 rounded-full ${printerState === "connected" ? "bg-emerald-600" : printerState === "connecting" ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden="true" />
              {printerState === "connected" ? "Conectada" : printerState === "connecting" ? "Conectando…" : printerState === "checking" ? "Verificando…" : "No conectada"}
            </span>
          </div>
          {printerState === "connected" && printer ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs text-slate-600">{printer.deviceName || printer.deviceId}</p>
              <button type="button" onClick={handleDisconnect} className="shrink-0 text-xs font-semibold text-slate-500 underline">Desconectar</button>
            </div>
          ) : (
            <button type="button" onClick={handleOpenPicker} disabled={printerState === "connecting"} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 disabled:opacity-60">
              <Bluetooth className="h-4 w-4" aria-hidden="true" />
              Conectar impresora
            </button>
          )}
          {printerError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{printerError}</p> : null}

          {pickerOpen ? (
            <div className="mt-2 rounded-xl bg-slate-50 p-2">
              {pairedDevices === null ? (
                <p className="p-2 text-center text-xs text-slate-500">Cargando dispositivos emparejados…</p>
              ) : pairedDevices.length === 0 ? (
                <p className="p-2 text-center text-xs text-slate-500">Sin dispositivos Bluetooth emparejados. Empareja la MTP-II en Ajustes de Android primero.</p>
              ) : (
                <ul className="space-y-1">
                  {pairedDevices.map((device) => (
                    <li key={device.deviceId}>
                      <button type="button" onClick={() => handleConnect(device.deviceId, device.name)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold text-[#041E42] shadow-sm">
                        <span className="min-w-0 truncate">{device.name || device.deviceId}</span>
                        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setPickerOpen(false)} className="mt-2 block w-full text-center text-xs font-semibold text-slate-500">Cerrar</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handlePrint}
        disabled={(isAndroid && printerState !== "connected") || printStatus === "printing"}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#041E42] font-black text-white disabled:opacity-60"
      >
        <Printer className="h-5 w-5" aria-hidden="true" />
        {printStatus === "printing" ? "Imprimiendo…" : printLabel}
      </button>

      {printStatus === "done" ? <p role="status" className="text-center text-sm font-bold text-emerald-700">Ticket enviado a la impresora.</p> : null}
      {printStatus === "error" ? <p role="alert" className="text-center text-sm font-bold text-rose-700">{printError}</p> : null}
    </div>
  );
}

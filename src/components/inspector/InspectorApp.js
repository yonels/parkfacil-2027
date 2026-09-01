"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { INSPECTOR_VIEW } from "./inspectorViews.mjs";
import InspectorTopBar from "./InspectorTopBar";
import InspectorSidebar from "./InspectorSidebar";
import InspectorBottomNav from "./InspectorBottomNav";
import InspectorDrawer from "./InspectorDrawer";
import InspectorConsulta from "./InspectorConsulta";
import InspectorResultado from "./InspectorResultado";
import InspectorFiscalizacion from "./InspectorFiscalizacion";
import InspectorFiscalizaciones from "./InspectorFiscalizaciones";
import InspectorHistorial from "./InspectorHistorial";
import InspectorMorosos from "./InspectorMorosos";
import InspectorMapa from "./InspectorMapa";
import InspectorSync from "./InspectorSync";
import InspectorAjustes from "./InspectorAjustes";

const PORTAL_HEADERS = { "x-parkfacil-portal": "inspector" };

async function getInspectorSession() {
  const response = await fetch("/api/auth/session", { headers: PORTAL_HEADERS, cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return payload?.data || null;
}

async function fetchPlateState(plate) {
  const response = await fetch(`/api/inspector/plates/${encodeURIComponent(plate)}`, { headers: PORTAL_HEADERS, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function fetchInspectorInspections() {
  const response = await fetch("/api/inspector/inspections", { headers: PORTAL_HEADERS, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return payload?.data || [];
}

// Normaliza la forma real de la API (license_plate_normalized/inspection_type/
// inspected_at) a la misma forma que ya consumían los componentes de
// pantalla de la Etapa 1 -- para no reescribirlos innecesariamente.
function mapApiInspection(row) {
  return { id: row.id, plate: row.license_plate_normalized, motivo: inspectionMotivoLabel(row), observaciones: row.observations || "", at: row.inspected_at, smsStatus: row.sms_status };
}

// Shell real de ParkFacil Inspectores (Etapa 2): una sola ruta (/inspector),
// navegación por estado de cliente -- mismo patrón que PosTerminal.js,
// decompuesto en un componente por pantalla (§22). proxy.js ya garantiza
// que solo se llega aquí autenticado con rol Inspector (§4) -- este
// componente vuelve a confirmar la sesión real (para mostrar nombre/email y
// como defensa si el cookie expiró en caliente) y consume las APIs reales
// de consulta/fiscalización/historial en vez de los mocks de la Etapa 1.
export default function InspectorApp() {
  const [inspector, setInspector] = useState(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [view, setView] = useState(INSPECTOR_VIEW.CONSULTA);
  const [activeResult, setActiveResult] = useState(null);
  const [fiscalizacionPlate, setFiscalizacionPlate] = useState(null);
  const [fiscalizacionLockToOverstay, setFiscalizacionLockToOverstay] = useState(false);
  // "Últimas consultas" se mantiene client-side, alimentada por resultados
  // REALES de la API (§15: "consultas recientes cuando corresponda") -- no
  // hay ninguna tabla de consultas que persistir en esta etapa.
  const [history, setHistory] = useState([]);
  const [fiscalizaciones, setFiscalizaciones] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [consultError, setConsultError] = useState("");

  useEffect(() => {
    // Mismo patrón que useReorderableColumns.js para leer estado externo al
    // montar sin disparar un setState síncrono dentro del cuerpo del efecto.
    const timer = window.setTimeout(async () => {
      const session = await getInspectorSession();
      setInspector(session);
      setCheckedSession(true);
      if (session) setFiscalizaciones((await fetchInspectorInspections()).map(mapApiInspection));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleLogout() {
    try { await getSupabaseBrowserClient().auth.signOut(); } catch {}
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    window.location.href = "/inspector/login";
  }

  function navigate(nextView) {
    setView(nextView);
    setDrawerOpen(false);
  }

  async function consult(plate) {
    setConsultError("");
    const { ok, status, payload } = await fetchPlateState(plate);
    if (!ok) {
      if (status === 401 || status === 403) { setInspector(null); return; }
      setConsultError(payload?.error || "No fue posible consultar la patente.");
      return;
    }
    const result = payload.data;
    setActiveResult(result);
    setHistory((prev) => [{ plate: result.plate, status: result.status, at: new Date().toISOString() }, ...prev].slice(0, 20));
    setView(INSPECTOR_VIEW.RESULTADO);
  }

  function goFiscalizar(plate, { lockToOverstay = false } = {}) {
    setFiscalizacionPlate(plate);
    setFiscalizacionLockToOverstay(lockToOverstay);
    setView(INSPECTOR_VIEW.FISCALIZACION);
  }

  function onFiscalizacionRegistrada(row) {
    if (row?.reused === false) {
      // Solo se agrega al historial local si el registro fue nuevo -- una
      // repetición idempotente no debe duplicar la fila en pantalla tampoco.
      setFiscalizaciones((prev) => [{ id: row.id, plate: fiscalizacionPlate, motivo: fiscalizacionLockToOverstay ? "Exceso de tiempo" : null, observaciones: "", at: row.inspectedAt || new Date().toISOString() }, ...prev]);
    }
  }

  if (!checkedSession) return <main className="grid min-h-dvh place-items-center bg-[#EEF4FF]"><p className="font-bold text-[#041E42]">Cargando…</p></main>;
  if (!inspector) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#041E42] p-4 text-center text-white">
        <div>
          <p className="text-lg font-black">Tu sesión ya no es válida.</p>
          <a href="/inspector/login" className="mt-4 inline-block rounded-2xl bg-white px-6 py-3 font-black text-[#041E42]">INICIAR SESIÓN</a>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-[#EEF4FF]">
      <InspectorSidebar view={view} onNavigate={navigate} onLogout={handleLogout} />
      <div className="md:pl-64">
        <InspectorTopBar inspector={inspector} />
        <main className="pb-24 md:pb-8">
          {view === INSPECTOR_VIEW.CONSULTA ? (
            <InspectorConsulta history={history} onConsult={consult} onOpenPast={consult} error={consultError} />
          ) : null}
          {view === INSPECTOR_VIEW.RESULTADO && activeResult ? (
            <InspectorResultado
              result={activeResult}
              onNuevaConsulta={() => navigate(INSPECTOR_VIEW.CONSULTA)}
              onFiscalizar={() => goFiscalizar(activeResult.plate, { lockToOverstay: true })}
              onVerEnMapa={() => navigate(INSPECTOR_VIEW.MAPA)}
            />
          ) : null}
          {view === INSPECTOR_VIEW.FISCALIZACION ? (
            <InspectorFiscalizacion
              plate={fiscalizacionPlate}
              lockToOverstay={fiscalizacionLockToOverstay}
              onRegistrado={onFiscalizacionRegistrada}
              onCancelar={() => navigate(fiscalizacionPlate ? INSPECTOR_VIEW.RESULTADO : INSPECTOR_VIEW.FISCALIZACIONES)}
            />
          ) : null}
          {view === INSPECTOR_VIEW.FISCALIZACIONES ? (
            <InspectorFiscalizaciones fiscalizaciones={fiscalizaciones} onNueva={() => goFiscalizar(null)} />
          ) : null}
          {view === INSPECTOR_VIEW.HISTORIAL ? <InspectorHistorial history={history} fiscalizaciones={fiscalizaciones} /> : null}
          {view === INSPECTOR_VIEW.MOROSOS ? <InspectorMorosos onOpenPlate={consult} /> : null}
          {view === INSPECTOR_VIEW.MAPA ? <InspectorMapa /> : null}
          {view === INSPECTOR_VIEW.SYNC ? <InspectorSync /> : null}
          {view === INSPECTOR_VIEW.AJUSTES ? <InspectorAjustes inspector={inspector} onLogout={handleLogout} /> : null}
        </main>
      </div>
      <InspectorBottomNav view={view} onNavigate={navigate} onOpenDrawer={() => setDrawerOpen(true)} />
      <InspectorDrawer open={drawerOpen} view={view} onNavigate={navigate} onLogout={handleLogout} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

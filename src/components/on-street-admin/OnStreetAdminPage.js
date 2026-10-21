"use client";

import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import OnStreetWorkspace from "./OnStreetWorkspace";
import OnStreetLocationsWorkspace from "./OnStreetLocationsWorkspace";
import OnStreetQrCreateWorkspace from "./OnStreetQrCreateWorkspace";
import OnStreetTarifasWorkspace from "./OnStreetTarifasWorkspace";
import OnStreetDashboard from "./OnStreetDashboard";
import OnStreetReports from "./OnStreetReports";
import OnStreetFiscalizaciones from "./OnStreetFiscalizaciones";
import OnStreetInspectores from "./OnStreetInspectores";
import OnStreetProjectsList from "./OnStreetProjectsList";

// Navegación del módulo On Street: vive únicamente en el árbol del Sidebar
// (ver src/config/navigation.js), no como tarjetas dentro de la página.
const TITLES = { dashboard: "Dashboard On Street", sessions: "Sesiones On Street", payments: "Pagos On Street", locations: "Ubicaciones QR", crear: "Crear QR", tarifas: "Configuración / Tarifas", reportes: "Reportes On Street", fiscalizaciones: "Fiscalizaciones On Street", inspectores: "Inspectores On Street", proyectos: "Proyectos On Street" };
const DESCRIPTIONS = { crear: "Crea una nueva ubicación QR para instalar físicamente en un estacionamiento On Street.", tarifas: "Motor tarifario reutilizado, filtrado al contexto On Street." };

// "Volver a la sesión inmediatamente precedente" (2026-08-30, todas las
// páginas de On Street): AppShell ya tiene un mecanismo "← Volver"
// integrado (onBack -> Topbar -> Breadcrumbs, el mismo que usa
// Facturación) -- se activa aquí con router.back() (navegación real de
// historial, nunca un destino fijo). "inspectores" es la única excepción:
// OnStreetInspectores.js ya trae su propio botón "Volver" en el
// encabezado (mismo router.back()), así que no se duplica aquí.
export default function OnStreetAdminPage({ kind }) {
  const router = useRouter();
  const onBack = () => router.back();
  // Dashboard, Reportes, Fiscalizaciones e Inspectores traen su propio
  // encabezado/filtros, así que no se envuelven en el PageHeader genérico
  // como el resto de los kinds.
  if (kind === "dashboard") {
    return (
      <AppShell title={TITLES.dashboard} description="Operación On Street con Webpay" onBack={onBack}>
        <OnStreetDashboard />
      </AppShell>
    );
  }
  if (kind === "reportes") {
    return (
      <AppShell title={TITLES.reportes} description="Operación On Street con Webpay" onBack={onBack}>
        <OnStreetReports />
      </AppShell>
    );
  }
  if (kind === "fiscalizaciones") {
    return (
      <AppShell title={TITLES.fiscalizaciones} description="Operación On Street con Webpay" onBack={onBack}>
        <OnStreetFiscalizaciones />
      </AppShell>
    );
  }
  if (kind === "inspectores") {
    return (
      <AppShell title={TITLES.inspectores} description="Operación On Street con Webpay">
        <OnStreetInspectores />
      </AppShell>
    );
  }
  if (kind === "proyectos") {
    return (
      <AppShell title={TITLES.proyectos} description="Operación On Street con Webpay" onBack={onBack}>
        <OnStreetProjectsList />
      </AppShell>
    );
  }
  return (
    <AppShell title={TITLES[kind]} description="Operación On Street con Webpay">
      <div className="space-y-6">
        <PageHeader title={TITLES[kind]} description={DESCRIPTIONS[kind] || "Operación prepago QR con Webpay"} onBack={onBack} backLabel="Volver" tone="onstreet" />
        {kind === "locations" ? <OnStreetLocationsWorkspace /> : kind === "crear" ? <OnStreetQrCreateWorkspace /> : kind === "tarifas" ? <OnStreetTarifasWorkspace /> : <OnStreetWorkspace kind={kind} />}
      </div>
    </AppShell>
  );
}

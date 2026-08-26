import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import OnStreetWorkspace from "./OnStreetWorkspace";
import OnStreetLocationsWorkspace from "./OnStreetLocationsWorkspace";
import OnStreetQrCreateWorkspace from "./OnStreetQrCreateWorkspace";
import OnStreetTarifasWorkspace from "./OnStreetTarifasWorkspace";
import OnStreetDashboard from "./OnStreetDashboard";
import OnStreetReports from "./OnStreetReports";

// Navegación del módulo On Street: vive únicamente en el árbol del Sidebar
// (ver src/config/navigation.js), no como tarjetas dentro de la página.
const TITLES = { dashboard: "Dashboard On Street", sessions: "Sesiones On Street", payments: "Pagos On Street", locations: "Ubicaciones QR", crear: "Crear QR", tarifas: "Configuración / Tarifas", reportes: "Reportes On Street" };
const DESCRIPTIONS = { crear: "Crea una nueva ubicación QR para instalar físicamente en un estacionamiento On Street.", tarifas: "Motor tarifario reutilizado, filtrado al contexto On Street." };

export default function OnStreetAdminPage({ kind }) {
  // Dashboard y Reportes traen su propio encabezado/filtros (distintos
  // entre sí — visión ejecutiva vs. consulta histórica exportable), así
  // que no se envuelven en el PageHeader genérico como el resto de los
  // kinds.
  if (kind === "dashboard") {
    return (
      <AppShell title={TITLES.dashboard} description="Operación On Street con Webpay">
        <OnStreetDashboard />
      </AppShell>
    );
  }
  if (kind === "reportes") {
    return (
      <AppShell title={TITLES.reportes} description="Operación On Street con Webpay">
        <OnStreetReports />
      </AppShell>
    );
  }
  return (
    <AppShell title={TITLES[kind]} description="Operación On Street con Webpay">
      <div className="space-y-6">
        <PageHeader title={TITLES[kind]} description={DESCRIPTIONS[kind] || "Operación prepago QR con Webpay"} backHref="/" backLabel="Volver al inicio" tone="onstreet" />
        {kind === "locations" ? <OnStreetLocationsWorkspace /> : kind === "crear" ? <OnStreetQrCreateWorkspace /> : kind === "tarifas" ? <OnStreetTarifasWorkspace /> : <OnStreetWorkspace kind={kind} />}
      </div>
    </AppShell>
  );
}

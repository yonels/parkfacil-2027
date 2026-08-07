import { BarChart3, BadgeDollarSign, Building2, Calculator, CreditCard, FileText, Handshake, KeyRound, Layers, MapPinned, RadioTower, ScanLine, ShieldAlert, TicketPercent, Users, Wallet } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/ui/StatCard";
import ModuleCard from "@/components/ui/ModuleCard";
import StatusBadge from "@/components/ui/StatusBadge";

const modules = [
  { title: "Operación", description: "Vista general de la operación y el control diario.", icon: Building2, href: "/operacion", state: "Disponible" },
  { title: "Estacionamientos", description: "Gestión de disponibilidad y control de accesos.", icon: ShieldAlert, href: "/estacionamientos", state: "Disponible" },
  { title: "On Street", description: "Administración de estacionamientos y espacios en vía pública.", icon: MapPinned, href: "/estacionamientos?tipo=ON_STREET", state: "Disponible" },
  { title: "Off Street", description: "Administración de recintos, niveles, zonas y capacidad.", icon: Building2, href: "/estacionamientos?tipo=OFF_STREET", state: "Disponible" },
  { title: "Empresas", description: "Clientes, contratos y estacionamientos asociados.", icon: Users, href: "/empresas", state: "Disponible" },
  { title: "Usuarios", description: "Administradores, operadores y permisos de acceso.", icon: Users, href: "/usuarios", state: "Disponible" },
  { title: "Contratos", description: "Condiciones comerciales y vigencia contractual.", icon: FileText, href: "/contratos", state: "Disponible" },
  { title: "Recaudación", description: "Ingresos, medios de pago y control financiero.", icon: Wallet, href: "/recaudacion", state: "Disponible" },
  { title: "Cupones", description: "Cupones, minutos gratis y beneficios aplicables.", icon: TicketPercent, href: "/cupones", state: "Disponible" },
  { title: "Convenios", description: "Acuerdos comerciales y beneficios para empresas asociadas.", icon: Handshake, href: "/convenios", state: "Disponible" },
  { title: "Facturación", description: "Documentos tributarios, cargos y seguimiento de cobros.", icon: FileText, href: "/recaudacion", state: "Disponible" },
  { title: "Data Entry", description: "Ingreso, salida y cobro operacional de vehículos.", icon: ScanLine, href: "/data-entry", state: "Disponible" },
  { title: "Medios de pago", description: "Configuración y consulta de formas de pago.", icon: CreditCard, href: "/recaudacion#medios-de-pago", state: "Disponible" },
  { title: "Abonados y credenciales", description: "Administración de abonados, vehículos y accesos.", icon: KeyRound, href: "/abonados", state: "Disponible" },
  { title: "Simulador de tarifas", description: "Comparación de escenarios tarifarios sin alterar la tarifa vigente.", icon: Calculator, href: "/simulador-tarifas", state: "Disponible" },
  { title: "Dispositivos", description: "Inventario tecnológico y estado de conexión.", icon: RadioTower, href: "/dispositivos", state: "Disponible" },
  { title: "Monitoreo", description: "Centro operativo para dispositivos y alertas.", icon: RadioTower, href: "/monitoreo", state: "Disponible" },
  { title: "Tarifas", description: "Configura y administra las tarifas de los estacionamientos.", icon: BadgeDollarSign, href: "/tarifas", state: "Disponible" },
  { title: "Planes", description: "Administra los planes comerciales y sus condiciones.", icon: Layers, href: "/tarifas", state: "Disponible" },
];

export default function Home() {
  return (
    <AppShell title="Inicio" description="Acceso principal a las áreas de ParkFacil">
      <div id="centro-control" className="scroll-mt-5 space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Estacionamientos" value="24" description="Demostración visual" icon={Building2} trend="+3% respecto a la última etapa" href="/estacionamientos" />
          <StatCard title="Operación" value="12" description="Módulo base preparado" icon={BarChart3} trend="En revisión" href="/operacion" />
          <StatCard title="Dispositivos" value="86" description="Datos de ejemplo" icon={RadioTower} trend="Sin conexión real" href="/dispositivos" />
          <StatCard title="Alertas" value="4" description="Indicadores de demostración" icon={ShieldAlert} trend="No operativa" href="/notificaciones" />
        </section>

        <section>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#041E42]">Áreas de ParkFacil</h3>
                <p className="mt-2 text-sm text-slate-600">Selecciona un área para acceder directamente a sus funciones.</p>
              </div>
              <StatusBadge variant="positive">Accesos disponibles</StatusBadge>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {modules.map((module) => (
                <ModuleCard key={module.title} title={module.title} description={module.description} icon={module.icon} href={module.href} state={module.state} />
              ))}
            </div>
          </div>

        </section>
      </div>
    </AppShell>
  );
}

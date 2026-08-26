import { redirect } from "next/navigation";
import { BarChart3, BadgeDollarSign, Building2, Calculator, CreditCard, FileText, Handshake, KeyRound, Layers, MapPinned, MessageCircle, MessageCircleQuestion, RadioTower, ReceiptText, ScanLine, ShieldAlert, TicketPercent, Users, Wallet } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/ui/StatCard";
import ModuleCard from "@/components/ui/ModuleCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { ROLES } from "@/lib/auth/permissions.mjs";

const modules = [
  { title: "Operación", description: "Vista general de la operación y el control diario.", icon: Building2, href: "/operacion", state: "Disponible" },
  { title: "Estacionamientos", description: "Gestión de disponibilidad y control de accesos.", icon: ShieldAlert, href: "/estacionamientos", state: "Disponible" },
  { title: "On Street", description: "Administración de estacionamientos y espacios en vía pública.", icon: MapPinned, href: "/estacionamientos?tipo=ON_STREET", state: "Disponible" },
  { title: "Off Street", description: "Administración de recintos, niveles, zonas y capacidad.", icon: Building2, href: "/estacionamientos?tipo=OFF_STREET", state: "Disponible" },
  { title: "Empresas", description: "Clientes, contratos y estacionamientos asociados.", icon: Users, href: "/empresas", state: "Disponible" },
  { title: "Usuarios", description: "Administradores, operadores y permisos de acceso.", icon: Users, href: "/usuarios", state: "Disponible" },
  { title: "Turnos", description: "Crear, editar, modificar y eliminar turnos por estacionamiento.", icon: Building2, href: "/turnos", state: "Disponible" },
  { title: "Contratos", description: "Condiciones comerciales y vigencia contractual.", icon: FileText, href: "/contratos", state: "Disponible" },
  { title: "Recaudación", description: "Ingresos, medios de pago y control financiero.", icon: Wallet, href: "/recaudacion", state: "Disponible" },
  { title: "Cupones", description: "Cupones, minutos gratis y beneficios aplicables.", icon: TicketPercent, href: "/cupones", state: "Disponible" },
  { title: "Convenios", description: "Acuerdos comerciales y beneficios para empresas asociadas.", icon: Handshake, href: "/convenios", state: "Disponible" },
  { title: "Facturación", description: "Prefacturación, documentos, cuenta corriente, cobranza y conciliación de clientes.", icon: ReceiptText, href: "/facturacion", state: "Disponible" },
  { title: "Data Entry", description: "Ingreso, salida y cobro operacional de vehículos.", icon: ScanLine, href: "/data-entry", state: "Disponible" },
  { title: "Medios de pago", description: "Configuración y consulta de formas de pago.", icon: CreditCard, href: "/recaudacion#medios-de-pago", state: "Disponible" },
  { title: "Abonados y credenciales", description: "Administración de abonados, vehículos y accesos.", icon: KeyRound, href: "/abonados", state: "Disponible" },
  { title: "Simulador de tarifas", description: "Comparación de escenarios tarifarios sin alterar la tarifa vigente.", icon: Calculator, href: "/simulador-tarifas", state: "Disponible" },
  { title: "Dispositivos", description: "Inventario tecnológico y estado de conexión.", icon: RadioTower, href: "/dispositivos", state: "Disponible" },
  { title: "Monitoreo", description: "Centro operativo para dispositivos y alertas.", icon: RadioTower, href: "/monitoreo", state: "Disponible" },
  { title: "Tarifas", description: "Configura y administra las tarifas de los estacionamientos.", icon: BadgeDollarSign, href: "/administracion-tarifas", state: "Disponible" },
  { title: "Planes", description: "Administra los planes comerciales y sus condiciones.", icon: Layers, href: "/tarifas", state: "Disponible" },
];

const whatsappUrl = "https://wa.me/56966514044?text=Hola%20ParkFacil%2C%20necesito%20informaci%C3%B3n.";

// company_admin/operator sin ningún producto habilitado: pantalla controlada
// resuelta enteramente en el servidor -- la grilla operacional de abajo
// nunca se renderiza para este caso (no es un overlay ni un ocultamiento por
// CSS, ver §4 de la auditoría de acceso por producto). Reutiliza el mismo
// canal de contacto ya existente en esta página (WhatsApp), no crea uno
// nuevo.
function NoProductsScreen() {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-[#041E42]">No tienes productos ParkFacil habilitados</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Tu empresa actualmente no tiene productos ParkFacil habilitados. Contacta al administrador de tu cuenta para solicitar acceso a Off-Street, On-Street o ambos.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5"><Building2 className="h-3.5 w-3.5" /> Off Street</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5"><MapPinned className="h-3.5 w-3.5" /> On Street</span>
      </div>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#3150D8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
        <MessageCircleQuestion className="h-4 w-4" /> Contactar soporte
      </a>
    </div>
  );
}

export default async function Home() {
  // Resuelto server-side, reutilizando el mismo contexto de autenticación
  // que ya usa /estacionamientos (getCurrentServerContext -- no es un
  // sistema paralelo). proxy.js ya garantiza que solo se llega aquí
  // autenticado, así que el único motivo real de fallo es un error de
  // datos, no de sesión -- por eso el try/catch es defensivo, igual que en
  // esa página.
  let context = null;
  try {
    context = await getCurrentServerContext();
  } catch {
    context = null;
  }
  const isClientRole = context?.role === ROLES.COMPANY_ADMIN || context?.role === ROLES.OPERATOR;
  const enabledProducts = Array.isArray(context?.enabledProducts) ? context.enabledProducts : [];

  if (isClientRole && enabledProducts.length === 0) {
    return (
      <AppShell title="Inicio" description="Acceso principal a las áreas de ParkFacil">
        <div className="flex min-h-[60vh] items-center justify-center">
          <NoProductsScreen />
        </div>
      </AppShell>
    );
  }

  // Un solo producto habilitado: redirección server-side, sin pasar por la
  // grilla genérica ni por ningún estado intermedio en el cliente.
  if (isClientRole && enabledProducts.length === 1) {
    redirect(enabledProducts[0] === "ON_STREET" ? "/on-street-qr" : "/estacionamientos");
  }

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
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar a ParkFacil por WhatsApp"
        className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#20BD5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
      >
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
      </a>
    </AppShell>
  );
}

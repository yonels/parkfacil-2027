"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { pricingRowsToMap } from "@/lib/modulePricing.mjs";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  CarFront,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  LoaderCircle,
  Mail,
  MapPin,
  ParkingSquare,
  Phone,
  Power,
  RadioTower,
  ReceiptText,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";

const modules = [
  { id: "dashboard", name: "Dashboard ejecutivo", description: "Indicadores, recaudación y flujo operacional.", icon: LayoutDashboard, category: "Análisis", color: "blue" },
  { id: "operacion", name: "Operación", description: "Ingresos, salidas, anulaciones y movimientos.", icon: CarFront, category: "Operación", color: "cyan" },
  { id: "estacionamientos", name: "Estacionamientos", description: "Instalaciones, capacidad, niveles y sectores.", icon: ParkingSquare, category: "Operación", color: "indigo" },
  { id: "seguridad", name: "Seguridad", description: "Permisos, controles de acceso y políticas de protección.", icon: ShieldCheck, category: "Seguridad", color: "rose" },
  { id: "tarifas", name: "Tarifas y planes", description: "Reglas de cobro, horarios y planes comerciales.", icon: WalletCards, category: "Comercial", color: "emerald" },
  { id: "simulador", name: "Simulador de tarifas", description: "Escenarios consultivos de precio e ingresos.", icon: Calculator, category: "Comercial", color: "amber" },
  { id: "recaudacion", name: "Recaudación", description: "Transacciones, medios de pago y cierres.", icon: CircleDollarSign, category: "Finanzas", color: "green" },
  { id: "abonados", name: "Abonados y credenciales", description: "Clientes frecuentes y accesos autorizados.", icon: Users, category: "Clientes", color: "violet" },
  { id: "operadores", name: "Operadores y administradores", description: "Usuarios operativos, permisos y responsables del cliente.", icon: UserCog, category: "Administración", color: "indigo" },
  { id: "dispositivos", name: "Dispositivos", description: "Barreras, lectores, cámaras y conectividad.", icon: RadioTower, category: "Tecnología", color: "sky" },
  { id: "reportes", name: "Reportes", description: "Exportación y análisis histórico personalizado.", icon: ReceiptText, category: "Análisis", color: "slate" },
  { id: "alertas", name: "Alertas", description: "Eventos críticos y notificaciones operativas.", icon: Bell, category: "Seguridad", color: "rose" },
];

const clientModuleManagement = {
  id: "gestion-cliente",
  name: "Gestión de módulos",
  description: "Consulta tus módulos contratados y solicita nuevas capacidades.",
  icon: SlidersHorizontal,
  category: "Mi cuenta",
  color: "slate",
};

const moduleCommercial = {
  dashboard: { price: 1.8, benefit: "Visión ejecutiva inmediata para decidir con datos." },
  operacion: { price: 2.4, benefit: "Control diario de movimientos, tickets e incidencias." },
  estacionamientos: { price: 2.1, benefit: "Administra capacidad, instalaciones y estructura operativa." },
  seguridad: { price: 1.6, benefit: "Refuerza permisos, accesos y trazabilidad de seguridad." },
  tarifas: { price: 1.4, benefit: "Centraliza reglas de cobro y planes comerciales." },
  simulador: { price: 1.2, benefit: "Compara escenarios y mejora decisiones tarifarias." },
  recaudacion: { price: 2.2, benefit: "Controla pagos, cierres y conciliación de ingresos." },
  abonados: { price: 1.5, benefit: "Gestiona clientes frecuentes y sus credenciales." },
  operadores: { price: 1.3, benefit: "Administra operadores, responsables y permisos." },
  dispositivos: { price: 1.9, benefit: "Supervisa equipos, conectividad y estado técnico." },
  reportes: { price: 1.1, benefit: "Entrega análisis exportables e históricos personalizados." },
  alertas: { price: 0.9, benefit: "Notifica eventos críticos para reaccionar a tiempo." },
};

const initialClients = [
  {
    id: "ramis",
    name: "Clínica Ramis",
    legalName: "Sociedad Médica Integral Clínica Ramis Ltda.",
    plan: "Enterprise",
    sites: 3,
    users: 18,
    status: "Activo",
    rut: "76.345.890-2",
    contact: "Carolina Muñoz",
    email: "admin@clinicaramis.cl",
    phone: "+56 2 2345 7788",
    billingEmail: "facturacion@clinicaramis.cl",
    modules: ["dashboard", "operacion", "estacionamientos", "seguridad", "tarifas", "simulador", "recaudacion", "abonados", "operadores", "dispositivos"],
  },
  {
    id: "costanera",
    name: "Parking Costanera",
    legalName: "Estacionamientos Costanera SpA",
    plan: "Profesional",
    sites: 2,
    users: 9,
    status: "Activo",
    rut: "77.104.221-9",
    contact: "Diego Silva",
    email: "administracion@costaneraparking.cl",
    phone: "+56 2 2670 1190",
    billingEmail: "pagos@costaneraparking.cl",
    modules: ["dashboard", "operacion", "estacionamientos", "tarifas", "recaudacion", "reportes"],
  },
  {
    id: "centro",
    name: "Parking Centro",
    legalName: "Inversiones Centro Parking Ltda.",
    plan: "Esencial",
    sites: 1,
    users: 4,
    status: "Activo",
    rut: "76.902.118-5",
    contact: "Pablo Rojas",
    email: "contacto@parkingcentro.cl",
    phone: "+56 2 2412 6600",
    billingEmail: "facturacion@parkingcentro.cl",
    modules: ["dashboard", "operacion", "estacionamientos", "tarifas"],
  },
];

function mapPersistentCompany(company, currentClients) {
  const rut = `${company.rutNumero}-${company.rutDv}`;
  const current = currentClients.find((item) => item.rut?.replace(/\D/g, "") === rut.replace(/\D/g, ""))
    || currentClients.find((item) => item.name === company.nombreFantasia);
  return {
    id: current?.id || company.id,
    companyId: company.id,
    name: company.nombreFantasia || company.razonSocial,
    legalName: company.razonSocial,
    plan: company.plan || current?.plan || "Por definir",
    sites: company.estacionamientos?.length || 0,
    users: company.usuarios || 0,
    status: company.estado === "active" ? "Activo" : company.estado === "onboarding" ? "En implementación" : "Inactivo",
    rut,
    contact: company.contactoPrincipal,
    email: company.correo,
    phone: company.telefono,
    address: company.direccion,
    district: company.comuna,
    city: company.ciudad,
    region: company.region,
    country: company.pais,
    billingEmail: current?.billingEmail || company.correo,
    modules: current?.modules || [],
    contract: company.contrato || null,
    userSummary: company.resumenUsuarios || { administradores: 0, operadores: 0 },
  };
}

function contractMoney(value, currency, tax = "") {
  if (value === null || value === undefined) return "Según tarifario web";
  return `${Number(value).toLocaleString("es-CL", { maximumFractionDigits: 4 })} ${currency}${tax ? ` ${tax}` : ""}`;
}

const initialParkings = [
  { id: "PF-001", name: "Clínica Ramis Central", clientId: "ramis", city: "Santiago", address: "Av. Providencia 1840", type: "Edificio", capacity: 320, occupied: 246, devices: 12, manager: "Carolina Muñoz", status: "Activo", created: "12/03/2025" },
  { id: "PF-002", name: "Clínica Ramis Norte", clientId: "ramis", city: "Huechuraba", address: "Av. El Salto 4921", type: "Superficie", capacity: 180, occupied: 91, devices: 8, manager: "Felipe Soto", status: "Activo", created: "08/07/2025" },
  { id: "PF-003", name: "Clínica Ramis Urgencias", clientId: "ramis", city: "Santiago", address: "Los Leones 955", type: "Subterráneo", capacity: 96, occupied: 74, devices: 6, manager: "Andrea Pérez", status: "Inactivo", created: "21/11/2025" },
  { id: "PF-004", name: "Costanera Oriente", clientId: "costanera", city: "Vitacura", address: "Av. Andrés Bello 2711", type: "Subterráneo", capacity: 540, occupied: 418, devices: 16, manager: "Diego Silva", status: "Activo", created: "18/02/2026" },
  { id: "PF-005", name: "Costanera Poniente", clientId: "costanera", city: "Providencia", address: "Nueva Tobalaba 101", type: "Edificio", capacity: 410, occupied: 0, devices: 14, manager: "Marcela Díaz", status: "Baja", created: "04/04/2026" },
  { id: "PF-006", name: "Parking Centro Alameda", clientId: "centro", city: "Santiago", address: "Alameda 1450", type: "Edificio", capacity: 240, occupied: 189, devices: 10, manager: "Pablo Rojas", status: "Activo", created: "19/05/2026" },
];

const initialStaff = [
  { id: "USR-001", name: "Carolina Muñoz", email: "admin@clinicaramis.cl", role: "Administrador", parking: "Todos", status: "Activo" },
  { id: "USR-002", name: "Felipe Soto", email: "felipe.soto@clinicaramis.cl", role: "Administrador", parking: "PF-002", status: "Activo" },
  { id: "USR-003", name: "Andrea Pérez", email: "andrea.perez@clinicaramis.cl", role: "Operador", parking: "PF-001", status: "Activo" },
  { id: "USR-004", name: "Mario López", email: "mario.lopez@clinicaramis.cl", role: "Operador", parking: "PF-001", status: "Activo" },
  { id: "USR-005", name: "Paula Reyes", email: "paula.reyes@clinicaramis.cl", role: "Operador", parking: "PF-002", status: "Activo" },
  { id: "USR-006", name: "Tomás Vidal", email: "tomas.vidal@clinicaramis.cl", role: "Operador", parking: "PF-003", status: "Activo" },
];

const tones = {
  blue: "bg-blue-50 text-blue-700",
  cyan: "bg-cyan-50 text-cyan-700",
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-green-50 text-green-700",
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
  slate: "bg-slate-100 text-slate-700",
  rose: "bg-rose-50 text-rose-700",
};

const moduleRoutes = {
  dashboard: "/modelo-dashboard",
  operacion: "/operacion",
  estacionamientos: "/estacionamientos",
  seguridad: "/seguridad",
  tarifas: "/tarifas",
  simulador: "/simulador-tarifas",
  abonados: "/abonados",
  operadores: "/usuarios",
  dispositivos: "/dispositivos",
};

const moduleMetrics = {
  dashboard: [["Recaudación mensual", "$2.478.180"], ["Transacciones", "1.388"], ["Ocupación promedio", "88%"]],
  operacion: [["Ingresos hoy", "41"], ["Salidas hoy", "39"], ["Pendientes", "6"]],
  estacionamientos: [["Instalaciones", "3"], ["Capacidad total", "596"], ["Plazas ocupadas", "411"]],
  seguridad: [["Controles activos", "8"], ["Accesos autorizados", "207"], ["Alertas abiertas", "3"]],
  tarifas: [["Tarifas activas", "4"], ["Planes vigentes", "3"], ["Ticket promedio", "$1.786"]],
  simulador: [["Tarifa actual", "$1.500"], ["Escenario sugerido", "$1.700"], ["Potencial estimado", "+10,6%"]],
  recaudacion: [["Total mensual", "$2.478.180"], ["Efectivo", "$545.670"], ["Crédito", "$1.932.510"]],
  abonados: [["Abonados activos", "184"], ["Credenciales", "207"], ["Por vencer", "12"]],
  operadores: [["Usuarios activos", "6"], ["Administradores", "2"], ["Operadores", "4"]],
  dispositivos: [["Dispositivos", "26"], ["En línea", "24"], ["Con alertas", "2"]],
  reportes: [["Reportes disponibles", "12"], ["Generados este mes", "38"], ["Programados", "4"]],
  alertas: [["Alertas abiertas", "3"], ["Críticas", "1"], ["Resueltas hoy", "7"]],
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#3150D8] text-xl font-black text-white shadow-lg shadow-blue-950/20">P</span>
      <div>
        <p className="font-bold tracking-tight text-[#041E42]">ParkFacil</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Plataforma 2027</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("client");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [email, setEmail] = useState("admin@clinicaramis.cl");
  const [password, setPassword] = useState("Cliente2027");

  const changeRole = (nextRole) => {
    setRole(nextRole);
    setEmail(nextRole === "root" ? "root@parkfacil.cl" : "admin@clinicaramis.cl");
    setPassword(nextRole === "root" ? "Root2027" : "Cliente2027");
  };

  return (
    <main className="min-h-screen bg-[#F4F7FB] p-4 sm:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-300/30 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-[#041E42] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full border-[60px] border-[#3150D8]/35" />
          <div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-[#2EA8FF]/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl font-black text-[#3150D8]">P</span>
              <span className="text-xl font-bold">ParkFacil 2027</span>
            </div>
          </div>
          <div className="relative max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" /> Plataforma modular
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight">Cada cliente recibe exactamente lo que necesita.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-300">Una experiencia independiente para administrar licencias, habilitar soluciones y operar cada estacionamiento con acceso seguro.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[["10", "Módulos"], ["3", "Clientes demo"], ["2", "Perfiles"]].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-2xl font-bold">{value}</p>
                <p className="mt-1 text-xs text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-9 flex items-center justify-between lg:hidden"><Brand /><Link href="/" className="text-sm font-semibold text-[#3150D8]">Volver</Link></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#3150D8]">Acceso seguro</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#041E42]">Bienvenido a ParkFacil</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Selecciona el perfil para revisar ambos recorridos del prototipo.</p>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5">
              <button type="button" onClick={() => changeRole("client")} className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${role === "client" ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500"}`}>
                Administrador cliente
              </button>
              <button type="button" onClick={() => changeRole("root")} className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${role === "root" ? "bg-[#041E42] text-white shadow-sm" : "text-slate-500"}`}>
                ParkFacil Root
              </button>
            </div>

            <form className="mt-7 space-y-4" onSubmit={(event) => { event.preventDefault(); onLogin(role); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#041E42]">Correo electrónico</span>
                <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-[#3150D8] focus-within:ring-4 focus-within:ring-blue-100">
                  <Mail className="h-5 w-5 text-slate-400" />
                  <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none" />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#041E42]">Contraseña</span>
                <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-[#3150D8] focus-within:ring-4 focus-within:ring-blue-100">
                  <KeyRound className="h-5 w-5 text-slate-400" />
                  <input required type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none" />
                  <button type="button" onClick={() => setPasswordVisible((value) => !value)} className="text-slate-400 hover:text-[#3150D8]" aria-label="Mostrar u ocultar contraseña">
                    {passwordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </span>
              </label>
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-500"><input type="checkbox" defaultChecked className="accent-[#3150D8]" /> Recordar acceso</label>
                <button type="button" className="font-semibold text-[#3150D8]">Recuperar contraseña</button>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3150D8] px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-[#2442C5]">
                Ingresar como {role === "root" ? "Root" : "cliente"} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              <b>Prototipo:</b> las credenciales están precargadas y el acceso no consulta todavía la autenticación productiva.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Header({ role, onLogout, onSwitchRole }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        <Brand />
        <div className="flex items-center gap-2">
          {role === "root" ? <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#3150D8] hover:border-[#3150D8] hover:bg-[#EEF4FF]" aria-label="Volver al panel principal de operaciones">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link> : null}
          {role === "client" ? <button type="button" onClick={onSwitchRole} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#3150D8] hover:border-[#3150D8] hover:bg-[#EEF4FF]" aria-label="Volver a la administración de ParkFacil">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button> : null}
          {role === "root" ? <button type="button" onClick={onSwitchRole} className="hidden rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#3150D8] hover:text-[#3150D8] sm:block">
            Ver como cliente
          </button> : null}
          <span className={`rounded-full px-3 py-2 text-xs font-bold ${role === "root" ? "bg-[#041E42] text-cyan-100" : "bg-blue-50 text-[#3150D8]"}`}>
            {role === "root" ? "ParkFacil Root" : "Cliente administrador"}
          </span>
          <button type="button" onClick={onLogout} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Cerrar sesión"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </header>
  );
}

function RootWorkspace({ clients, setClients, pricing, setPricing, pricingAccess, onSavePricing, onLogout, onSwitchRole, onEnterClient }) {
  const [selectedId, setSelectedId] = useState(clients[0].id);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [parkings, setParkings] = useState(initialParkings);
  const [parkingQuery, setParkingQuery] = useState("");
  const [parkingStatus, setParkingStatus] = useState("Todos");
  const [parkingSort, setParkingSort] = useState({ key: "name", direction: "asc" });
  const [parkingDetail, setParkingDetail] = useState(null);
  const [parkingToRemove, setParkingToRemove] = useState(null);
  const [clientDraft, setClientDraft] = useState(null);
  const [clientSave, setClientSave] = useState({ saving: false, error: "" });
  const selected = clients.find((client) => client.id === selectedId);
  const filteredModules = modules.filter((module) => `${module.name} ${module.category}`.toLowerCase().includes(query.toLowerCase()));
  const visibleParkings = useMemo(() => parkings
    .filter((parking) => parkingStatus === "Todos" || parking.status === parkingStatus)
    .filter((parking) => {
      const clientName = clients.find((client) => client.id === parking.clientId || client.companyId === parking.clientId)?.name ?? "";
      return `${parking.id} ${parking.name} ${parking.city} ${clientName}`.toLowerCase().includes(parkingQuery.toLowerCase());
    })
    .sort((left, right) => {
      const comparison = typeof left[parkingSort.key] === "number"
        ? left[parkingSort.key] - right[parkingSort.key]
        : String(left[parkingSort.key]).localeCompare(String(right[parkingSort.key]), "es", { numeric: true });
      return parkingSort.direction === "asc" ? comparison : -comparison;
    }), [clients, parkingQuery, parkingSort, parkingStatus, parkings]);

  useEffect(() => {
    let active = true;
    fetch("/api/estacionamientos", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible cargar los estacionamientos.");
        if (!active || !Array.isArray(body.data)) return;
        setParkings(body.data.map((parking) => ({
          id: parking.code,
          databaseId: parking.id,
          name: parking.name,
          clientId: parking.companyId,
          city: parking.city,
          address: parking.address,
          type: parking.type === "ON_STREET" ? "On Street" : "Off Street",
          capacity: parking.metrics?.capacity || 0,
          occupied: parking.metrics?.occupied || 0,
          devices: 0,
          manager: "Administrador de empresa",
          status: parking.status === "ACTIVE" ? "Activo" : parking.status === "INACTIVE" ? "Inactivo" : parking.status === "DRAFT" ? "Borrador" : "En configuración",
          created: "Registro persistente",
        })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const sortParking = (key) => setParkingSort((current) => ({
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  }));
  const toggleParkingStatus = (parkingId) => setParkings((current) => current.map((parking) => parking.id === parkingId
    ? { ...parking, status: parking.status === "Activo" ? "Inactivo" : "Activo", occupied: parking.status === "Activo" ? 0 : parking.occupied }
    : parking));
  const removeParking = () => {
    setParkings((current) => current.map((parking) => parking.id === parkingToRemove.id ? { ...parking, status: "Baja", occupied: 0 } : parking));
    setParkingToRemove(null);
  };
  const saveClient = async (event) => {
    event.preventDefault();
    setClientSave({ saving: true, error: "" });
    try {
      const response = await authenticatedFetch(`/api/empresas/${clientDraft.companyId || clientDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientDraft.name,
          legalName: clientDraft.legalName,
          contact: clientDraft.contact,
          email: clientDraft.email,
          phone: clientDraft.phone,
          status: clientDraft.status,
          plan: clientDraft.plan,
          contract: clientDraft.contract ? {
            id: clientDraft.contract.id,
            currency: clientDraft.contract.moneda,
            taxLabel: clientDraft.contract.impuesto,
            monthlyValue: clientDraft.contract.valorMensual,
            startsOn: clientDraft.contract.fechaInicio,
            endsOn: clientDraft.contract.fechaTermino,
            automaticRenewal: clientDraft.contract.renovacionAutomatica,
            nonRenewalNoticeDays: clientDraft.contract.avisoNoRenovacionDias,
            annualDiscountPercent: clientDraft.contract.descuentoAnualPorcentaje,
            paymentDueDays: clientDraft.contract.plazoPagoDias,
            reactivationValue: clientDraft.contract.valorReactivacion,
            equipmentPenaltyValue: clientDraft.contract.multaEquipo,
          } : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible guardar los cambios.");
      const updated = mapPersistentCompany(body.data, clients);
      setClients((current) => current.map((client) => client.id === clientDraft.id ? { ...client, ...updated } : client));
      setClientDraft(null);
      setClientSave({ saving: false, error: "" });
    } catch (error) {
      setClientSave({ saving: false, error: error.message });
    }
  };

  const toggleModule = (moduleId) => {
    setSaved(false);
    setClients((current) => current.map((client) => client.id !== selectedId ? client : {
      ...client,
      modules: client.modules.includes(moduleId) ? client.modules.filter((id) => id !== moduleId) : [...client.modules, moduleId],
    }));
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <Header role="root" onLogout={onLogout} onSwitchRole={onSwitchRole} />
      <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-7">
        <section className="flex flex-col gap-5 overflow-hidden rounded-[1.75rem] bg-[#041E42] p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Administración central</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Clientes y módulos contratados</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Configura la experiencia de cada organización sin afectar a los demás clientes.</p>
          </div>
          <div className="space-y-3 sm:min-w-[390px]">
            <div className="flex justify-end">
              <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white px-4 py-2 text-sm font-bold text-[#3150D8] shadow-sm transition hover:bg-blue-50">
                <ArrowLeft className="h-4 w-4" /> Volver
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[[clients.length, "Clientes"], [modules.length, "Módulos"], [clients.reduce((total, client) => total + client.modules.length, 0), "Licencias"]].map(([value, label]) => <div key={label} className="rounded-2xl bg-white/10 p-3 text-center"><p className="text-xl font-bold">{value}</p><p className="mt-0.5 text-[11px] text-slate-300">{label}</p></div>)}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#041E42]"><Building2 className="h-5 w-5 text-[#3150D8]" />Empresas registradas</h2>
              <p className="mt-1 text-sm text-slate-500">Todas las empresas se muestran aunque todavía no tengan estacionamientos.</p>
            </div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#3150D8]">{clients.length} empresas</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-[#E2F0D9] text-xs uppercase tracking-[0.06em] text-[#041E42]">
                <tr>
                  <th className="border border-slate-300 px-4 py-3 font-bold">Empresa</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold">RUT</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold">Estado</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold">Contrato</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold">Moneda</th>
                  <th className="border border-slate-300 px-4 py-3 text-center font-bold">Estacionamientos</th>
                  <th className="border border-slate-300 px-4 py-3 text-center font-bold">Administrador</th>
                  <th className="border border-slate-300 px-4 py-3 text-center font-bold">Operadores</th>
                  <th className="border border-slate-300 px-4 py-3 text-right font-bold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((company, index) => (
                  <tr key={`company-row-${company.id}`} className={`${index % 2 ? "bg-slate-50" : "bg-white"} hover:bg-[#EEF4FF]`}>
                    <td className="border border-slate-200 px-4 py-3"><p className="font-bold text-[#041E42]">{company.name}</p><p className="mt-0.5 text-xs text-slate-500">{company.legalName}</p></td>
                    <td className="border border-slate-200 px-4 py-3 font-semibold text-[#3150D8]">{company.rut}</td>
                    <td className="border border-slate-200 px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${company.status === "Activo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{company.status}</span></td>
                    <td className="border border-slate-200 px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${company.contract ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{company.contract ? "Con contrato" : "Sin contrato"}</span>{company.contract ? <p className="mt-1 text-xs text-slate-500">{company.contract.numero}</p> : null}</td>
                    <td className="border border-slate-200 px-4 py-3 font-semibold">{company.contract?.moneda || "—"}</td>
                    <td className="border border-slate-200 px-4 py-3 text-center font-semibold tabular-nums">{company.sites}</td>
                    <td className="border border-slate-200 px-4 py-3 text-center font-semibold tabular-nums">{company.userSummary?.administradores || 0}</td>
                    <td className="border border-slate-200 px-4 py-3 text-center font-semibold tabular-nums">{company.userSummary?.operadores || 0}</td>
                    <td className="border border-slate-200 px-4 py-3 text-right"><button type="button" onClick={() => { setSelectedId(company.id); document.getElementById("company-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="rounded-full border border-[#3150D8] bg-white px-3 py-2 text-xs font-bold text-[#3150D8] hover:bg-[#EEF4FF]">Ver empresa</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#041E42]"><FileSpreadsheet className="h-5 w-5 text-emerald-600" />Inventario global de estacionamientos</h2>
              <p className="mt-1 text-sm text-slate-500">Vista Root de todas las instalaciones registradas en ParkFacil.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={parkingQuery} onChange={(event) => setParkingQuery(event.target.value)} placeholder="Buscar código, nombre o cliente" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
              <label className="relative">
                <select value={parkingStatus} onChange={(event) => setParkingStatus(event.target.value)} className="h-full min-w-36 appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-slate-600 outline-none">
                  {["Todos", "Activo", "Inactivo", "Baja"].map((status) => <option key={status}>{status}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
            <span><b className="text-[#041E42]">{parkings.length}</b> registrados</span>
            <span><b className="text-emerald-700">{parkings.filter((item) => item.status === "Activo").length}</b> activos</span>
            <span><b className="text-amber-700">{parkings.filter((item) => item.status === "Inactivo").length}</b> inactivos</span>
            <span><b className="text-rose-700">{parkings.filter((item) => item.status === "Baja").length}</b> dados de baja</span>
            <span className="sm:ml-auto">Selecciona un encabezado para ordenar</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="bg-[#041E42] text-[11px] uppercase tracking-[0.08em] text-white">
                <tr>
                  {[
                    ["id", "Código"], ["name", "Estacionamiento"], ["clientId", "Cliente"], ["city", "Ciudad"], ["type", "Tipo"],
                    ["capacity", "Capacidad"], ["occupied", "Ocupadas"], ["devices", "Dispositivos"], ["status", "Estado"],
                  ].map(([key, label]) => (
                    <th key={key} className="border-r border-white/10 p-0 last:border-r-0">
                      <button type="button" onClick={() => sortParking(key)} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left font-bold hover:bg-white/10">
                        {label}<span className={parkingSort.key === key ? "text-cyan-200" : "text-slate-500"}>{parkingSort.key === key ? (parkingSort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-right font-bold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleParkings.map((parking) => {
                  const owner = clients.find((client) => client.id === parking.clientId || client.companyId === parking.clientId);
                  const occupancy = parking.capacity ? Math.round((parking.occupied / parking.capacity) * 100) : 0;
                  return (
                    <tr key={parking.id} className={`border-b border-slate-100 last:border-b-0 ${parking.status === "Baja" ? "bg-slate-50 text-slate-400" : "hover:bg-blue-50/40"}`}>
                      <td className="px-4 py-3 font-bold text-[#3150D8]">{parking.id}</td>
                      <td className="px-4 py-3"><p className="font-bold text-[#041E42]">{parking.name}</p><p className="mt-0.5 max-w-56 truncate text-xs text-slate-400">{parking.address}</p></td>
                      <td className="px-4 py-3 font-medium">{owner?.name}</td>
                      <td className="px-4 py-3">{parking.city}</td>
                      <td className="px-4 py-3">{parking.type}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{parking.capacity}</td>
                      <td className="px-4 py-3"><div className="flex items-center justify-between gap-2"><span className="tabular-nums">{parking.occupied}</span><span className="text-xs text-slate-400">{occupancy}%</span></div><div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#3150D8]" style={{ width: `${occupancy}%` }} /></div></td>
                      <td className="px-4 py-3 text-center tabular-nums">{parking.devices}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${parking.status === "Activo" ? "bg-emerald-50 text-emerald-700" : parking.status === "Inactivo" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{parking.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setParkingDetail(parking)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-[#3150D8] hover:bg-blue-50"><Eye className="h-3.5 w-3.5" /> Ver</button>
                          <button type="button" onClick={() => onEnterClient(owner?.id || parking.clientId, parking.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2.5 py-2 text-xs font-bold text-[#3150D8] hover:bg-[#DCE8FF]"><LogIn className="h-3.5 w-3.5" /> Entrar</button>
                          {parking.status !== "Baja" ? <>
                            <button type="button" onClick={() => toggleParkingStatus(parking.id)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold ${parking.status === "Activo" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}><Power className="h-3.5 w-3.5" />{parking.status === "Activo" ? "Desactivar" : "Activar"}</button>
                            <button type="button" onClick={() => setParkingToRemove(parking)} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" aria-label={`Dar de baja ${parking.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                          </> : <span className="px-2 py-2 text-xs font-semibold text-slate-400">Sin operación</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleParkings.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No existen estacionamientos que coincidan con la búsqueda.</div> : null}
        </section>

        <div id="company-detail" className="grid min-w-0 scroll-mt-24 gap-5 xl:grid-cols-[330px_1fr]">
          <aside className="self-start overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm xl:sticky xl:top-24">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between"><div><h2 className="font-bold text-[#041E42]">Organizaciones</h2><p className="text-xs text-slate-500">Selecciona un cliente</p></div><Building2 className="h-5 w-5 text-[#3150D8]" /></div>
            </div>
            <div className="space-y-2 p-3">
              {clients.map((client) => (
                <button key={client.id} type="button" onClick={() => { setSelectedId(client.id); setSaved(false); }} className={`w-full rounded-2xl border p-3 text-left transition ${selectedId === client.id ? "border-[#3150D8] bg-[#EEF4FF] shadow-sm" : "border-transparent hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${selectedId === client.id ? "bg-[#3150D8] text-white" : "bg-slate-100 text-slate-600"}`}>{client.name.slice(0, 2).toUpperCase()}</span>
                    <span className="flex-1"><span className="block text-sm font-bold text-[#041E42]">{client.name}</span><span className="mt-0.5 block text-xs text-slate-500">{client.contract ? "Con contrato" : "Sin contrato"} · {client.modules.length} módulos</span></span>
                    <span className={`mt-1 h-2 w-2 rounded-full ${client.status === "Activo" ? "bg-emerald-500" : client.status === "Suspendido" ? "bg-amber-500" : "bg-rose-500"}`} />
                  </div>
                </button>
              ))}
              <button type="button" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-xs font-bold text-slate-500 hover:border-[#3150D8] hover:text-[#3150D8]">
                <Building2 className="h-4 w-4" /> Agregar organización
              </button>
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#041E42] text-lg font-bold text-white">{selected.name.slice(0, 2).toUpperCase()}</span>
                  <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-[#041E42]">{selected.name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selected.status === "Activo" ? "bg-emerald-50 text-emerald-700" : selected.status === "Suspendido" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{selected.status}</span></div><p className="mt-1 text-sm text-slate-500">{selected.legalName}</p></div>
                </div>
                <button type="button" onClick={() => { setClientSave({ saving: false, error: "" }); setClientDraft({ ...selected, contract: selected.contract ? { ...selected.contract } : null }); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-[#3150D8] hover:text-[#3150D8]"><Settings2 className="h-4 w-4" /> Configurar cliente</button>
              </div>
              <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4">
                {[["Plan", selected.plan], ["Estacionamientos", selected.sites], ["Usuarios", selected.users], ["Módulos activos", `${selected.modules.length} de ${modules.length}`]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-[#041E42]">{value}</p></div>)}
              </div>
              <div className={`mt-4 rounded-2xl border p-4 ${selected.contract ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Situación contractual</p>
                    <p className="mt-1 font-bold text-[#041E42]">{selected.contract ? `Con contrato · ${selected.contract.numero}` : "Sin contrato"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${selected.contract ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{selected.contract ? "CON CONTRATO" : "SIN CONTRATO"}</span>
                </div>
                {selected.contract ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Moneda contractual", `${selected.contract.moneda} ${selected.contract.impuesto || ""}`.trim()],
                    ["Valor mensual", contractMoney(selected.contract.valorMensual, selected.contract.moneda, selected.contract.impuesto)],
                    ["Vigencia", `${selected.contract.fechaInicio} al ${selected.contract.fechaTermino}`],
                    ["Renovación", selected.contract.renovacionAutomatica ? `Automática · aviso ${selected.contract.avisoNoRenovacionDias} días` : "No automática"],
                    ["Descuento pago anual", `${selected.contract.descuentoAnualPorcentaje ?? 0}%`],
                    ["Plazo de pago", `${selected.contract.plazoPagoDias ?? "—"} días`],
                    ["Reactivación", contractMoney(selected.contract.valorReactivacion, selected.contract.moneda, selected.contract.impuesto)],
                    ["Multa por equipo", contractMoney(selected.contract.multaEquipo, selected.contract.moneda, selected.contract.impuesto)],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-white bg-white/80 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-[#041E42]">{value}</p></div>)}
                  <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Fuente: {selected.contract.documentoFuente}. El valor mensual no se inventa cuando el contrato remite al tarifario web.</p>
                </div> : <p className="mt-2 text-sm text-amber-800">La empresa está registrada, pero no tiene un contrato asociado.</p>}
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div><h2 className="flex items-center gap-2 text-lg font-bold text-[#041E42]"><SlidersHorizontal className="h-5 w-5 text-[#3150D8]" />Asignación de módulos</h2><p className="mt-1 text-sm text-slate-500">Los cambios determinan qué funciones verá el cliente al iniciar sesión.</p></div>
                <label className="flex min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulo" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {filteredModules.map((module) => {
                  const Icon = module.icon;
                  const enabled = selected.modules.includes(module.id);
                  return (
                    <button key={module.id} type="button" role="switch" aria-checked={enabled} onClick={() => toggleModule(module.id)} className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition ${enabled ? "border-[#BFD2FF] bg-[#F8FAFF]" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[module.color]}`}><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-bold text-[#041E42]">{module.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{module.category}</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">{module.description}</span></span>
                      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-[#3150D8]" : "bg-slate-200"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} /></span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500"><b className="text-[#041E42]">{selected.modules.length} módulos</b> estarán disponibles en el próximo acceso del cliente.</p>
                <button type="button" onClick={() => setSaved(true)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${saved ? "bg-emerald-600" : "bg-[#3150D8] hover:bg-[#2442C5]"}`}>
                  {saved ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{saved ? "Configuración guardada" : "Guardar asignación"}
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-[#041E42]"><CircleDollarSign className="h-5 w-5 text-emerald-700" />Tarifario de módulos adicionales</h2><p className="mt-1 text-sm text-slate-500">Precios mensuales editables, expresados en UF y aplicables a nuevas contrataciones.</p></div><span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">UF mensual</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#041E42] text-white"><tr><th className="px-4 py-3 font-semibold">Módulo</th><th className="px-4 py-3 font-semibold">Descripción comercial</th><th className="px-4 py-3 text-center font-semibold">Valor adicional</th><th className="px-4 py-3 font-semibold">Estado cliente</th></tr></thead>
                  <tbody>{modules.map((module) => {
                    const enabled = selected.modules.includes(module.id);
                    return <tr key={`price-${module.id}`} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50"><td className="px-4 py-3 font-bold text-[#041E42]">{module.name}</td><td className="px-4 py-3 text-xs text-slate-600">{moduleCommercial[module.id]?.benefit}</td><td className="px-4 py-3"><label className={`mx-auto flex w-28 items-center overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-[#3150D8] ${!pricingAccess.canEdit ? "opacity-70" : ""}`}><input type="number" min="0" max="10000" step="0.01" disabled={!pricingAccess.canEdit || pricingAccess.loading || pricingAccess.saving} value={pricing[module.id] ?? 0} onChange={(event) => setPricing((current) => ({ ...current, [module.id]: Math.max(0, Number(event.target.value)) }))} className="min-w-0 flex-1 px-3 py-2 text-right font-bold text-[#041E42] outline-none disabled:cursor-not-allowed disabled:bg-slate-100" /><span className="pr-3 text-xs font-bold text-[#3150D8]">UF</span></label></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Contratado" : "Disponible"}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-amber-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs text-amber-800">El valor en pesos dependerá de la UF vigente al momento de la facturación.</p>{pricingAccess.error ? <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{pricingAccess.error}</p> : null}{pricingAccess.saved ? <p role="status" className="mt-1 text-xs font-semibold text-emerald-700">Tarifario guardado y auditado.</p> : null}{!pricingAccess.canEdit && !pricingAccess.loading ? <p className="mt-1 text-xs font-semibold text-slate-600">Solo un Administrador de Plataforma puede modificar estos valores.</p> : null}</div>
                {pricingAccess.canEdit ? <button type="button" onClick={onSavePricing} disabled={pricingAccess.loading || pricingAccess.saving} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">{pricingAccess.saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{pricingAccess.saving ? "Guardando…" : "Guardar tarifario"}</button> : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      {parkingDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setParkingDetail(null); }}>
          <section className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
            <header className="flex items-start justify-between bg-[#041E42] p-5 text-white">
              <div className="flex gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><ParkingSquare className="h-5 w-5 text-cyan-200" /></span><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">{parkingDetail.id} · Ficha completa</p><h2 className="mt-1 text-xl font-bold">{parkingDetail.name}</h2></div></div>
              <button type="button" onClick={() => setParkingDetail(null)} className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </header>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {[
                ["Cliente", clients.find((client) => client.id === parkingDetail.clientId)?.legalName],
                ["Estado operacional", parkingDetail.status],
                ["Dirección", `${parkingDetail.address}, ${parkingDetail.city}`],
                ["Tipo de instalación", parkingDetail.type],
                ["Capacidad total", `${parkingDetail.capacity} plazas`],
                ["Ocupación actual", `${parkingDetail.occupied} vehículos`],
                ["Dispositivos asociados", parkingDetail.devices],
                ["Administrador responsable", parkingDetail.manager],
                ["Fecha de alta", parkingDetail.created],
                ["Código interno", parkingDetail.id],
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-[#041E42]">{value}</p></div>)}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs text-slate-500"><MapPin className="h-4 w-4 text-[#3150D8]" />Acceso Root a configuración, módulos e historial.</p>
              <button type="button" onClick={() => { onEnterClient(parkingDetail.clientId, parkingDetail.id); setParkingDetail(null); }} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-xs font-bold text-white"><LogIn className="h-4 w-4" />Ingresar a plataforma cliente</button>
            </footer>
          </section>
        </div>
      ) : null}

      {parkingToRemove ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/65 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-700"><Trash2 className="h-6 w-6" /></span>
            <h2 className="mt-4 text-xl font-bold text-[#041E42]">Dar de baja estacionamiento</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Se suspenderá la operación de <b className="text-[#041E42]">{parkingToRemove.name}</b>. La información histórica se conservará para auditoría.</p>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">La baja no elimina registros ni transacciones. Requerirá autorización para reactivarse.</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setParkingToRemove(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">Cancelar</button>
              <button type="button" onClick={removeParking} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700">Confirmar baja</button>
            </div>
          </section>
        </div>
      ) : null}

      {clientDraft ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041E42]/65 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center">
            <form onSubmit={saveClient} className="w-full max-w-4xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
              <header className="flex items-start justify-between bg-[#041E42] p-5 text-white">
                <div className="flex gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Settings2 className="h-5 w-5 text-cyan-200" /></span>
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Control total Root</p><h2 className="mt-1 text-xl font-bold">Configuración del cliente</h2><p className="mt-1 text-xs text-slate-300">Los módulos se administran en el panel principal.</p></div>
                </div>
                <button type="button" onClick={() => setClientDraft(null)} className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              </header>

              <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5 sm:p-6">
                <fieldset>
                  <legend className="flex items-center gap-2 text-sm font-bold text-[#041E42]"><Building2 className="h-4 w-4 text-[#3150D8]" />Identificación de la organización</legend>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {[
                      ["name", "Nombre comercial", "text"],
                      ["legalName", "Razón social", "text"],
                      ["rut", "RUT", "text"],
                      ["contact", "Contacto principal", "text"],
                    ].map(([key, label, type]) => (
                      <label key={key} className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input required type={type} value={clientDraft[key]} onChange={(event) => setClientDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#041E42] outline-none focus:border-[#3150D8] focus:ring-4 focus:ring-blue-100" /></label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="border-t border-slate-100 pt-5">
                  <legend className="flex items-center gap-2 text-sm font-bold text-[#041E42]"><Mail className="h-4 w-4 text-[#3150D8]" />Contacto y facturación</legend>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {[
                      ["email", "Correo de acceso", "email"],
                      ["phone", "Teléfono", "text"],
                      ["billingEmail", "Correo de facturación", "email"],
                    ].map(([key, label, type]) => (
                      <label key={key} className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input required type={type} value={clientDraft[key]} onChange={(event) => setClientDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#041E42] outline-none focus:border-[#3150D8] focus:ring-4 focus:ring-blue-100" /></label>
                    ))}
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Restablecer acceso</span><button type="button" className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-[#3150D8] hover:bg-blue-50"><KeyRound className="h-4 w-4" />Enviar nueva contraseña</button></label>
                  </div>
                </fieldset>

                <fieldset className="border-t border-slate-100 pt-5">
                  <legend className="flex items-center gap-2 text-sm font-bold text-[#041E42]"><ShieldCheck className="h-4 w-4 text-[#3150D8]" />Plan, estado y límites</legend>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Plan contratado</span><select value={clientDraft.plan} onChange={(event) => setClientDraft((current) => ({ ...current, plan: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]">{["Por definir", "Esencial", "Profesional", "Enterprise", "Personalizado"].map((plan) => <option key={plan}>{plan}</option>)}</select></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Estado del cliente</span><select value={clientDraft.status} onChange={(event) => setClientDraft((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]">{["Activo", "Suspendido", "Baja"].map((status) => <option key={status}>{status}</option>)}</select></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Límite estacionamientos</span><input min="0" type="number" value={clientDraft.sites} onChange={(event) => setClientDraft((current) => ({ ...current, sites: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Límite usuarios</span><input min="0" type="number" value={clientDraft.users} onChange={(event) => setClientDraft((current) => ({ ...current, users: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]" /></label>
                  </div>
                </fieldset>

                {clientDraft.contract ? <fieldset className="border-t border-slate-100 pt-5">
                  <legend className="flex items-center gap-2 text-sm font-bold text-[#041E42]"><ReceiptText className="h-4 w-4 text-emerald-700" />Condiciones del contrato</legend>
                  <p className="mt-1 text-xs text-slate-500">Los cambios se guardan en Supabase y modifican la ficha contractual visible para Root.</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Moneda</span><select value={clientDraft.contract.moneda || "UF"} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, moneda: event.target.value } }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]"><option>UF</option><option>CLP</option><option>USD</option></select></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Impuesto</span><input value={clientDraft.contract.impuesto || ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, impuesto: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Valor mensual</span><input required min="0" step="0.01" type="number" value={clientDraft.contract.valorMensual ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, valorMensual: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Descuento anual (%)</span><input min="0" max="100" step="0.01" type="number" value={clientDraft.contract.descuentoAnualPorcentaje ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, descuentoAnualPorcentaje: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Inicio de vigencia</span><input required type="date" value={clientDraft.contract.fechaInicio || ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, fechaInicio: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Término de vigencia</span><input required type="date" value={clientDraft.contract.fechaTermino || ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, fechaTermino: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Aviso no renovación (días)</span><input min="0" type="number" value={clientDraft.contract.avisoNoRenovacionDias ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, avisoNoRenovacionDias: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="flex items-end"><span className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={Boolean(clientDraft.contract.renovacionAutomatica)} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, renovacionAutomatica: event.target.checked } }))} className="accent-[#3150D8]" />Renovación automática</span></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Plazo de pago (días)</span><input min="0" type="number" value={clientDraft.contract.plazoPagoDias ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, plazoPagoDias: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Reactivación</span><input min="0" step="0.01" type="number" value={clientDraft.contract.valorReactivacion ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, valorReactivacion: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Multa por equipo</span><input min="0" step="0.01" type="number" value={clientDraft.contract.multaEquipo ?? ""} onChange={(event) => setClientDraft((current) => ({ ...current, contract: { ...current.contract, multaEquipo: event.target.value } }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" /></label>
                  </div>
                </fieldset> : null}

                {clientSave.error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{clientSave.error}</p> : null}

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                  <b>Recomendación para producción:</b> cada modificación Root debe registrar valor anterior, valor nuevo, usuario responsable, fecha, motivo y dirección IP en una bitácora inalterable.
                </div>
              </div>

              <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">ID interno: <b className="text-[#041E42]">{clientDraft.id}</b></p>
                <div className="flex gap-2"><button type="button" disabled={clientSave.saving} onClick={() => setClientDraft(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-60">Cancelar</button><button type="submit" disabled={clientSave.saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{clientSave.saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{clientSave.saving ? "Guardando…" : "Guardar cambios"}</button></div>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClientWorkspace({ client, pricing, sourceParkingId, onLogout, onSwitchRole }) {
  const activeModules = modules.filter((module) => client.modules.includes(module.id));
  const [selectedModule, setSelectedModule] = useState(null);
  const [staff, setStaff] = useState(initialStaff);
  const [staffDraft, setStaffDraft] = useState({ name: "", email: "", role: "Operador", parking: "PF-001" });
  const [showStaffForm, setShowStaffForm] = useState(false);
  const createStaff = (event) => {
    event.preventDefault();
    setStaff((current) => [...current, { ...staffDraft, id: `USR-${String(current.length + 1).padStart(3, "0")}`, status: "Activo" }]);
    setStaffDraft({ name: "", email: "", role: "Operador", parking: "PF-001" });
    setShowStaffForm(false);
  };
  const deleteStaff = (person) => {
    const adminCount = staff.filter((item) => item.role === "Administrador").length;
    if (person.role === "Administrador" && adminCount === 1) return;
    setStaff((current) => current.filter((item) => item.id !== person.id));
  };
  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <Header role="client" onLogout={onLogout} onSwitchRole={onSwitchRole} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-7">
        <section className="grid gap-4 overflow-hidden rounded-[1.75rem] bg-[#041E42] p-6 text-white shadow-lg lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Portal del cliente</p>
            <h1 className="mt-2 text-3xl font-bold">Buenos días, {client.name}</h1>
            <p className="mt-2 text-sm text-slate-300">Tus herramientas contratadas están listas para operar.</p>
            {sourceParkingId ? <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"><ShieldCheck className="h-3.5 w-3.5" />Acceso supervisado desde {sourceParkingId}</span> : null}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[[client.sites, "Estacionamientos"], [client.users, "Usuarios"], [activeModules.length, "Módulos"]].map(([value, label]) => <div key={label} className="min-w-24 rounded-2xl bg-white/10 p-3 text-center"><p className="text-xl font-bold">{value}</p><p className="mt-0.5 text-[10px] text-slate-300">{label}</p></div>)}
          </div>
        </section>
        <section className="grid gap-3 rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Empresa", client.legalName, Building2],
            ["RUT", client.rut, ReceiptText],
            ["Teléfono", client.phone, Phone],
            ["Correo", client.email, Mail],
          ].map(([label, value, Icon]) => <div key={label} className="flex min-w-0 items-center gap-3 rounded-xl bg-white/70 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#3150D8] shadow-sm"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span><span className="mt-0.5 block truncate text-sm font-bold text-[#041E42]" title={value}>{value}</span></span></div>)}
        </section>
        <section>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3150D8]">Mi plataforma</p><h2 className="mt-1 text-2xl font-bold text-[#041E42]">Módulos disponibles</h2><p className="mt-1 text-sm text-slate-500">Solo se muestran las soluciones habilitadas para tu organización.</p></div>
            <span className="text-xs font-semibold text-slate-500">Plan {client.plan} · Actualizado hoy</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...activeModules, clientModuleManagement].map((module) => {
              const Icon = module.icon;
              return (
                <button key={module.id} type="button" onClick={() => setSelectedModule(module)} className="group flex min-h-44 flex-col items-start rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#3150D8] hover:shadow-lg">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tones[module.color]}`}><Icon className="h-6 w-6" /></span>
                  <span className="mt-4 flex w-full items-center justify-between gap-2"><span className="font-bold text-[#041E42]">{module.name}</span><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#3150D8]" /></span>
                  <span className="mt-2 text-xs leading-5 text-slate-500">{module.description}</span>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-cyan-700"><Sparkles className="h-5 w-5" /></span><div><p className="text-sm font-bold text-[#041E42]">¿Necesitas otra funcionalidad?</p><p className="text-xs text-slate-600">Solicita un módulo adicional al equipo ParkFacil.</p></div></div>
          <button type="button" className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#3150D8] shadow-sm">Contactar asesor</button>
        </aside>
      </main>

      {selectedModule ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedModule(null); }}>
          <section className="w-full max-w-3xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
            <header className="flex items-start justify-between bg-[#041E42] p-5 text-white">
              <div className="flex gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-cyan-200`}><selectedModule.icon className="h-5 w-5" /></span>
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">{client.name}</p><h2 className="mt-1 text-xl font-bold">{selectedModule.name}</h2><p className="mt-1 text-xs text-slate-300">{selectedModule.description}</p></div>
              </div>
              <button type="button" onClick={() => setSelectedModule(null)} className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </header>
            <div className="p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {(selectedModule.id === "operadores"
                  ? [["Usuarios activos", staff.length], ["Administradores", staff.filter((item) => item.role === "Administrador").length], ["Operadores", staff.filter((item) => item.role === "Operador").length]]
                  : moduleMetrics[selectedModule.id] ?? [["Estado", "Disponible"], ["Organización", client.name], ["Actualización", "Hoy"]]).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-[#041E42]">{value}</p></div>
                ))}
              </div>
              {selectedModule.id === "operadores" ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-[#EEF4FF] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-bold text-[#041E42]">Equipo con acceso</p><p className="text-xs text-slate-500">Administra roles y estacionamientos asignados.</p></div>
                    <button type="button" onClick={() => setShowStaffForm((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-3 py-2 text-xs font-bold text-white"><UserPlus className="h-4 w-4" />Nuevo usuario</button>
                  </div>
                  {showStaffForm ? (
                    <form onSubmit={createStaff} className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                      <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Nombre completo</span><input required value={staffDraft.name} onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" placeholder="Nombre y apellido" /></label>
                      <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Correo de acceso</span><input required type="email" value={staffDraft.email} onChange={(event) => setStaffDraft((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" placeholder="usuario@cliente.cl" /></label>
                      <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Perfil</span><select value={staffDraft.role} onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value, parking: event.target.value === "Administrador" ? "Todos" : current.parking }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"><option>Operador</option><option>Administrador</option></select></label>
                      <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Estacionamiento</span><select value={staffDraft.parking} disabled={staffDraft.role === "Administrador"} onChange={(event) => setStaffDraft((current) => ({ ...current, parking: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none disabled:bg-slate-100"><option>PF-001</option><option>PF-002</option><option>PF-003</option><option>Todos</option></select></label>
                      <div className="flex gap-2 md:col-span-2 md:justify-end"><button type="button" onClick={() => setShowStaffForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">Crear y enviar acceso</button></div>
                    </form>
                  ) : null}
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="sticky top-0 bg-[#041E42] text-[10px] uppercase tracking-wider text-white"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Estacionamiento</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acción</th></tr></thead>
                      <tbody>{staff.map((person) => {
                        const isLastAdmin = person.role === "Administrador" && staff.filter((item) => item.role === "Administrador").length === 1;
                        return <tr key={person.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-3"><p className="font-bold text-[#041E42]">{person.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{person.email}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-bold ${person.role === "Administrador" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-[#3150D8]"}`}>{person.role}</span></td><td className="px-4 py-3 font-semibold">{person.parking}</td><td className="px-4 py-3 text-emerald-700">{person.status}</td><td className="px-4 py-3 text-right"><button type="button" disabled={isLastAdmin} title={isLastAdmin ? "No se puede eliminar al último administrador" : "Eliminar usuario"} onClick={() => deleteStaff(person)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-2 font-bold text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"><Trash2 className="h-3.5 w-3.5" />Eliminar</button></td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                </div>
              ) : selectedModule.id === "gestion-cliente" ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-[#EEF4FF] px-4 py-3"><div><p className="text-sm font-bold text-[#041E42]">Estado de contratación</p><p className="text-xs text-slate-500">Consulta de módulos disponibles para {client.name}.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#3150D8]">Solo consulta</span></div>
                  <div className="max-h-72 overflow-y-auto p-3">
                    {modules.map((module) => {
                      const enabled = client.modules.includes(module.id);
                      const Icon = module.icon;
                      return <div key={module.id} className="flex items-center gap-3 border-b border-slate-100 px-2 py-3 last:border-b-0"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[module.color]}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#041E42]">{module.name}</span><span className="block text-xs text-slate-500">{moduleCommercial[module.id]?.benefit}</span>{!enabled ? <span className="mt-1 block text-xs font-bold text-[#3150D8]">Valor adicional: {(pricing[module.id] ?? 0).toFixed(1)} UF mensuales</span> : null}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Contratado" : "Disponible"}</span></div>;
                    })}
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Solo ParkFacil Root puede modificar la contratación.</p><button type="button" className="rounded-xl bg-[#3150D8] px-4 py-2.5 text-xs font-bold text-white">Solicitar módulo</button></div>
                </div>
              ) : <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#EEF4FF] px-4 py-3"><p className="text-sm font-bold text-[#041E42]">Información disponible</p><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#3150D8]">Acceso autorizado</span></div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 p-3"><p className="text-xs font-bold text-slate-500">Cliente</p><p className="mt-1 text-sm font-semibold text-[#041E42]">{client.legalName}</p></div>
                  <div className="rounded-xl border border-slate-100 p-3"><p className="text-xs font-bold text-slate-500">Contexto de acceso</p><p className="mt-1 text-sm font-semibold text-[#041E42]">{sourceParkingId ?? "Vista general del cliente"}</p></div>
                </div>
              </div>}
            </div>
            <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Los datos corresponden exclusivamente a {client.name}.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedModule(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cerrar</button>
                {moduleRoutes[selectedModule.id] ? <Link href={moduleRoutes[selectedModule.id]} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-xs font-bold text-white">Abrir módulo completo <ArrowRight className="h-4 w-4" /></Link> : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function ModeloGestionModulosPage() {
  const [session, setSession] = useState(null);
  const [clients, setClients] = useState(initialClients);
  const [clientSessionId, setClientSessionId] = useState(initialClients[0].id);
  const [sourceParkingId, setSourceParkingId] = useState(null);
  const [pricing, setPricing] = useState(() => Object.fromEntries(Object.entries(moduleCommercial).map(([id, data]) => [id, data.price])));
  const [pricingAccess, setPricingAccess] = useState({ loading: true, saving: false, canEdit: false, error: "", saved: false });
  const client = useMemo(() => clients.find((item) => item.id === clientSessionId) ?? clients[0], [clientSessionId, clients]);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      authenticatedFetch("/api/tarifario-modulos", { cache: "no-store" }),
      authenticatedFetch("/api/empresas", { cache: "no-store" }),
    ]).then(async ([pricingResult, companiesResult]) => {
      if (companiesResult.status === "fulfilled" && companiesResult.value.ok) {
        const body = await companiesResult.value.json();
        if (active && Array.isArray(body.data)) {
          setClients((current) => body.data.map((company) => mapPersistentCompany(company, current)));
        }
      }
      if (pricingResult.status === "rejected") throw pricingResult.reason;
      return pricingResult.value;
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible cargar el tarifario.");
        if (!active) return;
        setPricing((current) => ({ ...current, ...pricingRowsToMap(body.data) }));
        setPricingAccess({ loading: false, saving: false, canEdit: Boolean(body.permissions?.canEdit), error: "", saved: false });
      })
      .catch((error) => { if (active) setPricingAccess({ loading: false, saving: false, canEdit: false, error: error.message, saved: false }); });
    return () => { active = false; };
  }, []);
  const savePricing = async () => {
    setPricingAccess((current) => ({ ...current, saving: true, error: "", saved: false }));
    try {
      const response = await authenticatedFetch("/api/tarifario-modulos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: modules.map((module) => ({ moduleId: module.id, monthlyUf: pricing[module.id] })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.details?.join(" ") || body.error || "No fue posible guardar el tarifario.");
      setPricing((current) => ({ ...current, ...pricingRowsToMap(body.data) }));
      setPricingAccess({ loading: false, saving: false, canEdit: true, error: "", saved: true });
    } catch (error) {
      setPricingAccess((current) => ({ ...current, saving: false, error: error.message, saved: false }));
    }
  };
  const enterClient = (clientId, parkingId = null) => {
    const nextClient = clients.find((item) => item.id === clientId) ?? clients[0];
    setClientSessionId(clientId);
    setSourceParkingId(parkingId);
    window.localStorage.setItem("parkfacil-client-context", JSON.stringify({
      id: nextClient.id,
      name: nextClient.name,
      legalName: nextClient.legalName,
      rut: nextClient.rut,
      phone: nextClient.phone,
      email: nextClient.email,
      sourceParkingId: parkingId,
      modules: nextClient.modules,
    }));
    window.dispatchEvent(new Event("parkfacil-client-context"));
    setSession("client");
  };
  const clearClientContext = () => {
    window.localStorage.removeItem("parkfacil-client-context");
    window.dispatchEvent(new Event("parkfacil-client-context"));
  };
  const login = (role) => {
    if (role === "client") enterClient(clients[0].id);
    else {
      clearClientContext();
      setSession("root");
    }
  };
  const logout = () => {
    clearClientContext();
    setSession(null);
  };

  if (!session) return <LoginScreen onLogin={login} />;
  if (session === "root") return <RootWorkspace clients={clients} setClients={setClients} pricing={pricing} setPricing={setPricing} pricingAccess={pricingAccess} onSavePricing={savePricing} onLogout={logout} onSwitchRole={() => enterClient(clients[0].id)} onEnterClient={enterClient} />;
  return <ClientWorkspace client={client} pricing={pricing} sourceParkingId={sourceParkingId} onLogout={logout} onSwitchRole={() => { clearClientContext(); setSession("root"); }} />;
}

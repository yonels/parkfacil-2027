import { LayoutGrid, BarChart3, ParkingSquare, ShieldCheck, KeyRound, Wallet, WalletCards, BadgeDollarSign, Layers, Users, Handshake, RadioTower, Monitor, FileChartColumnIncreasing, Settings2, Plug2, BookOpen, Calculator, SlidersHorizontal, ScanLine, TicketPercent, Clock3, ReceiptText } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Inicio", icon: LayoutGrid, active: true },
  { href: "/modelo-dashboard", label: "Dashboard", icon: BarChart3 },
  // Para platform_admin (Root), este ítem nunca abre /data-entry con la
  // sesión Root: Sidebar/MobileNavigation lo interceptan y llevan al login
  // real de operador en el origen del Portal Cliente. Root nunca opera el
  // terminal directamente (PORTAL_FORBIDDEN se mantiene intacto). Ver
  // src/lib/auth/operatorAccessUrl.mjs y src/app/acceso-operador/page.js.
  { href: "/data-entry", label: "Data Entry", icon: ScanLine, platformAdminGateway: true },
  { href: "/operacion", label: "Operación", icon: ParkingSquare },
  { href: "/turnos", label: "Turnos", icon: Clock3 },
  { href: "/estacionamientos", label: "Estacionamientos", icon: ShieldCheck },
  { href: "/seguridad", label: "Seguridad", icon: KeyRound, requiresModule: "seguridad" },
  { href: "/recaudacion", label: "Recaudación", icon: Wallet },
  {
    href: "/facturacion",
    label: "Facturación",
    icon: ReceiptText,
    children: [
      { href: "/facturacion#prefacturacion", label: "Prefacturación" },
      { href: "/facturacion#facturas", label: "Facturas" },
      { href: "/facturacion#notas-credito", label: "Notas de Crédito" },
      { href: "/facturacion#notas-debito", label: "Notas de Débito" },
      { href: "/facturacion#cuenta-corriente", label: "Cuenta Corriente" },
      { href: "/facturacion#pagos", label: "Pagos" },
      { href: "/facturacion#cobranza", label: "Cobranza" },
      { href: "/facturacion#conciliacion", label: "Conciliación" },
      { href: "/facturacion#reportes", label: "Reportes" },
      { href: "/facturacion#configuracion", label: "Configuración" },
    ],
  },
  { href: "/recaudacion#medios-de-pago", label: "Medios de Pago", icon: WalletCards },
  { href: "/empresas", label: "Empresas", icon: Users },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/modelo-gestion-modulos", label: "Gestión de módulos", icon: SlidersHorizontal },
  { href: "/contratos", label: "Contratos", icon: Handshake },
  { href: "/abonados", label: "Abonados y Credenciales", icon: KeyRound },
  {
    href: "/administracion-tarifas",
    label: "Tarifas",
    icon: BadgeDollarSign,
    children: [
      { href: "/administracion-tarifas", label: "Tarifas", icon: BadgeDollarSign },
      { href: "/tarifas", label: "Planes", icon: Layers },
      { href: "/simulador-tarifas", label: "Simulador de tarifas", icon: Calculator },
    ],
  },
  { href: "/cupones", label: "Cupones y descuentos", icon: TicketPercent },
  { href: "/convenios", label: "Convenios", icon: Handshake },
  {
    href: "/dispositivos",
    label: "Dispositivos",
    icon: RadioTower,
    children: [
      { href: "/dispositivos", label: "Todos los dispositivos" },
      { href: "/dispositivos?tipo=C%C3%A1mara%20LPR", label: "Cámaras LPR" },
      { href: "/dispositivos?tipo=Barrera", label: "Barreras" },
      { href: "/dispositivos?tipo=Terminal%20POS", label: "Terminales POS" },
      { href: "/dispositivos?tipo=Impresora", label: "Impresoras" },
      { href: "/dispositivos?tipo=Lector%20QR", label: "Lectores QR" },
      { href: "/dispositivos?tipo=Sensor", label: "Sensores" },
      { href: "/dispositivos?tipo=Controlador%20de%20acceso", label: "Controladores de acceso" },
      { href: "/dispositivos?tipo=Cajero%20autom%C3%A1tico", label: "Cajeros automáticos" },
      { href: "/dispositivos?tipo=Computador", label: "Computadores" },
      { href: "/dispositivos?tipo=Dispositivo%20Android", label: "Dispositivos Android" },
    ],
  },
  { href: "/monitoreo", label: "Monitoreo", icon: Monitor },
  { href: null, label: "Reportes", icon: FileChartColumnIncreasing, future: true },
  { href: null, label: "Administración", icon: Settings2, future: true },
  { href: null, label: "Integraciones", icon: Plug2, future: true },
  { href: "/documentos", label: "Documentación", icon: BookOpen },
];

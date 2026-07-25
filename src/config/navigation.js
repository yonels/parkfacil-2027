import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Handshake,
  LayoutGrid,
  Map,
  Monitor,
  RadioTower,
  Receipt,
  Settings2,
  ShieldCheck,
  TicketPercent,
  Users,
  Wallet,
} from "lucide-react";

export const navigationSections = [
  {
    group: "Monitoreo",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid },
      { href: null, label: "Mapa de sitios", icon: Map, future: true },
      { href: null, label: "Actividad en tiempo real", icon: Activity, future: true },
      { href: "/seguridad", label: "Alertas", icon: AlertTriangle },
    ],
  },
  {
    group: "Operación",
    items: [
      { href: "/control-accesos", label: "Accesos y salidas", icon: ShieldCheck },
      { href: "/dispositivos", label: "Dispositivos", icon: RadioTower },
      { href: "/tarifas", label: "Tarifas y planes", icon: Wallet },
      { href: null, label: "Validaciones y cupones", icon: TicketPercent, future: true },
      { href: "/abonados", label: "Abonados", icon: Users },
      { href: "/visitas", label: "Visitas y reservas", icon: Handshake },
    ],
  },
  {
    group: "Transacciones",
    items: [
      { href: "/operacion", label: "Transacciones", icon: Receipt },
      { href: null, label: "Recaudación", icon: Wallet, future: true },
      { href: null, label: "Medios de pago", icon: CreditCard, future: true },
      { href: null, label: "Cajas y turnos", icon: ArrowLeftRight, future: true },
    ],
  },
  {
    group: "Reportes",
    items: [
      { href: null, label: "Reportes", icon: FileText, future: true },
      { href: null, label: "Exportar datos", icon: Download, future: true },
    ],
  },
  {
    group: "Administración",
    items: [
      { href: "/empresas", label: "Empresas", icon: Building2 },
      { href: "/estacionamientos", label: "Estacionamientos", icon: Gauge },
      { href: "/usuarios", label: "Usuarios y permisos", icon: Users },
      { href: null, label: "Configuración", icon: Settings2, future: true },
      { href: null, label: "Integraciones", icon: Monitor, future: true },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((section) => section.items);

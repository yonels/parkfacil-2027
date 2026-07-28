import { LayoutGrid, BarChart3, ParkingSquare, ShieldCheck, KeyRound, Wallet, Users, Handshake, RadioTower, Monitor, FileChartColumnIncreasing, Settings2, Plug2, BookOpen, Calculator } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Inicio", icon: LayoutGrid, active: true },
  { href: "/modelo-dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/operacion", label: "Operación", icon: ParkingSquare },
  { href: "/estacionamientos", label: "Estacionamientos", icon: ShieldCheck },
  { href: "/seguridad", label: "Seguridad", icon: KeyRound },
  { href: null, label: "Recaudación", icon: Wallet, future: true },
  { href: "/empresas", label: "Empresas", icon: Users },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/contratos", label: "Contratos", icon: Handshake },
  { href: "/abonados", label: "Abonados y Credenciales", icon: KeyRound },
  { href: "/tarifas", label: "Tarifas y Planes", icon: Wallet },
  { href: "/simulador-tarifas", label: "Simulador de tarifas", icon: Calculator },
  { href: "/dispositivos", label: "Dispositivos", icon: RadioTower },
  { href: null, label: "Monitoreo", icon: Monitor, future: true },
  { href: null, label: "Reportes", icon: FileChartColumnIncreasing, future: true },
  { href: null, label: "Administración", icon: Settings2, future: true },
  { href: null, label: "Integraciones", icon: Plug2, future: true },
  { href: "/documentos", label: "Documentación", icon: BookOpen },
];

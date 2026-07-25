import { LayoutGrid, ParkingSquare, ShieldCheck, KeyRound, Wallet, Users, Handshake, RadioTower, Monitor, FileChartColumnIncreasing, Settings2, Plug2, BookOpen } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Inicio", icon: LayoutGrid, active: true },
  { href: null, label: "Operación", icon: ParkingSquare, future: true },
  { href: "/estacionamientos", label: "Estacionamientos", icon: ShieldCheck },
  { href: "/seguridad", label: "Seguridad", icon: KeyRound },
  { href: null, label: "Recaudación", icon: Wallet, future: true },
  { href: "/empresas", label: "Empresas", icon: Users },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/contratos", label: "Contratos", icon: Handshake },
  { href: "/dispositivos", label: "Dispositivos", icon: RadioTower },
  { href: null, label: "Monitoreo", icon: Monitor, future: true },
  { href: null, label: "Reportes", icon: FileChartColumnIncreasing, future: true },
  { href: null, label: "Administración", icon: Settings2, future: true },
  { href: null, label: "Integraciones", icon: Plug2, future: true },
  { href: "/documentos", label: "Documentación", icon: BookOpen },
];

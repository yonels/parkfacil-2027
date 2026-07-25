import { LayoutGrid, ParkingSquare, ShieldCheck, KeyRound, Wallet, Users, Handshake, RadioTower, Monitor, FileChartColumnIncreasing, Settings2, Plug2, BookOpen } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Inicio", icon: LayoutGrid, active: true },
  { href: null, label: "Operación", icon: ParkingSquare, future: true },
  { href: null, label: "Estacionamientos", icon: ShieldCheck, future: true },
  { href: null, label: "Accesos", icon: KeyRound, future: true },
  { href: null, label: "Recaudación", icon: Wallet, future: true },
  { href: null, label: "Abonados", icon: Users, future: true },
  { href: null, label: "Convenios", icon: Handshake, future: true },
  { href: null, label: "Dispositivos", icon: RadioTower, future: true },
  { href: null, label: "Monitoreo", icon: Monitor, future: true },
  { href: null, label: "Reportes", icon: FileChartColumnIncreasing, future: true },
  { href: null, label: "Administración", icon: Settings2, future: true },
  { href: null, label: "Integraciones", icon: Plug2, future: true },
  { href: "/documentos", label: "Documentación", icon: BookOpen },
];

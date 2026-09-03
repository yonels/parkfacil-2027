import { AlertOctagon, ClipboardList, History, Map, MessageSquareText, RefreshCw, Search, Settings, LogOut } from "lucide-react";
import { INSPECTOR_VIEW } from "./inspectorViews.mjs";

// Config única de navegación completa (sidebar de escritorio y drawer
// "Más" de móvil comparten esta misma lista -- sección 13: en pantallas
// grandes se reorganiza como sidebar, no se amplía la barra inferior).
// Reporte SMS (2026-09-03): pantalla administrativa/operativa, no de uso
// diario en terreno -- va junto a Sincronización/Ajustes, nunca en la
// barra inferior (INSPECTOR_BOTTOM_NAV_ITEMS, reservada a las 3 acciones
// más frecuentes).
export const INSPECTOR_NAV_ITEMS = Object.freeze([
  { view: INSPECTOR_VIEW.CONSULTA, label: "Consultar patente", Icon: Search },
  { view: INSPECTOR_VIEW.FISCALIZACIONES, label: "Fiscalizaciones", Icon: ClipboardList },
  { view: INSPECTOR_VIEW.HISTORIAL, label: "Historial", Icon: History },
  { view: INSPECTOR_VIEW.MOROSOS, label: "Morosos / Observados", Icon: AlertOctagon },
  { view: INSPECTOR_VIEW.MAPA, label: "Mapa", Icon: Map },
  { view: INSPECTOR_VIEW.SMS_REPORT, label: "Reporte SMS", Icon: MessageSquareText },
  { view: INSPECTOR_VIEW.SYNC, label: "Sincronización", Icon: RefreshCw },
  { view: INSPECTOR_VIEW.AJUSTES, label: "Ajustes", Icon: Settings },
]);

export const INSPECTOR_BOTTOM_NAV_ITEMS = Object.freeze([
  { view: INSPECTOR_VIEW.CONSULTA, label: "Consultar", Icon: Search },
  { view: INSPECTOR_VIEW.FISCALIZACIONES, label: "Fiscalizaciones", Icon: ClipboardList },
  { view: INSPECTOR_VIEW.HISTORIAL, label: "Historial", Icon: History },
]);

export const INSPECTOR_LOGOUT_ITEM = Object.freeze({ label: "Cerrar sesión", Icon: LogOut });

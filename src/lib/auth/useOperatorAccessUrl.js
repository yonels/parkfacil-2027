"use client";

import { useSyncExternalStore } from "react";

import {
  OPERATOR_ACCESS_FALLBACK_URL,
  buildOperatorAccessUrl,
} from "@/lib/auth/operatorAccessUrl.mjs";

// window.location no cambia sin una navegación completa de página, así que
// no hay nada que "escuchar": el store nunca emite cambios por sí mismo.
function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return buildOperatorAccessUrl(window.location.host);
}

function getServerSnapshot() {
  return OPERATOR_ACCESS_FALLBACK_URL;
}

// Lee el host real del navegador sin provocar un desajuste de hidratación:
// useSyncExternalStore usa getServerSnapshot() en el render de servidor y en
// la primera pasada de hidratación, y luego getClientSnapshot() ya en el
// navegador (dominio de producción del Portal Cliente, cliente.localhost, etc.).
export function useOperatorAccessUrl() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

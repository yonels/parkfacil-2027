"use client";
import { useEffect, useState } from "react";
import { formatCountdownClock, remainingSeconds } from "@/lib/onStreetPilot.mjs";

// Contador vivo de "tiempo restante" para la pantalla de comprobante de
// pago. Arranca SIEMPRE desde el expiresAt real de la sesión, recién
// obtenido del servidor por el componente servidor que renderiza esta
// pieza (nunca desde purchased_minutes ni desde un estado previo del
// navegador) y se actualiza cada segundo en el cliente -- el usuario nunca
// necesita refrescar manualmente para ver el tiempo avanzar. Mismo patrón
// que PublicParkingSession.js (la pantalla de sesión activa), reutilizando
// las mismas funciones puras de onStreetPilot.mjs.
export default function LiveRemainingTime({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{formatCountdownClock(remainingSeconds(expiresAt, now))}</>;
}

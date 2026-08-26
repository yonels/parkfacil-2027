export function normalizeChileanMobile(value) {
  const input = String(value || "").trim();
  if (!input || !/^\+?[\d\s-]+$/.test(input) || (input.match(/\+/g) || []).length > 1) return null;
  const digits = input.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("56") ? digits.slice(2) : digits;
  return /^9\d{8}$/.test(local) ? `+56${local}` : null;
}

export function localChileanMobile(value) {
  const normalized = normalizeChileanMobile(value);
  return normalized ? normalized.slice(3) : null;
}

export function formatChileDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Santiago",
  }).format(date);
}

export function maskPhone(phone) {
  return /^\+569\d{8}$/.test(phone || "") ? `${phone.slice(0, 4)} **** ${phone.slice(-4)}` : "—";
}

export function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return hours ? `${hours} h ${minutes} min` : minutes ? `${minutes} min ${secs} s` : `${secs} s`;
}

// El QR/letrero debe apuntar SIEMPRE al Portal Cliente (público), nunca al
// origen desde el que el administrador (Root o cliente) está generándolo.
// Root administra en localhost:3000 / root.parkfacilapp.cl, pero esos
// dominios no sirven la experiencia pública del automovilista.
export function publicOriginFor(currentOrigin) {
  try {
    const url = new URL(String(currentOrigin || ""));
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = "cliente.localhost";
      return url.origin;
    }
    if (url.hostname === "root.parkfacilapp.cl") {
      url.hostname = "cliente.parkfacilapp.cl";
      return url.origin;
    }
    return url.origin;
  } catch {
    return String(currentOrigin || "");
  }
}

export function isPublicCode(value) { return /^[a-zA-Z0-9_-]{20,80}$/.test(String(value || "")); }
export function isPublicToken(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
export const MIN_PURCHASED_MINUTES = 1;
export const MAX_PURCHASED_MINUTES = 1440;
export function normalizePurchasedMinutes(value){const n=Number(value);return Number.isInteger(n)&&n>=MIN_PURCHASED_MINUTES&&n<=MAX_PURCHASED_MINUTES?n:null;}
export function simulatedAmount(minutes,rate){const m=normalizePurchasedMinutes(minutes),r=Number(rate);return m&&Number.isFinite(r)&&r>0?Math.round(m*r):null;}
export function remainingSeconds(expiresAt,now=Date.now()){return Math.max(0,Math.floor((new Date(expiresAt).getTime()-now)/1000));}

// Formato de reloj para un contador en vivo (comprobante de pago): MM:SS
// bajo una hora, H:MM:SS desde una hora en adelante. Distinto de
// formatDuration() (que usa "X h Y min") a propósito -- este formato es
// para un número que va cambiando cada segundo frente al usuario, donde ver
// los segundos moverse es la señal de que el contador está vivo y viene de
// expires_at real, no de un valor estático.
export function formatCountdownClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

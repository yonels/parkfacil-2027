// Lectura de la UF desde la API BDE del Banco Central de Chile (SOL-2026-11-05-005, F1.3).
// Documentación oficial (leída 2026-11-05):
// https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/acceso_api.html
// https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html
// - REST exige «API Key Token» (parámetro token, vigencia de un año). Usuario y contraseña quedan para SOAP y
//   usuarios antiguos: se aceptan solo como respaldo si no hay token.
// - Respuesta: Codigo (0 = éxito), Descripcion, Series.Obs[] con indexDateString DD-MM-AAAA, value como texto con
//   punto decimal («1.5») y statusCode (OK, o ND con value «NaN» cuando no hay dato).
// Código puro (sin red) para poder probarlo con node --test.

export const BCCH_ENDPOINT = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";
// Serie diaria de la UF: verificada el 2026-11-05 con SearchSeries («Unidad de fomento (UF)», desde 01-08-1977).
export const DEFAULT_UF_SERIES_ID = "F073.UFF.PRE.Z.D";

export class UfRateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UfRateError";
    this.code = code;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isoToBcchDate(isoDate) {
  if (!ISO_DATE.test(String(isoDate || ""))) throw new UfRateError("UF_DATE_INVALID", "La fecha de la UF debe tener formato AAAA-MM-DD.");
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

// «39643.21» (formato BCCh) → 39643.21; «39.643,21» (formato chileno, p. ej. CMF) → 39643.21.
export function parseUfValue(raw) {
  const text = String(raw ?? "").trim();
  if (!text || /nan/i.test(text)) return NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
}

export function buildBcchUfUrl({ token, user, password, seriesId = DEFAULT_UF_SERIES_ID, date }) {
  if (!ISO_DATE.test(String(date || ""))) throw new UfRateError("UF_DATE_INVALID", "La fecha de la UF debe tener formato AAAA-MM-DD.");
  const url = new URL(BCCH_ENDPOINT);
  if (token) url.searchParams.set("token", token);
  else if (user && password) { url.searchParams.set("user", user); url.searchParams.set("pass", password); }
  else throw new UfRateError("BCCH_NOT_CONFIGURED", "Configure BCCH_API_TOKEN (API Key Token de la BDE del Banco Central).");
  url.searchParams.set("function", "GetSeries");
  url.searchParams.set("timeseries", seriesId || DEFAULT_UF_SERIES_ID);
  url.searchParams.set("firstdate", date);
  url.searchParams.set("lastdate", date);
  return url;
}

export function parseBcchUfResponse(payload, requestedDate) {
  if (Number(payload?.Codigo) !== 0) throw new UfRateError("BCCH_REJECTED", payload?.Descripcion || "El Banco Central rechazó la consulta.");
  const observations = payload?.Series?.Obs || payload?.series?.obs || [];
  const target = isoToBcchDate(requestedDate);
  const match = observations.find((item) => String(item.indexDateString || "").trim() === target);
  if (!match) throw new UfRateError("BCCH_UF_NOT_FOUND", `El Banco Central no informó la UF del ${requestedDate}.`);
  const value = parseUfValue(match.value ?? match.Valor ?? match.valor);
  if (String(match.statusCode || "OK").toUpperCase() !== "OK" || !Number.isFinite(value) || value <= 0) {
    throw new UfRateError("BCCH_UF_NOT_AVAILABLE", `La UF del ${requestedDate} no está disponible en el Banco Central.`);
  }
  // Rango de sensatez: evita facturar con un valor mal leído (p. ej. 100 veces mayor).
  if (value < 10000 || value > 200000) throw new UfRateError("BCCH_INVALID_RESPONSE", `Valor de UF fuera de rango: ${value}.`);
  return { date: requestedDate, value, source: "Banco Central de Chile", seriesId: payload?.Series?.seriesId || null };
}

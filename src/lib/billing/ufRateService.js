import "server-only";
import { buildBcchUfUrl, DEFAULT_UF_SERIES_ID, parseBcchUfResponse, UfRateError } from "./ufRateCore.mjs";

// Consulta de la UF al Banco Central (SOL-2026-11-05-005, F1.3). Ver ufRateCore.mjs para el formato oficial.
// Credenciales solo en variables de entorno (.env.local y Vercel), nunca en el repositorio.
export class UfRateServiceError extends UfRateError {}

export class UfRateService {
  constructor({
    token = process.env.BCCH_API_TOKEN,
    user = process.env.BCCH_API_USER,
    password = process.env.BCCH_API_PASSWORD,
    seriesId = process.env.BCCH_UF_SERIES_ID || DEFAULT_UF_SERIES_ID,
    fetchImpl = fetch,
  } = {}) {
    this.token = token; this.user = user; this.password = password; this.seriesId = seriesId; this.fetchImpl = fetchImpl;
  }

  async getUfByDate(date) {
    const url = buildBcchUfUrl({ token: this.token, user: this.user, password: this.password, seriesId: this.seriesId, date });
    let response;
    try { response = await this.fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }); }
    catch { throw new UfRateServiceError("BCCH_UNAVAILABLE", "No fue posible conectar con el Banco Central."); }
    if (!response.ok) throw new UfRateServiceError("BCCH_HTTP_ERROR", `El Banco Central respondió HTTP ${response.status}.`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new UfRateServiceError("BCCH_INVALID_RESPONSE", "El Banco Central no respondió en formato JSON."); }
    return parseBcchUfResponse(payload, date);
  }

  async getLatestUf() {
    return this.getUfByDate(new Date().toISOString().slice(0, 10));
  }
}

import "server-only";

const OFFICIAL_ENDPOINT = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";

export class UfRateServiceError extends Error {
  constructor(code, message) { super(message); this.name = "UfRateServiceError"; this.code = code; }
}

function parseOfficialResponse(payload, requestedDate) {
  if (Number(payload?.Codigo) !== 0) throw new UfRateServiceError("BCCH_REJECTED", payload?.Descripcion || "El Banco Central rechazo la consulta.");
  const observations = payload?.Series?.Obs || payload?.series?.obs || [];
  const match = observations.find((item) => String(item.indexDateString || item.fecha || item.date || "").includes(requestedDate)) || observations[0];
  const raw = match?.value ?? match?.Valor ?? match?.valor;
  const value = Number(String(raw ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) throw new UfRateServiceError("BCCH_INVALID_RESPONSE", "La respuesta oficial no contiene un valor UF valido.");
  return { date: requestedDate, value, source: "Banco Central de Chile" };
}

export class UfRateService {
  constructor({ user = process.env.BCCH_API_USER, password = process.env.BCCH_API_PASSWORD, seriesId = process.env.BCCH_UF_SERIES_ID, fetchImpl = fetch } = {}) {
    this.user = user; this.password = password; this.seriesId = seriesId; this.fetchImpl = fetchImpl;
  }

  assertConfigured() {
    if (!this.user || !this.password || !this.seriesId) throw new UfRateServiceError("BCCH_NOT_CONFIGURED", "Configure BCCH_API_USER, BCCH_API_PASSWORD y BCCH_UF_SERIES_ID.");
  }

  async getUfByDate(date) {
    this.assertConfigured();
    const url = new URL(OFFICIAL_ENDPOINT);
    url.searchParams.set("user", this.user); url.searchParams.set("pass", this.password);
    url.searchParams.set("function", "GetSeries"); url.searchParams.set("timeseries", this.seriesId);
    url.searchParams.set("firstdate", date); url.searchParams.set("lastdate", date);
    let response;
    try { response = await this.fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }); }
    catch { throw new UfRateServiceError("BCCH_UNAVAILABLE", "No fue posible conectar con el Banco Central."); }
    if (!response.ok) throw new UfRateServiceError("BCCH_HTTP_ERROR", `Banco Central respondio HTTP ${response.status}.`);
    return parseOfficialResponse(await response.json(), date);
  }

  async getLatestUf() {
    const today = new Date().toISOString().slice(0, 10);
    return this.getUfByDate(today);
  }
}

export { OFFICIAL_ENDPOINT, parseOfficialResponse };

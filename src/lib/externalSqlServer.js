import "server-only";
import sql from "mssql";

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Falta la variable de servidor ${name}.`);
  return value;
};

function booleanValue(name, fallback) {
  const value = process.env[name];
  return value == null ? fallback : String(value).toLowerCase() === "true";
}

export const EXTERNAL_DATABASES = {
  master: "EXTERNAL_MASTER_DB_NAME",
  client: "EXTERNAL_CLIENT_DB_NAME",
};

export function getExternalSqlConfig(databaseKey = "master") {
  const port = Number(process.env.EXTERNAL_DB_PORT || 1437);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("EXTERNAL_DB_PORT no es válido.");
  const databaseVariable = EXTERNAL_DATABASES[databaseKey];
  if (!databaseVariable) throw new Error("Contexto de base de datos no permitido.");
  return {
    server: required("EXTERNAL_DB_HOST"),
    port,
    database: required(databaseVariable),
    user: required("EXTERNAL_DB_USER"),
    password: required("EXTERNAL_DB_PASSWORD"),
    connectionTimeout: 10000,
    requestTimeout: 15000,
    pool: { min: 0, max: 5, idleTimeoutMillis: 30000 },
    options: {
      encrypt: booleanValue("EXTERNAL_DB_ENCRYPT", true),
      trustServerCertificate: booleanValue("EXTERNAL_DB_TRUST_SERVER_CERTIFICATE", false),
      enableArithAbort: true,
    },
  };
}

export async function getExternalSqlPool(databaseKey = "master") {
  globalThis.__parkfacilExternalSqlPools ||= {};
  if (!globalThis.__parkfacilExternalSqlPools[databaseKey]) {
    const pool = new sql.ConnectionPool(getExternalSqlConfig(databaseKey));
    globalThis.__parkfacilExternalSqlPools[databaseKey] = pool.connect().catch((error) => {
      globalThis.__parkfacilExternalSqlPools[databaseKey] = null;
      throw error;
    });
  }
  return globalThis.__parkfacilExternalSqlPools[databaseKey];
}

export async function checkExternalSqlConnection(databaseKey = "master") {
  const pool = await getExternalSqlPool(databaseKey);
  const result = await pool.request().query(`
    select
      cast(db_name() as nvarchar(128)) as databaseName,
      cast(serverproperty('ProductVersion') as nvarchar(128)) as productVersion,
      sysdatetimeoffset() as serverTime
  `);
  return { context: databaseKey, ...result.recordset[0] };
}

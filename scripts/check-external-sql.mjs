import sql from "mssql";

const baseConfig = {
  server: process.env.EXTERNAL_DB_HOST,
  port: Number(process.env.EXTERNAL_DB_PORT || 1437),
  user: process.env.EXTERNAL_DB_USER,
  password: process.env.EXTERNAL_DB_PASSWORD,
  connectionTimeout: 10000,
  requestTimeout: 15000,
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
};

const databases = [process.env.EXTERNAL_MASTER_DB_NAME, process.env.EXTERNAL_CLIENT_DB_NAME];
const results = [];
for (const database of databases) {
  try {
    const pool = await new sql.ConnectionPool({ ...baseConfig, database }).connect();
    const result = await pool.request().query("select cast(db_name() as nvarchar(128)) databaseName, cast(serverproperty('ProductVersion') as nvarchar(128)) productVersion");
    results.push({ connected: true, ...result.recordset[0] });
    await pool.close();
  } catch (error) {
    results.push({ connected: false, databaseName: database, code: error?.code, name: error?.name });
  }
}
let visibleParkFacilDatabases = [];
if (results.some((result) => !result.connected)) {
  try {
    const pool = await new sql.ConnectionPool({ ...baseConfig, database: "master" }).connect();
    const visible = await pool.request().query("select name from sys.databases where lower(name) like '%facil%' order by name");
    visibleParkFacilDatabases = visible.recordset.map((row) => row.name);
    await pool.close();
  } catch {}
}
console.log(JSON.stringify({ databases: results, visibleParkFacilDatabases }));
if (results.some((result) => !result.connected)) {
  process.exitCode = 1;
}

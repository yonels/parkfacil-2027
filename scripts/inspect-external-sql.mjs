import sql from "mssql";

const baseConfig = {
  server: process.env.EXTERNAL_DB_HOST,
  port: Number(process.env.EXTERNAL_DB_PORT || 1437),
  user: process.env.EXTERNAL_DB_USER,
  password: process.env.EXTERNAL_DB_PASSWORD,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
};

const databases = [process.env.EXTERNAL_MASTER_DB_NAME, process.env.EXTERNAL_CLIENT_DB_NAME];
for (const database of databases) {
  const pool = await new sql.ConnectionPool({ ...baseConfig, database }).connect();
  const result = await pool.request().query(`
    select
      schema_name(t.schema_id) as schemaName,
      t.name as tableName,
      sum(p.rows) as [rowCount]
    from sys.tables t
    left join sys.partitions p on p.object_id=t.object_id and p.index_id in (0,1)
    group by t.schema_id,t.name
    order by t.name
  `);
  console.log(JSON.stringify({ database, tables: result.recordset }));
  await pool.close();
}

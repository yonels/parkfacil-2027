import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.EXTERNAL_DB_HOST,
  port: Number(process.env.EXTERNAL_DB_PORT || 1437),
  database: process.env.EXTERNAL_MASTER_DB_NAME,
  user: process.env.EXTERNAL_DB_USER,
  password: process.env.EXTERNAL_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
}).connect();

const result = await pool.request().input("rut", sql.NVarChar, "%966731206%").query(`
  select e.ID,rtrim(e.RUT) as RUT,rtrim(e.NOMBRE) as NOMBRE,e.ACTIVA,
         p.ID as PARKING_ID,rtrim(p.NOMBRE) as PARKING_NOMBRE,p.ID_PLAN
  from dbo.empresas e
  left join dbo.estacionamientos p on p.ID_EMPRESA=e.ID
  where replace(replace(replace(rtrim(e.RUT),'.',''),'-',''),' ','') like @rut
  order by p.ID
`);
console.log(JSON.stringify(result.recordset));
await pool.close();

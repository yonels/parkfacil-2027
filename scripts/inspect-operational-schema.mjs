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

const targets = [
  { database: process.env.EXTERNAL_MASTER_DB_NAME, tables: ["estacionamientos", "usuarios", "tramos"] },
  { database: process.env.EXTERNAL_CLIENT_DB_NAME, tables: ["movimientos", "boletas"] },
];

for (const target of targets) {
  const pool = await new sql.ConnectionPool({ ...baseConfig, database: target.database }).connect();
  for (const table of target.tables) {
    const columns = await pool.request().input("table", sql.NVarChar, table).query(`
      select column_name as columnName,data_type as dataType,is_nullable as nullable
      from information_schema.columns where table_name=@table order by ordinal_position
    `);
    console.log(JSON.stringify({ database: target.database, table, columns: columns.recordset }));
  }
  await pool.close();
}

const masterPool = await new sql.ConnectionPool({ ...baseConfig, database: process.env.EXTERNAL_MASTER_DB_NAME }).connect();
const masterData = await masterPool.request().query(`
  select ID,rtrim(CODIGO) as CODIGO,rtrim(CORREO) as CORREO,rtrim(NOMBRE) as NOMBRE,TIPO,ESTADO,ID_EMPRESA,ID_ESTACIONAMIENTO,MULTI_ESTACIONAMIENTO
  from dbo.usuarios order by ID;
  select ID,ID_EMPRESA,rtrim(NOMBRE) as NOMBRE,rtrim(DIRECCION) as DIRECCION,rtrim(COMUNA) as COMUNA,rtrim(CIUDAD) as CIUDAD,ID_PLAN
  from dbo.estacionamientos order by ID;
  select c.column_name as columnName,c.data_type as dataType from information_schema.columns c where c.table_name='empresas' order by c.ordinal_position;
`);
console.log(JSON.stringify({ database: process.env.EXTERNAL_MASTER_DB_NAME, users: masterData.recordsets[0], parkings: masterData.recordsets[1], companyColumns: masterData.recordsets[2] }));
await masterPool.close();

const clientPool = await new sql.ConnectionPool({ ...baseConfig, database: process.env.EXTERNAL_CLIENT_DB_NAME }).connect();
const openMovements = await clientPool.request().query(`
  select top (10) id,rtrim(patente) as patente,id_usuario,id_estacionamiento,fecha_ingreso
  from dbo.movimientos where fecha_salida is null and isnull(cancelado,0)=0 and isnull(anulado,0)=0
  order by fecha_ingreso desc
`);
console.log(JSON.stringify({ database: process.env.EXTERNAL_CLIENT_DB_NAME, openMovements: openMovements.recordset }));
await clientPool.close();

import { readFile } from "node:fs/promises";
import pg from "pg";

const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = projectUrl.hostname.split(".")[0];
const password = process.env.SUPABASE_DB_PASSWORD;
if (!projectRef || !password) throw new Error("Falta la configuración de conexión Supabase.");

const migrations = [
  "supabase/migrations/20260731120000_parking_movements_data_entry.sql",
  "supabase/migrations/20260731130000_parking_stays_tickets.sql",
];

const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: "postgres",
  user: process.env.SUPABASE_DB_HOST ? `postgres.${projectRef}` : "postgres",
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

await client.connect();
try {
  await client.query("select pg_advisory_lock(2026073113)");
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../${migration}`, import.meta.url), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(JSON.stringify({ migration, applied: true }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(2026073113)").catch(() => {});
  await client.end();
}

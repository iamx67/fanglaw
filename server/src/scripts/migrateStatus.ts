import "dotenv/config";
import { Pool } from "pg";
import { getMigrationStatus } from "../migrations/runtime.js";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const databaseSsl = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "") === "true";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Migration status requires a PostgreSQL database.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  const status = await getMigrationStatus(pool);
  console.log(JSON.stringify(status, null, 2));

  if (status.summary.changed > 0 || status.summary.missing > 0) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}

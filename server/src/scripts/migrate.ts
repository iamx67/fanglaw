import "dotenv/config";
import { Pool } from "pg";
import { runMigrations } from "../migrations/runtime.js";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const databaseSsl = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "") === "true";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Migration requires a PostgreSQL database.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  const status = await runMigrations(pool);
  console.log(
    JSON.stringify(
      {
        ok: true,
        appliedVersions: status.appliedVersions,
        summary: status.summary,
        migrationsDirectory: status.migrationsDirectory,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

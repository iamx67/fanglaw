import { runMigrations } from "./runtime.js";

const migrationBootstrapTasks = new Map<string, Promise<void>>();

export async function ensureConfiguredDatabaseMigrations(databaseUrl: string, ssl: boolean) {
  const normalizedDatabaseUrl = databaseUrl.trim();
  if (!normalizedDatabaseUrl) {
    return;
  }

  const cacheKey = `${normalizedDatabaseUrl}::${ssl ? "ssl" : "plain"}`;
  const existingTask = migrationBootstrapTasks.get(cacheKey);
  if (existingTask) {
    await existingTask;
    return;
  }

  const nextTask = runConfiguredDatabaseMigrations(normalizedDatabaseUrl, ssl);
  migrationBootstrapTasks.set(cacheKey, nextTask);

  try {
    await nextTask;
  } catch (error) {
    migrationBootstrapTasks.delete(cacheKey);
    throw error;
  }
}

async function runConfiguredDatabaseMigrations(databaseUrl: string, ssl: boolean) {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const status = await runMigrations(pool);
    if (status.appliedVersions.length > 0) {
      console.log(`[migrations] Applied ${status.appliedVersions.join(", ")}`);
    } else {
      console.log("[migrations] Schema is up to date");
    }
  } finally {
    await pool.end();
  }
}

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type DatabaseRow = Record<string, unknown>;

export type MigrationFile = {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
};

export type AppliedMigration = {
  version: string;
  filename: string;
  checksum: string;
  appliedAt: string;
};

export type MigrationStatusEntry = {
  version: string;
  filename: string;
  status: "applied" | "pending" | "changed" | "missing";
  checksum: string;
  appliedAt: string | null;
};

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../migrations/", import.meta.url));
const VALID_MIGRATION_FILENAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

const ENSURE_SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function loadMigrationFiles() {
  const directoryEntries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
  const migrationFiles: MigrationFile[] = [];
  const seenVersions = new Set<string>();

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const parsed = parseMigrationFileName(entry.name);
    if (!parsed) {
      continue;
    }

    const { version } = parsed;
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version detected: ${version}`);
    }

    seenVersions.add(version);

    const filePath = fileURLToPath(new URL(`../../migrations/${entry.name}`, import.meta.url));
    const sql = normalizeMigrationSql(await readFile(filePath, "utf8"));
    migrationFiles.push({
      version,
      filename: entry.name,
      checksum: sha256(sql),
      sql,
    });
  }

  migrationFiles.sort(compareMigrationVersions);
  return migrationFiles;
}

export async function getMigrationStatus(pool: Pool) {
  await ensureSchemaMigrationsTable(pool);

  const migrationFiles = await loadMigrationFiles();
  const appliedMigrations = await loadAppliedMigrations(pool);
  const appliedByVersion = new Map(appliedMigrations.map((migration) => [migration.version, migration]));
  const statusEntries: MigrationStatusEntry[] = [];

  for (const migration of migrationFiles) {
    const applied = appliedByVersion.get(migration.version);
    if (!applied) {
      statusEntries.push({
        version: migration.version,
        filename: migration.filename,
        status: "pending",
        checksum: migration.checksum,
        appliedAt: null,
      });
      continue;
    }

    const hasChanged = applied.checksum !== migration.checksum || applied.filename !== migration.filename;
    statusEntries.push({
      version: migration.version,
      filename: migration.filename,
      status: hasChanged ? "changed" : "applied",
      checksum: migration.checksum,
      appliedAt: applied.appliedAt,
    });
  }

  for (const applied of appliedMigrations) {
    if (migrationFiles.some((migration) => migration.version === applied.version)) {
      continue;
    }

    statusEntries.push({
      version: applied.version,
      filename: applied.filename,
      status: "missing",
      checksum: applied.checksum,
      appliedAt: applied.appliedAt,
    });
  }

  statusEntries.sort(compareStatusEntries);

  return {
    migrationsDirectory: MIGRATIONS_DIRECTORY,
    entries: statusEntries,
    summary: {
      applied: statusEntries.filter((entry) => entry.status === "applied").length,
      pending: statusEntries.filter((entry) => entry.status === "pending").length,
      changed: statusEntries.filter((entry) => entry.status === "changed").length,
      missing: statusEntries.filter((entry) => entry.status === "missing").length,
      totalFiles: migrationFiles.length,
      totalTracked: appliedMigrations.length,
    },
  };
}

export async function runMigrations(pool: Pool) {
  const initialStatus = await getMigrationStatus(pool);
  const blockingEntries = initialStatus.entries.filter((entry) => entry.status === "changed" || entry.status === "missing");
  if (blockingEntries.length > 0) {
    const details = blockingEntries
      .map((entry) => `${entry.status.toUpperCase()} ${entry.version} (${entry.filename})`)
      .join("\n");
    throw new Error(`Migration status is unsafe:\n${details}`);
  }

  const pendingEntries = initialStatus.entries.filter((entry) => entry.status === "pending");
  const migrationFiles = await loadMigrationFiles();
  const migrationFilesByVersion = new Map(migrationFiles.map((migration) => [migration.version, migration]));
  const appliedVersions: string[] = [];

  for (const pendingEntry of pendingEntries) {
    const migration = migrationFilesByVersion.get(pendingEntry.version);
    if (!migration) {
      throw new Error(`Pending migration file is missing: ${pendingEntry.version}`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSchemaMigrationsTable(client);
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, filename, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.filename, migration.checksum],
      );
      await client.query("COMMIT");
      appliedVersions.push(migration.version);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      throw error;
    } finally {
      client.release();
    }
  }

  const finalStatus = await getMigrationStatus(pool);
  return {
    ...finalStatus,
    appliedVersions,
  };
}

async function ensureSchemaMigrationsTable(queryable: Queryable) {
  await queryable.query(ENSURE_SCHEMA_MIGRATIONS_SQL);
}

async function loadAppliedMigrations(queryable: Queryable) {
  const result = await queryable.query<DatabaseRow>(
    `SELECT version, filename, checksum, applied_at
     FROM schema_migrations
     ORDER BY version ASC`,
  );

  return result.rows.map((row) => ({
    version: stringValue(row.version),
    filename: stringValue(row.filename),
    checksum: stringValue(row.checksum),
    appliedAt: stringValue(row.applied_at),
  }));
}

function normalizeMigrationSql(sql: string) {
  return sql.replace(/\r\n/g, "\n");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function compareMigrationVersions(left: MigrationFile, right: MigrationFile) {
  return left.version.localeCompare(right.version);
}

function compareStatusEntries(left: MigrationStatusEntry, right: MigrationStatusEntry) {
  return left.version.localeCompare(right.version);
}

function parseMigrationFileName(filename: string) {
  const match = filename.match(VALID_MIGRATION_FILENAME);
  if (!match) {
    return null;
  }

  return {
    version: match[1],
    filename,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

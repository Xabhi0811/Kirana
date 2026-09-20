import { Client } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI environment may supply values. */
}
const connection = process.env.DIRECT_URL;
if (!connection)
  throw new Error("Set the server-only DIRECT_URL in .env.local.");
const parsed = new URL(connection);
const project = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost",
).hostname.split(".")[0];
if (
  parsed.hostname.endsWith(".supabase.com") &&
  decodeURIComponent(parsed.username) !== "postgres." + project
)
  throw new Error(
    "Database connection does not match the configured Supabase project.",
  );
if (parsed.port === "6543")
  throw new Error(
    "Migrations require the session pooler on port 5432, not the transaction pooler.",
  );
const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
const caFile = process.env.SUPABASE_DB_CA_FILE;
const client = new Client({
  connectionString: connection,
  ssl: local
    ? false
    : {
        rejectUnauthorized: true,
        ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
      },
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
  application_name: "localkart-migrations",
});
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
async function main() {
  await client.connect();
  const { rows: tables } = await client.query<{ name: string; rls: boolean }>(
    "select tablename as name,rowsecurity as rls from pg_tables where schemaname='public' order by tablename",
  );
  console.log("Connected to configured project through the session pooler.");
  console.log("Public tables:", JSON.stringify(tables));
  const { rows: accounts } = await client.query<{ count: string }>(
    "select count(*) from auth.users",
  );
  console.log("Existing Auth accounts:", accounts[0].count);
  if (process.argv.includes("--inspect")) return;
  if (!process.argv.includes("--apply"))
    throw new Error("Choose --inspect or --apply.");
  const filenames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{12}_.+\.sql$/.test(name))
    .sort();
  if (!filenames.length) throw new Error("No migration files found.");
  await client.query("begin");
  try {
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('localkart-migration',0))",
    );
    const tracker = await client.query<{ exists: string | null }>(
      "select to_regclass('private.localkart_migrations')::text as exists",
    );
    if (!tracker.rows[0].exists) {
      // Never adopt an unknown installation or overwrite another application's tables.
      const current = await client.query(
        "select tablename from pg_tables where schemaname='public'",
      );
      if (current.rows.length)
        throw new Error(
          "The public schema is not empty and has no migration tracker. No changes made; inspect before proceeding.",
        );
      if (Number(accounts[0].count) > 0)
        throw new Error(
          "Existing Auth accounts require an explicit profile backfill plan. No changes made.",
        );
      await client.query("create schema if not exists private");
      await client.query("revoke all on schema private from public");
      await client.query(
        "create table private.localkart_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now())",
      );
      await client.query(
        "revoke all on private.localkart_migrations from public,anon,authenticated",
      );
    }
    let installed = 0;
    for (const filename of filenames) {
      const version = filename.slice(0, -4);
      const sql = await readFile(new URL(filename, migrationDirectory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string }>(
        "select checksum from private.localkart_migrations where version=$1",
        [version],
      );
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(
            "The applied migration differs from this file. Use a new migration rather than editing the installed version.",
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        "insert into private.localkart_migrations(version,checksum) values($1,$2)",
        [version, checksum],
      );
      installed++;
    }
    await client.query("commit");
    console.log(
      `Committed ${installed} pending Kirana migration(s) atomically.`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
void main()
  .catch((error: unknown) => {
    // Never print a connection string, config object, or stack containing credentials.
    const code = (error as { code?: string }).code;
    const safe =
      error instanceof Error ? error.message : "Database connection failed";
    console.error(
      "Database operation failed:",
      code || "",
      safe
        .replaceAll(connection!, "[redacted]")
        .replaceAll(decodeURIComponent(parsed.password), "[redacted]"),
    );
    process.exitCode = 1;
  })
  .finally(() => client.end());

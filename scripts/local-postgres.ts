// Workspace-local PostgreSQL for schema development, not a Supabase Auth server.
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(".local-postgres"),
  bin = join(root, "pgsql", "bin"),
  data = join(root, "data"),
  credentialsFile = join(root, "credentials.json");
const action = process.argv[2] || "status";
type Credentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};
function run(program: string, args: string[], allowFailure = false) {
  const result = spawnSync(join(bin, program + ".exe"), args, {
    encoding: "utf8",
    windowsHide: true,
    // A background Windows postgres process must not inherit captured runner pipes.
    stdio: program === "pg_ctl" && args.includes("start") ? "ignore" : "pipe",
  });
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `${program} failed: ${result.stderr || result.stdout || result.error?.message}`,
    );
  return result;
}
async function main() {
  if (!["setup", "start", "stop", "status"].includes(action))
    throw new Error("Use setup, start, stop or status.");
  if (!existsSync(join(bin, "postgres.exe")))
    throw new Error(
      "Extract the official PostgreSQL Windows binaries into .local-postgres/pgsql first.",
    );
  if (action === "stop") {
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    console.log("Local PostgreSQL stopped.");
    return;
  }
  if (action === "status") {
    const status = run("pg_ctl", ["-D", data, "status"], true);
    console.log(status.stdout || "Local PostgreSQL is not running.");
    return;
  }
  mkdirSync(root, { recursive: true });
  let credentials: Credentials;
  if (existsSync(credentialsFile))
    credentials = JSON.parse(readFileSync(credentialsFile, "utf8"));
  else {
    if (existsSync(join(data, "PG_VERSION")))
      throw new Error(
        "Cluster already exists without credentials; refusing to overwrite it.",
      );
    if (action !== "setup") throw new Error("Run setup first.");
    credentials = {
      host: "127.0.0.1",
      port: 54329,
      user: "postgres",
      password: randomBytes(32).toString("base64url"),
      database: "localkart",
    };
    writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (!existsSync(join(data, "PG_VERSION"))) {
    if (action !== "setup") throw new Error("Run setup first.");
    // Password file is confined to the ignored directory and is never logged.
    const passwordFile = join(root, "init-password.txt");
    writeFileSync(passwordFile, credentials.password + "\n", { mode: 0o600 });
    run("initdb", [
      "-D",
      data,
      "-U",
      credentials.user,
      "--encoding=UTF8",
      "--locale=C",
      "--auth-host=scram-sha-256",
      "--auth-local=scram-sha-256",
      `--pwfile=${passwordFile}`,
    ]);
    // Empty the generated one-time password file; keep the recoverable JSON credentials.
    writeFileSync(passwordFile, "");
  }
  if (run("pg_ctl", ["-D", data, "status"], true).status !== 0)
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      join(root, "server.log"),
      "-o",
      `-h 127.0.0.1 -p ${credentials.port} -c wal_level=logical`,
      "-w",
      "start",
    ]);
  if (action === "start") {
    console.log(`Local PostgreSQL running on 127.0.0.1:${credentials.port}.`);
    return;
  }
  const admin = new Client({
    ...credentials,
    database: "postgres",
    ssl: false,
  });
  await admin.connect();
  try {
    if (
      !(
        await admin.query("select 1 from pg_database where datname=$1", [
          credentials.database,
        ])
      ).rowCount
    )
      await admin.query('create database "localkart"');
  } finally {
    await admin.end();
  }
  const db = new Client({ ...credentials, ssl: false });
  await db.connect();
  try {
    await db.query("begin");
    const tracked = (
      await db.query(
        "select to_regclass('private.localkart_migrations') as tracker",
      )
    ).rows[0].tracker;
    if (!tracked) {
      const existing = await db.query(
        "select tablename from pg_tables where schemaname in ('public','auth','storage','private')",
      );
      if (existing.rows.length)
        throw new Error(
          "Untracked database is not empty; refusing to change existing tables.",
        );
      await db.query(
        await readFileSync(
          resolve("supabase/local-postgres-bootstrap.sql"),
          "utf8",
        ),
      );
      await db.query(
        "create schema private; revoke all on schema private from public; create table private.localkart_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now()); revoke all on private.localkart_migrations from public,anon,authenticated;",
      );
    }
    let installed = 0;
    for (const file of readdirSync(resolve("supabase/migrations"))
      .filter((f) => /^\d{12}_.+\.sql$/.test(f))
      .sort()) {
      const version = file.slice(0, -4),
        sql = readFileSync(resolve("supabase/migrations", file), "utf8"),
        checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await db.query(
        "select checksum from private.localkart_migrations where version=$1",
        [version],
      );
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(
            "Installed migration checksum differs. Use a new migration; do not reset the database.",
          );
        continue;
      }
      await db.query(sql);
      await db.query(
        "insert into private.localkart_migrations(version,checksum) values($1,$2)",
        [version, checksum],
      );
      installed++;
    }
    await db.query("commit");
    const tables = await db.query(
      "select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename",
    );
    console.log(
      `PostgreSQL ready: 127.0.0.1:${credentials.port}, database ${credentials.database}; ${installed} migrations installed.`,
    );
    console.table(tables.rows);
    const relations = await db.query(
      "select count(*) as count from pg_constraint where contype='f' and connamespace='public'::regnamespace",
    );
    if (
      tables.rows.length !== 16 ||
      tables.rows.some((row) => !row.rowsecurity)
    )
      throw new Error("Expected 16 application tables with RLS enabled.");
    console.log(
      `Verified ${relations.rows[0].count} application foreign-key relationships.`,
    );
    // Verify the actual native PostgreSQL profile trigger without retaining a fake account.
    await db.query("begin");
    try {
      const probe = randomUUID();
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)",
        [
          probe,
          probe + "@local.invalid",
          JSON.stringify({ name: "Schema verification", role: "ADMIN" }),
        ],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        probe,
      ]);
      await db.query("set local role authenticated");
      const profile = await db.query(
        "select role from public.users where id=$1",
        [probe],
      );
      if (profile.rows[0]?.role !== "CUSTOMER")
        throw new Error("Profile trigger/RLS verification failed.");
      console.log(
        "Verified Auth-metadata profile trigger and own-profile RLS; signup metadata cannot grant ADMIN. No test account retained.",
      );
    } finally {
      await db.query("rollback");
    }
    console.log(
      "Credentials are in ignored .local-postgres/credentials.json. Supabase HTTP Auth/Storage/Realtime services are NOT installed. App .env.local is unchanged.",
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}
void main().catch((error) => {
  console.error(
    "Local PostgreSQL setup failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});

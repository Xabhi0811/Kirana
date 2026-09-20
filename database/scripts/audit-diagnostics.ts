// Read-only metadata plus a rolled-back RLS reproduction. Never logs credentials.
import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({
  connectionString: process.env.DIRECT_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(process.env.SUPABASE_DB_CA_FILE!, "utf8"),
  },
});
async function main() {
  try {
    await db.connect();
    const evidence: Record<string, unknown> = {
      checkedAt: new Date().toISOString(),
    };
    for (const [label, sql] of Object.entries({
      publications:
        "select * from pg_publication_tables where pubname='supabase_realtime'",
      policies:
        "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname",
      grants:
        "select grantee,table_name,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='chat_messages'",
      integrity:
        "select (select count(*) from public.orders o where total_amount<>(select coalesce(sum(total_price),0) from public.order_items i where i.order_id=o.id)) as bad_totals,(select count(*) from public.products where stock_quantity<0) as negative_stock",
      tables:
        "select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename",
      columns:
        "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
      authIntegrity:
        "select (select count(*) from auth.users a left join public.users u on a.id=u.id where u.id is null) as missing_profiles,(select count(*) from public.users u left join auth.users a on a.id=u.id where a.id is null) as orphan_profiles,(select count(*) from public.users u join auth.users a on a.id=u.id where u.email is distinct from a.email) as mismatched_emails",
      constraints:
        "select c.conrelid::regclass::text as table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by 1,2",
      indexes:
        "select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname",
      functions:
        "select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace order by proname",
      orderTimeline:
        "select count(*) as inconsistent_latest_status from public.orders o where o.status is distinct from (select t.status from public.order_tracking t where t.order_id=o.id order by t.created_at desc,t.id desc limit 1)",
      buckets:
        "select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id",
    })) {
      evidence[label] = (await db.query(sql)).rows;
      console.log(
        label,
        ["constraints", "indexes", "functions", "columns", "policies"].includes(
          label,
        )
          ? `${(evidence[label] as unknown[]).length} definitions`
          : JSON.stringify(evidence[label]),
      );
    }
    const counts: Record<string, number> = {};
    for (const { tablename } of evidence.tables as { tablename: string }[])
      counts[tablename] = Number(
        (await db.query(`select count(*) from public.${tablename}`)).rows[0]
          .count,
      );
    evidence.counts = counts;
    evidence.regressions = (
      await db.query(readFileSync("database/supabase/tests/integrity.sql", "utf8"))
    ).rows;
    if (
      (evidence.regressions as { violations: number }[]).some(
        (r) => Number(r.violations) > 0,
      )
    )
      process.exitCode = 1;
    console.log("Integrity regressions", JSON.stringify(evidence.regressions));
    await db.query("begin");
    const keeper = (
      await db.query(
        "select id from public.users where email='demo.shopkeeper@localkart.test'",
      )
    ).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      keeper,
    ]);
    await db.query("set local role authenticated");
    try {
      await db.query(
        "insert into public.shops(owner_id,category_id,name,address,latitude,longitude,delivery_radius_km) select $1,id,'Audit rollback shop','Audit road',12.9784,77.6408,5 from public.categories limit 1 returning id",
        [keeper],
      );
      console.log("Shop INSERT RETURNING: PASS");
      evidence.shopInsertReturning = "PASS";
    } catch (e) {
      evidence.shopInsertReturning = "FAIL";
      process.exitCode = 1;
      console.log(
        "Shop INSERT RETURNING:",
        (e as { code: string }).code,
        (e as Error).message,
      );
    }
    await db.query("rollback");
    writeFileSync(
      "database/evidence/audit-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    await db.end();
  }
}
void main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});

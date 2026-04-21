import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(url);

const tables = (await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`) as { table_name: string }[];

console.log("=== public tables ===");
for (const row of tables) console.log(" -", row.table_name);

const propertiesCols = (await sql`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'properties'
  ORDER BY ordinal_position
`) as {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}[];

console.log("\n=== properties columns (ordinal order) ===");
for (const c of propertiesCols) {
  const nullable = c.is_nullable === "YES" ? "NULL" : "NOT NULL";
  const dflt = c.column_default ? ` DEFAULT ${c.column_default}` : "";
  console.log(` - ${c.column_name.padEnd(24)} ${c.data_type.padEnd(28)} ${nullable}${dflt}`);
}

const checks = (await sql`
  SELECT conname, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public' AND c.contype = 'c'
  ORDER BY conname
`) as { conname: string; def: string }[];

console.log("\n=== CHECK constraints ===");
for (const c of checks) console.log(` - ${c.conname}: ${c.def}`);

const indexes = (await sql`
  SELECT tablename, indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname
`) as { tablename: string; indexname: string }[];

console.log("\n=== indexes ===");
for (const i of indexes) console.log(` - ${i.tablename}.${i.indexname}`);

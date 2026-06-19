/**
 * Migration runner.
 *
 * Applies every `migrations/*.sql` file in filename order against the Neon
 * DIRECT (unpooled) connection. Applied migrations are recorded in a
 * `schema_migrations` ledger so re-running only applies what's new. Each file
 * runs inside a single transaction — a failure rolls the whole file back.
 *
 *   npm run migrate            # apply all pending migrations
 *   npm run migrate:status     # show applied vs pending, apply nothing
 *
 * Uses DATABASE_URL_UNPOOLED on purpose: pooled (PgBouncer) connections can
 * mishandle multi-statement DDL and session-level locks.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// Load .env.local (preferred) then fall back to .env.
loadEnv({ path: ".env.local" });
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const connectionString = process.env.DATABASE_URL_UNPOOLED;
const statusOnly = process.argv.includes("--status");

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function listMigrationFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  if (!connectionString) {
    fail("DATABASE_URL_UNPOOLED is not set. Copy .env.local.example to .env.local and fill it in.");
  }

  const files = listMigrationFiles();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    // Integrity check: warn loudly if a previously-applied file changed on disk.
    for (const file of files) {
      const prior = applied.get(file);
      if (prior) {
        const current = sha256(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        if (prior !== current) {
          fail(
            `Migration ${file} was already applied but its contents changed ` +
              `(checksum mismatch). Never edit an applied migration — add a new one.`,
          );
        }
      }
    }

    const pending = files.filter((f) => !applied.has(f));

    console.log(`\nMigrations dir: ${MIGRATIONS_DIR}`);
    console.log(`Found ${files.length} file(s); ${applied.size} applied; ${pending.length} pending.`);

    if (statusOnly) {
      for (const f of files) {
        console.log(`  ${applied.has(f) ? "✓ applied" : "• pending"}  ${f}`);
      }
      console.log("");
      return;
    }

    if (pending.length === 0) {
      console.log("Nothing to apply. Database is up to date.\n");
      return;
    }

    for (const file of pending) {
      const fullPath = join(MIGRATIONS_DIR, file);
      const text = readFileSync(fullPath, "utf8");
      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query("BEGIN");
        await client.query(text);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [file, sha256(text)],
        );
        await client.query("COMMIT");
        console.log("done");
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        throw err;
      }
    }

    console.log(`\nApplied ${pending.length} migration(s).\n`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

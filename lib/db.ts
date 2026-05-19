import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
    });
  }
  return pool;
}

async function ensureBannerEventsSchema(): Promise<void> {
  const db = getDbPool();
  await db.query(`
    ALTER TABLE banner_events
      ADD COLUMN IF NOT EXISTS generation_success BOOLEAN,
      ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
      ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
      ADD COLUMN IF NOT EXISTS total_tokens INTEGER,
      ADD COLUMN IF NOT EXISTS image_model TEXT
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_banner_events_ts_event
      ON banner_events (timestamp DESC, event_name);

    CREATE INDEX IF NOT EXISTS idx_banner_events_ts_user
      ON banner_events (timestamp DESC, user_id);
  `);
}

export async function ensureAnalyticsSchemaReady(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureBannerEventsSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

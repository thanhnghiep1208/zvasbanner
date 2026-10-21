import "server-only";

import {
  contactInfoFromEnv,
  validateContactInfo,
  type ContactInfo,
} from "@/lib/contact-info";
import { getDbPool } from "@/lib/db";

const CONTACT_KEY = "contact_info";

export type ContactInfoSource = "db" | "env";

let tableReady: Promise<void> | null = null;

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function ensureAppSettingsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getDbPool()
      .query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

/**
 * Thông tin liên hệ admin đã lưu trong DB; chưa lưu (hoặc DB lỗi) thì dùng
 * CONTACT_EMAIL / CONTACT_PHONE. Không cache trong bộ nhớ: trang editor và
 * route PUT có thể chạy ở instance khác nhau, cache sẽ hiện giá trị cũ sau khi lưu.
 */
export async function getContactInfo(): Promise<{ value: ContactInfo; source: ContactInfoSource }> {
  let value = contactInfoFromEnv(process.env);
  let source: ContactInfoSource = "env";
  if (hasDatabase()) {
    try {
      await ensureAppSettingsTable();
      const res = await getDbPool().query<{ value: unknown }>(
        "SELECT value FROM app_settings WHERE key = $1",
        [CONTACT_KEY]
      );
      const parsed = res.rows[0] ? validateContactInfo(res.rows[0].value) : null;
      if (parsed?.ok) {
        value = parsed.value;
        source = "db";
      }
    } catch (error) {
      console.warn("[contact-settings] read failed, using env", error);
    }
  }

  return { value, source };
}

export async function saveContactInfo(value: ContactInfo, actorUserId: string): Promise<void> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is not set");
  }
  await ensureAppSettingsTable();
  await getDbPool().query(
    `
    INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ($1, $2, now(), $3)
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
    `,
    [CONTACT_KEY, JSON.stringify(value), actorUserId]
  );
}

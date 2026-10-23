import { createClient } from '@libsql/client';
let cached, key;
export function database(conf) {
  const next = `${conf.databaseUrl}:${conf.databaseToken || ''}`;
  if (!cached || key !== next) {
    cached?.close();
    cached = createClient({ url: conf.databaseUrl, authToken: conf.databaseToken || undefined });
    key = next;
  }
  return cached;
}
export function closeDatabase() { cached?.close(); cached = undefined; key = undefined; }

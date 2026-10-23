import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL in the selected environment.');
if (url.startsWith('file:private/')) await mkdir('private', { recursive: true });
if (!url.startsWith('file:') && process.env.MIGRATION_TARGET !== 'production' && process.env.MIGRATION_TARGET !== 'preview') throw new Error('Cloud migrations require MIGRATION_TARGET=production or preview. Verify the selected database first.');
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
try {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  for (const name of (await readdir('migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    const sql = await readFile(`migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const current = await db.execute({ sql: 'SELECT checksum FROM schema_migrations WHERE name = ?', args: [name] });
    if (current.rows.length) { if (current.rows[0].checksum !== checksum) throw new Error(`Previously applied migration changed: ${name}`); continue; }
    const tx = await db.transaction('write');
    try {
      await tx.executeMultiple(sql);
      await tx.execute({ sql: 'INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)', args: [name, checksum, new Date().toISOString()] });
      await tx.commit();
      console.log(`Applied ${name}`);
    } finally { tx.close(); }
  }
  console.log('Database migrations complete. Existing plans were preserved.');
} finally { db.close(); }

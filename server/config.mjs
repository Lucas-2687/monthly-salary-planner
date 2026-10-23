export function config() {
  const { APP_ORIGIN, PLANNER_ENV, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, PLANNER_PASSWORD_HASH, SESSION_SECRET, VERCEL_ENV } = process.env;
  if (!['development', 'preview', 'production'].includes(PLANNER_ENV)) throw new Error('Invalid environment');
  const url = new URL(APP_ORIGIN);
  if (url.origin !== APP_ORIGIN || url.username || url.password) throw new Error('Invalid origin');
  if (url.protocol !== 'https:' && !(PLANNER_ENV === 'development' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new Error('HTTPS required');
  if (VERCEL_ENV && VERCEL_ENV !== PLANNER_ENV) throw new Error('Deployment environment mismatch');
  if (!TURSO_DATABASE_URL || !/^(file:|libsql:\/\/|https:\/\/)/.test(TURSO_DATABASE_URL)) throw new Error('Invalid database');
  if (PLANNER_ENV !== 'development' && (TURSO_DATABASE_URL.startsWith('file:') || !TURSO_AUTH_TOKEN)) throw new Error('Cloud database required');
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(PLANNER_PASSWORD_HASH || '') || (SESSION_SECRET || '').length < 43) throw new Error('Authentication not configured');
  return { origin: APP_ORIGIN, environment: PLANNER_ENV, databaseUrl: TURSO_DATABASE_URL, databaseToken: TURSO_AUTH_TOKEN, passwordHash: PLANNER_PASSWORD_HASH, secret: SESSION_SECRET, secure: url.protocol === 'https:' };
}

import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword, issueSession, sessionCookie, authorized } from '../server/auth.mjs';
import { config } from '../server/config.mjs';
import { database, closeDatabase } from '../server/db.mjs';
import { auth, state } from '../server/handlers.mjs';
import { fixture } from './fixtures.mjs';
let conf, cookie;
const password = 'synthetic-test-password-with-no-real-account';
before(async () => {
  Object.assign(process.env, { APP_ORIGIN: 'http://localhost:3000', PLANNER_ENV: 'development', TURSO_DATABASE_URL: 'file::memory:', TURSO_AUTH_TOKEN: '', PLANNER_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(48).toString('base64url') });
  delete process.env.VERCEL_ENV;
  conf = config(); cookie = sessionCookie(issueSession(conf), conf).split(';')[0];
  await database(conf).executeMultiple(await readFile('migrations/001_initial.sql', 'utf8'));
});
beforeEach(async () => { await database(conf).executeMultiple('DELETE FROM planner_states; DELETE FROM planner_history; DELETE FROM login_attempts;'); });
after(() => { closeDatabase(); });
function request(method = 'GET', body, { authenticated = true, origin = conf.origin, contentType = 'application/json' } = {}) {
  const headers = new Headers({ 'content-type': contentType });
  if (authenticated) headers.set('cookie', cookie);
  if (origin) headers.set('origin', origin);
  return new Request(`${conf.origin}/api/state`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const put = (data = fixture(), revision = 0) => ({ userId: 'owner', revision, state: data });
test('anonymous readers and writers cannot access records', async () => {
  assert.equal((await state(request('GET', undefined, { authenticated: false }))).status, 401);
  assert.equal((await state(request('PUT', put(), { authenticated: false }))).status, 401);
});
test('forged and expired session cookies fail, password rotation invalidates sessions', () => {
  const forged = request(); forged.headers.set('cookie', cookie + 'a'); assert.equal(authorized(forged, conf), false);
  const expired = request(); expired.headers.set('cookie', sessionCookie(issueSession(conf, Date.now() - 13 * 3600000), conf)); assert.equal(authorized(expired, conf), false);
  assert.equal(authorized(request(), { ...conf, passwordHash: conf.passwordHash.replace(/.$/, conf.passwordHash.endsWith('0') ? '1' : '0') }), false);
});
test('authenticated save and read preserve complete original records', async () => {
  assert.equal((await state(request('PUT', put()))).status, 200);
  const response = await state(request()); const result = await response.json();
  assert.deepEqual(result.state, fixture()); assert.equal(result.revision, 1); assert.equal(result.userId, 'owner');
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('simultaneous first writes have exactly one winner', async () => {
  const responses = await Promise.all([state(request('PUT', put())), state(request('PUT', put()))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
});
test('simultaneous updates cannot silently overwrite another device', async () => {
  await state(request('PUT', put()));
  const one = fixture(), two = fixture(); one.plans['2025-01'].income = 101; two.plans['2025-01'].income = 102;
  const results = await Promise.all([state(request('PUT', put(one, 1))), state(request('PUT', put(two, 1)))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await (await state(request())).json()).revision, 2);
});
test('cross-origin state changes, login, and logout are denied', async () => {
  assert.equal((await state(request('PUT', put(), { origin: 'https://untrusted.example' }))).status, 403);
  assert.equal((await auth(request('POST', { password }, { origin: 'https://untrusted.example' }))).status, 403);
  assert.equal((await auth(request('DELETE', undefined, { origin: null }))).status, 403);
});
test('bad content types, oversized payloads, malformed records and revisions fail safely', async () => {
  assert.equal((await state(request('PUT', put(), { contentType: 'text/plain' }))).status, 415);
  assert.equal((await state(request('PUT', { ...put(), revision: -1 }))).status, 400);
  assert.equal((await state(request('PUT', { ...put(), userId: 'other' }))).status, 409);
  assert.equal((await state(request('PUT', put({ version: 9 })))).status, 400);
  assert.equal((await state(request('PUT', { huge: 'x'.repeat(3 * 1024 * 1024) }))).status, 413);
  assert.equal((await (await state(request())).json()).revision, 0);
});
test('correct login issues HttpOnly session; logout clears it', async () => {
  const response = await auth(request('POST', { password }, { authenticated: false }));
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  const secureConf = { ...conf, secure: true }; assert.match(sessionCookie(issueSession(secureConf), secureConf), /^__Host-.*; Secure$/);
  const logout = await auth(request('DELETE')); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
test('database-backed rate limits reject repeated password guesses', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await auth(request('POST', { password: 'wrong' }, { authenticated: false }))).status, 401);
  assert.equal((await auth(request('POST', { password }, { authenticated: false }))).status, 429);
});
test('only latest 30 saved revisions are retained atomically', async () => {
  for (let revision = 0; revision < 32; revision++) assert.equal((await state(request('PUT', put(fixture(), revision)))).status, 200);
  const history = await database(conf).execute('SELECT revision FROM planner_history ORDER BY revision');
  assert.equal(history.rows.length, 30); assert.equal(Number(history.rows[0].revision), 3); assert.equal(Number(history.rows.at(-1).revision), 32);
});
test('missing configuration and preview/production mismatch fail closed', async () => {
  const original = process.env.SESSION_SECRET; process.env.SESSION_SECRET = '';
  assert.equal((await state(request())).status, 503); process.env.SESSION_SECRET = original;
  process.env.VERCEL_ENV = 'preview'; assert.equal((await state(request())).status, 503); delete process.env.VERCEL_ENV;
});
test('an unmigrated database never responds with a blank cloud state', async () => {
  closeDatabase();
  const response = await state(request()); assert.equal(response.status, 503);
  assert.equal('state' in await response.json(), false);
});

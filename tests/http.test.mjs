import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth.mjs';
import { config } from '../server/config.mjs';
import { database, closeDatabase } from '../server/db.mjs';
import { nodeHandler } from '../server/adapter.mjs';
import { auth, state } from '../server/handlers.mjs';
import { fixture } from './fixtures.mjs';

test('real HTTP login, cookie, save, reload, conflict and logout through the Vercel Node adapter', async () => {
  const password = randomBytes(24).toString('base64url');
  Object.assign(process.env, { PLANNER_ENV: 'development', TURSO_DATABASE_URL: 'file::memory:', TURSO_AUTH_TOKEN: '', PLANNER_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(48).toString('base64url') });
  delete process.env.VERCEL_ENV;
  const server = createServer((req, res) => nodeHandler(req.url === '/api/auth' ? auth : state)(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${server.address().port}`;
  process.env.APP_ORIGIN = origin;
  await database(config()).executeMultiple(await readFile('migrations/001_initial.sql', 'utf8'));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/state')).status, 401);
    const login = await fetch(base + '/api/auth', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const write = () => fetch(base + '/api/state', { method: 'PUT', headers, body: JSON.stringify({ userId: 'owner', revision: 0, state: fixture() }) });
    assert.equal((await write()).status, 200);
    assert.deepEqual((await (await fetch(base + '/api/state', { headers })).json()).state, fixture());
    assert.equal((await write()).status, 409);
    const bad = await fetch(base + '/api/state', { method: 'PUT', headers, body: '{' }); assert.equal(bad.status, 400);
    const logout = await fetch(base + '/api/auth', { method: 'DELETE', headers });
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(base + '/api/state')).status, 401);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); closeDatabase();
  }
});

test('Vercel pre-parsed JSON request bodies use the same authenticated validation', async () => {
  const request = { method: 'POST', url: '/api/auth', headers: { origin: 'https://wrong.example', 'content-type': 'application/json' }, body: { password: 'synthetic' } };
  const result = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(bytes) { this.body = JSON.parse(bytes.toString()); } };
  await nodeHandler(auth)(request, result);
  assert.equal(result.statusCode, 403);
});

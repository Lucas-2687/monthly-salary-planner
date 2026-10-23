import { config } from './config.mjs';
import { authorized, fingerprint, issueSession, sessionCookie, verifyPassword } from './auth.mjs';
import { database } from './db.mjs';
import { MAX_BODY, readJson, reply, sameOrigin } from './http.mjs';
import { validateBackup } from '../public/planner/core.js';

async function limitLogin(request, db, conf) {
  const window = Math.floor(Date.now() / 900000);
  // Vercel supplies the forwarding header. A global bound also limits forged addresses locally.
  const address = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 200);
  const globalKey = `global:${window}`, ipKey = `${fingerprint(address, conf)}:${window}`;
  const results = await db.batch([
    { sql: 'DELETE FROM login_attempts WHERE window < ?', args: [window - 1] },
    { sql: 'INSERT INTO login_attempts (key, window, attempts) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts', args: [globalKey, window] },
  ], 'write');
  if (Number(results[1].rows[0].attempts) > 100) return false;
  const ip = await db.execute({ sql: 'INSERT INTO login_attempts (key, window, attempts) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts', args: [ipKey, window] });
  return Number(ip.rows[0].attempts) <= 10;
}

export async function auth(request) {
  try {
    const conf = config();
    if (request.method === 'GET') return reply({ authenticated: authorized(request, conf) });
    if (!['POST', 'DELETE'].includes(request.method)) return reply({ error: '不支持此操作。' }, 405, { Allow: 'GET, POST, DELETE' });
    if (!sameOrigin(request, conf)) return reply({ error: '请求来源不正确。' }, 403);
    if (request.method === 'DELETE') return reply({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', conf, true) });
    const input = await readJson(request, 4096);
    if (!await limitLogin(request, database(conf), conf)) return reply({ error: '登录尝试过多，请 15 分钟后重试。' }, 429, { 'Retry-After': '900' });
    if (!await verifyPassword(input?.password, conf.passwordHash)) return reply({ error: '口令不正确。' }, 401);
    return reply({ ok: true }, 200, { 'Set-Cookie': sessionCookie(issueSession(conf), conf) });
  } catch (error) { return reply({ error: error.status ? error.message : '服务尚未就绪，请检查部署配置与数据库迁移。' }, error.status || 503); }
}

export async function state(request) {
  try {
    const conf = config();
    if (!authorized(request, conf)) return reply({ error: '请先登录。' }, 401);
    if (!['GET', 'PUT'].includes(request.method)) return reply({ error: '不支持此操作。' }, 405, { Allow: 'GET, PUT' });
    const db = database(conf);
    if (request.method === 'GET') {
      const result = await db.execute({ sql: 'SELECT data, revision FROM planner_states WHERE user_id = ?', args: ['owner'] });
      const row = result.rows[0];
      return reply({ state: row ? validateBackup(JSON.parse(row.data)) : null, revision: Number(row?.revision || 0), userId: 'owner' });
    }
    if (!sameOrigin(request, conf)) return reply({ error: '请求来源不正确。' }, 403);
    const input = await readJson(request);
    if (input?.userId !== 'owner') return reply({ error: '登录账号已变化，请刷新后再编辑。' }, 409);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) return reply({ error: '同步版本不正确。' }, 400);
    let validated;
    try { validated = validateBackup(input.state); }
    catch (error) { return reply({ error: error.message }, 400); }
    const data = JSON.stringify(validated);
    if (Buffer.byteLength(data) > MAX_BODY) return reply({ error: '记录不能超过 3 MB。' }, 413);
    const now = new Date().toISOString();
    const result = input.revision === 0
      ? await db.execute({ sql: 'INSERT INTO planner_states (user_id, data, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision', args: ['owner', data, now] })
      : await db.execute({ sql: 'UPDATE planner_states SET data = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision', args: [data, now, 'owner', input.revision] });
    if (!result.rows.length) return reply({ error: '其他设备已有更新，请处理同步冲突。' }, 409);
    return reply({ revision: Number(result.rows[0].revision) });
  } catch (error) { return reply({ error: error.status ? error.message : '云端暂不可用，请稍后重试。' }, error.status || 503); }
}

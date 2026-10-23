import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_SECONDS = 12 * 60 * 60;
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 20 || Buffer.byteLength(password) > 1024) throw new Error('口令至少需要 20 个字符，且不能超过 1024 字节。');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await scrypt(password, salt, 32, options)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const [, salt, expected] = encoded.split('$');
  const actual = await scrypt(password, salt, 32, options);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function signature(value, conf) {
  return createHmac('sha256', `${conf.secret}:${conf.passwordHash}`).update(value).digest('base64url');
}
export function issueSession(conf, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: 'owner', exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  return `${payload}.${signature(payload, conf)}`;
}
export function authorized(request, conf, now = Date.now()) {
  const cookieName = conf.secure ? '__Host-planner_session' : 'planner_session';
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
  if (!cookie || cookie.length > 1024) return false;
  const [payload, mac, extra] = cookie.slice(cookieName.length + 1).split('.');
  if (!payload || !mac || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(mac)) return false;
  const expected = signature(payload, conf);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const seconds = Math.floor(now / 1000);
    return data.v === 1 && data.sub === 'owner' && Number.isSafeInteger(data.exp) && data.exp > seconds && data.exp <= seconds + SESSION_SECONDS;
  } catch { return false; }
}
export function sessionCookie(value, conf, clear = false) {
  return `${conf.secure ? '__Host-planner_session' : 'planner_session'}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${conf.secure ? '; Secure' : ''}`;
}
export function fingerprint(value, conf) { return createHmac('sha256', conf.secret).update(value).digest('hex'); }

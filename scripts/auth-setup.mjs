import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth.mjs';
let env;
try { env = await readFile('.env.local', 'utf8'); } catch { env = await readFile('.env.example', 'utf8'); }
if (/^PLANNER_PASSWORD_HASH=.+$/m.test(env) || /^SESSION_SECRET=.+$/m.test(env)) throw new Error('Authentication already exists. Back up .env.local and explicitly remove its authentication values before rotating. Rotation signs out existing sessions.');
const password = randomBytes(24).toString('base64url');
env = env.replace(/^PLANNER_PASSWORD_HASH=.*$/m, `PLANNER_PASSWORD_HASH=${await hashPassword(password)}`)
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(48).toString('base64url')}`);
await mkdir('private', { recursive: true });
await writeFile('private/login.txt', `月薪分配登录口令：\n${password}\n\n请保存到密码管理器，之后删除此文件。不要上传、提交或分享此文件。\n`, { mode: 0o600, flag: 'wx' });
await writeFile('.env.local', env, { mode: 0o600 });
console.log('已生成本地认证配置。请在 private/login.txt 查看口令并保存到密码管理器。终端不会显示口令。');

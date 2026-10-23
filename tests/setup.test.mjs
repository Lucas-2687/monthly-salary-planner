import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('authentication setup works after Vercel link without overwriting existing variables or printing the password', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'planner-setup-'));
  try {
    await writeFile(path.join(directory, '.env.example'), await readFile('.env.example', 'utf8'));
    await writeFile(path.join(directory, '.env.local'), 'VERCEL_OIDC_TOKEN=synthetic\n');
    const result = spawnSync(process.execPath, [path.resolve('scripts/auth-setup.mjs')], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const generated = await readFile(path.join(directory, '.env.local'), 'utf8');
    const password = (await readFile(path.join(directory, 'private/login.txt'), 'utf8')).split('\n')[1];
    assert.match(generated, /^VERCEL_OIDC_TOKEN=synthetic$/m);
    assert.match(generated, /^APP_ORIGIN=http:\/\/localhost:3000$/m);
    assert.match(generated, /^PLANNER_PASSWORD_HASH=scrypt\$/m);
    assert.match(generated, /^SESSION_SECRET=.{43,}$/m);
    assert.equal(result.stdout.includes(password), false);
    const again = spawnSync(process.execPath, [path.resolve('scripts/auth-setup.mjs')], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(again.status, 0);
    assert.equal(await readFile(path.join(directory, '.env.local'), 'utf8'), generated);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

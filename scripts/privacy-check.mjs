import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ignored = new Set(['.git', 'node_modules', 'dist', '.vercel', 'private', 'backups', 'coverage']);
const forbidden = [
  /art_v\d+_[A-Za-z0-9_]{15,}/,
  /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
  /(?:libsql|https):\/\/[^\s"']+\.turso\.io/,
  /appgprj_[a-f0-9]{20,}/,
];
let failed = false;
async function checkFile(file) {
  const parts = file.replaceAll('\\', '/').split('/');
  if (parts.some(part => ignored.has(part)) || parts.some(part => part.startsWith('.env') && part !== '.env.example') || /\.(db|sqlite|log)(-|$|\.)/.test(file)) {
    console.error(`Private/generated file included in release source: ${file}`); failed = true; return;
  }
  const data = await readFile(file, 'utf8');
  if (forbidden.some(pattern => pattern.test(data))) { console.error(`Potential private value: ${file}`); failed = true; }
  if (/^(PLANNER_PASSWORD_HASH|SESSION_SECRET|TURSO_AUTH_TOKEN)=.+/m.test(data)) { console.error(`Nonempty credential setting: ${file}`); failed = true; }
}
async function visit(dir = '.') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) { console.error(`Review symbolic link: ${file}`); failed = true; continue; }
    if (entry.isDirectory()) { await visit(file); continue; }
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    await checkFile(file);
  }
}
const repository = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (repository.status === 0 && path.resolve(repository.stdout.trim()) === path.resolve('.')) {
  const files = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (files.status !== 0) throw new Error('Cannot enumerate release source');
  for (const file of new Set(files.stdout.split('\0').filter(Boolean))) await checkFile(file);
} else await visit();
if (failed) process.exitCode = 1;
else console.log('Release source scan passed. Manually review screenshots, commit identity, and any later-added content.');

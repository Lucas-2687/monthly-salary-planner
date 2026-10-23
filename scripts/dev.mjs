import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { nodeHandler } from '../server/adapter.mjs';
import { auth, state } from '../server/handlers.mjs';
const root = path.resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const security = JSON.parse(await readFile('vercel.json', 'utf8')).headers[0].headers;
createServer(async (req, res) => {
  for (const { key, value } of security) res.setHeader(key, value);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/state') return nodeHandler(state)(req, res);
  if (url.pathname === '/api/auth') return nodeHandler(auth)(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(3000, '127.0.0.1', () => console.log('Local: http://localhost:3000'));

import { cp, mkdir, readdir, lstat, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const destination = path.resolve(root, 'dist');
if (!destination.startsWith((await realpath(root)) + path.sep)) throw new Error('Unsafe build destination');
const previous = await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (previous?.isSymbolicLink()) throw new Error('Build destination must not be a symbolic link');
// Remove only the verified build directory, so obsolete assets cannot survive a release.
if (previous) await rm(destination, { recursive: true });
await mkdir('dist', { recursive: true });
// Only public assets are packaged. Secrets, source history, and backups never enter dist.
await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
const entries = await readdir('dist');
if (!entries.includes('index.html') || !entries.includes('planner')) throw new Error('Missing application assets');
console.log('Static application built. Server functions are deployed separately by Vercel.');

import { validateBackup } from './core.js';
let revision = 0, userId, pending = null, busy = false, conflict = false, timer;
let applyRemote = () => {}, mayRefresh = () => true;
const status = (message, failed = false) => { const element = document.querySelector('#save-status'); element.textContent = message; element.classList.toggle('failed', failed); };
const cacheKey = () => `salary-cloud-pending:${userId}`;
function cache() { try { if (pending) localStorage.setItem(cacheKey(), JSON.stringify({ revision, state: pending })); else localStorage.removeItem(cacheKey()); } catch {} }
function notice(message, retry = false, overwrite = false) {
  const panel = document.querySelector('#cloud-warning'); panel.hidden = !message;
  document.querySelector('#cloud-message').textContent = message;
  document.querySelector('#cloud-retry').hidden = !retry;
  document.querySelector('#cloud-remote').hidden = !overwrite;
  document.querySelector('#cloud-overwrite').hidden = !overwrite;
}
async function call(method = 'GET', body) {
  const response = await fetch('/api/state', { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  let result; try { result = await response.json(); } catch { throw new Error('云端连接中断，请重新登录或重试。'); }
  if (!response.ok) { const error = new Error(result.error || '云端连接失败。'); error.code = response.status; throw error; }
  return result;
}
function choose(title, message, options) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'cloud-dialog';
    const heading = document.createElement('h2'); heading.textContent = title;
    const description = document.createElement('p'); description.textContent = message;
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    options.forEach(([value, label]) => { const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = label; button.onclick = () => { dialog.close(); dialog.remove(); resolve(value); }; actions.append(button); });
    dialog.addEventListener('cancel', event => event.preventDefault()); dialog.append(heading, description, actions); document.body.append(dialog); dialog.showModal();
  });
}
function download(state) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '月薪分配-未同步记录.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function initializeCloud(makeBlank) {
  document.querySelector('.shell').inert = true;
  status('正在读取云端记录');
  let server;
  for (;;) {
    try { server = await call(); break; }
    catch (error) {
      if (error.code === 401) { window.location.replace('/'); await new Promise(() => {}); }
      status('云端暂不可用', true);
      const action = await choose('暂时无法读取记录', `${error.message} 已有云端记录不会被空白计划覆盖。`, [['retry', '重试'], ['login', '重新登录']]);
      if (action === 'login') { window.location.assign('/'); await new Promise(() => {}); }
    }
  }
  userId = server.userId; revision = server.revision;
  let state = server.state ? validateBackup(server.state) : makeBlank();
  try {
    const raw = localStorage.getItem(cacheKey());
    if (raw) {
      const saved = JSON.parse(raw), cached = validateBackup(saved.state);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('缓存版本无效');
      const action = await choose('这台设备有未同步的修改', '可恢复继续同步，或先导出副本后使用云端记录。如果其他设备已有更新，恢复后会提示版本冲突。', [['recover', '恢复修改'], ['remote', '导出副本并用云端记录']]);
      if (action === 'recover') { state = cached; revision = saved.revision; pending = structuredClone(cached); }
      else { download(cached); localStorage.removeItem(cacheKey()); }
    }
  } catch { notice('这台设备的待同步副本无法读取。云端记录已正常加载，原始副本仍保留。'); }
  document.querySelector('.shell').inert = false;
  status(pending ? '有待同步的修改' : '已读取云端记录');
  return { state, needsSave: !server.state || !!pending };
}
export function queueCloudSave(state) {
  pending = structuredClone(state); cache(); status(conflict ? '需要处理同步冲突' : '正在保存到云端', conflict);
  clearTimeout(timer); timer = setTimeout(flush, 400);
}
async function flush() {
  if (busy || conflict || !pending) return;
  busy = true; const snapshot = pending;
  try {
    const result = await call('PUT', { revision, userId, state: snapshot }); revision = result.revision;
    if (pending === snapshot) pending = null;
    cache(); notice(''); status(pending ? '正在保存到云端' : '已保存到云端');
  } catch (error) {
    conflict = error.code === 409;
    status(conflict ? '需要处理同步冲突' : '尚未保存到云端', true);
    notice(conflict ? '其他设备已修改记录，或登录账号已变化。请选用云端版本，或确认用本页版本覆盖。你可以先导出备份。' : `${error.message} 本页修改仍待同步，请保持页面打开或先导出备份；恢复网络后可重试。`, !conflict, conflict);
  } finally { busy = false; }
  if (pending && !conflict && document.querySelector('#cloud-warning').hidden) setTimeout(flush, 0);
}
async function refresh() {
  if (pending || busy || conflict || !mayRefresh()) return;
  try {
    const server = await call();
    if (server.userId !== userId) { window.location.reload(); return; }
    if (server.revision > revision && !pending && !busy && mayRefresh()) {
      const state = validateBackup(server.state); revision = server.revision; applyRemote(state); notice(''); status('已同步其他设备的记录');
    }
  } catch { status('暂时无法检查同步', true); }
}
export function connectCloud(onRemote, canRefresh) {
  applyRemote = onRemote; mayRefresh = canRefresh;
  document.querySelector('#logout').onclick = async () => {
    if (pending || busy) {
      notice('还有修改尚未保存，请等待同步完成或先导出备份，再退出。', !conflict, conflict);
      if (!conflict) flush();
      return;
    }
    try {
      const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('退出失败，请重试。');
      localStorage.removeItem(cacheKey());
      window.location.replace('/');
    } catch (error) { notice(error.message); }
  };
  document.querySelector('#cloud-retry').onclick = () => { notice(''); flush(); };
  document.querySelector('#cloud-remote').onclick = async () => {
    try {
      const server = await call();
      if (server.userId !== userId) { window.location.reload(); return; }
      const action = await choose('改用云端记录？', '本页尚未同步的版本会先导出为备份，再加载其他设备保存的记录。', [['cancel', '取消'], ['remote', '导出并加载云端']]);
      if (action !== 'remote') return;
      if (pending) download(pending); pending = null; conflict = false; revision = server.revision; cache();
      applyRemote(server.state ? validateBackup(server.state) : null); notice(''); status('已同步云端记录');
    } catch (error) { notice(error.message, false, true); }
  };
  document.querySelector('#cloud-overwrite').onclick = async () => {
    try {
      const server = await call();
      if (server.userId !== userId) { window.location.reload(); return; }
      const action = await choose('用本页版本覆盖云端？', '这会替换其他设备已保存的预算和投入记录。请确认本页包含你要保留的全部数据。', [['cancel', '取消'], ['overwrite', '确认覆盖']]);
      if (action !== 'overwrite') return;
      revision = server.revision; conflict = false; notice(''); cache(); flush();
    } catch (error) { notice(error.message, false, true); }
  };
  setInterval(refresh, 30000);
  window.addEventListener('focus', refresh); window.addEventListener('online', () => { if (conflict) return; if (pending) { notice(''); flush(); } else refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
}

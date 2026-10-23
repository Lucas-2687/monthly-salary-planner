const form = document.querySelector('#login-form'), button = document.querySelector('#login-button'), error = document.querySelector('#login-error');
try {
  const response = await fetch('/api/auth', { cache: 'no-store' });
  if (response.ok && (await response.json()).authenticated) location.replace('/planner/index.html');
  else if (!response.ok) { error.textContent = '服务尚未就绪，请检查部署配置与数据库迁移。'; error.hidden = false; }
} catch { error.textContent = '暂时无法连接，请稍后重试。'; error.hidden = false; }
form.addEventListener('submit', async event => {
  event.preventDefault(); button.disabled = true; error.hidden = true;
  const input = document.querySelector('#password');
  try {
    const response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }), signal: AbortSignal.timeout(15000) });
    input.value = '';
    if (!response.ok) throw new Error((await response.json()).error || '登录失败。');
    location.replace('/planner/index.html');
  } catch (failure) { error.textContent = failure.name === 'TimeoutError' ? '连接超时，请重试。' : failure.message; error.hidden = false; }
  finally { input.value = ''; button.disabled = false; }
});

export const MAX_BODY = 3 * 1024 * 1024;
export function reply(body, status = 200, extra = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
export function sameOrigin(request, conf) { return request.headers.get('origin') === conf.origin; }
export async function readJson(request, limit = MAX_BODY) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw Object.assign(new Error('请使用 JSON 请求。'), { status: 415 });
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Object.assign(new Error('请求内容过大。'), { status: 413 });
  const reader = request.body?.getReader();
  const chunks = []; let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw Object.assign(new Error('请求内容过大。'), { status: 413 }); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON 格式不正确。'), { status: 400 }); }
}

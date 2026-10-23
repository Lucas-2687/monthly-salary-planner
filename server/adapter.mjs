import { MAX_BODY, reply } from './http.mjs';
export function nodeHandler(handler) {
  return async (req, res) => {
    let response;
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join('; ') : value);
      let body;
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.body !== undefined) {
          body = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
          if (Buffer.byteLength(body) > MAX_BODY) throw Object.assign(new Error('请求内容过大。'), { status: 413 });
        } else {
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('请求内容过大。'), { status: 413 }); chunks.push(chunk); }
          body = Buffer.concat(chunks);
        }
      }
      response = await handler(new Request(`http://localhost${req.url}`, { method: req.method, headers, body }));
    } catch (error) { response = reply({ error: error.status ? error.message : '请求处理失败。' }, error.status || 500); }
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}

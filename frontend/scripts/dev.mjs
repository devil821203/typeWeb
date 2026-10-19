import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { injectTestLogin } from './dev-login.mjs';
const root = resolve('.');
const backend = new URL(process.env.API_PROXY || 'http://localhost:8080');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
http
  .createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      const transport = backend.protocol === 'https:' ? https : http;
      const proxy = transport.request(
        new URL(req.url, backend),
        { method: req.method, headers: { ...req.headers, host: backend.host } },
        (incoming) => {
          res.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end('Backend unavailable');
      });
      req.pipe(proxy);
      return;
    }
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (
        pathname !== '/' &&
        pathname !== '/index.html' &&
        !/^\/src\/[a-zA-Z0-9._-]+$/.test(pathname)
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = resolve(
        root,
        pathname === '/' ? 'index.html' : pathname.slice(1),
      );
      let data = await readFile(file);
      if (extname(file) === '.html')
        data = injectTestLogin(data.toString('utf8'));
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(Number(process.env.PORT || 5173), '127.0.0.1', () =>
    console.log('Frontend: http://localhost:' + (process.env.PORT || 5173)),
  );

/*
 * Development server: serves this folder and proxies /api/* to the backend, so
 * the page and the API share one origin.
 *
 * That matters more than convenience. admin_token is SameSite=Lax, and a
 * browser refuses to store a Lax cookie that arrives from a cross-site
 * response — including localhost vs 127.0.0.1, which are different sites even
 * though they are the same machine. Behind this proxy the cookie is
 * first-party, so it is stored and returned like it will be in production.
 *
 *   node dev-server.js
 *   PORT=3000 API_TARGET=http://localhost:9090 node dev-server.js
 *
 * Requires no dependencies and no CORS configuration on the backend.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5173);
const API_TARGET = new URL(process.env.API_TARGET || 'http://localhost:8080');
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function proxy(req, res) {
  const upstream = http.request(
    {
      protocol: API_TARGET.protocol,
      hostname: API_TARGET.hostname,
      port: API_TARGET.port,
      method: req.method,
      path: req.url,
      // Present the request as if it arrived at the backend directly; the
      // Cookie header rides along untouched.
      headers: { ...req.headers, host: API_TARGET.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    console.error(`  proxy error: ${req.method} ${req.url} -> ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'ProxyError',
      error: `Cannot reach the backend at ${API_TARGET.origin}. Is it running?`,
    }));
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  const requested = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const relative = requested === '/' ? 'index.html' : requested.slice(1);
  const filePath = path.resolve(ROOT, relative);

  // Never serve anything outside this folder.
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(body);
  });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxy(req, res);
    return serveStatic(req, res);
  })
  .listen(PORT, () => {
    console.log(`Admin prototype   http://localhost:${PORT}`);
    console.log(`Proxying /api/*   ${API_TARGET.origin}`);
  });

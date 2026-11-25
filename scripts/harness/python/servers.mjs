// Local static export server (localhost:3023, ZERO custom security headers) and
// second-origin server (127.0.0.1:3024, HTTP/CORS + RFC 6455 WebSocket + SSE + framing test).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.py': 'text/x-python; charset=utf-8',
  '.whl': 'application/octet-stream',
  '.zip': 'application/zip',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function trackSockets(server) {
  const sockets = new Set();
  server.on('connection', (sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
  });
  return () =>
    new Promise((resolveClose) => {
      for (const sock of sockets) {
        try {
          sock.destroy();
        } catch {
          // ignore
        }
      }
      sockets.clear();
      server.close(() => resolveClose());
    });
}

function resolveStaticFile(outDir, rawPathname) {
  let pathname = rawPathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const clean = normalize(pathname).replace(/^([/\\])+/, '');
  if (clean.includes('..')) return null;

  const candidates = [];
  if (!clean) {
    candidates.push(join(outDir, 'index.html'));
  } else {
    candidates.push(join(outDir, clean));
    candidates.push(join(outDir, `${clean}.html`));
    candidates.push(join(outDir, clean, 'index.html'));
  }

  const rootResolved = resolve(outDir);
  for (const cand of candidates) {
    const full = resolve(cand);
    if (!full.startsWith(rootResolved)) continue;
    if (existsSync(full) && statSync(full).isFile()) {
      return full;
    }
  }
  return null;
}

export async function startHarnessServers(outDir, { primaryPort = 3023, secondaryPort = 3024 } = {}) {
  // Same-origin canned package index for packages-checks.mjs (served by the harness only, never in
  // out/): WebKit does not route a dedicated worker's requests, so micropip is pointed here instead.
  let mockPypi = null;
  const mockHits = [];

  // 1. Primary static server (http://localhost:3023) — ZERO COOP/COEP/CORP/CSP/Permissions/Referrer headers!
  const primaryServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${primaryPort}`);
    if (url.pathname.startsWith('/__mock-pypi/')) {
      mockHits.push(url.pathname);
      const reply = mockPypi ? mockPypi(url.pathname) : null;
      if (!reply) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      res.writeHead(reply.status ?? 200, { 'Cache-Control': 'no-store', ...reply.headers });
      res.end(reply.body);
      return;
    }
    const filePath = resolveStaticFile(outDir, url.pathname);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const body = readFileSync(filePath);
    const contentType = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(body);
  });

  // 2. Second-origin server (http://127.0.0.1:3024) — tracks every hit for exfil assertions.
  const hits = [];
  const secondaryServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${secondaryPort}`);
    const isFrameHelper = url.pathname === '/frame-test';
    if (!isFrameHelper) {
      hits.push({
        method: req.method || 'GET',
        path: url.pathname + url.search,
        referer: req.headers.referer || '',
      });
    }

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (url.pathname === '/frame-test') {
      const target = url.searchParams.get('src') || `http://localhost:${primaryPort}/python/harness`;
      const escaped = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const html = `<!doctype html><html><body><h1>Framing Test</h1><iframe id="target" src="${escaped}" width="600" height="400"></iframe></body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname === '/ping') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, origin: `http://127.0.0.1:${secondaryPort}` }));
      return;
    }

    if (url.pathname === '/script.js') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('export const leaked = true; self.__leaked = true;\n');
      return;
    }

    if (url.pathname === '/font.woff2') {
      res.writeHead(200, { ...cors, 'Content-Type': 'font/woff2' });
      res.end(Buffer.from('wOF20000', 'ascii'));
      return;
    }

    if (url.pathname === '/sse') {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.write('data: leaked-sse\n\n');
      setTimeout(() => res.end(), 100);
      return;
    }

    res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
  });

  // RFC 6455 WebSocket upgrade handler on 127.0.0.1:3024
  secondaryServer.on('upgrade', (req, socket) => {
    hits.push({ method: 'WS', path: req.url || '/ws', referer: req.headers.referer || '' });
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.on('error', () => {});
    setTimeout(() => {
      try {
        socket.end();
      } catch {
        // ignore
      }
    }, 100);
  });

  const closePrimary = trackSockets(primaryServer);
  const closeSecondary = trackSockets(secondaryServer);

  await new Promise((resolveListen, rejectListen) => {
    primaryServer.once('error', rejectListen);
    primaryServer.listen(primaryPort, '127.0.0.1', resolveListen);
  });
  await new Promise((resolveListen, rejectListen) => {
    secondaryServer.once('error', rejectListen);
    secondaryServer.listen(secondaryPort, '127.0.0.1', resolveListen);
  });

  return {
    primaryOrigin: `http://localhost:${primaryPort}`,
    secondaryOrigin: `http://127.0.0.1:${secondaryPort}`,
    getHits: () => [...hits],
    setMockPypi: (fn) => {
      mockPypi = fn;
      mockHits.length = 0;
    },
    getMockHits: () => [...mockHits],
    resetHits: () => {
      hits.length = 0;
    },
    stop: async () => {
      await Promise.allSettled([closePrimary(), closeSecondary()]);
    },
  };
}

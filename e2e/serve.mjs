// Serves the built widget for the browser tests with the production widget headers, without the Worker:
// the tests answer /api/* themselves (Playwright routes), so no GitHub credentials are needed.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = 'dist/widget';
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const csp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "connect-src 'self'",
  "font-src 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
].join('; ');

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const path = pathname === '/widget' ? '/index.html' : pathname;
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Widget on http://localhost:${port}/widget`));

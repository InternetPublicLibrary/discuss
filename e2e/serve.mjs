// Serves the built widget (port 4173) with the production widget headers, without the Worker, and an IPL-like host
// page (port 4174) under the IPL site's strict CSP. The tests answer /api/* themselves (Playwright routes), so no
// GitHub credentials are needed.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const widgetPort = 4173;
const hostPort = 4174;
const widgetOrigin = `http://localhost:${widgetPort}`;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const csp = [
  // Same policy as src/worker/widget.ts (production), minus the allow-listed ancestors.
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com https://github.githubassets.com", "connect-src 'self'",
  "font-src 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'", `frame-ancestors http://localhost:${hostPort}`,
].join('; ');
// The IPL site's policy (spec 004): the discuss origin in script-src, frame-src and connect-src, nothing unsafe.
const hostCsp = [
  "default-src 'self'", `script-src 'self' ${widgetOrigin}`, `frame-src ${widgetOrigin}`, `connect-src 'self' ${widgetOrigin}`,
  "style-src 'self'", "img-src 'self'", "base-uri 'none'", "object-src 'none'",
].join('; ');

function serve(root, policy, rewrite) {
  return (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const file = normalize(join(root, rewrite(pathname)));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': policy });
    createReadStream(file).pipe(response);
  };
}

createServer(serve('dist/widget', csp, (path) => (path === '/widget' ? '/index.html' : path)))
  .listen(widgetPort, () => console.log(`Widget on ${widgetOrigin}/widget`));
// Page paths are IPL-like test pages: /pt-BR/... is the Portuguese one, every other path the English one.
createServer(serve('e2e/host', hostCsp, (path) => (path.endsWith('/') ? (path.startsWith('/pt-BR/') ? '/pt-BR/index.html' : '/index.html') : path)))
  .listen(hostPort, () => console.log(`Host page on http://localhost:${hostPort}/`));

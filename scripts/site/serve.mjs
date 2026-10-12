import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await realpath(fileURLToPath(new URL('../../.output/site/', import.meta.url)));
const projectPrefix = '/Upload-History';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function isInsideRoot(file) {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    if (pathname === projectPrefix) {
      response.writeHead(302, { Location: `${projectPrefix}/` }).end();
      return;
    }
    if (pathname.startsWith(`${projectPrefix}/`)) pathname = pathname.slice(projectPrefix.length);
    let file = path.resolve(directory, `.${pathname}`);
    if (!isInsideRoot(file)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    file = await realpath(file);
    if (!isInsideRoot(file)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status =
      error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
    response
      .writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(status === 404 ? 'Not found' : status === 400 ? 'Invalid path' : 'Unable to serve file');
  }
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Website preview: http://127.0.0.1:4173/Upload-History/');
  console.log('Run npm run site:build after editing source files, then refresh.');
});

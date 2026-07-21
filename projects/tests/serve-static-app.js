const http = require('http');
const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '..', 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  let relative = pathname === '/projects' || pathname === '/projects/'
    ? 'index.html'
    : pathname.replace(/^\/projects\/static\//, '');
  relative = relative.replace(/^\/+/, '');
  const target = path.resolve(publicDir, relative);
  if (!target.startsWith(publicDir) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
}).listen(4173, '127.0.0.1');

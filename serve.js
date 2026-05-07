// Simple static file server for local preview — mock mode injected automatically
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

// Inject mock-mode.js as the LAST script before </body>
const MOCK_INJECT = '<script src="/mock-mode.js"></script>\n</body>';

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }

    let body = data;
    // Only inject into HTML responses
    if (ext === '.html') {
      const html = data.toString('utf8').replace('</body>', MOCK_INJECT);
      body = Buffer.from(html, 'utf8');
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  });
}).listen(PORT, () => {
  console.log(`\n✅  TaskFlow preview (mock mode) → http://localhost:${PORT}\n`);
  console.log('   任何程式碼變更後，直接在瀏覽器按 F5 即可看到最新版本');
  console.log('   mock 資料存在 localStorage["mock_tasks"]，重設資料請清除瀏覽器 localStorage\n');
});

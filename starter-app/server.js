// ============================================================
//  Pelican Tours — booking app (AWS project starter)
//  CEN4086 · Zero dependencies: Node standard library only.
//
//  Deployment shapes across the semester:
//   M1  EC2 runs this whole file (static + API together)  — rehost
//   M2  static half moves to S3; this serves only the API — replatform
//   M4  API half is re-implemented as Lambda + API Gateway — refactor
//
//  Environment:
//    COMPANY_NAME  default "Pelican Tours"
//    THEME_COLOR   default "#1273a8"
//    TAGLINE       default "Slow down. It's manatee time."
//    PORT          default 3000
//    TOURS_FILE    default ./tours.json
//
//  ── MILESTONE 4 SEAM ─────────────────────────────────────
//  API and STATIC sections are marked. In M4 you rebuild the
//  API section as Lambda functions behind API Gateway; each
//  handler below maps 1:1 to a Lambda handler.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const COMPANY = process.env.COMPANY_NAME || 'Pelican Tours';
const COLOR = process.env.THEME_COLOR || '#1273a8';
const TAGLINE = process.env.TAGLINE || "Slow down. It's manatee time.";
const TOURS_FILE = process.env.TOURS_FILE || path.join(__dirname, 'tours.json');

const startedAt = Date.now();
const bookings = [];   // in-memory — M4 moves this truth into DynamoDB, and you'll explain why
const meter = {};      // requests per route: your measured-service ledger

function count(route) { meter[route] = (meter[route] || 0) + 1; }

function loadTours() {
  try { return JSON.parse(fs.readFileSync(TOURS_FILE, 'utf8')); }
  catch (e) { return [{ id: 1, name: 'Tour data missing — check TOURS_FILE', price: 0, seats: 0, duration: '—' }]; }
}

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    // CORS: lets the S3-hosted frontend (M2+) call this API cross-origin.
    // Journal question: why is "*" acceptable here and a smell in production?
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(obj, null, 2));
}

// ── API SECTION (re-implemented as Lambdas in Milestone 4) ──
function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return json(res, 204, {});  // CORS preflight

  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    count('/api/health');
    return json(res, 200, {
      status: 'ok', company: COMPANY,
      served_by: os.hostname(),               // watch this rotate behind the ALB
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    count('/api/config');
    return json(res, 200, { company: COMPANY, color: COLOR, tagline: TAGLINE, served_by: os.hostname() });
  }

  if (req.method === 'GET' && url.pathname === '/api/tours') {
    count('/api/tours');
    return json(res, 200, loadTours());
  }

  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'tours' && parts[2]) {
    count('/api/tours/:id');
    const t = loadTours().find(x => String(x.id) === parts[2]);
    return t ? json(res, 200, t) : json(res, 404, { error: 'tour not found', id: parts[2] });
  }

  if (req.method === 'POST' && url.pathname === '/api/bookings') {
    count('/api/bookings');
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}');
        if (!b.tourId || !b.name) return json(res, 400, { error: 'tourId and name are required' });
        const booking = {
          bookingId: bookings.length + 1, tourId: b.tourId, name: b.name,
          guests: b.guests || 1, bookedAt: new Date().toISOString()
        };
        bookings.push(booking);
        json(res, 201, booking);
      } catch { json(res, 400, { error: 'invalid JSON body' }); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bookings') {
    count('/api/bookings');
    return json(res, 200, bookings);
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    count('/api/stats');
    return json(res, 200, { company: COMPANY, served_by: os.hostname(), requests_by_route: meter, bookings_taken: bookings.length });
  }

  return json(res, 404, { error: 'no such endpoint', hint: 'see /api/health, /api/config, /api/tours, /api/bookings, /api/stats' });
}
// ── END API SECTION ──────────────────────────────────────────

// ── STATIC SECTION (moves to S3 static hosting in M2) ───────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function handleStatic(req, res, url) {
  count('static');
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(__dirname, 'public', file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 — not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}
// ── END STATIC SECTION ───────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`🌊 ${COMPANY} booking app up on port ${PORT} (host: ${os.hostname()})`);
});

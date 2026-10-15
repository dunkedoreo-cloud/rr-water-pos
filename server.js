// ==========================================================================
// R&R Water Refilling Station - Unified POS Server & RESTful API
// Built with Node 24 zero-dependency HTTP + SQLite
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./database.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // --- RESTFUL API ROUTES ---
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Station Summary & Health
      if (pathname === '/api/status' && req.method === 'GET') {
        const summary = db.getStationSummary();
        return sendJson(res, 200, { success: true, ...summary });
      }

      // 2. Orders API
      if (pathname === '/api/orders') {
        if (req.method === 'GET') {
          const status = parsedUrl.searchParams.get('status') || 'all';
          const channel = parsedUrl.searchParams.get('channel') || 'all';
          const limit = parsedUrl.searchParams.get('limit') || 100;
          const orders = db.getOrders({ status, channel, limit });
          return sendJson(res, 200, { success: true, count: orders.length, orders });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const order = db.createOrder(body);
          db.logAuditEvent(
            'NEW_ORDER',
            `Recorded ${order.channel.toUpperCase()} order ${order.order_no} (${order.gallons} Gal • ₱${order.total.toFixed(2)})`,
            order.cashier_name || 'Neil',
            order.cashier_role || 'manager'
          );
          return sendJson(res, 201, { success: true, order });
        }
      }

      // 3. Collect Order Payment
      const payMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/pay$/);
      if (payMatch && req.method === 'PATCH') {
        const orderNo = decodeURIComponent(payMatch[1]);
        const body = await readJsonBody(req);
        const order = db.collectPayment(orderNo, body.paidAmount);
        if (!order) return sendJson(res, 404, { error: 'Order not found' });
        db.logAuditEvent('PAYMENT_COLLECTED', `Collected ₱${order.total.toFixed(2)} for ${orderNo}`, body.userName || 'Sarah', body.userRole || 'cashier');
        return sendJson(res, 200, { success: true, order });
      }

      // 4. Void Order (Requires Manager Reason)
      const voidMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/void$/);
      if (voidMatch && req.method === 'POST') {
        const orderNo = decodeURIComponent(voidMatch[1]);
        const body = await readJsonBody(req);
        const result = db.voidOrder(orderNo, body.reason, body.managerName);
        if (!result) return sendJson(res, 404, { error: 'Order not found' });
        return sendJson(res, 200, { success: true, result });
      }

      // 5. Customers & Empties Ledger
      if (pathname === '/api/customers') {
        if (req.method === 'GET') {
          const customers = db.getCustomers();
          return sendJson(res, 200, { success: true, customers });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const cust = db.addCustomer(body);
          return sendJson(res, 201, { success: true, customer: cust });
        }
      }

      const emptiesMatch = pathname.match(/^\/api\/customers\/([^\/]+)\/empties$/);
      if (emptiesMatch && req.method === 'POST') {
        const custId = decodeURIComponent(emptiesMatch[1]);
        const body = await readJsonBody(req);
        const loaned = Number(body.loaned ?? body.loanedDelta ?? 0);
        const returned = Number(body.returned ?? body.returnedDelta ?? 0);
        const notes = body.notes || body.note || '';
        const updated = db.updateCarboyBalance(custId, loaned, returned, notes);
        db.logAuditEvent(
          'EMPTIES_TRANSACTION',
          `Bottle ledger update for ${updated.name}: +${loaned} loaned, -${returned} returned. Current Balance: ${updated.carboy_balance}`,
          body.userName || 'Neil',
          body.userRole || 'manager'
        );
        return sendJson(res, 200, { success: true, customer: updated });
      }

      // 6. Inventory API
      if (pathname === '/api/inventory') {
        if (req.method === 'GET') {
          const items = db.getInventory();
          return sendJson(res, 200, { success: true, inventory: items });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const item = db.adjustInventory(body.key, body.delta);
          return sendJson(res, 200, { success: true, item });
        }
      }

      // 7. Security Audit Trail API
      if (pathname === '/api/audit-logs') {
        if (req.method === 'GET') {
          const limit = Number(parsedUrl.searchParams.get('limit')) || 100;
          const logs = db.getAuditLogs(limit);
          return sendJson(res, 200, { success: true, logs });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const logId = db.logAuditEvent(body.action, body.details, body.user, body.role, body.manager);
          return sendJson(res, 201, { success: true, id: logId });
        }
      }

      // 8. Bulk Sync from LocalStorage
      if (pathname === '/api/sync' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const syncResult = db.syncFromLocalStorage(payload);
        return sendJson(res, 200, { success: true, ...syncResult });
      }

      // 9. Database Backup Download
      if (pathname === '/api/backup' && req.method === 'GET') {
        const dbPath = path.join(__dirname, 'rr_water.db');
        if (!fs.existsSync(dbPath)) {
          return sendJson(res, 404, { error: 'Database not initialized' });
        }
        res.writeHead(200, {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="rr_water_backup_${new Date().toISOString().slice(0, 10)}.db"`
        });
        const stream = fs.createReadStream(dbPath);
        stream.pipe(res);
        return;
      }

      return sendJson(res, 404, { error: `API route not found: ${pathname}` });
    } catch (apiErr) {
      console.error('[API Error]', apiErr);
      return sendJson(res, 500, { error: apiErr.message });
    }
  }

  // --- STATIC FILE SERVING ---
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure filePath is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p>The file <code>${pathname}</code> was not found.</p><p><a href="/">Station POS Terminal</a></p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Enable aggressive caching for static assets, no-cache for index.html/manifest
    const isDynamic = pathname === '/index.html' || pathname === '/pos.html' || pathname.endsWith('.json');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isDynamic ? 'no-cache, must-revalidate' : 'public, max-age=86400'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n========================================================`);
    console.error(`  [!] Port ${PORT} is already in use by another instance.`);
    console.error(`  To stop previous server, run in PowerShell:`);
    console.error(`  Stop-Process -Name node -Force`);
    console.error(`========================================================\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, () => {
  console.log('========================================================');
  console.log('  R&R Water Refilling Station - POS Terminals & SQLite API');
  console.log('========================================================');
  console.log(`  [>] Main POS URL:      http://localhost:${PORT}/`);
  console.log(`  [>] API Health:        http://localhost:${PORT}/api/status`);
  console.log(`  [>] Database:          SQLite WAL (${path.join(__dirname, 'rr_water.db')})`);
  console.log('========================================================');
  console.log('  Station server ready.\n');
});

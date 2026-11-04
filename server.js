// ==========================================================================
// R&R Water Refilling Station - Unified POS Server & RESTful API
// Built with Node 24 zero-dependency HTTP + SQLite
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./database.js');
// Load .env if present (Zero external dependencies)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    envLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {}

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

// --- REAL-TIME CROSS-DEVICE EVENT BUS (Server-Sent Events) ---
const sseClients = new Set();

function broadcastEvent(type, payload) {
  const message = `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Keep SSE connections active across NAT / WiFi sleep
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': heartbeat\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 25000);

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
            // 0. Supabase Cloud Config Endpoint
      if (pathname === '/api/config/supabase' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
          url: process.env.SUPABASE_URL || null,
          anonKey: process.env.SUPABASE_ANON_KEY || null
        });
      }

      // 0.0 Real-time Event Stream (Server-Sent Events for Cross-Device Sync)
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // 0.01 Station Settings & Pricing API (Cross-Device Sync)
      if (pathname === '/api/settings') {
        if (req.method === 'GET') {
          const settings = db.getSettings();
          return sendJson(res, 200, { success: true, settings });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const saved = db.saveAllSettings(body);
          broadcastEvent('SETTINGS_UPDATED', saved);
          return sendJson(res, 200, { success: true, settings: saved });
        }
      }

      // 0.02 Delta Sync Endpoint for Smart Catch-up
      if (pathname === '/api/sync/delta' && req.method === 'GET') {
        const since = parsedUrl.searchParams.get('since') || 0;
        const delta = db.getSyncDelta(since);
        return sendJson(res, 200, { success: true, ...delta });
      }

      // 0.1 Telemetry Streaming Bus
      if (pathname === '/api/telemetry') {
        if (!global._telemetryHistory) global._telemetryHistory = [];
        if (req.method === 'GET') {
          return sendJson(res, 200, { success: true, count: global._telemetryHistory.length, events: global._telemetryHistory });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          global._telemetryHistory.unshift(body);
          if (global._telemetryHistory.length > 100) global._telemetryHistory.pop();
          return sendJson(res, 201, { success: true, received: true });
        }
      }

      if (pathname === '/api/telemetry/active') {
        if (!global._activeRegisterState) global._activeRegisterState = null;
        if (req.method === 'GET') {
          return sendJson(res, 200, { success: true, state: global._activeRegisterState });
        }
        if (req.method === 'POST') {
          global._activeRegisterState = await readJsonBody(req);
          return sendJson(res, 200, { success: true, updated: true });
        }
      }

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
          broadcastEvent('ORDER_CREATED', order);
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
        broadcastEvent('ORDER_UPDATED', order);
        return sendJson(res, 200, { success: true, order });
      }

      // 4. Void Order (Requires Manager PIN - Item 1.2)
      const voidMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/void$/);
      if (voidMatch && req.method === 'POST') {
        const orderNo = decodeURIComponent(voidMatch[1]);
        const body = await readJsonBody(req);
        const pin = body.managerPin || req.headers['x-manager-pin'] || '';
        if (!db.verifyManagerPin(pin)) {
          return sendJson(res, 401, { error: 'Unauthorized: Valid Manager 4-Digit Security PIN required to void transactions.' });
        }
        const result = db.voidOrder(orderNo, body.reason, body.managerName);
        if (!result) return sendJson(res, 404, { error: 'Order not found' });
        broadcastEvent('ORDER_VOIDED', { orderNo, reason: body.reason, status: 'voided', is_voided: 1 });
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
          broadcastEvent('INVENTORY_UPDATED', item);
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

      // 9. Database Backup Download (Requires Manager PIN - Item 1.2)
      if (pathname === '/api/backup' && req.method === 'GET') {
        const pin = parsedUrl.searchParams.get('pin') || req.headers['x-manager-pin'] || '';
        if (!db.verifyManagerPin(pin)) {
          return sendJson(res, 401, { error: 'Unauthorized: Manager 4-Digit Security PIN required to download database backup.' });
        }
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


      // 10. Expenses API (Item 2.3)
      if (pathname === '/api/expenses') {
        if (req.method === 'GET') {
          const limit = Number(parsedUrl.searchParams.get('limit')) || 100;
          const expenses = db.getExpenses({ limit });
          return sendJson(res, 200, { success: true, count: expenses.length, expenses });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const expense = db.addExpense(body);
          broadcastEvent('EXPENSE_CREATED', expense);
          return sendJson(res, 201, { success: true, expense });
        }
      }

      // 11. Driver Settlements API (Item 2.3)
      if (pathname === '/api/driver-settlements') {
        if (req.method === 'GET') {
          const limit = Number(parsedUrl.searchParams.get('limit')) || 100;
          const settlements = db.getDriverSettlements({ limit });
          return sendJson(res, 200, { success: true, count: settlements.length, settlements });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const settlement = db.addDriverSettlement(body);
          broadcastEvent('SETTLEMENT_CREATED', settlement);
          return sendJson(res, 201, { success: true, settlement });
        }
      }

      // 12. End-of-Day Dispatch API via Telegram Bot (Item 4.1)
      if (pathname === '/api/reports/eod/send' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const botToken = body.botToken || process.env.TELEGRAM_BOT_TOKEN;
        const chatId = body.chatId || process.env.TELEGRAM_CHAT_ID;

        if (!botToken || !chatId) {
          return sendJson(res, 400, { error: 'Missing Telegram botToken or chatId. Configure in Station Settings.' });
        }

        const summary = db.getStationSummary();
        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const today = summary.today || {};
        const totalSales = Number(today.total_cash_collected || 0);
        const gallons = Number(today.total_gallons || 0);
        const ordersCount = Number(today.total_orders || 0);
        const pending = Number(today.total_pending_receivables || 0);
        const carboysLoaned = Number(summary.carboysOnLoan || 0);

        // Fetch today's expenses
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const expenses = db.getExpenses({ dateFrom: startOfDay.getTime() });
        const totalExp = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const netCash = Math.max(0, totalSales - totalExp);

        const msgLines = [
          '💧 *R&R WATER REFILLING STATION*',
          '📋 *End-of-Day Shift Summary*',
          `📅 ${dateStr} • ${timeStr}`,
          '━━━━━━━━━━━━━━━━━━━━━',
          '💰 *FINANCIAL TOTALS:*',
          `• Gross Cash Collected: ₱${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `• Operating Expenses: ₱${totalExp.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `• Net Cash in Drawer: ₱${netCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `• Unpaid Deliveries: ₱${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          '',
          '📦 *VOLUMES & DELIVERIES:*',
          `• Total Gallons Dispensed: ${gallons} Gals`,
          `• Total Completed Orders: ${ordersCount}`,
          `• Active Carboys on Loan: ${carboysLoaned} containers`,
          '━━━━━━━━━━━━━━━━━━━━━',
          `👤 Cashier / Shift: ${body.cashierName || 'Counter #1'}`,
          body.notes ? `📝 Note: ${body.notes}` : '',
          '✅ Station terminal synchronized & closed.'
        ].filter(Boolean).join('\n');

        const postData = JSON.stringify({
          chat_id: chatId,
          text: msgLines,
          parse_mode: 'Markdown'
        });

        const reqTg = https.request({
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${encodeURIComponent(botToken)}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (resTg) => {
          let tgResp = '';
          resTg.on('data', chunk => tgResp += chunk);
          resTg.on('end', () => {
            try {
              const parsed = JSON.parse(tgResp);
              if (parsed.ok) {
                return sendJson(res, 200, { success: true, message: 'EOD Report sent to owner Telegram successfully!' });
              } else {
                return sendJson(res, 400, { error: 'Telegram API Error: ' + (parsed.description || 'Unknown error') });
              }
            } catch (e) {
              return sendJson(res, 500, { error: 'Invalid response from Telegram API' });
            }
          });
        });

        reqTg.on('error', (err) => {
          return sendJson(res, 500, { error: 'Failed to connect to Telegram API: ' + err.message });
        });

        reqTg.write(postData);
        reqTg.end();
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

  // Security check 1: ensure filePath is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Security check 2: Prevent source code, environment, and database file exposure (Item 1.1)
  const baseName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const BLOCKED_EXTENSIONS = ['.db', '.db-shm', '.db-wal', '.env', '.log', '.bat', '.py', '.pyc', '.sql'];
  const BLOCKED_FILES = ['server.js', 'database.js', 'package.json', 'package-lock.json', '.gitignore', 'dev_station_console.py'];

  if (baseName.startsWith('.') || BLOCKED_EXTENSIONS.includes(ext) || BLOCKED_FILES.includes(baseName)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Direct access to system configuration, database, or server source files is restricted.');
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

    // Station terminal asset headers: Always ensure immediate hot reload and fresh assets during station operations
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
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

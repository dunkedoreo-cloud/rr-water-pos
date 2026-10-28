// ==========================================================================
// R&R Water Refilling Station - Dedicated Developer Web Application Server
// Port: 4000 | Independent Developer Cockpit, Telemetry Hub & DB Maintenance
// Built with Node 22+ Zero-Dependency HTTP + node:sqlite
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.DEV_PORT || 4000;
const POS_PORT = process.env.PORT || 3000;
const DEV_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'rr_water.db');

// In-memory telemetry cache for developer portal
let devTelemetryHistory = [];
let devActiveRegisterState = {
  orderNo: 'ORD-DEV-001',
  timestamp: Date.now(),
  channel: 'WALK_IN',
  customerName: 'Walk-in Customer',
  customerAddress: 'Station Front Counter',
  gallonsSlim: 2,
  gallonsRound: 1,
  totalGallons: 3,
  computedTotal: 95.0,
  paymentStatus: 'PAID',
  paymentMethod: 'CASH',
  cashTendered: 100.0,
  changeDue: 5.0,
  orderNote: 'Standard refill, cleaned caps',
  cashierName: 'Dev Inspector',
  cashierRole: 'admin',
  activeTab: 'order'
};

// Initialize SQLite connection
let db = null;
function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  return db;
}

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Helper to poll POS Server (port 3000) if active
function fetchPosServer(endpoint) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${POS_PORT}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(null);
    });
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
  const pathname = parsedUrl.pathname;

  // =========================================================================
  // REST API ENDPOINTS FOR DEVELOPER WEB APP
  // =========================================================================

  // 1. Station Vitals & Server Diagnostics
  if (pathname === '/api/dev/status' && req.method === 'GET') {
    try {
      const posStatus = await fetchPosServer('/api/status');
      let dbStats = { fileSize: 0, tables: {} };
      if (fs.existsSync(DB_PATH)) {
        const stat = fs.statSync(DB_PATH);
        dbStats.fileSize = stat.size;
        try {
          const database = getDb();
          const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
          tables.forEach(t => {
            try {
              const countRow = database.prepare(`SELECT count(*) as c FROM "${t.name}";`).get();
              dbStats.tables[t.name] = countRow ? countRow.c : 0;
            } catch (e) {}
          });
        } catch (e) {}
      }

      const mem = process.memoryUsage();
      return sendJson(res, 200, {
        success: true,
        server: {
          name: 'R&R Water POS - Developer Web App Server',
          devPort: PORT,
          posPort: POS_PORT,
          posOnline: Boolean(posStatus && posStatus.success),
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: {
            rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
            heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2),
            heapTotalMb: +(mem.heapTotal / (1024 * 1024)).toFixed(2)
          }
        },
        database: dbStats,
        posSummary: posStatus ? posStatus : null
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 2. Real-Time Cashier Active Register Mirror
  if (pathname === '/api/dev/telemetry/active') {
    if (req.method === 'GET') {
      // Try to get freshest live state from POS server port 3000
      const posState = await fetchPosServer('/api/telemetry/active');
      if (posState && posState.success && posState.state) {
        devActiveRegisterState = posState.state;
      }
      return sendJson(res, 200, { success: true, state: devActiveRegisterState });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      devActiveRegisterState = { ...devActiveRegisterState, ...body, updatedAt: Date.now() };
      return sendJson(res, 200, { success: true, updated: true, state: devActiveRegisterState });
    }
  }

  // 3. Telemetry Stream Event Log
  if (pathname === '/api/dev/telemetry') {
    if (req.method === 'GET') {
      const posEvents = await fetchPosServer('/api/telemetry');
      let combined = [...devTelemetryHistory];
      if (posEvents && Array.isArray(posEvents.events)) {
        // Merge without duplicates by id or timestamp
        const seen = new Set(combined.map(e => e.id || e.timestamp));
        posEvents.events.forEach(e => {
          const key = e.id || e.timestamp;
          if (!seen.has(key)) {
            combined.push(e);
            seen.add(key);
          }
        });
      }
      combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return sendJson(res, 200, { success: true, count: combined.length, events: combined.slice(0, 100) });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const event = {
        id: 'TELEM-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        ...body
      };
      devTelemetryHistory.unshift(event);
      if (devTelemetryHistory.length > 200) devTelemetryHistory.pop();
      return sendJson(res, 201, { success: true, event });
    }
  }

  // 4. Arbitrary SQL Query Execution Console
  if (pathname === '/api/dev/query' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const sql = (body.query || '').trim();
      if (!sql) return sendJson(res, 400, { success: false, error: 'Query cannot be empty.' });

      const startTime = performance.now();
      const database = getDb();

      // Check if it's a read query or mutation
      const upper = sql.toUpperCase();
      if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
        const stmt = database.prepare(sql);
        const rows = stmt.all();
        const durationMs = +(performance.now() - startTime).toFixed(2);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return sendJson(res, 200, {
          success: true,
          columns,
          rows,
          rowCount: rows.length,
          durationMs
        });
      } else {
        // Mutation (INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, VACUUM)
        database.exec(sql);
        const durationMs = +(performance.now() - startTime).toFixed(2);
        return sendJson(res, 200, {
          success: true,
          mutation: true,
          durationMs,
          message: 'Statement executed successfully.'
        });
      }
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  // 5. Database Schema & Tables Explorer
  if (pathname === '/api/dev/tables' && req.method === 'GET') {
    try {
      const database = getDb();
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").all();
      const result = tables.map(t => {
        const info = database.prepare(`PRAGMA table_info("${t.name}");`).all();
        const countRow = database.prepare(`SELECT count(*) as count FROM "${t.name}";`).get();
        return {
          name: t.name,
          columns: info.map(c => ({ name: c.name, type: c.type, pk: c.pk === 1, notnull: c.notnull === 1 })),
          rowCount: countRow ? countRow.count : 0
        };
      });
      return sendJson(res, 200, { success: true, tables: result });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // Table rows API: /api/dev/tables/:tableName
  if (pathname.startsWith('/api/dev/tables/') && req.method === 'GET') {
    try {
      const tableName = decodeURIComponent(pathname.replace('/api/dev/tables/', '')).trim();
      const limit = Math.min(Number(parsedUrl.searchParams.get('limit')) || 100, 500);
      const search = (parsedUrl.searchParams.get('search') || '').trim();

      const database = getDb();
      // Sanitize table name against sqlite_master
      const valid = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;").get(tableName);
      if (!valid) return sendJson(res, 404, { success: false, error: `Table '${tableName}' not found.` });

      const info = database.prepare(`PRAGMA table_info("${tableName}");`).all();
      const columns = info.map(c => c.name);

      let sql = `SELECT * FROM "${tableName}"`;
      let params = [];
      if (search) {
        const clauses = columns.map(c => `CAST("${c}" AS TEXT) LIKE ?`);
        sql += ` WHERE ` + clauses.join(' OR ');
        params = columns.map(() => `%${search}%`);
      }
      sql += ` ORDER BY rowid DESC LIMIT ${limit};`;

      const stmt = database.prepare(sql);
      const rows = params.length > 0 ? stmt.all(...params) : stmt.all();

      return sendJson(res, 200, {
        success: true,
        table: tableName,
        columns,
        rowCount: rows.length,
        rows
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 6. Database Binary Backup Download
  if (pathname === '/api/dev/backup' && req.method === 'GET') {
    try {
      if (!fs.existsSync(DB_PATH)) return sendJson(res, 404, { success: false, error: 'Database file not found.' });
      const stat = fs.statSync(DB_PATH);
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      res.writeHead(200, {
        'Content-Type': 'application/x-sqlite3',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="rr_water_backup_${dateStr}.db"`,
        'Cache-Control': 'no-cache'
      });
      const stream = fs.createReadStream(DB_PATH);
      stream.pipe(res);
      return;
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 7. Full Station JSON Dump Export
  if (pathname === '/api/dev/export-json' && req.method === 'GET') {
    try {
      const database = getDb();
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
      const dump = {
        station: 'R&R Water Refilling Station',
        exportedAt: new Date().toISOString(),
        tables: {}
      };
      tables.forEach(t => {
        try {
          dump.tables[t.name] = database.prepare(`SELECT * FROM "${t.name}";`).all();
        } catch (e) {
          dump.tables[t.name] = [];
        }
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="rr_water_data_${Date.now()}.json"`
      });
      res.end(JSON.stringify(dump, null, 2));
      return;
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 8. PRAGMA Integrity Check
  if (pathname === '/api/dev/integrity' && req.method === 'POST') {
    try {
      const database = getDb();
      const resRow = database.prepare("PRAGMA integrity_check;").get();
      const result = resRow ? Object.values(resRow)[0] : 'ok';
      return sendJson(res, 200, { success: true, integrity: result, healthy: result === 'ok' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 9. Database VACUUM & Defrag
  if (pathname === '/api/dev/vacuum' && req.method === 'POST') {
    try {
      const beforeSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
      const database = getDb();
      database.exec("VACUUM;");
      const afterSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
      return sendJson(res, 200, {
        success: true,
        beforeBytes: beforeSize,
        afterBytes: afterSize,
        reclaimedBytes: Math.max(0, beforeSize - afterSize)
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 10. Test Data Seeder
  if (pathname === '/api/dev/seed' && req.method === 'POST') {
    try {
      const database = getDb();
      const now = Date.now();
      const dateStr = new Date().toISOString().split('T')[0];

      // Insert sample test orders
      const orders = [
        ['ORD-SEED-101', now - 3600000, dateStr, 'WALK_IN', 'round_5gal', '5-Gallon Round Refill', 2, 35.0, 70.0, 70.0, 'completed', 'Dev Cashier', 70.0, 0.0, 'Paid in full cash'],
        ['ORD-SEED-102', now - 2400000, dateStr, 'DELIVERY', 'slim_5gal', '5-Gallon Slim Refill', 5, 35.0, 175.0, 0.0, 'pending', 'Dev Cashier', 0.0, 0.0, 'Utang / To pay next delivery - Purok 2'],
        ['ORD-SEED-103', now - 1200000, dateStr, 'WALK_IN', 'round_5gal', '5-Gallon Round Refill', 3, 35.0, 105.0, 105.0, 'completed', 'Dev Cashier', 105.0, 0.0, 'GCash Ref: 1082736481']
      ];

      const stmt = database.prepare(`
        INSERT OR REPLACE INTO orders (order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, cashier_name, tendered, change_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      orders.forEach(o => stmt.run(...o));

      // Record telemetry event
      devTelemetryHistory.unshift({
        id: 'TELEM-' + Date.now(),
        timestamp: Date.now(),
        type: 'DEVELOPER_SEEDED_DATA',
        details: 'Seeded 3 sample test orders into rr_water.db'
      });

      return sendJson(res, 200, { success: true, seededCount: orders.length });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 11. Wipe Test Orders
  if (pathname === '/api/dev/wipe' && req.method === 'POST') {
    try {
      const database = getDb();
      database.exec("DELETE FROM orders;");
      devTelemetryHistory.unshift({
        id: 'TELEM-' + Date.now(),
        timestamp: Date.now(),
        type: 'ORDERS_TABLE_WIPED',
        details: 'Orders table wiped via Developer Web App'
      });
      return sendJson(res, 200, { success: true, message: 'All orders reset.' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // =========================================================================
  // STATIC ASSETS SERVING FOR DEVELOPER WEB APP
  // =========================================================================
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(DEV_DIR, safePath);

  // If file doesn't exist in developer-portal, check parent assets folder
  if (!fs.existsSync(filePath)) {
    const parentPath = path.join(ROOT_DIR, safePath);
    if (fs.existsSync(parentPath)) filePath = parentPath;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`404 Not Found: ${pathname}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`  R&R WATER REFILLING STATION — DEVELOPER WEB APP`);
  console.log(`  Dedicated Developer Portal & System Telemetry Server`);
  console.log(`========================================================`);
  console.log(`  Developer Web App URL:  http://localhost:${PORT}`);
  console.log(`  POS Web App Target:     http://localhost:${POS_PORT}`);
  console.log(`  Database File:          ${DB_PATH}`);
  console.log(`========================================================`);
});

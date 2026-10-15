// ==========================================================================
// R&R Water Refilling Station - Production SQLite Database Manager
// Uses Node 22.5+ built-in node:sqlite (zero external dependencies)
// ==========================================================================

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'rr_water.db');

class StationDatabase {
  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    // Enable Write-Ahead Logging (WAL) for high concurrency & instant durability
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initTables();
    this.seedDefaults();
  }

  initTables() {
    this.db.exec(`
      -- Staff & Operators
      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        title TEXT,
        pin TEXT NOT NULL,
        avatar_color TEXT,
        created_at INTEGER
      );

      -- Station Configuration & Settings
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER
      );

      -- Customers & Carboy Deposit Balances
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_no TEXT,
        address TEXT,
        carboy_balance INTEGER DEFAULT 0,
        notes TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      -- Station Orders
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_no TEXT UNIQUE NOT NULL,
        timestamp INTEGER NOT NULL,
        date_str TEXT,
        channel TEXT NOT NULL,
        prod_key TEXT NOT NULL,
        prod_name TEXT NOT NULL,
        gallons INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total REAL NOT NULL,
        paid_amount REAL NOT NULL,
        status TEXT NOT NULL,
        cashier_name TEXT,
        cashier_role TEXT,
        driver_id TEXT,
        driver_name TEXT,
        customer_name TEXT,
        customer_id TEXT,
        carboys_loaned INTEGER DEFAULT 0,
        carboys_returned INTEGER DEFAULT 0,
        tendered REAL DEFAULT 0,
        change_amount REAL DEFAULT 0,
        note TEXT,
        is_voided INTEGER DEFAULT 0,
        void_reason TEXT,
        voided_by TEXT,
        created_at INTEGER
      );

      -- Shifts & Drawer Reconciliations
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        cashier_id TEXT,
        cashier_name TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        opening_cash REAL DEFAULT 0,
        closing_cash REAL DEFAULT 0,
        expected_cash REAL DEFAULT 0,
        cash_difference REAL DEFAULT 0,
        total_gallons INTEGER DEFAULT 0,
        orders_count INTEGER DEFAULT 0,
        is_closed INTEGER DEFAULT 0,
        closed_by_manager TEXT,
        notes TEXT
      );

      -- Consumables Inventory (Caps, Seal Wraps, Filters)
      CREATE TABLE IF NOT EXISTS inventory (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        current_stock INTEGER NOT NULL,
        unit TEXT NOT NULL,
        reorder_level INTEGER NOT NULL,
        updated_at INTEGER
      );

      -- Security & Operational Audit Trail
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        time_str TEXT NOT NULL,
        action TEXT NOT NULL,
        user TEXT NOT NULL,
        role TEXT NOT NULL,
        manager TEXT,
        details TEXT
      );

      -- Indexes for fast reporting and live lookups
      CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `);
  }

  seedDefaults() {
    // Seed Staff if empty
    const staffCount = this.db.prepare('SELECT COUNT(*) as count FROM staff').get().count;
    if (staffCount === 0) {
      const insertStaff = this.db.prepare(`
        INSERT INTO staff (id, name, role, title, pin, avatar_color, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertStaff.run('usr_1', 'Neil', 'manager', 'Station Manager', '1234', '#0284c7', Date.now());
      insertStaff.run('usr_2', 'Sarah', 'cashier', 'Front-Desk Cashier', '2222', '#10b981', Date.now());
      insertStaff.run('usr_3', 'Kuya Jun', 'driver', 'Multicab Driver / Courier', '3333', '#8b5cf6', Date.now());
    }

    // Seed Inventory if empty
    const invCount = this.db.prepare('SELECT COUNT(*) as count FROM inventory').get().count;
    if (invCount === 0) {
      const insertInv = this.db.prepare(`
        INSERT INTO inventory (key, name, current_stock, unit, reorder_level, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertInv.run('cap_seals', '5-Gallon Non-Spill Cap Seals', 450, 'pcs', 100, Date.now());
      insertInv.run('heat_wraps', 'Tamper-Evident Heat Shrink Neck Sleeves', 600, 'pcs', 150, Date.now());
      insertInv.run('blue_carboys', '5-Gallon Polycarbonate Blue Carboys (Rack Ready)', 150, 'units', 30, Date.now());
      insertInv.run('sediment_filter', '5-Micron Polypropylene Sediment Filter', 8, 'cartridges', 2, Date.now());
      insertInv.run('carbon_filter', 'Activated Carbon Block Filter', 4, 'cartridges', 1, Date.now());
    }

    // Seed default customers if empty
    const custCount = this.db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    if (custCount === 0) {
      const insertCust = this.db.prepare(`
        INSERT INTO customers (id, name, contact_no, address, carboy_balance, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertCust.run('cust_1', 'Aling Tess Sari-Sari Store', '0917-888-1234', 'Purok 2, Near Chapel', 4, 'Weekly delivery regular', Date.now(), Date.now());
      insertCust.run('cust_2', 'Mang Carlos Vulcanizing', '0922-555-6789', 'Main Highway, Corner Purok 1', 2, 'Borrowed 2 blue carboys', Date.now(), Date.now());
      insertCust.run('cust_3', 'Bgy. Hall Health Center', '0999-333-4567', 'Municipal Road', 6, 'Dispenser refill on Mondays', Date.now(), Date.now());
    }
  }

  // --- ORDERS API ---
  getOrders(filters = {}) {
    let sql = 'SELECT * FROM orders WHERE is_voided = 0';
    const params = [];

    if (filters.status && filters.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.channel && filters.channel !== 'all') {
      sql += ' AND channel = ?';
      params.push(filters.channel);
    }
    if (filters.dateFrom) {
      sql += ' AND timestamp >= ?';
      params.push(Number(filters.dateFrom));
    }
    if (filters.dateTo) {
      sql += ' AND timestamp <= ?';
      params.push(Number(filters.dateTo));
    }

    sql += ' ORDER BY timestamp DESC';
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(Number(filters.limit));
    }

    return this.db.prepare(sql).all(...params);
  }

  createOrder(orderData) {
    const now = Date.now();
    const id = orderData.id || ('ord_' + now + '_' + Math.random().toString(36).substr(2, 4));
    const orderNo = orderData.orderNo || ('#' + Math.floor(100000 + Math.random() * 900000));
    const gallons = Number(orderData.gallons) || 1;
    const unitPrice = Number(orderData.unitPrice) || 35;
    const total = Number(orderData.total) || (gallons * unitPrice);
    const status = orderData.status || 'paid';
    const paidAmount = status === 'paid' ? (Number(orderData.paidAmount) || total) : 0;
    const loaned = Number(orderData.carboysLoaned) || 0;
    const returned = Number(orderData.carboysReturned) || 0;

    const stmt = this.db.prepare(`
      INSERT INTO orders (
        id, order_no, timestamp, date_str, channel, prod_key, prod_name,
        gallons, unit_price, total, paid_amount, status, cashier_name,
        cashier_role, driver_id, driver_name, customer_name, customer_id,
        carboys_loaned, carboys_returned, tendered, change_amount, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      orderNo,
      orderData.timestamp || now,
      orderData.time || new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      orderData.channel || 'walkin',
      orderData.prodKey || 'refill_5gal',
      orderData.prodName || '5-Gallon Purified Refill',
      gallons,
      unitPrice,
      total,
      paidAmount,
      status,
      orderData.cashierName || 'Neil',
      orderData.cashierRole || 'manager',
      orderData.driverId || null,
      orderData.driverName || (orderData.channel === 'delivery' ? 'Kuya Jun' : null),
      orderData.customerName || (orderData.note || 'Walk-in Refill Customer'),
      orderData.customerId || null,
      loaned,
      returned,
      Number(orderData.tendered) || paidAmount,
      Number(orderData.changeAmount) || 0,
      orderData.note || '',
      now
    );

    // Auto-deplete consumables inventory (1 cap seal per refill)
    this.db.prepare(`
      UPDATE inventory
      SET current_stock = MAX(0, current_stock - ?), updated_at = ?
      WHERE key = 'cap_seals'
    `).run(gallons, now);

    // Update customer carboy balance if customer_id is provided
    if (orderData.customerId && (loaned > 0 || returned > 0)) {
      const netChange = loaned - returned;
      this.db.prepare(`
        UPDATE customers
        SET carboy_balance = MAX(0, carboy_balance + ?), updated_at = ?
        WHERE id = ?
      `).run(netChange, now, orderData.customerId);
    }

    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  }

  collectPayment(orderNo, paidAmount = null) {
    const order = this.db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
    if (!order) return null;

    const amount = paidAmount !== null ? Number(paidAmount) : order.total;
    this.db.prepare(`
      UPDATE orders
      SET status = 'paid', paid_amount = ?
      WHERE order_no = ?
    `).run(amount, orderNo);

    return this.db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  }

  voidOrder(orderNo, reason, managerName) {
    const order = this.db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
    if (!order) return null;

    this.db.prepare(`
      UPDATE orders
      SET is_voided = 1, void_reason = ?, voided_by = ?
      WHERE order_no = ?
    `).run(reason || 'Manager Override', managerName || 'Neil', orderNo);

    // Restore inventory
    this.db.prepare(`
      UPDATE inventory
      SET current_stock = current_stock + ?, updated_at = ?
      WHERE key = 'cap_seals'
    `).run(order.gallons, Date.now());

    // Revert carboys if linked to customer
    if (order.customer_id && (order.carboys_loaned > 0 || order.carboys_returned > 0)) {
      const netChange = order.carboys_loaned - order.carboys_returned;
      this.db.prepare(`
        UPDATE customers
        SET carboy_balance = MAX(0, carboy_balance - ?), updated_at = ?
        WHERE id = ?
      `).run(netChange, Date.now(), order.customer_id);
    }

    // Log to audit table
    this.logAuditEvent(
      'VOID_ORDER',
      `Cancelled ${orderNo} (${order.gallons} Gal • ₱${order.total.toFixed(2)}). Reason: ${reason}`,
      order.cashier_name || 'Cashier',
      order.cashier_role || 'cashier',
      managerName
    );

    return { success: true, voided: orderNo };
  }

  // --- CUSTOMERS & CARBOY TRACKING API ---
  getCustomers() {
    return this.db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
  }

  addCustomer(cust) {
    const id = cust.id || ('cust_' + Date.now());
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO customers (id, name, contact_no, address, carboy_balance, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cust.name, cust.contactNo || '', cust.address || '', Number(cust.carboyBalance) || 0, cust.notes || '', now, now);
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  updateCarboyBalance(customerId, loanedDelta, returnedDelta, notes = '') {
    const now = Date.now();
    const net = (Number(loanedDelta) || 0) - (Number(returnedDelta) || 0);
    this.db.prepare(`
      UPDATE customers
      SET carboy_balance = MAX(0, carboy_balance + ?),
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          updated_at = ?
      WHERE id = ?
    `).run(net, notes, notes, now, customerId);

    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  }

  // --- INVENTORY API ---
  getInventory() {
    return this.db.prepare('SELECT * FROM inventory ORDER BY name ASC').all();
  }

  adjustInventory(key, delta) {
    const now = Date.now();
    this.db.prepare(`
      UPDATE inventory
      SET current_stock = MAX(0, current_stock + ?), updated_at = ?
      WHERE key = ?
    `).run(Number(delta), now, key);
    return this.db.prepare('SELECT * FROM inventory WHERE key = ?').get(key);
  }

  // --- AUDIT TRAIL API ---
  getAuditLogs(limit = 100) {
    return this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
  }

  logAuditEvent(action, details, user = 'Neil', role = 'manager', manager = null) {
    const now = Date.now();
    const id = 'sec_' + now + '_' + Math.random().toString(36).substr(2, 4);
    const date = new Date(now);
    const timeStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, time_str, action, user, role, manager, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, now, timeStr, action, user, role, manager || (role === 'manager' ? user : '—'), details);

    return id;
  }

  // --- BULK SYNC FROM LOCALSTORAGE ---
  syncFromLocalStorage(payload) {
    const now = Date.now();

    // 1. Sync orders
    if (Array.isArray(payload.orders)) {
      const existing = new Set(this.db.prepare('SELECT order_no FROM orders').all().map(o => o.order_no));
      const insertOrder = this.db.prepare(`
        INSERT OR IGNORE INTO orders (
          id, order_no, timestamp, date_str, channel, prod_key, prod_name,
          gallons, unit_price, total, paid_amount, status, cashier_name,
          cashier_role, driver_id, driver_name, customer_name, customer_id,
          carboys_loaned, carboys_returned, tendered, change_amount, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const o of payload.orders) {
        if (!existing.has(o.orderNo)) {
          const gallons = Number(o.gallons) || 1;
          const total = Number(o.total) || 35;
          const isPaid = o.status === 'paid';
          insertOrder.run(
            o.id || ('ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
            o.orderNo,
            o.timestamp || now,
            o.time || '',
            o.channel || 'walkin',
            o.prodKey || 'refill_5gal',
            o.prodName || '5-Gallon Purified Refill',
            gallons,
            Number(o.unitPrice) || 35,
            total,
            typeof o.paidAmount === 'number' ? o.paidAmount : (isPaid ? total : 0),
            o.status || 'paid',
            o.cashierName || 'Neil',
            o.cashierRole || 'manager',
            o.driverId || null,
            o.driverName || (o.channel === 'delivery' ? 'Kuya Jun' : null),
            o.customerName || (o.note || 'Refill Customer'),
            o.customerId || null,
            Number(o.carboysLoaned) || 0,
            Number(o.carboysReturned) || 0,
            Number(o.tendered) || total,
            Number(o.changeAmount) || 0,
            o.note || '',
            o.timestamp || now
          );
        }
      }
    }

    // 2. Sync staff if custom pins set
    if (Array.isArray(payload.staff)) {
      const updatePin = this.db.prepare('UPDATE staff SET pin = ?, title = ? WHERE id = ?');
      for (const s of payload.staff) {
        if (s.id && s.pin) {
          updatePin.run(s.pin, s.title || s.role, s.id);
        }
      }
    }

    // 3. Sync audit logs
    if (Array.isArray(payload.auditLogs)) {
      const existingLogs = new Set(this.db.prepare('SELECT id FROM audit_logs').all().map(l => l.id));
      const insertLog = this.db.prepare(`
        INSERT OR IGNORE INTO audit_logs (id, timestamp, time_str, action, user, role, manager, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of payload.auditLogs) {
        if (!existingLogs.has(l.id)) {
          insertLog.run(l.id, l.timestamp || now, l.timeStr || '', l.action || 'EVENT', l.user || 'Neil', l.role || 'manager', l.manager || '—', l.details || '');
        }
      }
    }

    return {
      status: 'synced',
      ordersCount: this.db.prepare('SELECT COUNT(*) as count FROM orders WHERE is_voided = 0').get().count,
      auditCount: this.db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count
    };
  }

  // Station Summary & Shift Metrics
  getStationSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todayStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(gallons), 0) as total_gallons,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END), 0) as total_cash_collected,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) as total_pending_receivables,
        COALESCE(SUM(CASE WHEN channel = 'delivery' THEN 1 ELSE 0 END), 0) as delivery_orders_count
      FROM orders
      WHERE is_voided = 0 AND timestamp >= ?
    `).get(todayMs);

    const totalCarboysOnLoan = this.db.prepare(`
      SELECT COALESCE(SUM(carboy_balance), 0) as balance FROM customers
    `).get().balance;

    const inventory = this.getInventory();

    return {
      today: todayStats,
      carboysOnLoan: totalCarboysOnLoan,
      inventory: inventory,
      timestamp: Date.now()
    };
  }
}

module.exports = new StationDatabase();

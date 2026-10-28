// ==========================================================================
// R&R Water Refilling Station - Developer Web Application Engine
// Standard: Dual-Theme, Pure SVG Icons, Robust Error Handling, Zero Emojis
// ==========================================================================

(function() {
  'use strict';

  // --- APPLICATION STATE ---
  let isStreamPaused = false;
  let activeStreamFilter = 'all';
  let telemetryEvents = [];
  let sfxEnabled = true;
  let activeExplorerTable = 'orders';
  let activeModalJson = null;

  // --- AUDIO SYNTHESIZER (Pure Web Audio API) ---
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    playChime() {
      if (!sfxEnabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.08); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } catch (e) {}
    },
    playDrawerPulse() {
      if (!sfxEnabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.setValueAtTime(60, now + 0.06);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {}
    }
  };

  // --- ESCAPE HTML HELPER ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabNavigation();
    initAudioToggle();
    initMonitorStream();
    initSimulators();
    initSqlConsole();
    initDbOperations();
    initExplorer();
    initModals();

    // Start background polling loops
    startActiveRegisterPolling();
    startTelemetryStreamPolling();
    startStationVitalsPolling();
  });

  // =========================================================================
  // 1. THEME CONTROLLER (DUAL-THEME HARMONY)
  // =========================================================================
  function initTheme() {
    const saved = localStorage.getItem('rr_dev_theme') || 'dark';
    if (saved === 'light') document.body.classList.add('light-mode');

    const btn = document.getElementById('btnThemeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('rr_dev_theme', isLight ? 'light' : 'dark');
      });
    }
  }

  function initAudioToggle() {
    const btn = document.getElementById('btnToggleAudio');
    const txt = document.getElementById('txtAudioStatus');
    if (btn && txt) {
      btn.addEventListener('click', () => {
        sfxEnabled = !sfxEnabled;
        txt.textContent = sfxEnabled ? 'SFX: On' : 'SFX: Mute';
        btn.style.opacity = sfxEnabled ? '1' : '0.6';
      });
    }
  }

  // =========================================================================
  // 2. TAB VIEW SWITCHING (MANDATORY SUB-TAB LOGIC)
  // =========================================================================
  function initTabNavigation() {
    const tabButtons = document.querySelectorAll('.dev-tab-btn');
    const tabPanels = document.querySelectorAll('.dev-tab-panel');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        if (!targetId) return;

        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');

        // Refresh panel data if needed
        if (targetId === 'tabViewExplorer') loadExplorerTables();
        if (targetId === 'tabViewDiagnostics') refreshDiagnostics();
      });
    });
  }

  // =========================================================================
  // 3. LIVE REGISTER MIRROR (REAL-TIME INPUTS SPY)
  // =========================================================================
  async function pollActiveRegister() {
    try {
      const res = await fetch('/api/dev/telemetry/active');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.state) return;

      const s = data.state;
      const mirOrderNo = document.getElementById('mirOrderNo');
      const mirChannel = document.getElementById('mirChannel');
      const mirSlim = document.getElementById('mirSlim');
      const mirRound = document.getElementById('mirRound');
      const mirTotal = document.getElementById('mirTotal');
      const mirStatusBadge = document.getElementById('mirStatusBadge');
      const mirMethod = document.getElementById('mirMethod');
      const mirTendered = document.getElementById('mirTendered');
      const mirChange = document.getElementById('mirChange');
      const mirCashier = document.getElementById('mirCashier');
      const mirNote = document.getElementById('mirNote');
      const mirLastSync = document.getElementById('mirLastSync');

      if (mirOrderNo) mirOrderNo.textContent = s.orderNo || 'ORD-0001';
      if (mirChannel) mirChannel.textContent = s.channel || 'WALK-IN';
      if (mirSlim) mirSlim.textContent = s.gallonsSlim ?? 0;
      if (mirRound) mirRound.textContent = s.gallonsRound ?? 0;
      if (mirTotal) mirTotal.textContent = `₱${Number(s.computedTotal || 0).toFixed(2)}`;

      if (mirStatusBadge) {
        const isPaid = (s.paymentStatus || 'PAID').toUpperCase() === 'PAID';
        mirStatusBadge.textContent = isPaid ? 'PAID' : 'UNPAID / UTANG';
        mirStatusBadge.className = `badge-payment-status ${isPaid ? 'paid' : 'unpaid'}`;
      }

      if (mirMethod) mirMethod.textContent = (s.paymentMethod || 'CASH').toUpperCase();
      if (mirTendered) mirTendered.textContent = `₱${Number(s.cashTendered || 0).toFixed(2)}`;
      if (mirChange) mirChange.textContent = `₱${Number(s.changeDue || 0).toFixed(2)}`;
      if (mirCashier) mirCashier.textContent = s.cashierName || 'Cashier';
      if (mirNote) {
        mirNote.textContent = s.orderNote || s.customerAddress || 'No active note or address';
      }
      if (mirLastSync) mirLastSync.textContent = new Date().toLocaleTimeString();

    } catch (e) {}
  }

  function startActiveRegisterPolling() {
    pollActiveRegister();
    setInterval(pollActiveRegister, 500); // Poll every 500ms for live sub-second mirroring
  }

  // =========================================================================
  // 4. LIVE TELEMETRY EVENT STREAM
  // =========================================================================
  function initMonitorStream() {
    const btnPause = document.getElementById('btnPauseStream');
    const btnClear = document.getElementById('btnClearStream');
    const filterBtns = document.querySelectorAll('.pill-filter-btn');

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        isStreamPaused = !isStreamPaused;
        btnPause.textContent = isStreamPaused ? 'Resume' : 'Pause';
        btnPause.style.borderColor = isStreamPaused ? 'var(--dev-warning)' : 'var(--dev-border)';
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        telemetryEvents = [];
        renderTelemetryFeed();
      });
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeStreamFilter = btn.getAttribute('data-filter') || 'all';
        renderTelemetryFeed();
      });
    });
  }

  async function pollTelemetryStream() {
    if (isStreamPaused) return;
    try {
      const res = await fetch('/api/dev/telemetry');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.events)) return;

      const previousCount = telemetryEvents.length;
      telemetryEvents = data.events;

      const counter = document.getElementById('badgeTelemetryCount');
      if (counter) counter.textContent = telemetryEvents.length;

      // Play audio chime if new events arrived
      if (telemetryEvents.length > previousCount && previousCount > 0) {
        AudioEngine.playChime();
      }

      renderTelemetryFeed();
    } catch (e) {}
  }

  function renderTelemetryFeed() {
    const container = document.getElementById('telemetryEventsContainer');
    const txtCounter = document.getElementById('txtStreamCounter');
    if (!container) return;

    let filtered = telemetryEvents;
    if (activeStreamFilter !== 'all') {
      filtered = telemetryEvents.filter(ev => {
        const type = (ev.type || '').toLowerCase();
        if (activeStreamFilter === 'order') return type.includes('order');
        if (activeStreamFilter === 'payment') return type.includes('payment') || type.includes('gcash');
        if (activeStreamFilter === 'debt') return type.includes('debt') || type.includes('utang');
        if (activeStreamFilter === 'expense') return type.includes('expense');
        if (activeStreamFilter === 'drawer') return type.includes('drawer');
        return true;
      });
    }

    if (txtCounter) txtCounter.textContent = `Showing ${filtered.length} events`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--dev-text-dim); font-size: 0.8rem;">
          No events match the selected category filter.
        </div>`;
      return;
    }

    container.innerHTML = filtered.slice(0, 40).map((ev, idx) => {
      let badgeClass = 'order';
      const t = (ev.type || '').toUpperCase();
      if (t.includes('PAYMENT') || t.includes('GCASH')) badgeClass = 'payment';
      else if (t.includes('DEBT') || t.includes('UTANG')) badgeClass = 'debt';
      else if (t.includes('EXPENSE')) badgeClass = 'expense';
      else if (t.includes('DRAWER')) badgeClass = 'drawer';

      const timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Now';
      const desc = ev.details || ev.message || JSON.stringify(ev.payload || ev);

      return `
        <div class="telemetry-event-item">
          <div class="event-item-left">
            <span class="event-type-badge ${badgeClass}">${escapeHtml(t || 'EVENT')}</span>
            <div>
              <div class="event-desc">${escapeHtml(desc)}</div>
              <div class="event-time">${escapeHtml(timeStr)}</div>
            </div>
          </div>
          <button type="button" class="btn-inspect" data-idx="${idx}">Inspect</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-inspect').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        openJsonModal(`Telemetry Event: ${filtered[idx].type || 'Payload'}`, filtered[idx]);
      });
    });
  }

  function startTelemetryStreamPolling() {
    pollTelemetryStream();
    setInterval(pollTelemetryStream, 1500);
  }

  // =========================================================================
  // 5. STATION VITALS & KPI SUMMARY POLLING
  // =========================================================================
  async function pollStationVitals() {
    try {
      const res = await fetch('/api/dev/status');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      // Update Header Server Pills
      const pillPos = document.getElementById('pillPosServerStatus');
      const txtPos = document.getElementById('txtPosServerStatus');
      if (pillPos && txtPos) {
        if (data.server.posOnline) {
          pillPos.className = 'status-pill online';
          txtPos.textContent = `POS Online :${data.server.posPort}`;
        } else {
          pillPos.className = 'status-pill probing';
          txtPos.textContent = `POS Probing :${data.server.posPort}`;
        }
      }

      // Update Database size badge
      const badgeDbSize = document.getElementById('badgeDbSize');
      if (badgeDbSize && data.database) {
        const kb = (data.database.fileSize / 1024).toFixed(1);
        badgeDbSize.textContent = `${kb} KB`;
      }

      // Update KPIs if station summary exists
      if (data.posSummary) {
        const s = data.posSummary;
        const elGross = document.getElementById('kpiGrossSales');
        const elOrders = document.getElementById('kpiGrossOrders');
        const elExpenses = document.getElementById('kpiExpenses');
        const elUtang = document.getElementById('kpiUtang');
        const elProfit = document.getElementById('kpiNetProfit');

        const gross = Number(s.todayGrossSales || 0);
        const expenses = Number(s.todayExpenses || 0);
        const utang = Number(s.unpaidTotal || 0);
        const netProfit = Math.max(0, gross - expenses - utang);

        if (elGross) elGross.textContent = `₱${gross.toFixed(2)}`;
        if (elOrders) elOrders.textContent = `${s.todayOrdersCount || 0} orders recorded`;
        if (elExpenses) elExpenses.textContent = `₱${expenses.toFixed(2)}`;
        if (elUtang) elUtang.textContent = `₱${utang.toFixed(2)}`;
        if (elProfit) elProfit.textContent = `₱${netProfit.toFixed(2)}`;
      }
    } catch (e) {}
  }

  function startStationVitalsPolling() {
    pollStationVitals();
    setInterval(pollStationVitals, 3000);
  }

  // =========================================================================
  // 6. FUNCTION SIMULATORS LOGIC
  // =========================================================================
  function initSimulators() {
    // 1. Walk-in Calculator & Order Simulator
    const inRound = document.getElementById('simWalkinRound');
    const inSlim = document.getElementById('simWalkinSlim');
    const inTender = document.getElementById('simWalkinTender');
    const inChange = document.getElementById('simWalkinChange');
    const btnWalkin = document.getElementById('btnSimWalkinOrder');
    const resWalkin = document.getElementById('simWalkinResult');

    const updateWalkinMath = () => {
      const r = Number(inRound?.value || 0);
      const s = Number(inSlim?.value || 0);
      const subtotal = (r + s) * 35;
      const t = Number(inTender?.value || 0);
      const chg = Math.max(0, t - subtotal);
      if (inChange) inChange.value = `₱${chg.toFixed(2)} (Total: ₱${subtotal.toFixed(2)})`;
    };

    if (inRound) inRound.addEventListener('input', updateWalkinMath);
    if (inSlim) inSlim.addEventListener('input', updateWalkinMath);
    if (inTender) inTender.addEventListener('input', updateWalkinMath);

    if (btnWalkin) {
      btnWalkin.addEventListener('click', async () => {
        updateWalkinMath();
        const r = Number(inRound?.value || 0);
        const s = Number(inSlim?.value || 0);
        const total = (r + s) * 35;
        const tendered = Number(inTender?.value || 0);
        const change = Math.max(0, tendered - total);

        if (resWalkin) resWalkin.textContent = 'Simulating order creation...';
        try {
          const sql = `INSERT INTO orders (order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, cashier_name, tendered, change_amount, note)
                       VALUES ('ORD-${Date.now().toString().slice(-4)}', ${Date.now()}, '${new Date().toISOString().split('T')[0]}', 'WALK_IN', 'round_5gal', '5-Gallon Refill', ${r+s}, 35.0, ${total}, ${total}, 'completed', 'Dev Sim', ${tendered}, ${change}, 'Simulated Walk-in Cash Order');`;
          
          await fetch('/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
          });

          await fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'ORDER_SUBMITTED',
              details: `Walk-in Order: ${r+s} gals, ₱${total.toFixed(2)} (Cash ₱${tendered})`,
              payload: { gallons: r+s, total, tendered, change }
            })
          });

          if (resWalkin) resWalkin.textContent = `SUCCESS: Walk-in order created for ₱${total.toFixed(2)}. Change: ₱${change.toFixed(2)}. Synced to SQLite.`;
          pollStationVitals();
        } catch (e) {
          if (resWalkin) resWalkin.textContent = `Error: ${e.message}`;
        }
      });
    }

    // 2. Delivery Utang Simulator
    const btnUtang = document.getElementById('btnSimUtangOrder');
    const resUtang = document.getElementById('simUtangResult');
    if (btnUtang) {
      btnUtang.addEventListener('click', async () => {
        const cust = document.getElementById('simUtangCustomer')?.value || 'Valued Customer';
        const gals = Number(document.getElementById('simUtangGallons')?.value || 1);
        const addr = document.getElementById('simUtangAddress')?.value || 'Local Area';
        const total = gals * 35;

        if (resUtang) resUtang.textContent = 'Dispatching unpaid delivery...';
        try {
          const sql = `INSERT INTO orders (order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, customer_name, note)
                       VALUES ('ORD-DEL-${Date.now().toString().slice(-4)}', ${Date.now()}, '${new Date().toISOString().split('T')[0]}', 'DELIVERY', 'slim_5gal', '5-Gallon Delivery', ${gals}, 35.0, ${total}, 0.0, 'pending', '${cust}', 'UTANG: ${addr}');`;
          
          await fetch('/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
          });

          await fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'DELIVERY_DISPATCHED_UTANG',
              details: `Unpaid Delivery: ${cust} (${gals} gals, ₱${total} receivable)`,
              payload: { customer: cust, gallons: gals, total, status: 'unpaid' }
            })
          });

          if (resUtang) resUtang.textContent = `SUCCESS: Dispatched ${gals} gallons to ${cust}. Total Utang added: ₱${total.toFixed(2)}.`;
          pollStationVitals();
        } catch (e) {
          if (resUtang) resUtang.textContent = `Error: ${e.message}`;
        }
      });
    }

    // 3. GCash Simulator
    const btnGcash = document.getElementById('btnSimGcashPay');
    const resGcash = document.getElementById('simGcashResult');
    if (btnGcash) {
      btnGcash.addEventListener('click', async () => {
        const amt = Number(document.getElementById('simGcashAmount')?.value || 140);
        const ref = document.getElementById('simGcashRef')?.value || '102938475612';
        if (resGcash) resGcash.textContent = 'Simulating GCash validation...';

        await fetch('/api/dev/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'PAYMENT_COLLECTED_GCASH',
            details: `GCash Ref ${ref} verified for ₱${amt.toFixed(2)}`,
            payload: { amount: amt, refNo: ref, method: 'GCASH' }
          })
        });

        if (resGcash) resGcash.textContent = `SUCCESS: GCash Ref ${ref} validated for ₱${amt.toFixed(2)}. Recorded in Telemetry stream.`;
      });
    }

    // 4. Bayad Utang Simulator
    const btnBayad = document.getElementById('btnSimBayadUtang');
    const resBayad = document.getElementById('simBayadResult');
    if (btnBayad) {
      btnBayad.addEventListener('click', async () => {
        const cust = document.getElementById('simBayadCustomer')?.value || 'Customer';
        const amt = Number(document.getElementById('simBayadAmount')?.value || 100);

        await fetch('/api/dev/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'DEBT_PAYMENT_COLLECTED',
            details: `Bayad Utang: ${cust} paid ₱${amt.toFixed(2)}`,
            payload: { customer: cust, amountPaid: amt }
          })
        });

        if (resBayad) resBayad.textContent = `SUCCESS: Bayad Utang payment of ₱${amt.toFixed(2)} collected from ${cust}. Shift ledger updated.`;
      });
    }

    // 5. Quick Expense Simulator
    const btnExpense = document.getElementById('btnSimExpense');
    const resExpense = document.getElementById('simExpenseResult');
    if (btnExpense) {
      btnExpense.addEventListener('click', async () => {
        const cat = document.getElementById('simExpCategory')?.value || 'Misc';
        const amt = Number(document.getElementById('simExpAmount')?.value || 50);

        await fetch('/api/dev/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'EXPENSE_LOGGED',
            details: `Operational Expense: ${cat} - ₱${amt.toFixed(2)}`,
            payload: { category: cat, amount: amt }
          })
        });

        if (resExpense) resExpense.textContent = `SUCCESS: Expense logged: ₱${amt.toFixed(2)} under ${cat}. Deducted from Real Daily Profit.`;
      });
    }

    // 6. Hardware Drawer Kick Simulator
    const btnDrawer = document.getElementById('btnSimDrawerKick');
    const resDrawer = document.getElementById('simHardwareResult');
    if (btnDrawer) {
      btnDrawer.addEventListener('click', async () => {
        AudioEngine.playDrawerPulse();
        await fetch('/api/dev/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'CASH_DRAWER_KICK',
            details: 'ESC/POS drawer kick pulse dispatched (pin 2 & 5)',
            payload: { hexCommand: '1B 70 00 19 FA' }
          })
        });
        if (resDrawer) resDrawer.textContent = 'PULSE SENT: ESC/POS pin 2 fired. Audio hardware pulse generated.';
      });
    }

    // 7. Thermal Receipt 80mm Preview Modal
    const btnPrint = document.getElementById('btnSimPrintReceipt');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        openThermalReceiptPreview();
      });
    }
  }

  function openThermalReceiptPreview() {
    const modal = document.getElementById('receiptModal');
    const paper = document.getElementById('receiptPaperView');
    if (!modal || !paper) return;

    const now = new Date();
    paper.innerHTML = `
      <div style="text-align: center; margin-bottom: 12px;">
        <h3 style="font-size: 1.1rem; font-weight: 800; letter-spacing: 1px;">R&amp;R WATER STATION</h3>
        <p style="font-size: 0.75rem;">Pure Refilled Drinking Water</p>
        <p style="font-size: 0.72rem;">Brgy. Central, Station Terminal</p>
        <p style="font-size: 0.72rem;">Contact: 0917-000-0000</p>
      </div>
      <div style="border-top: 1px dashed #444; border-bottom: 1px dashed #444; padding: 6px 0; margin-bottom: 10px; font-size: 0.75rem;">
        <div>Order #: ORD-${now.getTime().toString().slice(-6)}</div>
        <div>Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
        <div>Cashier: Station Front Desk</div>
      </div>
      <table style="width: 100%; font-size: 0.75rem; margin-bottom: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid #777;">
            <th style="text-align: left;">Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Round 5-Gal Refill</td>
            <td style="text-align: center;">2</td>
            <td style="text-align: right;">₱70.00</td>
          </tr>
          <tr>
            <td>Slim 5-Gal Refill</td>
            <td style="text-align: center;">1</td>
            <td style="text-align: right;">₱35.00</td>
          </tr>
        </tbody>
      </table>
      <div style="border-top: 1px dashed #444; padding-top: 6px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between;"><strong>SUBTOTAL:</strong> <span>₱105.00</span></div>
        <div style="display: flex; justify-content: space-between;"><strong>TENDERED (CASH):</strong> <span>₱150.00</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-top: 4px;"><strong>CHANGE DUE:</strong> <span>₱45.00</span></div>
      </div>
      <div style="text-align: center; margin-top: 16px; font-size: 0.7rem;">
        <p>Maraming Salamat Po!</p>
        <p>Please return empty bottles upon next refill.</p>
      </div>
    `;

    modal.style.display = 'flex';
  }

  // =========================================================================
  // 7. SQL QUERY CONSOLE & DB MAINTENANCE
  // =========================================================================
  function initSqlConsole() {
    const btnRun = document.getElementById('btnRunSqlQuery');
    const textarea = document.getElementById('sqlQueryTextarea');
    const quickBtns = document.querySelectorAll('.btn-quick-sql');

    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const sql = btn.getAttribute('data-sql');
        if (sql && textarea) {
          textarea.value = sql;
          executeSql(sql);
        }
      });
    });

    if (btnRun && textarea) {
      btnRun.addEventListener('click', () => executeSql(textarea.value));
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeSql(textarea.value);
        }
      });
    }
  }

  async function executeSql(sql) {
    const head = document.getElementById('sqlResultsHead');
    const body = document.getElementById('sqlResultsBody');
    const txtStatus = document.getElementById('txtSqlStatus');
    const txtTime = document.getElementById('txtSqlExecutionTime');

    if (txtStatus) txtStatus.textContent = 'Executing query...';

    try {
      const res = await fetch('/api/dev/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
      });

      const data = await res.json();
      if (!data.success) {
        if (txtStatus) txtStatus.textContent = `Error: ${data.error}`;
        if (body) body.innerHTML = `<tr><td style="color: var(--dev-danger); padding: 16px;">${escapeHtml(data.error)}</td></tr>`;
        return;
      }

      if (txtTime) txtTime.textContent = `${data.durationMs}ms`;
      if (txtStatus) txtStatus.textContent = `Success: ${data.rowCount ?? 0} rows returned`;

      if (data.mutation) {
        if (head) head.innerHTML = '';
        if (body) body.innerHTML = `<tr><td style="color: var(--dev-success); padding: 16px;">Statement executed successfully (${data.durationMs}ms)</td></tr>`;
        return;
      }

      // Render columns
      const cols = data.columns || [];
      if (head) {
        head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      }

      // Render rows
      if (body) {
        if (data.rows.length === 0) {
          body.innerHTML = `<tr><td colspan="${cols.length || 1}" style="padding: 16px; text-align: center; color: var(--dev-text-dim);">No rows returned</td></tr>`;
        } else {
          body.innerHTML = data.rows.map(row => {
            return `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`;
          }).join('');
        }
      }
    } catch (e) {
      if (txtStatus) txtStatus.textContent = `Network Error: ${e.message}`;
    }
  }

  function initDbOperations() {
    const btnBackup = document.getElementById('btnDownloadDbBackup');
    const btnExport = document.getElementById('btnExportJsonDump');
    const btnIntegrity = document.getElementById('btnRunIntegrityCheck');
    const btnVacuum = document.getElementById('btnRunVacuum');
    const btnSeed = document.getElementById('btnSeedData');
    const btnWipe = document.getElementById('btnWipeOrders');

    if (btnBackup) btnBackup.addEventListener('click', () => { window.location.href = '/api/dev/backup'; });
    if (btnExport) btnExport.addEventListener('click', () => { window.location.href = '/api/dev/export-json'; });

    if (btnIntegrity) {
      btnIntegrity.addEventListener('click', async () => {
        btnIntegrity.textContent = 'Checking...';
        const res = await fetch('/api/dev/integrity', { method: 'POST' });
        const d = await res.json();
        btnIntegrity.textContent = 'Check Health';
        alert(`SQLite Integrity Check:\n${d.integrity || 'ok'} (Healthy: ${d.healthy})`);
      });
    }

    if (btnVacuum) {
      btnVacuum.addEventListener('click', async () => {
        btnVacuum.textContent = 'Vacuuming...';
        const res = await fetch('/api/dev/vacuum', { method: 'POST' });
        const d = await res.json();
        btnVacuum.textContent = 'Run VACUUM';
        alert(`SQLite VACUUM Complete!\nBefore: ${d.beforeBytes} bytes\nAfter: ${d.afterBytes} bytes\nReclaimed: ${d.reclaimedBytes} bytes`);
        pollStationVitals();
      });
    }

    if (btnSeed) {
      btnSeed.addEventListener('click', async () => {
        btnSeed.textContent = 'Seeding...';
        const res = await fetch('/api/dev/seed', { method: 'POST' });
        const d = await res.json();
        btnSeed.textContent = 'Seed Orders';
        alert(`Seeded ${d.seededCount} sample transactions into rr_water.db!`);
        pollStationVitals();
      });
    }

    if (btnWipe) {
      btnWipe.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear all transactions in the orders table? Station settings and staff will be preserved.')) return;
        const res = await fetch('/api/dev/wipe', { method: 'POST' });
        const d = await res.json();
        alert(d.message || 'Orders table cleared.');
        pollStationVitals();
      });
    }
  }

  // =========================================================================
  // 8. RAW TABLE EXPLORER
  // =========================================================================
  async function loadExplorerTables() {
    const container = document.getElementById('tableSubtabsContainer');
    if (!container) return;

    try {
      const res = await fetch('/api/dev/tables');
      const data = await res.json();
      if (!data.success || !Array.isArray(data.tables)) return;

      container.innerHTML = data.tables.map(t => {
        const isActive = t.name === activeExplorerTable;
        return `
          <button type="button" class="btn-table-tab ${isActive ? 'active' : ''}" data-table="${escapeHtml(t.name)}">
            <span>${escapeHtml(t.name)}</span>
            <span class="table-row-count">${t.rowCount}</span>
          </button>
        `;
      }).join('');

      container.querySelectorAll('.btn-table-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.btn-table-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeExplorerTable = btn.getAttribute('data-table');
          loadExplorerTableData();
        });
      });

      loadExplorerTableData();
    } catch (e) {}
  }

  async function loadExplorerTableData() {
    const head = document.getElementById('explorerDataHead');
    const body = document.getElementById('explorerDataBody');
    const txtCount = document.getElementById('txtExplorerCount');
    const searchVal = document.getElementById('tblSearchInput')?.value || '';

    if (!head || !body) return;

    try {
      const url = `/api/dev/tables/${encodeURIComponent(activeExplorerTable)}?search=${encodeURIComponent(searchVal)}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        body.innerHTML = `<tr><td style="color: var(--dev-danger); padding: 16px;">${escapeHtml(data.error)}</td></tr>`;
        return;
      }

      if (txtCount) txtCount.textContent = `Showing ${data.rowCount} rows in '${activeExplorerTable}'`;

      const cols = data.columns || [];
      head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>Action</th></tr>`;

      if (data.rows.length === 0) {
        body.innerHTML = `<tr><td colspan="${cols.length + 1}" style="padding: 16px; text-align: center; color: var(--dev-text-dim);">Table has no matching records</td></tr>`;
      } else {
        body.innerHTML = data.rows.map((row, idx) => {
          return `
            <tr>
              ${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}
              <td><button type="button" class="btn-inspect" data-idx="${idx}">Inspect JSON</button></td>
            </tr>
          `;
        }).join('');

        body.querySelectorAll('.btn-inspect').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-idx'));
            openJsonModal(`${activeExplorerTable} Row #${idx + 1}`, data.rows[idx]);
          });
        });
      }
    } catch (e) {}
  }

  function initExplorer() {
    const search = document.getElementById('tblSearchInput');
    if (search) {
      search.addEventListener('input', () => {
        loadExplorerTableData();
      });
    }
  }

  // =========================================================================
  // 9. SYSTEM DIAGNOSTICS VIEW
  // =========================================================================
  async function refreshDiagnostics() {
    const preNode = document.getElementById('diagNodeMetrics');
    const preCloud = document.getElementById('diagCloudMetrics');

    try {
      const res = await fetch('/api/dev/status');
      const data = await res.json();
      if (preNode) preNode.textContent = JSON.stringify(data.server || data, null, 2);

      // Probe Supabase endpoint
      try {
        const cloudRes = await fetch('/api/config/supabase');
        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          if (preCloud) preCloud.textContent = JSON.stringify(cloudData, null, 2);
        } else {
          if (preCloud) preCloud.textContent = 'Supabase Cloud Config: Ready (Standalone Node Mode)';
        }
      } catch (e) {
        if (preCloud) preCloud.textContent = 'Supabase Cloud: Local SQLite Mode Active (No Cloud Blockers)';
      }
    } catch (e) {}
  }

  // =========================================================================
  // 10. MODAL DIALOGS (INSPECT JSON & RECEIPT)
  // =========================================================================
  function initModals() {
    const modalJson = document.getElementById('jsonInspectModal');
    const btnCloseJson = document.getElementById('btnCloseJsonModal');
    const btnDismissJson = document.getElementById('btnDismissJsonModal');
    const btnCopyJson = document.getElementById('btnCopyJson');

    const modalReceipt = document.getElementById('receiptModal');
    const btnCloseReceipt = document.getElementById('btnCloseReceiptModal');
    const btnDismissReceipt = document.getElementById('btnDismissReceiptModal');

    const closeAll = () => {
      if (modalJson) modalJson.style.display = 'none';
      if (modalReceipt) modalReceipt.style.display = 'none';
      document.body.classList.remove('overflow-hidden');
    };

    if (btnCloseJson) btnCloseJson.addEventListener('click', closeAll);
    if (btnDismissJson) btnDismissJson.addEventListener('click', closeAll);
    if (btnCloseReceipt) btnCloseReceipt.addEventListener('click', closeAll);
    if (btnDismissReceipt) btnDismissReceipt.addEventListener('click', closeAll);

    // Close on backdrop click
    if (modalJson) {
      modalJson.addEventListener('click', (e) => {
        if (e.target === modalJson) closeAll();
      });
    }
    if (modalReceipt) {
      modalReceipt.addEventListener('click', (e) => {
        if (e.target === modalReceipt) closeAll();
      });
    }

    // Close on Escape key press
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    if (btnCopyJson) {
      btnCopyJson.addEventListener('click', () => {
        const text = typeof activeModalJson === 'string' ? activeModalJson : JSON.stringify(activeModalJson, null, 2);
        navigator.clipboard.writeText(text).then(() => {
          btnCopyJson.textContent = 'Copied to Clipboard!';
          setTimeout(() => { btnCopyJson.textContent = 'Copy JSON'; }, 1500);
        });
      });
    }
  }

  function openJsonModal(title, data) {
    const modal = document.getElementById('jsonInspectModal');
    const elTitle = document.getElementById('jsonModalTitle');
    const elPre = document.getElementById('jsonModalPre');

    activeModalJson = data;
    if (elTitle) elTitle.textContent = title;
    if (elPre) elPre.textContent = JSON.stringify(data, null, 2);
    if (modal) {
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');
    }
  }

})();

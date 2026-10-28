// ==========================================================================
// R&R Water POS - Developer Cockpit & Telemetry Controller
// ==========================================================================

(function() {
  'use strict';

  // --- STATE ---
  let isStreamPaused = false;
  let activeStreamFilter = 'all';
  let telemetryEvents = [];
  let activeExplorerSubtab = 'orders';
  let activeJsonPayload = null;

  // --- AUDIO SYNTHESIZER ---
  const AudioSynthesizer = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    playTap() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
      } catch (e) {}
    },
    playChime() {
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc1.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc2.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        osc1.start(now);
        osc2.start(now + 0.24);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
      } catch (e) {}
    },
    playDrawerPulse() {
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(80, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } catch (e) {}
    }
  };

  // --- FORMATTING HELPERS ---
  function formatPeso(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
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
    initTelemetryListener();
    initPollingHeartbeat();
    initFunctionSimulators();
    initMaintenanceActions();
    initRawExplorer();
    initPayloadModal();

    // Load initial events from history if available
    try {
      const history = JSON.parse(localStorage.getItem('rr_telemetry_history') || '[]');
      if (Array.isArray(history) && history.length > 0) {
        telemetryEvents = history;
        renderTelemetryFeed();
      }
    } catch (e) {}

    // Initial render
    refreshKpis();
    refreshRegisterMirror();
  });

  // --- 1. THEME CONTROLLER ---
  function initTheme() {
    const savedTheme = localStorage.getItem('rr_dev_theme') || localStorage.getItem('rr_pos_theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
    }

    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('rr_dev_theme', isLight ? 'light' : 'dark');
      });
    }

    const btnOpenPos = document.getElementById('btnOpenPosApp');
    if (btnOpenPos) {
      btnOpenPos.addEventListener('click', () => {
        window.open('index.html', 'rr_water_pos_main');
      });
    }
  }

  // --- 2. TAB NAVIGATION ---
  function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.dev-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetId = btn.getAttribute('data-tab');
        document.querySelectorAll('.dev-panel').forEach(panel => {
          panel.classList.remove('active');
        });
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }

        if (targetId === 'tab-maintenance') {
          updateStorageGauge();
        } else if (targetId === 'tab-explorer') {
          renderExplorerTable();
        }
      });
    });
  }

  // --- 3. TELEMETRY & REAL-TIME INPUT LISTENER ---
  function initTelemetryListener() {
    // 1. BroadcastChannel (0ms zero-lag between tabs)
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('rr_pos_telemetry');
      bc.onmessage = (msg) => {
        if (!msg || !msg.data) return;
        handleIncomingTelemetry(msg.data);
      };
    }

    // 2. Storage Event (fires across windows when localStorage updates)
    window.addEventListener('storage', (e) => {
      if (e.key === 'rr_active_register_state') {
        refreshRegisterMirror();
      } else if (e.key === 'rr_telemetry_event' && e.newValue) {
        try {
          const evt = JSON.parse(e.newValue);
          handleIncomingTelemetry(evt);
        } catch (err) {}
      } else if (e.key && e.key.startsWith('rr_pos_')) {
        refreshKpis();
        if (document.getElementById('tab-explorer')?.classList.contains('active')) {
          renderExplorerTable();
        }
      }
    });

    // Stream Controls
    const btnPause = document.getElementById('btnPauseStream');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        isStreamPaused = !isStreamPaused;
        btnPause.textContent = isStreamPaused ? 'Resume' : 'Pause';
        btnPause.style.color = isStreamPaused ? '#f59e0b' : '';
      });
    }

    const btnClear = document.getElementById('btnClearStream');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        telemetryEvents = [];
        localStorage.removeItem('rr_telemetry_history');
        renderTelemetryFeed();
      });
    }

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeStreamFilter = chip.getAttribute('data-filter') || 'all';
        renderTelemetryFeed();
      });
    });
  }

  function handleIncomingTelemetry(data) {
    if (data.type === 'REGISTER_INPUT_UPDATE' || data.type === 'REGISTER_STATE_SYNC') {
      applyRegisterMirrorData(data.state);
      return;
    }

    // Regular event
    if (!isStreamPaused) {
      telemetryEvents.unshift(data);
      if (telemetryEvents.length > 100) telemetryEvents.pop();
      renderTelemetryFeed();
    }

    refreshKpis();
  }

  function renderTelemetryFeed() {
    const container = document.getElementById('devStreamContainer');
    const badgeCount = document.getElementById('badgeEventsCount');
    if (badgeCount) badgeCount.textContent = telemetryEvents.length;

    if (!container) return;

    const filtered = telemetryEvents.filter(evt => {
      if (activeStreamFilter === 'all') return true;
      const type = (evt.type || '').toLowerCase();
      if (activeStreamFilter === 'order') return type.includes('order');
      if (activeStreamFilter === 'pay') return type.includes('pay') && !type.includes('debt');
      if (activeStreamFilter === 'debt') return type.includes('debt') || type.includes('bayad');
      if (activeStreamFilter === 'driver') return type.includes('driver') || type.includes('settle');
      if (activeStreamFilter === 'expense') return type.includes('expense');
      if (activeStreamFilter === 'system') return type.includes('system') || type.includes('hardware') || type.includes('drawer') || type.includes('inventory');
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="stream-empty-state">
          <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <strong>No events found for "${activeStreamFilter}"</strong>
          <p>Perform an action in the POS terminal to generate telemetry.</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach((evt, idx) => {
      const badgeClass = getBadgeClass(evt.type);
      const timeStr = evt.timeStr || new Date(evt.timestamp || Date.now()).toLocaleTimeString();
      const user = evt.user || 'Neil';
      const role = evt.role ? `[${evt.role.toUpperCase()}]` : '';

      html += `
        <div class="stream-row">
          <span class="stream-time">${escapeHtml(timeStr)}</span>
          <span class="stream-badge ${badgeClass}">${escapeHtml(evt.type || 'EVENT')}</span>
          <div class="stream-body">
            <span class="stream-msg">${escapeHtml(evt.details || 'Event logged')}</span>
            <div class="stream-meta">
              <span>Operator: <strong>${escapeHtml(user)}</strong> ${escapeHtml(role)}</span>
              <span>ID: ${escapeHtml(evt.id || '---')}</span>
            </div>
          </div>
          ${evt.payload ? `<button type="button" class="btn-inspect-payload" data-evt-idx="${idx}">Inspect</button>` : ''}
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind inspect buttons
    container.querySelectorAll('.btn-inspect-payload').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-evt-idx'));
        const evt = filtered[idx];
        if (evt) {
          openPayloadModal(evt.type || 'Event Payload', evt.payload || evt);
        }
      });
    });
  }

  function getBadgeClass(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('order')) return 'badge-order';
    if (t.includes('debt') || t.includes('bayad')) return 'badge-debt';
    if (t.includes('pay')) return 'badge-pay';
    if (t.includes('driver') || t.includes('settle')) return 'badge-driver';
    if (t.includes('expense')) return 'badge-expense';
    return 'badge-system';
  }

  // --- 4. LIVE REGISTER MIRROR ---
  function refreshRegisterMirror() {
    try {
      const raw = localStorage.getItem('rr_active_register_state');
      if (raw) {
        const state = JSON.parse(raw);
        applyRegisterMirrorData(state);
      }
    } catch (e) {}
  }

  function applyRegisterMirrorData(state) {
    if (!state) return;

    const elAvatar = document.getElementById('mirrorCashierAvatar');
    const elName = document.getElementById('mirrorCashierName');
    const elOrderNo = document.getElementById('mirrorOrderNo');
    const elWalkin = document.getElementById('mirrorChannelWalkin');
    const elDelivery = document.getElementById('mirrorChannelDelivery');
    const elProdDesc = document.getElementById('mirrorProdDesc');
    const elQty = document.getElementById('mirrorQty');
    const elTotal = document.getElementById('mirrorTotal');
    const elPayMode = document.getElementById('mirrorPayMode');
    const elMethod = document.getElementById('mirrorPaymentMethod');
    const elTendered = document.getElementById('mirrorTendered');
    const elChange = document.getElementById('mirrorChange');
    const elNote = document.getElementById('mirrorNoteDisplay');
    const elLastSync = document.getElementById('mirrorLastSync');

    if (elAvatar) elAvatar.textContent = (state.cashier || 'N').charAt(0).toUpperCase();
    if (elName) elName.textContent = state.cashier || 'Neil';
    if (elOrderNo) elOrderNo.textContent = state.orderNo || '#000000';

    if (elWalkin && elDelivery) {
      if (state.channel === 'delivery') {
        elWalkin.classList.remove('active');
        elDelivery.classList.add('active');
      } else {
        elWalkin.classList.add('active');
        elDelivery.classList.remove('active');
      }
    }

    if (elProdDesc) elProdDesc.textContent = `${state.prodName || '1 Gallon Purified'} • ₱${formatPeso(state.unitPrice || 35)}`;
    if (elQty) elQty.textContent = `${state.qty || 1} Gallon${(state.qty > 1) ? 's' : ''}`;
    if (elTotal) elTotal.textContent = `₱ ${formatPeso(state.total || 35)}`;

    if (elPayMode) {
      if (state.orderPayMode === 'unpaid') {
        elPayMode.textContent = 'UNPAID / UTANG';
        elPayMode.className = 'mirror-tag unpaid';
      } else {
        elPayMode.textContent = 'PAID IN ADVANCE';
        elPayMode.className = 'mirror-tag paid';
      }
    }

    if (elMethod) {
      elMethod.textContent = (state.paymentMethod === 'gcash') ? 'GCash Official QR' : 'Cash Drawer';
    }

    if (elTendered) elTendered.textContent = `₱ ${formatPeso(state.tenderAmount || 0)}`;
    if (elChange) elChange.textContent = `₱ ${formatPeso(state.changeAmount || 0)}`;

    if (elNote) {
      const note = state.note || state.deliveryAddress;
      elNote.textContent = note ? note : '(No note or delivery address entered)';
      elNote.style.fontStyle = note ? 'normal' : 'italic';
    }

    if (elLastSync) {
      elLastSync.textContent = state.timeStr || new Date().toLocaleTimeString();
    }
  }

  // --- 5. KPI SUMMARY & METRICS ---
  function refreshKpis() {
    let orders = [];
    let expenses = [];
    let inventory = { ready: 150, returned: 34 };

    try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}
    try { expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'); } catch (e) {}
    try { inventory = JSON.parse(localStorage.getItem('rr_pos_inventory') || '{"ready":150,"returned":34}'); } catch (e) {}

    let grossSales = 0;
    let pendingDebt = 0;
    let pendingCount = 0;

    orders.forEach(o => {
      grossSales += Number(o.total || 0);
      if (o.status === 'pending') {
        const unpaid = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : Number(o.total || 0);
        pendingDebt += unpaid;
        pendingCount++;
      }
    });

    let totalExpenses = 0;
    expenses.forEach(x => {
      totalExpenses += Number(x.amount || 0);
    });

    const netProfit = grossSales - totalExpenses;

    const elGross = document.getElementById('kpiGrossSales');
    const elOrdersRatio = document.getElementById('kpiOrdersRatio');
    const elExp = document.getElementById('kpiExpensesTotal');
    const elExpCount = document.getElementById('kpiExpenseCount');
    const elNet = document.getElementById('kpiNetProfit');
    const elDebt = document.getElementById('kpiPendingDebt');
    const elPendingOrders = document.getElementById('kpiPendingOrders');
    const elReady = document.getElementById('kpiReadyJugs');
    const elEmpties = document.getElementById('kpiEmptiesCount');
    const badgeOrders = document.getElementById('badgeOrdersCount');

    if (elGross) elGross.textContent = `₱ ${formatPeso(grossSales)}`;
    if (elOrdersRatio) elOrdersRatio.textContent = `${orders.length} orders recorded`;
    if (elExp) elExp.textContent = `₱ ${formatPeso(totalExpenses)}`;
    if (elExpCount) elExpCount.textContent = `${expenses.length} operational items`;
    if (elNet) elNet.textContent = `₱ ${formatPeso(netProfit)}`;
    if (elDebt) elDebt.textContent = `₱ ${formatPeso(pendingDebt)}`;
    if (elPendingOrders) elPendingOrders.textContent = `${pendingCount} uncollected orders`;
    if (elReady) elReady.textContent = `${inventory.ready || 0} Gal`;
    if (elEmpties) elEmpties.textContent = `${inventory.returned || 0} returned awaiting sanitizing`;
    if (badgeOrders) badgeOrders.textContent = `${orders.length} Orders`;

    // Specs in features tab
    const specDebt = document.getElementById('specTotalDebt');
    if (specDebt) specDebt.textContent = `₱ ${formatPeso(pendingDebt)}`;
  }

  // --- 6. POLLING & HEARTBEAT ---
  function initPollingHeartbeat() {
    setInterval(() => {
      refreshRegisterMirror();
      refreshKpis();
    }, 2000);

    // Probe SQLite Backend
    probeBackend();
    setInterval(probeBackend, 10000);
  }

  function probeBackend() {
    const pill = document.getElementById('pillBackendStatus');
    const txt = document.getElementById('txtBackendStatus');
    if (!pill || !txt) return;

    fetch('/api/status', { method: 'GET' })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          pill.className = 'dev-status-pill online';
          txt.textContent = 'Backend: SQLite Online';
        } else {
          pill.className = 'dev-status-pill';
          txt.textContent = 'Backend: Standby';
        }
      })
      .catch(() => {
        pill.className = 'dev-status-pill';
        txt.textContent = 'Backend: Static Mode';
      });
  }

  // --- 7. FUNCTION DIRECTORY SIMULATORS ---
  function initFunctionSimulators() {
    // 1. Simulate Walk-in Order
    document.getElementById('btnSimulateWalkin')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      const orderNo = '#' + Math.floor(100000 + Math.random() * 900000);
      const qty = 3;
      const total = qty * 35;
      const newOrder = {
        orderNo: orderNo,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        channel: 'walkin',
        prodKey: 'purified',
        prodName: '1 Gallon Purified Refill',
        gallons: qty,
        unitPrice: 35,
        total: total,
        paidAmount: total,
        unpaidAmount: 0,
        status: 'paid',
        paymentMethod: 'cash',
        cashierName: 'Neil',
        note: 'Walk-in Counter Simulation'
      };

      appendOrderToStorage(newOrder);
      broadcastTelemetry('ORDER_SUBMITTED', `[Simulated] Walk-in order ${orderNo} ringer test (${qty} Gal • ₱${formatPeso(total)})`, newOrder);
    });

    // 2. Simulate Delivery Order (Pending Utang)
    document.getElementById('btnSimulateDelivery')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      const orderNo = '#' + Math.floor(100000 + Math.random() * 900000);
      const qty = 10;
      const total = qty * 35;
      const newOrder = {
        orderNo: orderNo,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        channel: 'delivery',
        prodKey: 'purified',
        prodName: '1 Gallon Purified Refill',
        gallons: qty,
        unitPrice: 35,
        total: total,
        paidAmount: 0,
        unpaidAmount: total,
        status: 'pending',
        paymentMethod: 'cash',
        cashierName: 'Neil',
        note: 'Purok 3 Riverside Subd (Pending Remittance)'
      };

      appendOrderToStorage(newOrder);
      broadcastTelemetry('ORDER_SUBMITTED', `[Simulated] Multicab dispatch ${orderNo} (${qty} Gal • Unpaid ₱${formatPeso(total)})`, newOrder);
    });

    // 3. Simulate Bayad Utang
    document.getElementById('btnSimulateDebtPayment')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      let orders = [];
      try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}

      let target = orders.find(o => o.status === 'pending');
      if (!target) {
        // Create an unpaid order first
        const orderNo = '#' + Math.floor(100000 + Math.random() * 900000);
        target = {
          orderNo: orderNo,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
          date: new Date().toISOString().slice(0, 10),
          channel: 'delivery',
          prodKey: 'purified',
          prodName: '1 Gallon Purified Refill',
          gallons: 3,
          unitPrice: 35,
          total: 105,
          paidAmount: 0,
          unpaidAmount: 105,
          status: 'pending',
          paymentMethod: 'cash',
          cashierName: 'Neil',
          note: 'Purok 1 Debt Customer'
        };
        orders.unshift(target);
      }

      const payAmt = Math.min(105, target.unpaidAmount || target.total);
      target.paidAmount = (target.paidAmount || 0) + payAmt;
      target.unpaidAmount = Math.max(0, target.total - target.paidAmount);
      if (target.unpaidAmount === 0) target.status = 'paid';

      localStorage.setItem('rr_pos_stored_orders', JSON.stringify(orders));
      broadcastTelemetry('DEBT_PAYMENT', `[Simulated] Bayad Utang payment of ₱${formatPeso(payAmt)} collected for ${target.orderNo}`, {
        orderNo: target.orderNo,
        paidAmount: payAmt,
        remainingDebt: target.unpaidAmount,
        status: target.status
      });
    });

    // 4. Simulate GCash Order
    document.getElementById('btnSimulateGcashOrder')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      const orderNo = '#' + Math.floor(100000 + Math.random() * 900000);
      const qty = 2;
      const total = qty * 35;
      const newOrder = {
        orderNo: orderNo,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        channel: 'walkin',
        prodKey: 'purified',
        prodName: '1 Gallon Purified Refill',
        gallons: qty,
        unitPrice: 35,
        total: total,
        paidAmount: total,
        unpaidAmount: 0,
        status: 'paid',
        paymentMethod: 'gcash',
        gcashRef: 'GC-' + Math.floor(100000000 + Math.random() * 900000000),
        cashierName: 'Neil',
        note: 'Customer Scanned Station QR Standee'
      };

      appendOrderToStorage(newOrder);
      broadcastTelemetry('ORDER_SUBMITTED', `[Simulated] GCash QR transaction ${orderNo} (₱${formatPeso(total)} • Ref ${newOrder.gcashRef})`, newOrder);
    });

    // 5. Simulate Driver Settlement
    document.getElementById('btnSimulateDriverSettlement')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      const settleRecord = {
        id: 'settle_' + Date.now(),
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        driver: 'Kuya Jun',
        loaded: 100,
        sold: 56,
        emptiesReturned: 56,
        unsoldReturned: 44,
        grossSales: 1960,
        fuelDeduction: 150,
        expectedNet: 1810,
        actualCashReceived: 1810,
        discrepancy: 0,
        status: 'balanced',
        cashier: 'Neil'
      };

      let settlements = [];
      try { settlements = JSON.parse(localStorage.getItem('rr_pos_driver_settlements') || '[]'); } catch (e) {}
      settlements.unshift(settleRecord);
      localStorage.setItem('rr_pos_driver_settlements', JSON.stringify(settlements));

      // Also log fuel expense
      addExpenseRecord('fuel', 150, 'Driver Fuel Deduction (Kuya Jun Multicab #1)', 'drawer');

      broadcastTelemetry('DRIVER_SETTLEMENT', `[Simulated] Driver Remittance: Kuya Jun remitted ₱1,810.00 (56 Sold, ₱150 Fuel)`, settleRecord);
    });

    // 6. Quick Expenses
    document.getElementById('btnSimulateExpenseFuel')?.addEventListener('click', () => {
      AudioSynthesizer.playTap();
      addExpenseRecord('fuel', 150, 'Petron 2L Unleaded for Delivery Route', 'drawer');
    });

    document.getElementById('btnSimulateExpenseSeals')?.addEventListener('click', () => {
      AudioSynthesizer.playTap();
      addExpenseRecord('seals', 85, '1 Pack Gallon Heat-Shrink Cap Seals', 'drawer');
    });

    // 7. Hardware Peripherals
    document.getElementById('btnTestDrawerKick')?.addEventListener('click', () => {
      AudioSynthesizer.playDrawerPulse();
      broadcastTelemetry('CASH_DRAWER_KICK', 'ESC/POS Solenoid Pulse Test: Drawer Opened (Pin 2 Solenoid Triggered)', { pulseMs: 120, pin: 2 });
    });

    document.getElementById('btnTestSoundChime')?.addEventListener('click', () => {
      AudioSynthesizer.playChime();
      broadcastTelemetry('AUDIO_CHIME_TEST', 'Audio Synthesizer: Triple-harmonic payment chime generated', { frequencies: [523.25, 659.25, 1046.50] });
    });

    document.getElementById('btnTestThermalReceipt')?.addEventListener('click', () => {
      AudioSynthesizer.playTap();
      const sampleReceipt = `
================================
     R&R WATER REFILLING STATION
     Counter #1 (Main Terminal)
      Purok 1, Main Road Station
        Tel: 0917-829-4102
================================
Order: #582910     Date: ${new Date().toLocaleDateString()}
Time:  ${new Date().toLocaleTimeString()}     Cashier: Neil
--------------------------------
ITEM               QTY    AMOUNT
1 Gal Purified      3     ₱105.00
--------------------------------
Subtotal:                 ₱105.00
Grand Total:              ₱105.00
CASH TENDERED:            ₱500.00
CHANGE DUE:               ₱395.00
--------------------------------
PAYMENT STATUS: PAID (Cash Drawer)
================================
  Clean, Pure & Crystal Refreshing
      Maraming Salamat Po!
================================
`;
      openPayloadModal('ESC/POS Thermal 80mm Receipt Preview', sampleReceipt, true);
      broadcastTelemetry('RECEIPT_PRINT_TEST', 'Thermal ESC/POS Preview Generated for Order #582910', { format: '80mm' });
    });
  }

  function appendOrderToStorage(order) {
    let orders = [];
    try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}
    orders.unshift(order);
    localStorage.setItem('rr_pos_stored_orders', JSON.stringify(orders));
    refreshKpis();
  }

  function addExpenseRecord(cat, amt, note, source) {
    const expense = {
      id: 'exp_' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      category: cat,
      amount: amt,
      note: note,
      source: source || 'drawer',
      cashier: 'Neil'
    };

    let expenses = [];
    try { expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'); } catch (e) {}
    expenses.unshift(expense);
    localStorage.setItem('rr_pos_expenses', JSON.stringify(expenses));
    refreshKpis();

    broadcastTelemetry('EXPENSE_LOGGED', `Operational Expense: ₱${formatPeso(amt)} for ${cat.toUpperCase()} (${note})`, expense);
  }

  function broadcastTelemetry(type, details, payload) {
    const event = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString(),
      type: type,
      details: details,
      user: 'Developer Console',
      role: 'owner',
      payload: payload
    };

    // Broadcast
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('rr_pos_telemetry');
        bc.postMessage(event);
      } catch (e) {}
    }

    // Local Storage trigger
    try {
      localStorage.setItem('rr_telemetry_event', JSON.stringify(event));
    } catch (e) {}

    handleIncomingTelemetry(event);
  }

  // --- 8. MAINTENANCE & HEALTH ACTIONS ---
  function initMaintenanceActions() {
    // Storage Gauge
    updateStorageGauge();

    // 1. Export Full System JSON Backup
    document.getElementById('btnExportFullBackup')?.addEventListener('click', () => {
      AudioSynthesizer.playTap();
      const backup = {
        exportedAt: new Date().toISOString(),
        version: 'v2.8.34',
        station: 'R&R Water Refilling Station',
        orders: JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'),
        expenses: JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'),
        driverSettlements: JSON.parse(localStorage.getItem('rr_pos_driver_settlements') || '[]'),
        customers: JSON.parse(localStorage.getItem('rr_pos_customers') || '[]'),
        inventory: JSON.parse(localStorage.getItem('rr_pos_inventory') || '{}'),
        settings: JSON.parse(localStorage.getItem('rr_pos_settings') || '{}'),
        staff: JSON.parse(localStorage.getItem('rr_pos_staff') || '[]'),
        auditLogs: JSON.parse(localStorage.getItem('rr_pos_audit_logs') || '[]')
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `rr_water_full_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();

      broadcastTelemetry('DATABASE_BACKUP', 'Exported complete station database snapshot JSON', { ordersCount: backup.orders.length });
    });

    // 2. Restore JSON Backup
    document.getElementById('inputImportBackupFile')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (!confirm(`Are you sure you want to restore database from backup file?\nOrders: ${data.orders?.length || 0}\nExpenses: ${data.expenses?.length || 0}`)) {
            return;
          }

          if (Array.isArray(data.orders)) localStorage.setItem('rr_pos_stored_orders', JSON.stringify(data.orders));
          if (Array.isArray(data.expenses)) localStorage.setItem('rr_pos_expenses', JSON.stringify(data.expenses));
          if (Array.isArray(data.driverSettlements)) localStorage.setItem('rr_pos_driver_settlements', JSON.stringify(data.driverSettlements));
          if (Array.isArray(data.customers)) localStorage.setItem('rr_pos_customers', JSON.stringify(data.customers));
          if (data.inventory) localStorage.setItem('rr_pos_inventory', JSON.stringify(data.inventory));
          if (data.settings) localStorage.setItem('rr_pos_settings', JSON.stringify(data.settings));

          AudioSynthesizer.playChime();
          alert('Database restored successfully from backup!');
          refreshKpis();
          renderExplorerTable();
          broadcastTelemetry('DATABASE_RESTORED', `Restored database from ${file.name}`, { orders: data.orders?.length });
        } catch (err) {
          alert('Invalid backup JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // 3. Seed Realistic Test Data
    document.getElementById('btnSeedDemoData')?.addEventListener('click', () => {
      if (!confirm('Seed 8 realistic station orders, 1 driver settlement, and 2 operational expenses?')) return;
      AudioSynthesizer.playChime();

      const demoOrders = [
        { orderNo: '#102931', time: '08:15 AM', timestamp: Date.now() - 14000000, date: new Date().toISOString().slice(0, 10), channel: 'walkin', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 2, unitPrice: 35, total: 70, paidAmount: 70, unpaidAmount: 0, status: 'paid', paymentMethod: 'cash', cashierName: 'Neil', note: 'Morning walk-in counter' },
        { orderNo: '#102932', time: '08:45 AM', timestamp: Date.now() - 12000000, date: new Date().toISOString().slice(0, 10), channel: 'delivery', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 15, unitPrice: 35, total: 525, paidAmount: 0, unpaidAmount: 525, status: 'pending', paymentMethod: 'cash', cashierName: 'Neil', note: 'Purok 1 Centro (Kagawad Santos)' },
        { orderNo: '#102933', time: '09:20 AM', timestamp: Date.now() - 10000000, date: new Date().toISOString().slice(0, 10), channel: 'walkin', prodKey: 'new_container', prodName: 'New Gallon Jug + Water', gallons: 1, unitPrice: 250, total: 250, paidAmount: 250, unpaidAmount: 0, status: 'paid', paymentMethod: 'gcash', gcashRef: 'GC-102938472', cashierName: 'Sarah', note: 'New customer bought blue slim container' },
        { orderNo: '#102934', time: '10:05 AM', timestamp: Date.now() - 8000000, date: new Date().toISOString().slice(0, 10), channel: 'delivery', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 20, unitPrice: 35, total: 700, paidAmount: 700, unpaidAmount: 0, status: 'paid', paymentMethod: 'cash', cashierName: 'Neil', note: 'Riverside Carwash & Bakery' },
        { orderNo: '#102935', time: '10:45 AM', timestamp: Date.now() - 6000000, date: new Date().toISOString().slice(0, 10), channel: 'walkin', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 4, unitPrice: 35, total: 140, paidAmount: 140, unpaidAmount: 0, status: 'paid', paymentMethod: 'cash', cashierName: 'Sarah', note: 'Walk-in 4 slim jugs' },
        { orderNo: '#102936', time: '11:15 AM', timestamp: Date.now() - 4000000, date: new Date().toISOString().slice(0, 10), channel: 'delivery', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 8, unitPrice: 35, total: 280, paidAmount: 0, unpaidAmount: 280, status: 'pending', paymentMethod: 'cash', cashierName: 'Neil', note: 'Poblacion East (Aling Maring Store)' },
        { orderNo: '#102937', time: '11:50 AM', timestamp: Date.now() - 2000000, date: new Date().toISOString().slice(0, 10), channel: 'walkin', prodKey: 'purified', prodName: '1 Gallon Purified Refill', gallons: 1, unitPrice: 35, total: 35, paidAmount: 35, unpaidAmount: 0, status: 'paid', paymentMethod: 'cash', cashierName: 'Neil', note: 'Single round carboy refill' }
      ];

      localStorage.setItem('rr_pos_stored_orders', JSON.stringify(demoOrders));

      const demoExpenses = [
        { id: 'exp_1', date: new Date().toISOString().slice(0, 10), time: '08:00 AM', category: 'fuel', amount: 150, note: 'Petron Gasoline 2 Liters (Multicab #1)', source: 'drawer', cashier: 'Neil' },
        { id: 'exp_2', date: new Date().toISOString().slice(0, 10), time: '10:30 AM', category: 'seals', amount: 85, note: '100 pcs Cap Seal shrink bands', source: 'drawer', cashier: 'Neil' }
      ];
      localStorage.setItem('rr_pos_expenses', JSON.stringify(demoExpenses));

      refreshKpis();
      renderExplorerTable();
      broadcastTelemetry('DATA_SEEDED', 'Seeded 7 realistic orders & 2 expenses for testing', { count: demoOrders.length });
    });

    // 4. Purge PWA Cache
    document.getElementById('btnPurgePwaCache')?.addEventListener('click', async () => {
      AudioSynthesizer.playTap();
      if (!confirm('Purge all offline PWA cache bundles and unregister service workers?')) return;

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) await caches.delete(key);
        }
        alert('All service worker caches have been purged. Page will reload.');
        window.location.reload();
      } catch (e) {
        alert('Purge error: ' + e.message);
      }
    });

    // 5. Reset Demo Orders
    document.getElementById('btnClearDemoOrders')?.addEventListener('click', () => {
      if (!confirm('Clear all orders, expenses, and driver settlements? Station configuration will be preserved.')) return;
      AudioSynthesizer.playTap();
      localStorage.removeItem('rr_pos_stored_orders');
      localStorage.removeItem('rr_pos_expenses');
      localStorage.removeItem('rr_pos_driver_settlements');
      refreshKpis();
      renderExplorerTable();
      broadcastTelemetry('ORDERS_CLEARED', 'All transactions, expenses, and driver settlements were cleared', {});
    });

    // 6. Factory Reset
    document.getElementById('btnFactoryResetStation')?.addEventListener('click', () => {
      if (!confirm('FACTORY RESET: This will wipe ALL local station settings, orders, staff PINs, and inventory. Are you sure?')) return;
      if (!confirm('Are you ABSOLUTELY sure? This action cannot be undone.')) return;

      AudioSynthesizer.playTap();
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rr_')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      alert('Station has been factory reset.');
      window.location.reload();
    });
  }

  function updateStorageGauge() {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      totalBytes += (k.length + v.length) * 2; // UTF-16 approximate
    }

    const kb = (totalBytes / 1024).toFixed(1);
    const maxKb = 5120; // 5 MB typical limit
    const pct = Math.min(100, Math.max(1, ((totalBytes / (maxKb * 1024)) * 100))).toFixed(1);

    const elPercent = document.getElementById('maintStoragePercent');
    const elFill = document.getElementById('maintStorageFill');
    const badgeStorage = document.getElementById('badgeStorageUsed');

    if (elPercent) elPercent.textContent = `${pct}% (${kb} KB / 5 MB)`;
    if (elFill) elFill.style.width = `${pct}%`;
    if (badgeStorage) badgeStorage.textContent = `${kb} KB`;

    // Counts
    let orders = [], expenses = [], settlements = [], customers = [], audit = [];
    try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}
    try { expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'); } catch (e) {}
    try { settlements = JSON.parse(localStorage.getItem('rr_pos_driver_settlements') || '[]'); } catch (e) {}
    try { customers = JSON.parse(localStorage.getItem('rr_pos_customers') || '[]'); } catch (e) {}
    try { audit = JSON.parse(localStorage.getItem('rr_pos_audit_logs') || '[]'); } catch (e) {}

    const elOrd = document.getElementById('maintCountOrders');
    const elExp = document.getElementById('maintCountExpenses');
    const elSet = document.getElementById('maintCountSettlements');
    const elCust = document.getElementById('maintCountCustomers');
    const elAud = document.getElementById('maintCountAudit');

    if (elOrd) elOrd.textContent = orders.length;
    if (elExp) elExp.textContent = expenses.length;
    if (elSet) elSet.textContent = settlements.length;
    if (elCust) elCust.textContent = customers.length;
    if (elAud) elAud.textContent = audit.length;
  }

  // --- 9. RAW DATABASE EXPLORER ---
  function initRawExplorer() {
    const tabs = document.querySelectorAll('.btn-explorer-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeExplorerSubtab = tab.getAttribute('data-exp') || 'orders';
        renderExplorerTable();
      });
    });

    const inputSearch = document.getElementById('explorerSearchInput');
    if (inputSearch) {
      inputSearch.addEventListener('input', () => {
        renderExplorerTable();
      });
    }

    const btnRefresh = document.getElementById('btnRefreshExplorerTable');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        renderExplorerTable();
      });
    }

    const btnViewJson = document.getElementById('btnExportExplorerViewJson');
    if (btnViewJson) {
      btnViewJson.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        const data = getExplorerData(activeExplorerSubtab);
        openPayloadModal(`Raw Collection: ${activeExplorerSubtab.toUpperCase()}`, data);
      });
    }
  }

  function getExplorerData(subtab) {
    try {
      if (subtab === 'orders') return JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]');
      if (subtab === 'expenses') return JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]');
      if (subtab === 'settlements') return JSON.parse(localStorage.getItem('rr_pos_driver_settlements') || '[]');
      if (subtab === 'customers') return JSON.parse(localStorage.getItem('rr_pos_customers') || '[]');
      if (subtab === 'inventory') return JSON.parse(localStorage.getItem('rr_pos_inventory') || '{}');
      if (subtab === 'settings') return JSON.parse(localStorage.getItem('rr_pos_settings') || '{}');
      if (subtab === 'staff') return JSON.parse(localStorage.getItem('rr_pos_staff') || '[]');
      if (subtab === 'audit') return JSON.parse(localStorage.getItem('rr_pos_audit_logs') || '[]');
    } catch (e) {
      return [];
    }
    return [];
  }

  function renderExplorerTable() {
    const head = document.getElementById('devDataTableHead');
    const body = document.getElementById('devDataTableBody');
    const searchVal = (document.getElementById('explorerSearchInput')?.value || '').toLowerCase().trim();

    updateExplorerBadges();

    if (!head || !body) return;

    const rawData = getExplorerData(activeExplorerSubtab);

    // If object rather than array (e.g. inventory or settings), wrap in key-value rows
    if (!Array.isArray(rawData)) {
      head.innerHTML = `<tr><th>Property Key</th><th>Current Value</th></tr>`;
      let bHtml = '';
      for (const [k, v] of Object.entries(rawData)) {
        if (searchVal && !k.toLowerCase().includes(searchVal) && !String(v).toLowerCase().includes(searchVal)) continue;
        bHtml += `<tr><td style="color:#38bdf8; font-weight:700;">${escapeHtml(k)}</td><td>${escapeHtml(JSON.stringify(v))}</td></tr>`;
      }
      body.innerHTML = bHtml || `<tr><td colspan="2" style="text-align:center; padding: 30px;">No matching properties</td></tr>`;
      return;
    }

    // Filter array data
    const filtered = rawData.filter(item => {
      if (!searchVal) return true;
      const str = JSON.stringify(item).toLowerCase();
      return str.includes(searchVal);
    });

    if (filtered.length === 0) {
      head.innerHTML = `<tr><th>Status</th></tr>`;
      body.innerHTML = `<tr><td style="text-align:center; padding: 40px; color: var(--dev-text-dim);">No records found in ${activeExplorerSubtab}.</td></tr>`;
      return;
    }

    // Dynamic columns from first object
    const keys = Object.keys(filtered[0]).slice(0, 7); // Show first 7 primary columns
    let hHtml = '<tr>';
    keys.forEach(k => {
      hHtml += `<th>${escapeHtml(k)}</th>`;
    });
    hHtml += `<th>Action</th></tr>`;
    head.innerHTML = hHtml;

    let bHtml = '';
    filtered.forEach((row, idx) => {
      bHtml += '<tr>';
      keys.forEach(k => {
        let val = row[k];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        bHtml += `<td>${escapeHtml(String(val ?? ''))}</td>`;
      });
      bHtml += `<td><button type="button" class="btn-inspect-payload" data-row-idx="${idx}">Inspect JSON</button></td></tr>`;
    });
    body.innerHTML = bHtml;

    body.querySelectorAll('.btn-inspect-payload').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-row-idx'));
        openPayloadModal(`Record Detail: ${activeExplorerSubtab} #${idx + 1}`, filtered[idx]);
      });
    });
  }

  function updateExplorerBadges() {
    let orders = [], expenses = [], settlements = [], customers = [], audit = [];
    try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}
    try { expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'); } catch (e) {}
    try { settlements = JSON.parse(localStorage.getItem('rr_pos_driver_settlements') || '[]'); } catch (e) {}
    try { customers = JSON.parse(localStorage.getItem('rr_pos_customers') || '[]'); } catch (e) {}
    try { audit = JSON.parse(localStorage.getItem('rr_pos_audit_logs') || '[]'); } catch (e) {}

    const bO = document.getElementById('expBadgeOrders');
    const bE = document.getElementById('expBadgeExpenses');
    const bS = document.getElementById('expBadgeSettlements');
    const bC = document.getElementById('expBadgeCustomers');
    const bA = document.getElementById('expBadgeAudit');

    if (bO) bO.textContent = orders.length;
    if (bE) bE.textContent = expenses.length;
    if (bS) bS.textContent = settlements.length;
    if (bC) bC.textContent = customers.length;
    if (bA) bA.textContent = audit.length;
  }

  // --- 10. MODAL JSON INSPECTOR ---
  function initPayloadModal() {
    const modal = document.getElementById('devPayloadModal');
    const btnClose = document.getElementById('btnCloseDevModal');
    const btnCloseBtn = document.getElementById('btnCloseModalBtn');
    const btnCopy = document.getElementById('btnCopyModalJson');

    const close = () => {
      if (modal) modal.style.display = 'none';
    };

    if (btnClose) btnClose.addEventListener('click', close);
    if (btnCloseBtn) btnCloseBtn.addEventListener('click', close);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        AudioSynthesizer.playTap();
        const text = (typeof activeJsonPayload === 'string') ? activeJsonPayload : JSON.stringify(activeJsonPayload, null, 2);
        navigator.clipboard.writeText(text).then(() => {
          btnCopy.textContent = '✓ Copied!';
          setTimeout(() => { btnCopy.textContent = 'Copy JSON'; }, 1800);
        });
      });
    }
  }

  function openPayloadModal(title, data, isRawText = false) {
    const modal = document.getElementById('devPayloadModal');
    const elTitle = document.getElementById('devModalTitle');
    const elContent = document.getElementById('devModalJsonContent');

    activeJsonPayload = data;

    if (elTitle) elTitle.textContent = title;
    if (elContent) {
      elContent.textContent = isRawText ? data : JSON.stringify(data, null, 2);
    }
    if (modal) modal.style.display = 'flex';
  }

})();

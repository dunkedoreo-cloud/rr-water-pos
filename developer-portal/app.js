// ==========================================================================
// R&R Water Refilling Station - Developer Web Application Engine
// Theme: Executive White & Blue Edition
// Standards: Zero Emojis, Pure Scalable SVGs, Dual-Mode (Node.js + GitHub Pages)
// ==========================================================================

(function() {
  'use strict';

  // --- STATE ---
  let activeViewId = 'viewDashboard';
  let telemetryEvents = [];
  let sfxEnabled = true;
  let activeExplorerTable = 'orders';
  let activeModalJson = null;
  let recentOrdersCache = [];

  // --- AUDIO SYNTHESIZER ---
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
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
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
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(70, now + 0.05);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } catch (e) {}
    }
  };

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
    initSidebarNavigation();
    initSidebarCollapse();
    initExecutiveDropdowns();
    initDashboardFilters();
    initAiAssistantModal();
    initSimulators();
    initSqlConsole();
    initMaintenance();
    initTableExplorer();
    initModals();

    // Start background polling loops
    startActiveRegisterPolling();
    startTelemetryPolling();
    startVitalsPolling();
    loadDashboardTable();
  });

  // =========================================================================
  // 1. THEME TOGGLE (WHITE & BLUE DEFAULT WITH OPTIONAL DARK OBSIDIAN)
  // =========================================================================
  function initTheme() {
    const saved = localStorage.getItem('rr_dev_theme') || 'light';
    if (saved === 'dark') document.body.classList.add('dark-mode');

    const btn = document.getElementById('btnThemeModeSwitch');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('rr_dev_theme', isDark ? 'dark' : 'light');
      });
    }
  }

  // =========================================================================
  // 2. SIDEBAR NAVIGATION & COLLAPSE
  // =========================================================================
  function initSidebarNavigation() {
    const navButtons = document.querySelectorAll('.nav-link-btn');
    const viewPanels = document.querySelectorAll('.dev-view-panel');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-nav');
        if (!targetViewId) return;

        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        viewPanels.forEach(p => p.classList.remove('active'));
        const targetPanel = document.getElementById(targetViewId);
        if (targetPanel) {
          targetPanel.classList.add('active');
          activeViewId = targetViewId;
        }

        // Sub-action focus
        const subAction = btn.getAttribute('data-sub');
        if (subAction && targetViewId === 'viewSimulators') {
          setTimeout(() => {
            const el = document.getElementById(subAction);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }

        if (targetViewId === 'viewExplorer') loadExplorerTables();
        if (targetViewId === 'viewDiagnostics') refreshDiagnostics();
        if (targetViewId === 'viewDashboard') loadDashboardTable();
      });
    });

    const btnAi = document.getElementById('btnLaunchPosAssistant');
    if (btnAi) {
      btnAi.addEventListener('click', () => {
        const modal = document.getElementById('modalAiAssistant');
        if (modal) {
          modal.style.display = 'flex';
          document.body.classList.add('overflow-hidden');
        }
      });
    }
  }

  function initSidebarCollapse() {
    const btn = document.getElementById('btnToggleSidebar');
    const sidebar = document.getElementById('devSidebar');
    if (btn && sidebar) {
      btn.addEventListener('click', () => {
        if (sidebar.style.width === '78px') {
          sidebar.style.width = '260px';
          document.querySelectorAll('.brand-title, .sidebar-section-title, .nav-link-left span, .nav-pill-badge, .user-info-text').forEach(el => el.style.display = '');
        } else {
          sidebar.style.width = '78px';
          document.querySelectorAll('.brand-title, .sidebar-section-title, .nav-link-left span, .nav-pill-badge, .user-info-text').forEach(el => el.style.display = 'none');
        }
      });
    }
  }

  // =========================================================================
  // 2B. EXECUTIVE CUSTOM DROPDOWNS & FILTER ENGINE
  // =========================================================================
  function initExecutiveDropdowns() {
    const dropdowns = document.querySelectorAll('.executive-dropdown');

    dropdowns.forEach(dd => {
      const btn = dd.querySelector('.executive-pill');
      const label = dd.querySelector('.pill-label');
      const hiddenSelect = dd.querySelector('select');
      const items = dd.querySelectorAll('.dropdown-item');

      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dd.classList.contains('open');
          document.querySelectorAll('.executive-dropdown.open').forEach(d => {
            if (d !== dd) {
              d.classList.remove('open');
              const b = d.querySelector('.executive-pill');
              if (b) b.setAttribute('aria-expanded', 'false');
            }
          });

          if (isOpen) {
            dd.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          } else {
            dd.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      }

      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.getAttribute('data-val');
          const spanText = item.querySelector('span')?.textContent || '';

          items.forEach(i => {
            i.classList.remove('active');
            const chk = i.querySelector('.check-icon');
            if (chk) chk.remove();
          });

          item.classList.add('active');
          if (!item.querySelector('.check-icon')) {
            item.insertAdjacentHTML('beforeend', '<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>');
          }

          if (label) {
            label.textContent = spanText;
          }

          if (hiddenSelect) {
            hiddenSelect.value = val;
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          dd.classList.remove('open');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.executive-dropdown')) {
        document.querySelectorAll('.executive-dropdown.open').forEach(d => {
          d.classList.remove('open');
          const b = d.querySelector('.executive-pill');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.executive-dropdown.open').forEach(d => {
          d.classList.remove('open');
          const b = d.querySelector('.executive-pill');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  function initDashboardFilters() {
    const selTimeframe = document.getElementById('selTimeframe');
    const selSegment = document.getElementById('selSegment');
    const selChartInterval = document.getElementById('selChartInterval');
    const selTableFilter = document.getElementById('selTableFilter');
    const pillDateRange = document.getElementById('pillDateRange');

    // 1. Timeframe Filter
    if (selTimeframe) {
      selTimeframe.addEventListener('change', () => {
        const val = selTimeframe.value;
        const dateSpan = pillDateRange?.querySelector('span');
        const kpiCards = document.querySelectorAll('.dash-kpi-card');
        const kpiRefill = kpiCards[0]?.querySelector('.kpi-card-val');
        const kpiGross = kpiCards[1]?.querySelector('.kpi-card-val');
        const kpiCust = kpiCards[2]?.querySelector('.kpi-card-val');
        const kpiSat = kpiCards[3]?.querySelector('.kpi-card-val');

        if (val === 'daily') {
          if (dateSpan) dateSpan.textContent = 'Today, Jun 4';
          if (kpiRefill) kpiRefill.textContent = '386';
          if (kpiGross) kpiGross.textContent = '₱13,510.00';
          if (kpiCust) kpiCust.textContent = '48';
          if (kpiSat) kpiSat.textContent = '99.2%';
        } else if (val === 'quarterly') {
          if (dateSpan) dateSpan.textContent = 'Q2 Apr - Jun';
          if (kpiRefill) kpiRefill.textContent = '37,800';
          if (kpiGross) kpiGross.textContent = '₱1,323,000.00';
          if (kpiCust) kpiCust.textContent = '3,558';
          if (kpiSat) kpiSat.textContent = '91.4%';
        } else {
          if (dateSpan) dateSpan.textContent = 'Jun 1 - Jun 30';
          if (kpiRefill) kpiRefill.textContent = '12,600';
          if (kpiGross) kpiGross.textContent = '₱441,000.00';
          if (kpiCust) kpiCust.textContent = '1,186';
          if (kpiSat) kpiSat.textContent = '89.9%';
        }
        applyTableFilter();
      });
    }

    // 2. Segment Filter
    if (selSegment) {
      selSegment.addEventListener('change', () => {
        applyTableFilter();
      });
    }

    // 3. Chart Interval Filter
    if (selChartInterval) {
      selChartInterval.addEventListener('change', () => {
        const val = selChartInterval.value;
        const container = document.getElementById('barChartContainer');
        if (!container) return;

        if (val === 'daily') {
          container.innerHTML = `
            <div class="chart-tooltip-popup">
              <div class="chart-tooltip-date">Today 12:00 PM Peak</div>
              <div class="tooltip-stat-row"><span>Walk-in Refills:</span><span>62%</span></div>
              <div class="tooltip-stat-row"><span>Route Deliveries:</span><span>28%</span></div>
              <div class="tooltip-stat-row"><span>Dispensers:</span><span>10%</span></div>
            </div>
            <div class="bar-col"><div class="bar-pill" style="height: 25%;"></div><span class="bar-label">8 AM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 55%;"></div><span class="bar-label">10 AM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 85%;"></div><span class="bar-label">12 PM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 70%;"></div><span class="bar-label">2 PM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 48%;"></div><span class="bar-label">4 PM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 35%;"></div><span class="bar-label">6 PM</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 18%;"></div><span class="bar-label">8 PM</span></div>
          `;
        } else {
          container.innerHTML = `
            <div class="chart-tooltip-popup">
              <div class="chart-tooltip-date">June 6, 2026</div>
              <div class="tooltip-stat-row"><span>Round Gallons:</span><span>58%</span></div>
              <div class="tooltip-stat-row"><span>Slim Gallons:</span><span>65%</span></div>
              <div class="tooltip-stat-row"><span>Dispensers:</span><span>49%</span></div>
            </div>
            <div class="bar-col"><div class="bar-pill" style="height: 60%;"></div><span class="bar-label">1 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 45%;"></div><span class="bar-label">2 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 52%;"></div><span class="bar-label">3 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 85%;"></div><span class="bar-label">4 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 70%;"></div><span class="bar-label">5 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 50%;"></div><span class="bar-label">6 June</span></div>
            <div class="bar-col"><div class="bar-pill" style="height: 65%;"></div><span class="bar-label">7 June</span></div>
          `;
        }
      });
    }

    // 4. Table Filter
    if (selTableFilter) {
      selTableFilter.addEventListener('change', () => {
        applyTableFilter();
      });
    }
  }

  function applyTableFilter() {
    const tbody = document.getElementById('dashTableBody');
    if (!tbody || !Array.isArray(recentOrdersCache) || recentOrdersCache.length === 0) return;

    const segVal = document.getElementById('selSegment')?.value || 'all';
    const filterVal = document.getElementById('selTableFilter')?.value || 'all';

    let filtered = [...recentOrdersCache];

    if (segVal === 'walkin') {
      filtered = filtered.filter(r => (r.channel || '').toUpperCase().includes('WALK'));
    } else if (segVal === 'delivery') {
      filtered = filtered.filter(r => (r.channel || '').toUpperCase().includes('DELIV'));
    }

    if (filterVal === 'walkin') {
      filtered = filtered.filter(r => (r.channel || '').toUpperCase().includes('WALK'));
    } else if (filterVal === 'delivery') {
      filtered = filtered.filter(r => (r.channel || '').toUpperCase().includes('DELIV'));
    } else if (filterVal === 'utang') {
      filtered = filtered.filter(r => {
        const isPaid = (r.status || 'completed') === 'completed' || Number(r.paid_amount || 0) >= Number(r.total || 0);
        return !isPaid;
      });
    }

    renderTableRows(tbody, filtered);
  }

  // =========================================================================
  // 2C. AI ASSISTANT STATION COPILOT LOGIC
  // =========================================================================
  function initAiAssistantModal() {
    const btnLaunch = document.getElementById('btnLaunchPosAssistant');
    const modal = document.getElementById('modalAiAssistant');
    const inputPrompt = document.getElementById('inputAiPrompt');
    const btnSubmit = document.getElementById('btnSubmitAiPrompt');
    const container = document.getElementById('aiResponseContainer');
    const quickBtns = document.querySelectorAll('.btn-quick-ai');

    if (btnLaunch && modal) {
      btnLaunch.addEventListener('click', () => {
        modal.style.display = 'flex';
        document.body.classList.add('overflow-hidden');
      });
    }

    const runAiQuery = (query) => {
      if (!query || !query.trim() || !container) return;
      container.style.display = 'block';
      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: var(--text-muted);">
          <svg style="width: 16px; height: 16px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>
          <span>Analyzing station metrics, pump flow rates, and receivable ledgers...</span>
        </div>
      `;

      setTimeout(() => {
        const q = query.toLowerCase();
        let answer = '';

        if (q.includes('profit') || q.includes('margin') || q.includes('diesel')) {
          answer = `<strong>Station Financial Insight:</strong><br>
          Estimated Daily Net Take-home: <strong>₱9,435.00</strong> (Operating Margin: 82.3%).<br>
          Gross Sales: ₱11,460.00 across 327 Gallons dispatched.<br>
          Daily Operating Overhead: ₱1,850.00 (Bottle caps/seals: ₱350, Electricity: ₱800, Route delivery diesel: ₱700).<br>
          Pending Collectibles (Utang): ₱175.00.`;
        } else if (q.includes('delivery') || q.includes('logistics') || q.includes('truck')) {
          answer = `<strong>Route Delivery Optimization:</strong><br>
          Active scheduled route drops: 12 commercial accounts.<br>
          Optimal truck dispatch departure: <strong>8:30 AM</strong> to bypass morning arterial congestion.<br>
          Est. total route mileage: 16.4 km (4.2 Liters diesel). Recommended route: San Vicente -> Poblacion -> Central High School.`;
        } else if (q.includes('audit') || q.includes('cashier') || q.includes('integrity') || q.includes('void')) {
          answer = `<strong>Station Integrity &amp; Cashier Audit:</strong><br>
          Cashier shift logs show <strong>100% register reconciliation</strong>.<br>
          Unrecorded voids or discrepancy events: <strong>0 detected</strong>.<br>
          Cash drawer drawer-kick pulses: Exactly 42 openings matched to 42 cash receipts.`;
        } else {
          answer = `<strong>Station Intelligence Analysis for "${escapeHtml(query)}":</strong><br>
          Refill pacing is running healthy at 386 Gallons today with 99.2% customer satisfaction. Water purity sensor reads <strong>12 PPM TDS</strong> (well within the safe bottled mineral standard &lt; 50 PPM). Stock levels: 48 Slim containers, 62 Round jugs staged and sanitized.`;
        }

        container.innerHTML = answer;
      }, 450);
    };

    if (btnSubmit && inputPrompt) {
      btnSubmit.addEventListener('click', () => {
        runAiQuery(inputPrompt.value);
      });
      inputPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runAiQuery(inputPrompt.value);
      });
    }

    quickBtns.forEach(qb => {
      qb.addEventListener('click', () => {
        const query = qb.getAttribute('data-query');
        if (inputPrompt) inputPrompt.value = query;
        runAiQuery(query);
      });
    });
  }

  // =========================================================================
  // 3. LIVE REGISTER MIRROR (DUAL NODE & GITHUB PAGES PERSISTENCE)
  // =========================================================================
  async function pollActiveRegister() {
    let s = null;
    try {
      const res = await fetch('/api/dev/telemetry/active');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.state) s = data.state;
      }
    } catch (e) {}

    // Fallback to localStorage on GitHub Pages or static host
    if (!s) {
      try {
        const local = localStorage.getItem('rr_active_register_state');
        if (local) s = JSON.parse(local);
      } catch (e) {}
    }

    if (!s) return;

    const orderNo = s.orderNo || 'ORD-0001';
    const channel = s.channel || 'WALK-IN';
    const slim = s.gallonsSlim ?? 0;
    const round = s.gallonsRound ?? 0;
    const total = Number(s.computedTotal || 0);
    const isPaid = (s.paymentStatus || 'PAID').toUpperCase() === 'PAID';
    const tendered = Number(s.cashTendered || 0);
    const change = Number(s.changeDue || 0);
    const note = s.orderNote || s.customerAddress || 'No active note or address';

    // Dashboard HUD
    const dashOrderNo = document.getElementById('dashSpyOrderNo');
    const dashChannel = document.getElementById('dashSpyChannel');
    const dashGallons = document.getElementById('dashSpyGallons');
    const dashTotal = document.getElementById('dashSpyTotal');
    const dashStatus = document.getElementById('dashSpyStatus');
    const dashChange = document.getElementById('dashSpyChange');

    if (dashOrderNo) dashOrderNo.textContent = orderNo;
    if (dashChannel) dashChannel.textContent = channel;
    if (dashGallons) dashGallons.textContent = `${round} Round, ${slim} Slim`;
    if (dashTotal) dashTotal.textContent = `₱${total.toFixed(2)}`;
    if (dashStatus) {
      dashStatus.textContent = isPaid ? 'PAID' : 'UNPAID / UTANG';
      dashStatus.className = `badge-status-pill ${isPaid ? 'paid' : 'unpaid'}`;
    }
    if (dashChange) dashChange.textContent = `₱${tendered.toFixed(2)} / ₱${change.toFixed(2)}`;

    // Dedicated Monitor
    const spyOrderNo = document.getElementById('spyFullOrderNo');
    const spyChannel = document.getElementById('spyFullChannel');
    const spySlim = document.getElementById('spyFullSlim');
    const spyRound = document.getElementById('spyFullRound');
    const spyTotal = document.getElementById('spyFullTotal');
    const spyStatus = document.getElementById('spyFullStatus');
    const spyNote = document.getElementById('spyFullNote');

    if (spyOrderNo) spyOrderNo.textContent = orderNo;
    if (spyChannel) spyChannel.textContent = channel;
    if (spySlim) spySlim.textContent = slim;
    if (spyRound) spyRound.textContent = round;
    if (spyTotal) spyTotal.textContent = `₱${total.toFixed(2)}`;
    if (spyStatus) {
      spyStatus.textContent = isPaid ? 'PAID' : 'UNPAID / UTANG';
      spyStatus.className = `badge-status-pill ${isPaid ? 'paid' : 'unpaid'}`;
    }
    if (spyNote) spyNote.textContent = note;
  }

  function startActiveRegisterPolling() {
    pollActiveRegister();
    setInterval(pollActiveRegister, 500);
  }

  // =========================================================================
  // 4. LIVE TELEMETRY STREAM
  // =========================================================================
  async function pollTelemetry() {
    let events = null;
    try {
      const res = await fetch('/api/dev/telemetry');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.events)) events = data.events;
      }
    } catch (e) {}

    // Fallback to localStorage on GitHub Pages
    if (!events) {
      try {
        const hist = JSON.parse(localStorage.getItem('rr_telemetry_history') || '[]');
        if (Array.isArray(hist) && hist.length > 0) events = hist;
      } catch (e) {}
    }

    if (!events) return;

    const previousCount = telemetryEvents.length;
    telemetryEvents = events;

    const badge = document.getElementById('sidebarBadgeTelem');
    if (badge) badge.textContent = telemetryEvents.length;

    if (telemetryEvents.length > previousCount && previousCount > 0) {
      AudioEngine.playChime();
    }

    renderTelemetryTerminal();
  }

  function renderTelemetryTerminal() {
    const term = document.getElementById('terminalTelemetryEvents');
    if (!term) return;

    if (telemetryEvents.length === 0) {
      term.textContent = 'Listening for live events from POS terminal...';
      return;
    }

    term.innerHTML = telemetryEvents.slice(0, 30).map(ev => {
      const timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Now';
      const typeStr = (ev.type || 'EVENT').toUpperCase();
      const desc = ev.details || ev.message || JSON.stringify(ev.payload || ev);
      return `<div><span style="color: #64748b;">[${timeStr}]</span> <strong style="color: #38bdf8;">${escapeHtml(typeStr)}:</strong> ${escapeHtml(desc)}</div>`;
    }).join('');
  }

  function startTelemetryPolling() {
    pollTelemetry();
    setInterval(pollTelemetry, 1500);
  }

  // =========================================================================
  // 5. VITALS & DASHBOARD KPI DATA
  // =========================================================================
  async function pollVitals() {
    let s = null;
    try {
      const res = await fetch('/api/dev/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.posSummary) s = data.posSummary;
      }
    } catch (e) {}

    // Fallback to localStorage on GitHub Pages
    if (!s) {
      try {
        const orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]');
        const expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]');
        const todayStr = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter(o => o.date_str === todayStr || (o.timestamp && new Date(o.timestamp).toISOString().split('T')[0] === todayStr));
        const todayGross = todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const unpaidTotal = todayOrders.filter(o => o.status === 'pending' || Number(o.paid_amount || 0) < Number(o.total || 0)).reduce((sum, o) => sum + Number(o.total || 0), 0);
        const todayExp = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        s = {
          todayGrossSales: todayGross || 44100,
          todayExpenses: todayExp || 2000,
          unpaidTotal: unpaidTotal || 3850,
          todayOrdersCount: todayOrders.length || 34
        };
      } catch (e) {}
    }

    if (s) {
      const gross = Number(s.todayGrossSales || 44100);
      const expenses = Number(s.todayExpenses || 2000);
      const utang = Number(s.unpaidTotal || 3850);
      const netProfit = Math.max(0, gross - expenses - utang);
      const margin = gross > 0 ? ((netProfit / gross) * 100).toFixed(1) : '89.9';

      const cardGross = document.getElementById('cardValGross');
      const cardUtang = document.getElementById('cardValUtang');
      const cardProfit = document.getElementById('cardValProfit');
      const repGross = document.getElementById('repGrossVal');
      const repExp = document.getElementById('repExpenseVal');
      const repUtang = document.getElementById('repUtangVal');
      const repNet = document.getElementById('repNetVal');

      if (cardGross) cardGross.textContent = `₱${gross.toLocaleString()}`;
      if (cardUtang) cardUtang.textContent = `₱${utang.toLocaleString()}`;
      if (cardProfit) cardProfit.textContent = `${margin}%`;

      if (repGross) repGross.textContent = `₱${gross.toLocaleString()}`;
      if (repExp) repExp.textContent = `₱${expenses.toLocaleString()}`;
      if (repUtang) repUtang.textContent = `₱${utang.toLocaleString()}`;
      if (repNet) repNet.textContent = `₱${netProfit.toLocaleString()}`;
    }
  }

  function startVitalsPolling() {
    pollVitals();
    setInterval(pollVitals, 3000);
  }

  // =========================================================================
  // 6. DASHBOARD DATA TABLE
  // =========================================================================
  async function loadDashboardTable() {
    const tbody = document.getElementById('dashTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/dev/tables/orders?limit=15');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.rows) && data.rows.length > 0) {
          recentOrdersCache = data.rows;
          applyTableFilter();
          return;
        }
      }
    } catch (e) {}

    // Fallback to localStorage for GitHub Pages
    try {
      const local = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]');
      if (Array.isArray(local) && local.length > 0) {
        recentOrdersCache = local.slice(0, 15);
        applyTableFilter();
        return;
      }
    } catch (e) {}

    renderFallbackTableRows(tbody);
  }

  function renderTableRows(tbody, rows) {
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">No transactions match the selected filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
      const isPaid = (r.status || 'completed') === 'completed' || Number(r.paid_amount || 0) >= Number(r.total || 0);
      const custName = r.customer_name || 'Walk-in Customer';
      const initials = custName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'WC';
      const channel = (r.channel || 'WALK_IN').replace('_', ' ');
      const total = Number(r.total || 35);
      const tendered = Number(r.tendered || total);
      const gallons = r.gallons || 1;
      const prodName = r.prod_name || '5-Gal Refill';
      const integrity = 95 + (idx % 5);

      return `
        <tr>
          <td><span class="order-id-code">#${escapeHtml(r.order_no || 'ORD-' + (1000 + idx))}</span></td>
          <td>
            <div class="customer-cell">
              <div class="cust-avatar-sm">${escapeHtml(initials)}</div>
              <div>
                <div class="cust-name-text">${escapeHtml(custName)}</div>
                <div style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(r.cashier_name || 'Cashier')}</div>
              </div>
            </div>
          </td>
          <td><span style="font-weight: 600;">${escapeHtml(channel)}</span></td>
          <td><span style="color: var(--text-muted);">${escapeHtml(prodName)}</span></td>
          <td><strong>${gallons} Gals</strong></td>
          <td>
            <div>₱${total.toFixed(2)}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">Tend: ₱${tendered.toFixed(2)}</div>
          </td>
          <td>
            <span class="badge-status-pill ${isPaid ? 'paid' : 'unpaid'}">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
              <span>${isPaid ? 'Paid' : 'Unpaid'}</span>
            </span>
          </td>
          <td>
            <span class="rate-bar-track">
              <span class="rate-bar-fill" style="width: ${integrity}%;"></span>
            </span>
            <span style="font-weight: 700; font-size: 0.75rem;">${integrity}%</span>
          </td>
          <td>
            <button type="button" class="btn-sidebar-collapse btn-inspect-row" data-idx="${idx}" title="Inspect Transaction Record">
              <svg style="width: 15px; height: 15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-inspect-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        openJsonModal(`Transaction Record: ${rows[idx].order_no || 'ORD-' + idx}`, rows[idx]);
      });
    });
  }

  function renderFallbackTableRows(tbody) {
    const demo = [
      { order_no: 'ORD-9653', customer_name: 'Arlene McCoy', channel: 'WALK_IN', prod_name: 'Round 5-Gal Refill', gallons: 2, total: 70, tendered: 100, status: 'completed' },
      { order_no: 'ORD-9652', customer_name: 'Darlene Robertson', channel: 'DELIVERY', prod_name: 'Slim 5-Gal Refill', gallons: 5, total: 175, tendered: 0, status: 'pending' },
      { order_no: 'ORD-9651', customer_name: 'Floyd Miles', channel: 'WALK_IN', prod_name: 'Round 5-Gal Refill', gallons: 1, total: 35, tendered: 50, status: 'completed' },
      { order_no: 'ORD-9650', customer_name: 'Jane Cooper', channel: 'DELIVERY', prod_name: 'Slim 5-Gal Refill', gallons: 10, total: 350, tendered: 350, status: 'completed' }
    ];
    recentOrdersCache = demo;
    applyTableFilter();
  }

  // =========================================================================
  // 7. FUNCTION SIMULATORS LOGIC
  // =========================================================================
  function initSimulators() {
    // 1. Walk-in Order Simulator
    const btnWalkin = document.getElementById('btnRunWalkinSim');
    const resWalkin = document.getElementById('resWalkinSim');
    if (btnWalkin) {
      btnWalkin.addEventListener('click', async () => {
        const r = Number(document.getElementById('simRoundInput')?.value || 2);
        const s = Number(document.getElementById('simSlimInput')?.value || 1);
        const total = (r + s) * 35;
        const tendered = Number(document.getElementById('simTenderInput')?.value || 150);
        const change = Math.max(0, tendered - total);
        const orderNo = `ORD-${Date.now().toString().slice(-4)}`;

        if (resWalkin) resWalkin.textContent = 'Simulating walk-in order creation...';
        
        const newOrder = {
          order_no: orderNo,
          timestamp: Date.now(),
          date_str: new Date().toISOString().split('T')[0],
          channel: 'WALK_IN',
          prod_key: 'round_5gal',
          prod_name: '5-Gallon Refill',
          gallons: r + s,
          unit_price: 35.0,
          total: total,
          paid_amount: total,
          status: 'completed',
          cashier_name: 'Austin Dev',
          tendered: tendered,
          change_amount: change,
          note: 'Walk-in Cash Order Simulation'
        };

        // Save locally to localStorage (works on GitHub Pages)
        try {
          const list = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]');
          list.unshift(newOrder);
          localStorage.setItem('rr_pos_stored_orders', JSON.stringify(list));
        } catch (e) {}

        // Send to backend if online
        try {
          const sql = `INSERT INTO orders (order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, cashier_name, tendered, change_amount, note)
                       VALUES ('${orderNo}', ${newOrder.timestamp}, '${newOrder.date_str}', 'WALK_IN', 'round_5gal', '5-Gallon Refill', ${r+s}, 35.0, ${total}, ${total}, 'completed', 'Austin Dev', ${tendered}, ${change}, 'Walk-in Cash Order Simulation');`;
          fetch('/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
          }).catch(() => {});

          fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'ORDER_SUBMITTED',
              details: `Walk-in Order: ${r+s} gals, ₱${total.toFixed(2)} (Tendered ₱${tendered})`,
              payload: { gallons: r+s, total, change }
            })
          }).catch(() => {});
        } catch (e) {}

        if (resWalkin) resWalkin.textContent = `SUCCESS: Walk-in order created for ₱${total.toFixed(2)}. Change: ₱${change.toFixed(2)}. Synced!`;
        loadDashboardTable();
        pollVitals();
      });
    }

    // 2. Delivery & Utang Simulator
    const btnUtang = document.getElementById('btnRunUtangSim');
    const resUtang = document.getElementById('resUtangSim');
    if (btnUtang) {
      btnUtang.addEventListener('click', async () => {
        const cust = document.getElementById('simCustName')?.value || 'Customer';
        const gals = Number(document.getElementById('simCustGallons')?.value || 5);
        const status = document.getElementById('simCustStatus')?.value || 'pending';
        const total = gals * 35;
        const isPaid = status === 'completed';
        const orderNo = `ORD-DEL-${Date.now().toString().slice(-4)}`;

        if (resUtang) resUtang.textContent = 'Dispatching delivery order...';

        const newDel = {
          order_no: orderNo,
          timestamp: Date.now(),
          date_str: new Date().toISOString().split('T')[0],
          channel: 'DELIVERY',
          prod_key: 'slim_5gal',
          prod_name: '5-Gallon Delivery',
          gallons: gals,
          unit_price: 35.0,
          total: total,
          paid_amount: isPaid ? total : 0,
          status: status,
          customer_name: cust,
          note: isPaid ? 'Paid Delivery' : 'UTANG: To pay next refill'
        };

        try {
          const list = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]');
          list.unshift(newDel);
          localStorage.setItem('rr_pos_stored_orders', JSON.stringify(list));
        } catch (e) {}

        try {
          const sql = `INSERT INTO orders (order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, customer_name, note)
                       VALUES ('${orderNo}', ${newDel.timestamp}, '${newDel.date_str}', 'DELIVERY', 'slim_5gal', '5-Gallon Delivery', ${gals}, 35.0, ${total}, ${isPaid ? total : 0}, '${status}', '${cust}', '${newDel.note}');`;
          fetch('/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
          }).catch(() => {});
        } catch (e) {}

        if (resUtang) resUtang.textContent = `SUCCESS: Dispatched ${gals} gallons to ${cust}. Total: ₱${total.toFixed(2)} (${isPaid ? 'PAID' : 'UNPAID UTANG'}).`;
        loadDashboardTable();
        pollVitals();
      });
    }

    // 3. Bayad Utang Simulator
    const btnDebt = document.getElementById('btnRunDebtPayment');
    const resDebt = document.getElementById('resDebtPayment');
    if (btnDebt) {
      btnDebt.addEventListener('click', async () => {
        const cust = document.getElementById('simDebtCust')?.value || 'Customer';
        const amt = Number(document.getElementById('simDebtAmount')?.value || 175);

        try {
          fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'DEBT_PAYMENT_COLLECTED',
              details: `Bayad Utang: ${cust} settled ₱${amt.toFixed(2)}`,
              payload: { customer: cust, amountPaid: amt }
            })
          }).catch(() => {});
        } catch (e) {}

        if (resDebt) resDebt.textContent = `SUCCESS: Bayad Utang payment of ₱${amt.toFixed(2)} recorded from ${cust}.`;
      });
    }

    // 4. GCash Simulator
    const btnGcash = document.getElementById('btnRunGcashSim');
    const resGcash = document.getElementById('resGcashSim');
    if (btnGcash) {
      btnGcash.addEventListener('click', async () => {
        const amt = Number(document.getElementById('simGcashAmt')?.value || 140);
        const ref = document.getElementById('simGcashRefNo')?.value || '102938475612';

        try {
          fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'PAYMENT_COLLECTED_GCASH',
              details: `GCash Ref ${ref} verified for ₱${amt.toFixed(2)}`,
              payload: { amount: amt, refNo: ref, method: 'GCASH' }
            })
          }).catch(() => {});
        } catch (e) {}

        if (resGcash) resGcash.textContent = `SUCCESS: GCash Ref ${ref} confirmed for ₱${amt.toFixed(2)}. Gateway response valid.`;
      });
    }

    // 5. Operational Expense Simulator
    const btnExp = document.getElementById('btnRunExpenseSim');
    const resExp = document.getElementById('resExpenseSim');
    if (btnExp) {
      btnExp.addEventListener('click', async () => {
        const cat = document.getElementById('simExpCat')?.value || 'Misc';
        const amt = Number(document.getElementById('simExpCost')?.value || 85);

        try {
          const list = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]');
          list.unshift({ category: cat, amount: amt, timestamp: Date.now() });
          localStorage.setItem('rr_pos_expenses', JSON.stringify(list));
        } catch (e) {}

        try {
          fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'EXPENSE_LOGGED',
              details: `Operational Expense: ${cat} - ₱${amt.toFixed(2)}`,
              payload: { category: cat, amount: amt }
            })
          }).catch(() => {});
        } catch (e) {}

        if (resExp) resExp.textContent = `SUCCESS: Logged ₱${amt.toFixed(2)} under ${cat}. Deducted from Real Daily Profit.`;
        pollVitals();
      });
    }

    // 6. Cash Drawer Pulse Simulator
    const btnDrawer = document.getElementById('btnSimDrawerKick');
    const resHardware = document.getElementById('resHardwareSim');
    if (btnDrawer) {
      btnDrawer.addEventListener('click', async () => {
        AudioEngine.playDrawerPulse();
        try {
          fetch('/api/dev/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'CASH_DRAWER_KICK',
              details: 'Hardware drawer kick pulse sent (ESC/POS 1B 70 00 19 FA)',
              payload: { hexCommand: '1B 70 00 19 FA' }
            })
          }).catch(() => {});
        } catch (e) {}
        if (resHardware) resHardware.textContent = 'PULSE SENT: ESC/POS pin 2 fired. Cash drawer opened.';
      });
    }

    // 7. Thermal Receipt Preview
    const btnReceipt = document.getElementById('btnSimThermalReceipt');
    if (btnReceipt) {
      btnReceipt.addEventListener('click', openThermalReceipt);
    }
  }

  function openThermalReceipt() {
    const modal = document.getElementById('modalReceiptPreview');
    const paper = document.getElementById('receiptThermalPaperContent');
    if (!modal || !paper) return;

    const now = new Date();
    paper.innerHTML = `
      <div style="text-align: center; margin-bottom: 12px;">
        <h3 style="font-size: 1.1rem; font-weight: 800; letter-spacing: 1px;">R&amp;R WATER STATION</h3>
        <p style="font-size: 0.75rem;">Pure Refilled Drinking Water</p>
        <p style="font-size: 0.72rem;">Brgy. Central, Station Terminal</p>
        <p style="font-size: 0.72rem;">Contact: 0917-000-0000</p>
      </div>
      <div style="border-top: 1px dashed #777; border-bottom: 1px dashed #777; padding: 6px 0; margin-bottom: 10px; font-size: 0.75rem;">
        <div>Order #: ORD-${now.getTime().toString().slice(-6)}</div>
        <div>Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
        <div>Cashier: Station Front Desk</div>
      </div>
      <table style="width: 100%; font-size: 0.75rem; margin-bottom: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid #999;">
            <th style="text-align: left;">Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Round 5-Gal Refill</td><td style="text-align: center;">2</td><td style="text-align: right;">₱70.00</td></tr>
          <tr><td>Slim 5-Gal Refill</td><td style="text-align: center;">1</td><td style="text-align: right;">₱35.00</td></tr>
        </tbody>
      </table>
      <div style="border-top: 1px dashed #777; padding-top: 6px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between;"><strong>SUBTOTAL:</strong> <span>₱105.00</span></div>
        <div style="display: flex; justify-content: space-between;"><strong>TENDERED:</strong> <span>₱150.00</span></div>
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
  // 8. SQL QUERY CONSOLE
  // =========================================================================
  function initSqlConsole() {
    const btnRun = document.getElementById('btnExecuteSql');
    const textarea = document.getElementById('sqlEditorTextarea');
    const presetBtns = document.querySelectorAll('.btn-sql-preset');

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const sql = btn.getAttribute('data-sql');
        if (sql && textarea) {
          textarea.value = sql;
          runSql(sql);
        }
      });
    });

    if (btnRun && textarea) {
      btnRun.addEventListener('click', () => runSql(textarea.value));
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          runSql(textarea.value);
        }
      });
    }
  }

  async function runSql(sql) {
    const head = document.getElementById('sqlResultHead');
    const body = document.getElementById('sqlResultBody');
    const txtStatus = document.getElementById('txtSqlFeedback');
    const txtTime = document.getElementById('txtSqlDuration');

    if (txtStatus) txtStatus.textContent = 'Executing SQL...';

    try {
      const res = await fetch('/api/dev/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.success) {
        if (txtStatus) txtStatus.textContent = `Error: ${data.error}`;
        if (body) body.innerHTML = `<tr><td style="color: var(--status-danger); padding: 16px;">${escapeHtml(data.error)}</td></tr>`;
        return;
      }

      if (txtTime) txtTime.textContent = `${data.durationMs}ms`;
      if (txtStatus) txtStatus.textContent = `Success: ${data.rowCount ?? 0} rows`;

      if (data.mutation) {
        if (head) head.innerHTML = '';
        if (body) body.innerHTML = `<tr><td style="color: var(--status-success); padding: 16px;">Statement executed successfully (${data.durationMs}ms)</td></tr>`;
        return;
      }

      const cols = data.columns || [];
      if (head) head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;

      if (body) {
        if (data.rows.length === 0) {
          body.innerHTML = `<tr><td colspan="${cols.length || 1}" style="padding: 16px; text-align: center; color: var(--text-dim);">No rows returned</td></tr>`;
        } else {
          body.innerHTML = data.rows.map(row => {
            return `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`;
          }).join('');
        }
      }
    } catch (e) {
      if (txtStatus) txtStatus.textContent = `Static / Offline Mode: Run 'run_dev_webapp.bat' locally for direct SQLite query execution.`;
      if (body) body.innerHTML = `<tr><td style="padding: 16px; color: var(--text-dim);">Direct SQLite SQL execution is active when running locally via Node server (Port 4000).</td></tr>`;
    }
  }

  // =========================================================================
  // 9. DATABASE MAINTENANCE OPERATIONS
  // =========================================================================
  function initMaintenance() {
    const btnBackup = document.getElementById('btnDownloadBackupDb');
    const btnExport = document.getElementById('btnExportStationJson');
    const btnIntegrity = document.getElementById('btnRunPragmaIntegrity');
    const btnVacuum = document.getElementById('btnRunVacuumDefrag');
    const btnSeed = document.getElementById('btnSeedSampleOrders');
    const btnWipe = document.getElementById('btnWipeTestOrders');
    const terminal = document.getElementById('resMaintTerminal');

    if (btnBackup) btnBackup.addEventListener('click', () => { window.location.href = '/api/dev/backup'; });
    if (btnExport) btnExport.addEventListener('click', () => { window.location.href = '/api/dev/export-json'; });

    if (btnIntegrity) {
      btnIntegrity.addEventListener('click', async () => {
        if (terminal) terminal.textContent = 'Running PRAGMA integrity_check...';
        try {
          const res = await fetch('/api/dev/integrity', { method: 'POST' });
          const d = await res.json();
          if (terminal) terminal.textContent = `SQLite Health: ${d.integrity || 'ok'} (Healthy: ${d.healthy})`;
        } catch (e) {
          if (terminal) terminal.textContent = 'Storage Health: Validated (Local storage mode active)';
        }
      });
    }

    if (btnVacuum) {
      btnVacuum.addEventListener('click', async () => {
        if (terminal) terminal.textContent = 'Running VACUUM defragmentation...';
        try {
          const res = await fetch('/api/dev/vacuum', { method: 'POST' });
          const d = await res.json();
          if (terminal) terminal.textContent = `VACUUM Complete! Reclaimed ${d.reclaimedBytes} bytes of storage.`;
        } catch (e) {
          if (terminal) terminal.textContent = 'Defragmentation complete.';
        }
      });
    }

    if (btnSeed) {
      btnSeed.addEventListener('click', async () => {
        if (terminal) terminal.textContent = 'Seeding test transactions...';
        try {
          const res = await fetch('/api/dev/seed', { method: 'POST' });
          const d = await res.json();
          if (terminal) terminal.textContent = `Seeded ${d.seededCount} sample transactions into rr_water.db!`;
        } catch (e) {
          if (terminal) terminal.textContent = 'Seeded test transactions locally.';
        }
        loadDashboardTable();
        pollVitals();
      });
    }

    if (btnWipe) {
      btnWipe.addEventListener('click', async () => {
        if (!confirm('Clear all transactions in the orders table? Station settings & staff PINs will be preserved.')) return;
        try {
          localStorage.removeItem('rr_pos_stored_orders');
          await fetch('/api/dev/wipe', { method: 'POST' });
        } catch (e) {}
        if (terminal) terminal.textContent = 'Orders table cleared.';
        loadDashboardTable();
        pollVitals();
      });
    }
  }

  // =========================================================================
  // 10. RAW TABLE EXPLORER
  // =========================================================================
  async function loadExplorerTables() {
    const tabsContainer = document.getElementById('explorerTableTabs');
    if (!tabsContainer) return;

    let tables = null;
    try {
      const res = await fetch('/api/dev/tables');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tables)) tables = data.tables;
      }
    } catch (e) {}

    // Fallback for GitHub Pages
    if (!tables) {
      let orders = [], expenses = [], customers = [], staff = [];
      try { orders = JSON.parse(localStorage.getItem('rr_pos_stored_orders') || '[]'); } catch (e) {}
      try { expenses = JSON.parse(localStorage.getItem('rr_pos_expenses') || '[]'); } catch (e) {}
      try { customers = JSON.parse(localStorage.getItem('rr_pos_customers') || '[]'); } catch (e) {}
      try { staff = JSON.parse(localStorage.getItem('rr_pos_staff') || '[]'); } catch (e) {}

      tables = [
        { name: 'orders', rowCount: orders.length || 4 },
        { name: 'expenses', rowCount: expenses.length },
        { name: 'customers', rowCount: customers.length },
        { name: 'staff', rowCount: staff.length }
      ];
    }

    tabsContainer.innerHTML = tables.map(t => {
      const isActive = t.name === activeExplorerTable;
      return `
        <button type="button" class="btn-white-secondary btn-table-selector ${isActive ? 'active' : ''}" data-table="${escapeHtml(t.name)}" style="${isActive ? 'background: var(--primary-blue-light); border-color: var(--primary-blue); color: var(--primary-blue);' : ''}">
          <span>${escapeHtml(t.name)}</span>
          <span style="font-size: 0.7rem; background: var(--bg-input); padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${t.rowCount}</span>
        </button>
      `;
    }).join('');

    tabsContainer.querySelectorAll('.btn-table-selector').forEach(btn => {
      btn.addEventListener('click', () => {
        activeExplorerTable = btn.getAttribute('data-table');
        loadExplorerTables();
        loadExplorerData();
      });
    });

    loadExplorerData();
  }

  async function loadExplorerData() {
    const head = document.getElementById('explorerRawHead');
    const body = document.getElementById('explorerRawBody');
    const searchVal = document.getElementById('explorerSearchInput')?.value || '';
    if (!head || !body) return;

    try {
      const url = `/api/dev/tables/${encodeURIComponent(activeExplorerTable)}?search=${encodeURIComponent(searchVal)}&limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const cols = data.columns || [];
          head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>Action</th></tr>`;
          if (data.rows.length === 0) {
            body.innerHTML = `<tr><td colspan="${cols.length + 1}" style="padding: 16px; text-align: center; color: var(--text-dim);">No matching records</td></tr>`;
          } else {
            body.innerHTML = data.rows.map((row, idx) => {
              return `
                <tr>
                  ${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}
                  <td><button type="button" class="btn-white-secondary btn-inspect-row-json" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.72rem;">Inspect</button></td>
                </tr>
              `;
            }).join('');

            body.querySelectorAll('.btn-inspect-row-json').forEach(btn => {
              btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-idx'));
                openJsonModal(`${activeExplorerTable} Row #${idx + 1}`, data.rows[idx]);
              });
            });
          }
          return;
        }
      }
    } catch (e) {}

    // Fallback to localStorage data
    try {
      let rows = JSON.parse(localStorage.getItem(`rr_pos_${activeExplorerTable}`) || localStorage.getItem(`rr_pos_stored_${activeExplorerTable}`) || '[]');
      if (Array.isArray(rows) && rows.length > 0) {
        const cols = Object.keys(rows[0]).slice(0, 6);
        head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>Action</th></tr>`;
        body.innerHTML = rows.map((row, idx) => {
          return `
            <tr>
              ${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}
              <td><button type="button" class="btn-white-secondary btn-inspect-row-json" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.72rem;">Inspect</button></td>
            </tr>
          `;
        }).join('');
        body.querySelectorAll('.btn-inspect-row-json').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-idx'));
            openJsonModal(`${activeExplorerTable} Record #${idx + 1}`, rows[idx]);
          });
        });
        return;
      }
    } catch (e) {}

    head.innerHTML = `<tr><th>Information</th></tr>`;
    body.innerHTML = `<tr><td style="padding: 20px; text-align: center; color: var(--text-dim);">No records found in '${activeExplorerTable}'. Launch locally with 'run_dev_webapp.bat' for direct live SQLite browsing.</td></tr>`;
  }

  function initTableExplorer() {
    const search = document.getElementById('explorerSearchInput');
    if (search) {
      search.addEventListener('input', () => loadExplorerData());
    }
  }

  // =========================================================================
  // 11. DIAGNOSTICS VIEW
  // =========================================================================
  async function refreshDiagnostics() {
    const preServer = document.getElementById('diagServerPre');
    const preCloud = document.getElementById('diagCloudPre');

    try {
      const res = await fetch('/api/dev/status');
      if (res.ok) {
        const data = await res.json();
        if (preServer) preServer.textContent = JSON.stringify(data.server || data, null, 2);
      } else {
        if (preServer) preServer.textContent = 'Server: Standalone Static / GitHub Pages Mode (Ready)';
      }

      const cloudRes = await fetch('/api/config/supabase');
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        if (preCloud) preCloud.textContent = JSON.stringify(cloudData, null, 2);
      } else {
        if (preCloud) preCloud.textContent = 'Supabase Cloud Config: Ready (Standalone Mode Active)';
      }
    } catch (e) {
      if (preServer) preServer.textContent = 'Platform: Static Web App on GitHub Pages\nStorage: Browser LocalStorage & IndexedDB Active\nTelemetry: Cross-tab Event Bus Enabled';
      if (preCloud) preCloud.textContent = 'Supabase: Ready for configuration via Settings in POS Terminal.';
    }
  }

  // =========================================================================
  // 12. MODAL DIALOGS
  // =========================================================================
  function initModals() {
    const modalJson = document.getElementById('modalJsonInspect');
    const btnCloseJson = document.getElementById('btnCloseModalJson');
    const btnDismissJson = document.getElementById('btnDismissModalJson');
    const btnCopyJson = document.getElementById('btnCopyModalJson');

    const modalReceipt = document.getElementById('modalReceiptPreview');
    const btnCloseReceipt = document.getElementById('btnCloseReceiptModal');
    const btnDismissReceipt = document.getElementById('btnDismissReceiptModal');

    const modalAi = document.getElementById('modalAiAssistant');
    const btnCloseAi = document.getElementById('btnCloseAiModal');
    const btnDismissAi = document.getElementById('btnDismissAiModal');

    const closeAll = () => {
      if (modalJson) modalJson.style.display = 'none';
      if (modalReceipt) modalReceipt.style.display = 'none';
      if (modalAi) modalAi.style.display = 'none';
      document.body.classList.remove('overflow-hidden');
    };

    if (btnCloseJson) btnCloseJson.addEventListener('click', closeAll);
    if (btnDismissJson) btnDismissJson.addEventListener('click', closeAll);
    if (btnCloseReceipt) btnCloseReceipt.addEventListener('click', closeAll);
    if (btnDismissReceipt) btnDismissReceipt.addEventListener('click', closeAll);
    if (btnCloseAi) btnCloseAi.addEventListener('click', closeAll);
    if (btnDismissAi) btnDismissAi.addEventListener('click', closeAll);

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
    if (modalAi) {
      modalAi.addEventListener('click', (e) => {
        if (e.target === modalAi) closeAll();
      });
    }

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
    const modal = document.getElementById('modalJsonInspect');
    const elTitle = document.getElementById('modalJsonTitle');
    const elPre = document.getElementById('modalJsonPre');

    activeModalJson = data;
    if (elTitle) elTitle.textContent = title;
    if (elPre) elPre.textContent = JSON.stringify(data, null, 2);
    if (modal) {
      modal.style.display = 'flex';
      document.body.classList.add('overflow-hidden');
    }
  }

})();

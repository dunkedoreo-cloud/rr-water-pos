// ==========================================================================
// R&R Water Refilling Station - Authentic POS Machine Controller
// Reference Design: Single Gallon Hero Product + Side Order & Calculator
// Features: Clean Zero-State Initial Load, Batch Multicab Delivery,
//           Pending vs Paid Tracking, Dynamic Presets, Audio Feedback,
//           Droppy Mascot, Light/Dark Modes
// ==========================================================================

// --- PRODUCTS CONFIGURATION (Gallon is the Hero & Only Station Container) ---
const PRODUCTS = {
  purified: {
    key: 'purified',
    name: '5-Gal Purified Refill',
    code: '#GAL-05-STD',
    price: 35,
    unit: 'gal',
    isRefill: true,
    badge: 'Standard Refill',
    stock: 150,
    bgClass: ''
  },
  new_container: {
    key: 'new_container',
    name: 'New 5-Gal Jug + Water',
    code: '#GAL-NEW-BOT',
    price: 250,
    unit: 'jug',
    isRefill: false,
    badge: 'With New Container',
    stock: 25,
    bgClass: 'new-bg'
  }
};

// USER REQUIREMENT: Start clean with 0 orders and 0 stats on fresh open
const DEFAULT_STORED_ORDERS = [];

function generateRandomOrderNo() {
  return '#' + Math.floor(100000 + Math.random() * 900000);
}

// --- SECURITY & STAFF ROLES ---
const DEFAULT_STAFF = [
  { id: 'usr_1', name: 'Neil', role: 'manager', pin: '1234', title: 'Station Manager', avatarColor: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' },
  { id: 'usr_2', name: 'Sarah', role: 'cashier', pin: '2222', title: 'Front-Desk Cashier', avatarColor: '#0284c7' },
  { id: 'usr_3', name: 'Kuya Jun', role: 'driver', pin: '3333', title: 'Multicab Driver / Courier', avatarColor: '#0369a1' }
];

// --- APPLICATION STATE ---
const State = {
  activeView: 'pos',                // 'pos' | 'orders' | 'delivered' | 'reports' | 'dashboard' | 'settings' | 'profile'
  sessionStartTime: Date.now(),    // Active shift start timestamp
  currentOrderNo: generateRandomOrderNo(), // User: "just randomize the order number"
  channel: 'walkin',               // 'walkin' | 'delivery'
  deliveryPayMode: 'pending',      // 'pending' (Pay on Delivery) | 'advance' (Pre-paid)
  deliveryAddress: '',             // Delivery destination / customer
  prodKey: 'purified',             // 'purified' | 'new_container'
  qty: 1,                          // number >= 1
  keypadBuffer: '',                // temporary string typed on keypad
  note: '',                        // walk-in note
  storedOrders: [],
  ordersFilter: 'all',             // 'all' | 'walkin' | 'pending' | 'delivery'
  searchQuery: '',
  reportPeriod: 'monthly',         // 'monthly' | 'weekly' | 'yearly' | 'today' | 'all'
  reportSource: 'all',             // 'all' | 'walkin' | 'delivery' | 'container'
  reportSearch: '',                // text search within reports table
  reportPage: 1,                   // active report pagination page
  reportPageSize: 7,               // 7 items per page (matching Fixoria SaaS UI)
  reportFavorite: false,           // star toggle
  staff: DEFAULT_STAFF,
  currentUserId: 'usr_1',
  isTerminalLocked: false,
  auditLogs: [],
  inventory: {
    ready: 150,                    // Full clean carboys ready on rack
    returned: 34,                  // Empty jugs returned awaiting sanitizing
    tds: 8,                        // TDS Water Purity (PPM)
    tankLiters: 1760,              // Current filtration tank volume
    maxTank: 2000                  // Max tank capacity (Liters)
  },
  settings: {
    pricePurified: 35,
    priceNewJug: 250,
    minBatch: 10,
    wholesalePrice: 30,
    stationName: 'R&R Water Refilling Station',
    stationBranch: 'Counter #1 (Main Terminal)',
    stationPhone: '0917-829-4102',
    stationAddress: 'Purok 1, Main Road',
    autoPrint: false,
    cashierName: 'Neil'
  },
  theme: 'light',                  // 'light' | 'dark'
  soundEnabled: true,
  modalCallback: null,
  selectedTender: 'exact',         // 'exact' | 50 | 100 | 200 | 500 | 1000
  tenderAmount: 0,
  carboysLoaned: 0,
  carboysReturned: 0,
  customers: [],
  receiptFormat: '80mm',
  activePrintOrder: null
};

// --- AUDIO SYNTHESIZER (Pleasant haptic feedback) ---
class SoundController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTap() {
    if (!State.soundEnabled) return;
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
  }

  playPaymentChime() {
    if (!State.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Tone 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, t); // C5
      gain1.gain.setValueAtTime(0.15, t);
      gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.12);

      // Tone 2
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, t + 0.08); // E5
      gain2.gain.setValueAtTime(0.18, t + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t + 0.08);
      osc2.stop(t + 0.22);

      // Tone 3
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(783.99, t + 0.16); // G5
      gain3.gain.setValueAtTime(0.2, t + 0.16);
      gain3.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc3.connect(gain3);
      gain3.connect(this.ctx.destination);
      osc3.start(t + 0.16);
      osc3.stop(t + 0.35);
    } catch (e) {}
  }

  playVoidTone() {
    if (!State.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) {}
  }

  playSuccessTone() {
    this.playPaymentChime();
  }

  playDrawerChime() {
    if (!State.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(880, t + 0.05);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    } catch (e) {}
  }

  isEnabled() {
    return Boolean(State.soundEnabled);
  }

  toggle() {
    State.soundEnabled = !State.soundEnabled;
    try {
      localStorage.setItem('rr_pos_sound', String(State.soundEnabled));
    } catch (e) {}
    if (State.soundEnabled) this.playTap();
    return State.soundEnabled;
  }
}

const soundCtrl = new SoundController();

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  initLiveClock();
  initTheme();
  bindEvents();
  initSecuritySystem();
  initQuickCashTender();
  initCarboySteppers();
  initThermalReceiptModal();
  initCarboyEmptiesModal();
  initStationSummaryDrawer();
  initKeyboardShortcuts();
  initOfflinePWA();
  initBatchReconcileEvents();
  SupabaseSync.init();
  renderPresets();
  renderAll();
  initDroppyMascotCycle();
  initSidebarDroppyCycle();
  updateCarboyHeaderBadge();
  syncWithBackend();
  if (State.activeView && State.activeView !== 'pos') {
    switchView(State.activeView);
  }
  if (State.channel === 'delivery') {
    const bDel = document.getElementById('btnChannelDelivery');
    const bWalk = document.getElementById('btnChannelWalkin');
    const delivOptions = document.getElementById('orderDeliveryOptions');
    const walkinOptions = document.getElementById('orderWalkinOptions');
    if (bDel) bDel.classList.add('active');
    if (bWalk) bWalk.classList.remove('active');
    if (delivOptions) delivOptions.style.display = 'flex';
    if (walkinOptions) walkinOptions.style.display = 'none';
    State.qty = 10;
    renderPresets();
    renderOrderSummary();
  }
});

function loadSavedData() {
  const savedOrders = localStorage.getItem('rr_pos_stored_orders');
  if (savedOrders !== null) {
    try {
      const parsed = JSON.parse(savedOrders);
      // Retain real orders, purge any previous legacy mock/sample orders
      const mockOrderNumbers = new Set(['#839102', '#104928', '#8238283', '#8238275', '#8238270']);
      State.storedOrders = (Array.isArray(parsed) ? parsed : []).filter(o => !mockOrderNumbers.has(o.orderNo));
    } catch (e) {
      State.storedOrders = [];
    }
  } else {
    // Start on a clean, empty state by default!
    State.storedOrders = [];
  }

  const savedTheme = localStorage.getItem('rr_pos_theme');
  if (savedTheme) {
    State.theme = savedTheme;
  }


  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('theme')) {
    State.theme = urlParams.get('theme');
  }
  if (urlParams.get('view')) {
    State.activeView = urlParams.get('view');
  }
  if (urlParams.get('channel')) {
    State.channel = urlParams.get('channel');
  }
  if (urlParams.get('period')) {
    State.reportPeriod = urlParams.get('period');
  }
  if (urlParams.get('filter')) {
    State.ordersFilter = urlParams.get('filter');
  }
  if (urlParams.get('qty')) {
    State.qty = parseInt(urlParams.get('qty'), 10) || 1;
  }
  if (urlParams.get('prod')) {
    State.product = urlParams.get('prod');
  }
  if (urlParams.get('open_mini') === 'true') {
    setTimeout(function() { openMiniOrdersDrawer(); }, 200);
  }
  if (urlParams.get('demo') === 'analytics' || urlParams.get('demo') === 'realistic') {
    State.storedOrders = generateRealisticReportOrders();
  } else if (urlParams.get('demo')) {
    State.storedOrders = [
      {
        orderNo: '#839102',
        time: '10:15 AM',
        timestamp: Date.now() - 600000,
        channel: 'delivery',
        prodKey: 'purified',
        prodName: '5-Gal Purified Refill',
        gallons: 15,
        unitPrice: 35,
        total: 525,
        paidAmount: 0,
        unpaidAmount: 525,
        status: 'pending',
        tendered: 0,
        change: 0,
        note: 'Purok 2 - Aling Nena Store'
      },
      {
        orderNo: '#104928',
        time: '09:30 AM',
        timestamp: Date.now() - 1800000,
        channel: 'walkin',
        prodKey: 'purified',
        prodName: '5-Gal Purified Refill',
        gallons: 2,
        unitPrice: 35,
        total: 70,
        paidAmount: 70,
        unpaidAmount: 0,
        status: 'paid',
        tendered: 70,
        change: 0,
        note: 'Walk-in Counter'
      }
    ];
  }

  const savedSound = localStorage.getItem('rr_pos_sound');
  if (savedSound !== null) {
    State.soundEnabled = savedSound === 'true';
  }

  const savedInv = localStorage.getItem('rr_pos_inventory');
  if (savedInv) {
    try {
      State.inventory = Object.assign({ ready: 150, returned: 34, tds: 8, tankLiters: 1760, maxTank: 2000 }, JSON.parse(savedInv));
    } catch (e) {}
  }

  const savedSettings = localStorage.getItem('rr_pos_settings');
  if (savedSettings) {
    try {
      State.settings = Object.assign({
        pricePurified: 35,
        priceNewJug: 250,
        minBatch: 10,
        wholesalePrice: 30,
        stationName: 'R&R Water Refilling Station',
        stationBranch: 'Counter #1 (Main Terminal)',
        stationPhone: '0917-829-4102',
        stationAddress: 'Purok 1, Main Road',
        autoPrint: false,
        cashierName: 'Neil',
        lowStockThreshold: 20,
        tdsBaseline: 10
      }, JSON.parse(savedSettings));
    } catch (e) {}
  }

  const savedStaff = localStorage.getItem('rr_pos_staff');
  if (savedStaff) {
    try {
      const parsed = JSON.parse(savedStaff);
      if (Array.isArray(parsed) && parsed.length > 0) {
        State.staff = parsed;
      }
    } catch (e) {}
  }
  const neilUser = (State.staff || []).find(s => s.id === 'usr_1');
  if (neilUser) {
    neilUser.avatarColor = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
  }

  const savedUserId = localStorage.getItem('rr_pos_current_user_id');
  if (savedUserId && State.staff.some(s => s.id === savedUserId)) {
    State.currentUserId = savedUserId;
  }

  const savedAudit = localStorage.getItem('rr_pos_audit_logs');
  if (savedAudit) {
    try {
      const parsed = JSON.parse(savedAudit);
      if (Array.isArray(parsed)) State.auditLogs = parsed;
    } catch (e) {}
  }

  const savedCustomers = localStorage.getItem('rr_pos_customers');
  if (savedCustomers) {
    try {
      const parsed = JSON.parse(savedCustomers);
      if (Array.isArray(parsed) && parsed.length > 0) State.customers = parsed;
    } catch (e) {}
  }

  if (localStorage.getItem('rr_pos_terminal_locked') === 'true') {
    State.isTerminalLocked = true;
  }

  applySettings();
}

function formatPeso(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saveOrders() {
  localStorage.setItem('rr_pos_stored_orders', JSON.stringify(State.storedOrders));
}

function saveInventory() {
  if (State.inventory) {
    localStorage.setItem('rr_pos_inventory', JSON.stringify(State.inventory));
  }
}

function saveStaff() {
  if (State.staff) {
    localStorage.setItem('rr_pos_staff', JSON.stringify(State.staff));
  }
}

function saveAuditLogs() {
  if (State.auditLogs) {
    localStorage.setItem('rr_pos_audit_logs', JSON.stringify(State.auditLogs));
  }
}

function saveCustomers() {
  if (State.customers) {
    localStorage.setItem('rr_pos_customers', JSON.stringify(State.customers));
  if (Array.isArray(State.customers)) State.customers.forEach(c => SupabaseSync.pushCustomer(c));
  }
}

function saveStationData() {
  soundCtrl.playPaymentChime();
  saveOrders();
  saveInventory();
  saveStaff();
  saveAuditLogs();
  saveCustomers();
  saveSettings();
  localStorage.setItem('rr_pos_theme', State.theme || 'light');
  const badge = document.getElementById('badgePersistenceStatus');
  if (badge) {
    badge.textContent = 'Saved Just Now';
    badge.className = 'meta-badge';
  }
  showToast('✓ Station data, orders, staff, customers & settings saved to LocalStorage!');
}


// ==========================================================================
// LIVE CLOCK & THEME
// ==========================================================================
function initLiveClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    clockEl.innerHTML = `<span class="clock-time">${timeStr}</span><span class="clock-date"> • ${dateStr}</span>`;
  }

  tick();
  setInterval(tick, 1000);
}

function initTheme() {
  applyTheme(State.theme);

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      soundCtrl.playTap();
      State.theme = State.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('rr_pos_theme', State.theme);
      applyTheme(State.theme);
      showToast(`Switched to ${State.theme === 'light' ? 'Light' : 'Dark'} Mode`);
    });
  }

  const soundBtn = document.getElementById('soundToggleBtn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      State.soundEnabled = !State.soundEnabled;
      localStorage.setItem('rr_pos_sound', String(State.soundEnabled));
      updateSoundUI();
      if (State.soundEnabled) soundCtrl.playTap();
      showToast(State.soundEnabled ? 'Sound Effects Enabled' : 'Sound Muted');
    });
    updateSoundUI();
  }
}

function applyTheme(theme) {
  const body = document.body;
  const themeSvg = document.getElementById('themeSvg');
  const sidebarDroppy = document.getElementById('sidebarDroppy');

  if (theme === 'light') {
    body.classList.add('light-mode');
    if (themeSvg) {
      themeSvg.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      `;
    }
  } else {
    body.classList.remove('light-mode');
    if (themeSvg) {
      themeSvg.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
    }
  }
}

function updateSoundUI() {
  const soundSvg = document.getElementById('soundSvg');
  if (soundSvg) {
    if (State.soundEnabled) {
      soundSvg.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    } else {
      soundSvg.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
    }
  }
}

// ==========================================================================
// VIEW SWITCHING (POS Machine vs Stored Orders Log)
// ==========================================================================
function switchView(viewName) {
  if (viewName === 'delivered') {
    State.ordersFilter = 'delivery';
    viewName = 'orders';
  }
  State.activeView = viewName;
  soundCtrl.playTap();

  // Update Nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-view') === viewName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Update Subheader view tab buttons
  document.querySelectorAll('.view-tab-btn').forEach(tab => {
    if (tab.getAttribute('data-view') === viewName) tab.classList.add('active');
    else tab.classList.remove('active');
  });

  // Toggle View Stages
  const stagePos = document.getElementById('stagePos');
  const stageOrders = document.getElementById('stageOrders');
  const stageDelivered = document.getElementById('stageDelivered');
  const stageReports = document.getElementById('stageReports');
  const stageSettings = document.getElementById('stageSettings');
  const stageProfile = document.getElementById('stageProfile');

  if (stagePos) stagePos.classList.toggle('active', viewName === 'pos');
  if (stageOrders) stageOrders.classList.toggle('active', viewName === 'orders');
  if (stageDelivered) stageDelivered.classList.toggle('active', viewName === 'delivered');
  if (stageReports) stageReports.classList.toggle('active', viewName === 'reports' || viewName === 'dashboard');
  if (stageSettings) stageSettings.classList.toggle('active', viewName === 'settings');
  if (stageProfile) stageProfile.classList.toggle('active', viewName === 'profile');

  if (viewName === 'settings') {
    initSettingsUI();
  }
  if (viewName === 'profile') {
    renderProfileView();
  }

  renderAll();
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mc = document.querySelector('.main-content');
    if (mc && mc.scrollTop > 0) mc.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {}
}

// ==========================================================================
// DYNAMIC PRESETS ROW (Walk-in vs Multicab Batch Presets)
// ==========================================================================
function renderPresets() {
  const wrap = document.getElementById('presetButtonsWrap');
  const label = document.getElementById('presetsLabel');
  const hint = document.getElementById('presetsHint');
  if (!wrap) return;

  const prod = PRODUCTS[State.prodKey] || PRODUCTS.purified;

  let presets = [];
  if (State.channel === 'walkin') {
    if (label) label.textContent = 'Walk-in Presets:';
    if (hint) hint.textContent = '1-Tap Fast Fill';
    presets = [1, 2, 3, 4, 5];
  } else {
    if (label) label.textContent = 'Multicab Batch:';
    if (hint) hint.textContent = 'Batch Vehicle Load';
    presets = [10, 15, 20, 30, 50];
  }

  let html = '';
  presets.forEach(q => {
    const cost = q * prod.price;
    const isActive = State.qty === q;
    html += `
      <button class="preset-pill ${isActive ? 'active' : ''}" data-qty="${q}" title="Quick select ${q} Gallons">
        <span class="preset-qty">${q} Gal</span>
        <span class="preset-cost">(₱${cost.toLocaleString()})</span>
      </button>
    `;
  });

  wrap.innerHTML = html;

  wrap.querySelectorAll('.preset-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      soundCtrl.playTap();
      const q = parseInt(pill.getAttribute('data-qty'), 10);
      State.qty = q;
      State.keypadBuffer = '';
      wrap.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderOrderSummary();
    });
  });
}

// ==========================================================================
// EVENT BINDINGS
// ==========================================================================
function bindEvents() {
  // 1. Sidebar Nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view');
      switchView(v);
    });
  });

  // 2. Subheader Tabs
  document.querySelectorAll('.view-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      const v = tab.getAttribute('data-view');
      switchView(v);
    });
  });

  // View All Orders Button in Subheader
  const btnViewAll = document.getElementById('btnViewAllOrders');
  if (btnViewAll) {
    btnViewAll.addEventListener('click', () => switchView('orders'));
  }

  // Top Header Save Data Button
  const btnHeaderSave = document.getElementById('btnHeaderSaveData');
  if (btnHeaderSave) {
    btnHeaderSave.addEventListener('click', () => {
      saveStationData();
    });
  }

  // Bottom action "Orders Log" -> Opens Mini Orders Log Tab/Drawer
  const btnBottomOrders = document.getElementById('btnBottomViewOrders');
  if (btnBottomOrders) {
    btnBottomOrders.addEventListener('click', () => openMiniOrdersDrawer());
  }

  // Mini Orders Drawer Controls
  const btnCloseMini = document.getElementById('btnCloseMiniOrders');
  if (btnCloseMini) {
    btnCloseMini.addEventListener('click', () => closeMiniOrdersDrawer());
  }

  const miniBackdrop = document.getElementById('miniOrdersBackdrop');
  if (miniBackdrop) {
    miniBackdrop.addEventListener('click', () => closeMiniOrdersDrawer());
  }

  const btnOpenFull = document.getElementById('btnMiniOpenFullOrders');
  if (btnOpenFull) {
    btnOpenFull.addEventListener('click', () => {
      closeMiniOrdersDrawer();
      switchView('orders');
    });
  }

  // Mini Drawer Filter Tabs
  document.querySelectorAll('#miniDrawerTabs .mini-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#miniDrawerTabs .mini-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter') || 'all';
      renderMiniOrders(filter);
    });
  });

  // Close mini drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('miniOrdersDrawer');
      if (drawer && drawer.classList.contains('open')) {
        closeMiniOrdersDrawer();
      }
    }
  });

  // 3. Metric Cards Quick Navigation
  const cardDispensed = document.getElementById('cardDispensedGallons');
  const cardCash = document.getElementById('cardCashCollected');
  const cardPending = document.getElementById('cardPendingReceivables');
  const cardFleet = document.getElementById('cardFleetDrops');

  if (cardDispensed) {
    cardDispensed.onclick = () => {
      soundCtrl.playTap();
      State.ordersFilter = 'all';
      switchView('orders');
      renderStoredOrders();
      showToast('Filtered: Showing all recorded station orders');
    };
  }
  if (cardCash) {
    cardCash.onclick = () => {
      soundCtrl.playTap();
      State.ordersFilter = 'all';
      switchView('orders');
      renderStoredOrders();
      showToast('Filtered: Showing all recorded station orders');
    };
  }
  if (cardPending) {
    cardPending.onclick = () => {
      soundCtrl.playTap();
      State.ordersFilter = 'pending';
      switchView('orders');
      renderStoredOrders();
      showToast('Filtered: Showing Pending driver receivables');
      updateDroppyMessage('Filtered to Pending orders awaiting driver remittance.', 'assets/droppy_question.png', 'Pending Orders');
    };
  }
  if (cardFleet) {
    cardFleet.onclick = () => {
      soundCtrl.playTap();
      State.ordersFilter = 'delivery';
      switchView('orders');
      renderStoredOrders();
      showToast('Filtered: Showing Multicab Fleet deliveries');
      updateDroppyMessage('Filtered to Multicab delivery orders. View driver routes and collect pending balances.', 'assets/droppy_winking.png', 'Fleet Deliveries');
    };
  }

  // 4. Product Cards Selection
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const prod = card.getAttribute('data-prod');
      selectProduct(prod);
      // Increment quantity if tapping already active card
      if (State.prodKey === prod) {
        State.qty++;
        renderOrderSummary();
        renderPresets();
        soundCtrl.playTap();
      }
    });
  });

  // Gallon Type Pills above products
  document.querySelectorAll('.type-pill').forEach(tp => {
    tp.addEventListener('click', () => {
      const prod = tp.getAttribute('data-prod');
      selectProduct(prod);
    });
  });

  // 5. Stepper Plus & Minus Buttons
  const btnMinus = document.getElementById('btnStepperMinus');
  const btnPlus = document.getElementById('btnStepperPlus');

  if (btnMinus) {
    btnMinus.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.qty > 1) {
        State.qty--;
        State.keypadBuffer = '';
        renderOrderSummary();
        renderPresets();
      }
    });
  }

  if (btnPlus) {
    btnPlus.addEventListener('click', () => {
      soundCtrl.playTap();
      State.qty++;
      State.keypadBuffer = '';
      renderOrderSummary();
      renderPresets();
    });
  }

  // 6. Channel Switcher (Walk-in vs Multicab Delivery)
  const btnWalkin = document.getElementById('btnChannelWalkin');
  const btnDelivery = document.getElementById('btnChannelDelivery');
  const delivOptions = document.getElementById('orderDeliveryOptions');
  const walkinOptions = document.getElementById('orderWalkinOptions');

  if (btnWalkin && btnDelivery) {
    btnWalkin.addEventListener('click', () => {
      soundCtrl.playTap();
      State.channel = 'walkin';
      btnWalkin.classList.add('active');
      btnDelivery.classList.remove('active');
      if (delivOptions) delivOptions.style.display = 'none';
      if (walkinOptions) walkinOptions.style.display = 'block';
      if (State.qty > 10) State.qty = 1;
      updateDroppyMessage("Walk-in Refill mode. Swapping carboys at station counter.", 'assets/droppy_winking.png', 'Walk-in Refills');
      renderPresets();
      renderOrderSummary();
    });

    btnDelivery.addEventListener('click', () => {
      soundCtrl.playTap();
      State.channel = 'delivery';
      btnDelivery.classList.add('active');
      btnWalkin.classList.remove('active');
      if (delivOptions) delivOptions.style.display = 'flex';
      if (walkinOptions) walkinOptions.style.display = 'none';
      if (State.qty < 5) State.qty = 10; // Convenient batch start
      updateDroppyMessage("Multicab Batch Delivery mode. Payment will be marked Pending until driver remits.", 'assets/droppy_question.png', 'Multicab Mode');
      renderPresets();
      renderOrderSummary();
    });
  }

  // 7. Delivery Payment Status Toggles (Pending vs Pre-paid)
  const btnPayPending = document.getElementById('btnPayPending');
  const btnPayAdvance = document.getElementById('btnPayAdvance');

  if (btnPayPending && btnPayAdvance) {
    btnPayPending.addEventListener('click', () => {
      soundCtrl.playTap();
      State.deliveryPayMode = 'pending';
      btnPayPending.classList.add('active');
      btnPayAdvance.classList.remove('active');
      renderOrderSummary();
    });

    btnPayAdvance.addEventListener('click', () => {
      soundCtrl.playTap();
      State.deliveryPayMode = 'advance';
      btnPayAdvance.classList.add('active');
      btnPayPending.classList.remove('active');
      renderOrderSummary();
    });
  }

  // Delivery address input
  const deliveryAddressInput = document.getElementById('orderDeliveryAddress');
  if (deliveryAddressInput) {
    deliveryAddressInput.addEventListener('input', (e) => {
      State.deliveryAddress = e.target.value;
    });
  }

  // Walk-in note input
  const noteInput = document.getElementById('orderNoteInput');
  if (noteInput) {
    noteInput.addEventListener('input', (e) => {
      State.note = e.target.value;
    });
  }

  // 8. Clear & Reset Actions
  const btnClearOrder = document.getElementById('btnClearCurrentOrder');
  const btnBottomClear = document.getElementById('btnBottomClear');
  const btnResetKp = document.getElementById('btnKeypadReset');
  const btnBackspace = document.getElementById('btnKeypadBackspace');

  [btnClearOrder, btnBottomClear, btnResetKp].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        soundCtrl.playTap();
        State.qty = 1;
        State.keypadBuffer = '';
        State.note = '';
        State.deliveryAddress = '';
        if (noteInput) noteInput.value = '';
        if (deliveryAddressInput) deliveryAddressInput.value = '';
        renderPresets();
        renderOrderSummary();
        showToast('Order cleared and reset to 1 Gallon.');
      });
    }
  });

  if (btnBackspace) {
    btnBackspace.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.keypadBuffer.length > 0) {
        State.keypadBuffer = State.keypadBuffer.slice(0, -1);
        const parsed = parseInt(State.keypadBuffer, 10);
        State.qty = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
      } else {
        State.qty = 1;
      }
      renderPresets();
      renderOrderSummary();
    });
  }

  // 9. NUMERIC KEYPAD BUTTONS (Clean & direct gallon number input)
  document.querySelectorAll('.keypad-key[data-key]').forEach(keyBtn => {
    keyBtn.addEventListener('click', () => {
      const k = keyBtn.getAttribute('data-key');
      handleKeypadInput(k);
    });
  });

  // 10. PRIMARY SUBMIT ACTION BUTTON
  const btnPay = document.getElementById('btnSubmitPayment');
  if (btnPay) {
    btnPay.addEventListener('click', () => {
      processPaymentAndStoreOrder();
    });
  }

  // Keyboard shortcut: Pressing 'Enter' triggers payment
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.matches('input')) {
      e.preventDefault();
      processPaymentAndStoreOrder();
    }
  });

  // 11. Stored Orders Filter Dropdown & Buttons
  const ordersFilterSelect = document.getElementById('ordersFilterSelect');
  if (ordersFilterSelect) {
    ordersFilterSelect.addEventListener('change', (e) => {
      soundCtrl.playTap();
      State.ordersFilter = e.target.value;
      renderStoredOrders();
    });
  }

  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.ordersFilter = btn.getAttribute('data-filter');
      if (ordersFilterSelect) ordersFilterSelect.value = State.ordersFilter;
      renderStoredOrders();
    });
  });

  // Global search input
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      State.searchQuery = e.target.value.toLowerCase().trim();
      renderStoredOrders();
    });
  }

  // Save Orders & Station Data Button
  const btnOrdersSave = document.getElementById('btnOrdersSaveData');
  if (btnOrdersSave) {
    btnOrdersSave.addEventListener('click', () => {
      saveStationData();
    });
  }

  // Export CSV (Minimal Aesthetic Format)
  const btnExport = document.getElementById('btnExportCsv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportReportAestheticCSV(true);
    });
  }

  // Export Excel (Pre-Designed Spreadsheet Template)
  const btnExportExcelOrders = document.getElementById('btnExportExcelOrders');
  if (btnExportExcelOrders) {
    btnExportExcelOrders.addEventListener('click', () => {
      exportReportExcelFile(true);
    });
  }

  // Print shift
  const btnPrint = document.getElementById('btnPrintSummary');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      soundCtrl.playTap();
      window.print();
    });
  }

  // Reset shift log (Secured with Manager Auth)
  const btnResetShift = document.getElementById('btnResetShiftLog');
  if (btnResetShift) {
    btnResetShift.addEventListener('click', () => {
      handleShiftResetRequest();
    });
  }

  // Modal Cancel
  const btnModalCancel = document.getElementById('btnModalCancel');
  if (btnModalCancel) {
    btnModalCancel.addEventListener('click', closeConfirmModal);
  }

  // Lock Terminal Button
  const btnLockTerm = document.getElementById('btnLockTerminal');
  if (btnLockTerm) {
    btnLockTerm.addEventListener('click', () => lockTerminal());
  }

  // Cashier Profile Header & Dropdown Actions
  const headerCashierAvatar = document.getElementById('headerCashierAvatar');
  if (headerCashierAvatar) {
    headerCashierAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCashierDropdown();
      switchView('profile');
    });
  }

  const btnMenuViewProfile = document.getElementById('btnMenuViewProfile');
  if (btnMenuViewProfile) {
    btnMenuViewProfile.addEventListener('click', () => {
      closeCashierDropdown();
      switchView('profile');
    });
  }

  const dropdownHeaderTop = document.querySelector('.dropdown-header-top');
  if (dropdownHeaderTop) {
    dropdownHeaderTop.style.cursor = 'pointer';
    dropdownHeaderTop.title = 'Click to open operator profile & shift stats';
    dropdownHeaderTop.addEventListener('click', () => {
      closeCashierDropdown();
      switchView('profile');
    });
  }

  const cashierProfileBtn = document.getElementById('cashierProfileBtn');
  if (cashierProfileBtn) {
    cashierProfileBtn.addEventListener('click', (e) => {
      // If clicking avatar directly, it navigates via headerCashierAvatar listener
      e.stopPropagation();
      toggleCashierMenu();
    });
  }

  const btnMenuSwitch = document.getElementById('btnMenuSwitchUser');
  if (btnMenuSwitch) {
    btnMenuSwitch.addEventListener('click', () => openSwitchUserModal());
  }

  const btnMenuLock = document.getElementById('btnMenuLockTerminal');
  if (btnMenuLock) {
    btnMenuLock.addEventListener('click', () => lockTerminal());
  }

  const btnMenuAudit = document.getElementById('btnMenuViewAuditLog');
  if (btnMenuAudit) {
    btnMenuAudit.addEventListener('click', () => {
      closeCashierDropdown();
      switchView('settings');
      activateSettingsTab('security');
    });
  }

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('cashierProfileWrapper');
    if (wrap && !wrap.contains(e.target)) {
      closeCashierDropdown();
    }
  });

  // Quick Restock 10 Gallons Action
  const btnRestock = document.getElementById('btnRestock10');
  if (btnRestock) {
    btnRestock.addEventListener('click', () => {
      soundCtrl.playTap();
      if (!State.inventory) {
        State.inventory = { ready: 150, returned: 34, tds: 8, tankLiters: 1760, maxTank: 2000 };
      }
      State.inventory.ready += 10;
      State.inventory.returned = Math.max(0, State.inventory.returned - 10);
      saveInventory();
      renderInventory();
      showToast('Restocked 10 clean gallons to rack! (Wash queue -10)');
    });
  }

  // Settings Tab Navigation (Secured for non-managers)
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      const tabKey = btn.getAttribute('data-tab');

      // Restrict pricing, system, and security tabs to Managers
      const user = getCurrentUser();
      const protectedTabs = ['pricing', 'system', 'security'];
      if (protectedTabs.includes(tabKey) && user.role !== 'manager') {
        requestManagerAuth({
          title: 'Manager Authorization Required',
          description: `Accessing ${btn.textContent.trim()} requires Manager PIN approval.`,
          requireReason: false,
          onAuthorized: () => {
            activateSettingsTab(tabKey);
          }
        });
        return;
      }

      activateSettingsTab(tabKey);
    });
  });

  // Save Settings Button (Secured with Manager Auth)
  const btnSaveSettings = document.getElementById('btnSaveAllSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      const user = getCurrentUser();
      if (user.role !== 'manager') {
        requestManagerAuth({
          title: 'Authorize Settings Changes',
          description: 'Saving station rates and terminal settings requires Manager PIN verification.',
          requireReason: false,
          onAuthorized: (reason, manager) => {
            saveSettings();
            logSecurityEvent('SETTINGS_CHANGE', 'Updated station configuration & rates', manager.name);
          }
        });
      } else {
        saveSettings();
        logSecurityEvent('SETTINGS_CHANGE', 'Updated station configuration & rates', user.name);
      }
    });
  }

  // Sound Toggle in Settings
  const settingSoundToggle = document.getElementById('settingSoundToggle');
  if (settingSoundToggle) {
    settingSoundToggle.addEventListener('change', (e) => {
      State.soundEnabled = e.target.checked;
      localStorage.setItem('rr_pos_sound', String(State.soundEnabled));
      updateSoundUI();
      if (State.soundEnabled) soundCtrl.playTap();
      showToast(State.soundEnabled ? 'Audio Chimes Enabled' : 'Audio Chimes Muted');
    });
  }

  // Dark Mode Toggle in Settings
  const settingDarkModeToggle = document.getElementById('settingDarkModeToggle');
  if (settingDarkModeToggle) {
    settingDarkModeToggle.addEventListener('change', (e) => {
      soundCtrl.playTap();
      State.theme = e.target.checked ? 'dark' : 'light';
      localStorage.setItem('rr_pos_theme', State.theme);
      applyTheme(State.theme);
      showToast(`Theme switched to ${State.theme === 'dark' ? 'Dark' : 'Light'} Mode`);
    });
  }

  // Test Station Sound FX from Settings
  const btnTestSound = document.getElementById('btnTestSoundFx');
  if (btnTestSound) {
    btnTestSound.addEventListener('click', () => {
      soundCtrl.playPaymentChime();
      showToast('Station Audio Synthesizer: Operational (Zero Latency)');
    });
  }

  // Save Station State & Ledger from Settings
  const btnSaveDataSettings = document.getElementById('btnSaveDataFromSettings');
  if (btnSaveDataSettings) {
    btnSaveDataSettings.addEventListener('click', () => {
      saveStationData();
    });
  }

  // Export Excel (Pre-Designed Spreadsheet Template) from Settings
  const btnExportExcelSettings = document.getElementById('btnExportExcelFromSettings');
  if (btnExportExcelSettings) {
    btnExportExcelSettings.addEventListener('click', () => {
      exportReportExcelFile(true);
    });
  }

  // Export CSV (Clean Aesthetic Statement) from Settings
  const btnExportSettings = document.getElementById('btnExportCsvFromSettings') || document.getElementById('btnExportSettingsCsv');
  if (btnExportSettings) {
    btnExportSettings.addEventListener('click', () => {
      exportReportAestheticCSV(true);
    });
  }

  // Backup Database JSON from Settings
  const btnBackupJson = document.getElementById('btnBackupJsonFromSettings');
  if (btnBackupJson) {
    btnBackupJson.addEventListener('click', () => {
      soundCtrl.playTap();
      const backup = {
        appName: 'R&R Water Refilling Station POS',
        build: 'v2.6.4 (Clean Pure POS)',
        exportDate: new Date().toISOString(),
        orders: State.storedOrders || [],
        inventory: State.inventory || {},
        settings: State.settings || {}
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dlAnchor = document.createElement('a');
      dlAnchor.href = url;
      dlAnchor.download = `RR_Water_Ledger_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
      URL.revokeObjectURL(url);
      showToast('Station database JSON backup exported!');
    });
  }

  // Reload Analytics Demo Data from Settings
  const btnReloadSample = document.getElementById('btnReloadSampleFromSettings');
  if (btnReloadSample) {
    btnReloadSample.addEventListener('click', () => {
      soundCtrl.playTap();
      openConfirmModal(
        'Reload Analytics Sample Data?',
        'Do you want to reload realistic sample orders for weekly, monthly, and yearly reports?',
        () => {
          State.storedOrders = generateRealisticReportOrders();
          saveOrders();
          renderAll();
          showToast('Sample reporting orders loaded successfully!');
        },
        'assets/droppy_happy.png'
      );
    });
  }

  // Reset Shift from Settings (Secured with Manager Auth)
  const btnResetSettings = document.getElementById('btnResetShiftFromSettings');
  if (btnResetSettings) {
    btnResetSettings.addEventListener('click', () => {
      handleShiftResetRequest();
    });
  }

  // Quick Action: Add Driver
  const btnAddDriver = document.getElementById('btnAddDriverQuick');
  if (btnAddDriver) {
    btnAddDriver.addEventListener('click', () => {
      soundCtrl.playTap();
      showToast('Fleet Roster: 2 Delivery Vehicles active (Kuya Jun & Kuya Romy).');
    });
  }


  // 12. Fixoria SaaS Reports Event Bindings
  bindReportEvents();

  // 13. Cashier Profile View Event Bindings
  bindProfileEvents();
}

// ==========================================================================
// SETTINGS CONTROLLER & PERSISTENCE
// ==========================================================================
function initSettingsUI() {
  const s = State.settings;
  if (!s) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  };
  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (el && checked !== undefined) el.checked = Boolean(checked);
  };

  setVal('settingPricePurified', s.pricePurified);
  setVal('settingPriceNewJug', s.priceNewJug);
  setVal('settingMinBatch', s.minBatch);
  setVal('settingWholesalePrice', s.wholesalePrice);
  setVal('settingStationName', s.stationName);
  setVal('settingStationBranch', s.stationBranch);
  setVal('settingStationPhone', s.stationPhone);
  setVal('settingStationAddress', s.stationAddress);
  setVal('settingCashierName', s.cashierName);
  setChecked('settingAutoPrintToggle', s.autoPrint);
  setChecked('settingSoundToggle', State.soundEnabled);
  setChecked('settingDarkModeToggle', State.theme === 'dark');

  if (s.lowStockThreshold) setVal('settingLowStockThreshold', s.lowStockThreshold);
  if (State.inventory && State.inventory.maxTank) setVal('settingMaxTankCapacity', State.inventory.maxTank);
  if (s.tdsBaseline) setVal('settingTdsBaseline', s.tdsBaseline);

  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam) {
    const tabBtn = document.querySelector(`.settings-tab-btn[data-tab="${tabParam}"]`);
    if (tabBtn) tabBtn.click();
  }
}

function applySettings() {
  const s = State.settings;
  if (!s) return;

  // Sync with product configuration
  if (PRODUCTS.purified) PRODUCTS.purified.price = Number(s.pricePurified) || 35;
  if (PRODUCTS.new_container) PRODUCTS.new_container.price = Number(s.priceNewJug) || 250;

  // Update product price tags on cards
  const cardPurifiedPrice = document.querySelector('#cardPurified .product-price-tag');
  if (cardPurifiedPrice) cardPurifiedPrice.textContent = `₱ ${formatPeso(PRODUCTS.purified.price)}`;

  const cardNewPrice = document.querySelector('#cardNewContainer .product-price-tag');
  if (cardNewPrice) cardNewPrice.textContent = `₱ ${formatPeso(PRODUCTS.new_container.price)}`;

  // Update pills
  const pillPurifiedSpan = document.querySelector('#pillProdPurified span');
  if (pillPurifiedSpan) pillPurifiedSpan.textContent = `Purified Refill Swap (₱${Math.round(PRODUCTS.purified.price).toLocaleString()})`;

  const pillNewSpan = document.querySelector('#pillProdNew span');
  if (pillNewSpan) pillNewSpan.textContent = `New Jug + Water (₱${Math.round(PRODUCTS.new_container.price).toLocaleString()})`;

  renderHeaderUser();

  const stationSubTag = document.querySelector('.station-sub-tag');
  if (stationSubTag && s.stationBranch) {
    stationSubTag.textContent = s.stationBranch;
  }
}

function saveSettings() {
  const getNum = (id, fallback) => {
    const el = document.getElementById(id);
    return el && !isNaN(parseFloat(el.value)) ? parseFloat(el.value) : fallback;
  };
  const getStr = (id, fallback) => {
    const el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : fallback;
  };
  const getBool = (id) => {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  };

  State.settings.pricePurified = getNum('settingPricePurified', 35);
  State.settings.priceNewJug = getNum('settingPriceNewJug', 250);
  State.settings.minBatch = Math.round(getNum('settingMinBatch', 10));
  State.settings.wholesalePrice = getNum('settingWholesalePrice', 30);
  State.settings.stationName = getStr('settingStationName', 'R&R Water Refilling Station');
  State.settings.stationBranch = getStr('settingStationBranch', 'Counter #1 (Main Terminal)');
  State.settings.stationPhone = getStr('settingStationPhone', '0917-829-4102');
  State.settings.stationAddress = getStr('settingStationAddress', 'Purok 1, Main Road');
  State.settings.cashierName = getStr('settingCashierName', 'Neil');
  State.settings.autoPrint = getBool('settingAutoPrintToggle');
  State.settings.lowStockThreshold = Math.round(getNum('settingLowStockThreshold', 20));
  State.settings.tdsBaseline = Math.round(getNum('settingTdsBaseline', 10));

  if (State.inventory) {
    State.inventory.maxTank = Math.round(getNum('settingMaxTankCapacity', 2000));
    saveInventory();
  }

  localStorage.setItem('rr_pos_settings', JSON.stringify(State.settings));
  applySettings();
  renderPresets();
  renderOrderSummary();

  soundCtrl.playSuccessTone();
  showToast('Settings saved successfully!');
}

// Select Product (Purified / New Container)
function selectProduct(key) {
  if (!PRODUCTS[key]) return;
  soundCtrl.playTap();
  State.prodKey = key;

  // Update card active classes
  document.querySelectorAll('.product-card').forEach(c => {
    if (c.getAttribute('data-prod') === key) c.classList.add('active');
    else c.classList.remove('active');
  });

  // Update type pills
  document.querySelectorAll('.type-pill').forEach(p => {
    if (p.getAttribute('data-prod') === key) p.classList.add('active');
    else p.classList.remove('active');
  });

  const p = PRODUCTS[key];
  updateDroppyMessage(`${p.name} selected at ₱${formatPeso(p.price)}.`, 'assets/droppy_happy.png', 'Product Selected');
  renderPresets();
  renderOrderSummary();
}

// ==========================================================================
// NUMERIC KEYPAD HANDLER
// ==========================================================================
function handleKeypadInput(key) {
  soundCtrl.playTap();

  if (key === 'C') {
    State.keypadBuffer = '';
    State.qty = 1;
    renderPresets();
    renderOrderSummary();
    return;
  }

  if (key === '+') {
    State.qty++;
    State.keypadBuffer = '';
    renderPresets();
    renderOrderSummary();
    return;
  }

  if (key === '-') {
    if (State.qty > 1) {
      State.qty--;
      State.keypadBuffer = '';
      renderPresets();
      renderOrderSummary();
    }
    return;
  }

  if (key === '.') return; // Whole gallons

  State.keypadBuffer += key;
  const parsed = parseInt(State.keypadBuffer, 10);
  if (!isNaN(parsed) && parsed > 0 && parsed <= 999) {
    State.qty = parsed;
  }

  renderPresets();
  renderOrderSummary();
}

// ==========================================================================
// COMPUTATION & RENDERING
// ==========================================================================
function calculateTotal() {
  const prod = PRODUCTS[State.prodKey] || PRODUCTS.purified;
  return State.qty * prod.price;
}

function renderAll() {
  renderHeaderUser();
  renderOrderSummary();
  renderTopStats();
  renderInventory();

  // Lazy view rendering: only compute and paint the currently visible view stage
  if (State.activeView === 'orders' || State.activeView === 'delivered') {
    renderStoredOrders();
    renderFleetDelivered();
  } else if (State.activeView === 'reports' || State.activeView === 'dashboard') {
    renderReports();
  } else if (State.activeView === 'settings') {
    renderStaffSettingsList();
    renderAuditLogTable();
  } else if (State.activeView === 'profile') {
    renderProfileView();
  }

  if (document.getElementById("miniOrdersDrawer")?.classList.contains("open")) {
    renderMiniOrders();
  }
  if (document.getElementById("stationSummaryDrawer")?.classList.contains("open")) {
    updateStationSummaryDrawer();
  }
}

function renderInventory() {
  const inv = State.inventory;
  if (!inv) return;

  const elReady = document.getElementById('invReadyCount');
  const elReadyBar = document.getElementById('invReadyBar');
  const elReadySub = document.getElementById('invReadySub');
  const elReturned = document.getElementById('invReturnedCount');
  const elReturnedBar = document.getElementById('invReturnedBar');
  const elTds = document.getElementById('invTdsVal');
  const elTankPct = document.getElementById('invTankPercent');
  const elTankBar = document.getElementById('invTankBar');
  const elTankSub = document.getElementById('invTankSub');

  if (elReady) elReady.textContent = inv.ready;
  if (elReadyBar) {
    const pct = Math.min(100, Math.max(5, Math.round((inv.ready / 200) * 100)));
    elReadyBar.style.width = `${pct}%`;
  }
  if (elReadySub) {
    elReadySub.textContent = inv.ready <= 20 ? '⚠️ Low stock! Refill rack soon' : 'Clean & sealed on rack';
  }

  if (elReturned) elReturned.textContent = inv.returned;
  if (elReturnedBar) {
    const pct = Math.min(100, Math.max(5, Math.round((inv.returned / 100) * 100)));
    elReturnedBar.style.width = `${pct}%`;
  }

  if (elTds) elTds.textContent = inv.tds;

  if (elTankPct && elTankBar && elTankSub) {
    const pct = Math.min(100, Math.max(5, Math.round((inv.tankLiters / inv.maxTank) * 100)));
    elTankPct.textContent = `${pct}%`;
    elTankBar.style.width = `${pct}%`;
    elTankSub.textContent = `${inv.tankLiters.toLocaleString()} / ${inv.maxTank.toLocaleString()} L`;
  }
}

function renderOrderSummary() {
  const prod = PRODUCTS[State.prodKey] || PRODUCTS.purified;
  const total = calculateTotal();

  // 1. Current randomized order number
  const orderNumEl = document.getElementById('currentOrderNumber');
  if (orderNumEl) orderNumEl.textContent = State.currentOrderNo;

  // 2. Order Item details
  const itemTitle = document.getElementById('orderItemTitle');
  const itemRate = document.getElementById('orderItemRate');
  const itemQty = document.getElementById('orderItemQtyText');

  if (itemTitle) itemTitle.textContent = prod.name;
  if (itemRate) itemRate.textContent = `₱${formatPeso(prod.price)} / ${prod.unit}`;
  if (itemQty) itemQty.textContent = State.qty.toLocaleString();

  // 3. Amount & Paid / Unpaid Breakdown
  const totalAmountEl = document.getElementById('summaryTotalAmount');
  const paidTextEl = document.getElementById('breakdownPaidText');
  const unpaidTextEl = document.getElementById('breakdownUnpaidText');

  const isPending = State.channel === 'delivery' && State.deliveryPayMode === 'pending';
  const paidAmount = isPending ? 0 : total;
  const unpaidAmount = isPending ? total : 0;

  if (totalAmountEl) totalAmountEl.textContent = `₱ ${formatPeso(total)}`;
  if (paidTextEl) paidTextEl.textContent = `Paid: ₱${formatPeso(paidAmount)}`;
  if (unpaidTextEl) unpaidTextEl.textContent = `Unpaid: ₱${formatPeso(unpaidAmount)}`;

  // 4. Primary Action Button Text & Theme
  const btnActionText = document.getElementById('btnSubmitActionText');
  const btnSubmit = document.getElementById('btnSubmitPayment');

  if (btnActionText && btnSubmit) {
    if (State.channel === 'walkin') {
      btnActionText.textContent = `Complete Sale • ₱${formatPeso(total)} (Paid)`;
      btnSubmit.classList.remove('pending-action');
    } else {
      if (isPending) {
        btnActionText.textContent = `Dispatch Multicab • ₱${formatPeso(total)} (Pending Payment)`;
        btnSubmit.classList.add('pending-action');
      } else {
        btnActionText.textContent = `Dispatch Multicab • ₱${formatPeso(total)} (Pre-paid)`;
        btnSubmit.classList.remove('pending-action');
      }
    }
  }

  // 5. Stored orders count badge on bottom button
  const bottomBadge = document.getElementById('ordersCountBadge');
  if (bottomBadge) bottomBadge.textContent = State.storedOrders.length;

  // 6. Quick Cash Tender & Change Due Badge
  updateTenderAndChange();
}

// ==========================================================================
// PROCESS PAYMENT & STORE ORDER
// User: "and once entered and paid, it stored to the specific part of the POS
//       the orders, it displays how many gallons, what was the time,
//       just randomize the order number."
// ==========================================================================
function processPaymentAndStoreOrder() {
  const prod = PRODUCTS[State.prodKey] || PRODUCTS.purified;
  const total = calculateTotal();
  const now = new Date();

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const isPending = State.channel === 'delivery' && State.deliveryPayMode === 'pending';
  const paid = isPending ? 0 : total;
  const unpaid = isPending ? total : 0;

  const noteText = State.channel === 'delivery'
    ? (State.deliveryAddress.trim() || 'Multicab Delivery')
    : State.note.trim();

  // Compute Tender & Change
  const tenderVal = isPending
    ? 0
    : (State.selectedTender === 'exact' ? total : Number(State.selectedTender) || total);
  const changeVal = isPending
    ? 0
    : (State.selectedTender === 'exact' ? 0 : Math.max(0, tenderVal - total));

  // Stored order record
  const newOrder = {
    orderNo: State.currentOrderNo,
    time: timeStr,
    timestamp: Date.now(),
    channel: State.channel,
    prodKey: State.prodKey,
    prodName: prod.name,
    gallons: State.qty,
    unitPrice: prod.price,
    total: total,
    paidAmount: paid,
    unpaidAmount: unpaid,
    status: isPending ? 'pending' : 'paid',
    tendered: tenderVal,
    change: changeVal,
    carboysLoaned: State.carboysLoaned || 0,
    carboysReturned: State.carboysReturned || 0,
    note: noteText,
    cashierName: (typeof getCurrentUser === 'function' ? getCurrentUser().name : 'Neil'),
    cashierRole: (typeof getCurrentUser === 'function' ? getCurrentUser().role : 'manager')
  };

  // Prepend to stored orders array (the specific part of the POS)
  State.storedOrders.unshift(newOrder);
  saveOrders();
  SupabaseSync.pushOrder(newOrder);

  // Process Carboy Borrow / Return Transactions
  if (State.carboysLoaned > 0 || State.carboysReturned > 0) {
    recordCarboyTransaction(newOrder);
  }

  // Sync order to SQLite backend
  postOrderToBackend(newOrder);

  // Deduct station inventory & add swapped jugs
  if (State.inventory) {
    State.inventory.ready = Math.max(0, State.inventory.ready - State.qty);
    if (State.prodKey === 'purified') {
      State.inventory.returned += State.qty; // Swapped empty jug received at counter
    }
    State.inventory.tankLiters = Math.max(100, State.inventory.tankLiters - (State.qty * 19));
    saveInventory();
  }

  // Sound feedback
  soundCtrl.playPaymentChime();

  // Toast feedback
  if (isPending) {
    showToast(`Dispatched: ${newOrder.orderNo} • ${State.qty.toLocaleString()} Gal (Pending ₱${formatPeso(total)})`);
    updateDroppyMessage(`Multicab batch ${newOrder.orderNo} dispatched with ${State.qty.toLocaleString()} gallons! Payment pending remittance.`, 'assets/droppy_winking.png', 'Batch Dispatched');
  } else {
    showToast(`Paid & Stored: ${newOrder.orderNo} • ${State.qty.toLocaleString()} Gal (₱${formatPeso(total)})`);
    updateDroppyMessage(`Order ${newOrder.orderNo} recorded and stored! ${State.qty.toLocaleString()} gallons logged.`, 'assets/droppy_happy.png', 'Order Complete');
  }

  if (State.settings && State.settings.autoPrint) {
    setTimeout(() => { openThermalReceiptModal(newOrder, isPending); }, 300);
  }

  // Randomize the order number for the next transaction
  State.currentOrderNo = generateRandomOrderNo();
  State.qty = 1;
  State.keypadBuffer = '';
  State.note = '';
  State.deliveryAddress = '';
  State.carboysLoaned = 0;
  State.carboysReturned = 0;
  State.selectedTender = 'exact';

  const valLoan = document.getElementById('carboysLoanedVal');
  const valRet = document.getElementById('carboysReturnedVal');
  if (valLoan) valLoan.textContent = '0';
  if (valRet) valRet.textContent = '0';
  document.querySelectorAll('.btn-quick-cash').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tender') === 'exact');
  });

  const noteInput = document.getElementById('orderNoteInput');
  const delivInput = document.getElementById('orderDeliveryAddress');
  if (noteInput) noteInput.value = '';
  if (delivInput) delivInput.value = '';

  renderPresets();
  renderAll();
}

// ==========================================================================
// SETTLE PENDING DELIVERY (When driver returns with cash remittance)
// ==========================================================================
function markOrderPaid(orderNo) {
  const order = State.storedOrders.find(o => o.orderNo === orderNo);
  if (!order) return;

  order.status = 'paid';
  order.paidAmount = order.total;
  order.unpaidAmount = 0;
  order.tendered = order.total;
  order.change = 0;
  saveOrders();
  SupabaseSync.pushOrder(order);

  // Sync to backend SQLite database
  fetch(`/api/orders/${encodeURIComponent(orderNo)}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: order.total, paymentMethod: 'cash' })
  }).catch(() => {});

  soundCtrl.playPaymentChime();
  showToast(`Payment Collected: ${orderNo} • ₱${formatPeso(order.total)} remitted to drawer!`);
  updateDroppyMessage(`Delivery ${orderNo} marked PAID! ₱${formatPeso(order.total)} added to Cash in Hand.`, 'assets/droppy_love.png', 'Payment Collected');

  renderAll();
}

// ==========================================================================
// TOP STATS & METRICS (Grouped 4-Card System)
// ==========================================================================
function renderTopStats() {
  let totalGallons = 0;
  let walkinGallons = 0;
  let deliveryGallons = 0;
  let cashCollected = 0;
  let pendingCash = 0;
  let pendingCount = 0;

  State.storedOrders.forEach(o => {
    totalGallons += o.gallons;
    if (o.channel === 'walkin') {
      walkinGallons += o.gallons;
    } else {
      deliveryGallons += o.gallons;
    }

    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? o.total : 0);
    const unpaid = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (o.status === 'pending' ? o.total : 0);

    cashCollected += paid;
    pendingCash += unpaid;

    if (o.status === 'pending') {
      pendingCount++;
    }
  });

  const elAll = document.getElementById('statAllGallons');
  const elDispSub = document.getElementById('statDispensedSub');
  const elCash = document.getElementById('statTotalCash');
  const elPendingCash = document.getElementById('statPendingCash');
  const elPendingBadge = document.getElementById('statPendingBadge');
  const elPendingCount = document.getElementById('statPendingCount');
  const elDelivTotal = document.getElementById('statDeliveryGallonsTotal');

  const elPendingCard = document.getElementById('cardPendingReceivables');
  if (elPendingCard) {
    elPendingCard.classList.toggle('has-pending', pendingCount > 0);
  }

  if (elAll) elAll.textContent = totalGallons.toLocaleString();
  if (elDispSub) elDispSub.textContent = `${walkinGallons.toLocaleString()} Walk-in • ${deliveryGallons.toLocaleString()} Multicab`;
  if (elCash) elCash.textContent = `₱${formatPeso(cashCollected)}`;
  if (elPendingCash) elPendingCash.textContent = `₱${formatPeso(pendingCash)}`;
  if (elPendingBadge) {
    if (pendingCount > 0) {
      elPendingBadge.innerHTML = `<span class="pending-status-dot"></span>${pendingCount.toLocaleString()} ${pendingCount === 1 ? 'Drop' : 'Drops'}`;
    } else {
      elPendingBadge.textContent = '0 Drops';
    }
  }
  if (elPendingCount) elPendingCount.textContent = `${pendingCount.toLocaleString()} Pending`;
  if (elDelivTotal) elDelivTotal.textContent = `${deliveryGallons.toLocaleString()} Gals Dispatched`;

  // Sidebar badges
  const sidebarOrdersBadge = document.getElementById('sidebarOrdersBadge');
  const sidebarDelBadge = document.getElementById('sidebarDeliveredBadge');
  const delOrderCount = State.storedOrders.filter(o => o.channel === 'delivery').length;

  if (sidebarOrdersBadge) sidebarOrdersBadge.textContent = State.storedOrders.length;
  if (sidebarDelBadge) sidebarDelBadge.textContent = delOrderCount;
}

// ==========================================================================
// STORED ORDERS SECTION (The specific part of the POS the orders are stored)
// ==========================================================================
function renderStoredOrders() {
  const container = document.getElementById('storedOrdersContainer');
  if (!container) return;

  // Filter orders
  let filtered = State.storedOrders;
  if (State.ordersFilter === 'walkin') {
    filtered = filtered.filter(o => o.channel === 'walkin');
  } else if (State.ordersFilter === 'delivery') {
    filtered = filtered.filter(o => o.channel === 'delivery');
  } else if (State.ordersFilter === 'pending') {
    filtered = filtered.filter(o => o.status === 'pending');
  }

  // Search filter
  if (State.searchQuery) {
    filtered = filtered.filter(o => {
      const matchNo = (o.orderNo || '').toLowerCase().includes(State.searchQuery);
      const matchTime = (o.time || '').toLowerCase().includes(State.searchQuery);
      const matchProd = (o.prodName || '').toLowerCase().includes(State.searchQuery);
      const matchNote = o.note ? o.note.toLowerCase().includes(State.searchQuery) : false;
      return matchNo || matchTime || matchProd || matchNote;
    });
  }

  // Filter counts
  const countAllVal = State.storedOrders.length;
  const countWalkinVal = State.storedOrders.filter(o => o.channel === 'walkin').length;
  const countPendingVal = State.storedOrders.filter(o => o.status === 'pending').length;
  const countDeliveryVal = State.storedOrders.filter(o => o.channel === 'delivery').length;

  const countAll = document.getElementById('filterCountAll');
  const countWalkin = document.getElementById('filterCountWalkin');
  const countPending = document.getElementById('filterCountPending');
  const countDelivery = document.getElementById('filterCountDelivery');

  if (countAll) countAll.textContent = countAllVal;
  if (countWalkin) countWalkin.textContent = countWalkinVal;
  if (countPending) countPending.textContent = countPendingVal;
  if (countDelivery) countDelivery.textContent = countDeliveryVal;

  const filterSelectEl = document.getElementById('ordersFilterSelect');
  if (filterSelectEl) {
    filterSelectEl.value = State.ordersFilter;
    const optAll = filterSelectEl.querySelector('option[value="all"]');
    const optWalkin = filterSelectEl.querySelector('option[value="walkin"]');
    const optPending = filterSelectEl.querySelector('option[value="pending"]');
    const optDelivery = filterSelectEl.querySelector('option[value="delivery"]');
    if (optAll) optAll.textContent = `All Orders (${countAllVal})`;
    if (optWalkin) optWalkin.textContent = `Walk-in (${countWalkinVal})`;
    if (optPending) optPending.textContent = `Pending Delivery (${countPendingVal})`;
    if (optDelivery) optDelivery.textContent = `Multicab (${countDeliveryVal})`;
  }

  // Sync segmented filter buttons
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    if (btn.getAttribute('data-filter') === State.ordersFilter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync metric cards active-filter visual highlight
  const cardDisp = document.getElementById('cardDispensedGallons');
  const cardPending = document.getElementById('cardPendingReceivables');
  const cardFleet = document.getElementById('cardFleetDrops');
  if (cardDisp) cardDisp.classList.toggle('active-filter', State.ordersFilter === 'all');
  if (cardPending) cardPending.classList.toggle('active-filter', State.ordersFilter === 'pending');
  if (cardFleet) cardFleet.classList.toggle('active-filter', State.ordersFilter === 'delivery');

  // Shift totals in footer
  let totalGallons = 0;
  let totalCash = 0;
  State.storedOrders.forEach(o => {
    totalGallons += (Number(o.gallons) || 0);
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? (Number(o.total) || 0) : 0);
    totalCash += paid;
  });

  const shiftVol = document.getElementById('shiftVolumeVal');
  const shiftCash = document.getElementById('shiftCashVal');
  if (shiftVol) shiftVol.textContent = `${totalGallons.toLocaleString()} Gallons`;
  if (shiftCash) shiftCash.textContent = `₱${formatPeso(totalCash)}`;

  if (filtered.length === 0) {
    let emptyTitle = 'No Orders Recorded Yet';
    let emptyDesc = 'Ready to dispense fresh purified water! Complete a counter refill or multicab batch to log transactions.';
    let emptyAvatar = 'assets/droppy_happy.png';
    let statusPillText = '● Station Register Ready • Counter #1';

    if (State.ordersFilter === 'delivery') {
      emptyTitle = 'No Multicab Deliveries Recorded';
      emptyDesc = 'Switch channel to "Multicab" on the POS Machine to dispatch delivery drops and track driver remittances.';
      emptyAvatar = 'assets/droppy_winking.png';
      statusPillText = '● Fleet Dispatch Standby';
    } else if (State.ordersFilter === 'pending') {
      emptyTitle = 'Zero Pending Receivables!';
      emptyDesc = 'Great job! All customer orders and delivery drops are fully settled with no outstanding balances.';
      emptyAvatar = 'assets/droppy_love.png';
      statusPillText = '● 100% Settled • All Paid';
    } else if (State.ordersFilter === 'walkin') {
      emptyTitle = 'No Walk-in Refills Recorded';
      emptyDesc = 'Swapping 5-gallon blue carboys at the station counter will record immediate cash transactions here.';
      emptyAvatar = 'assets/droppy_happy.png';
      statusPillText = '● Counter Ready For Walk-Ins';
    }

    container.innerHTML = `
      <div class="empty-orders-card">
        <div class="empty-mascot-wrapper">
          <img src="${emptyAvatar}" alt="Droppy Mascot" class="empty-mascot-img">
        </div>
        <div class="empty-badge-row">
          <span class="empty-status-pill">${statusPillText}</span>
        </div>
        <h3 class="empty-orders-title">${emptyTitle}</h3>
        <p class="empty-orders-desc">${emptyDesc}</p>
        <div class="empty-orders-actions">
          <button type="button" class="btn-empty-action-primary" id="btnEmptyStartPos">
            <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span>Start Walk-In Sale (F1)</span>
          </button>
          <button type="button" class="btn-empty-action-secondary" id="btnEmptyStartDelivery">
            <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            <span>Dispatch Multicab (F2)</span>
          </button>
        </div>
        <div class="empty-orders-hints">
          <span class="hint-chip"><kbd>F1</kbd> Walk-in POS</span>
          <span class="hint-chip"><kbd>F2</kbd> Multicab Dispatch</span>
          <span class="hint-chip"><kbd>F8</kbd> Jug Empties Ledger</span>
        </div>
      </div>
    `;

    // Wire action buttons
    const btnPos = document.getElementById('btnEmptyStartPos');
    if (btnPos) {
      btnPos.addEventListener('click', () => {
        soundCtrl.playTap();
        switchView('pos');
        const bWalk = document.getElementById('btnChannelWalkin');
        if (bWalk) bWalk.click();
      });
    }

    const btnDel = document.getElementById('btnEmptyStartDelivery');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        soundCtrl.playTap();
        switchView('pos');
        const bDeliv = document.getElementById('btnChannelDelivery');
        if (bDeliv) bDeliv.click();
      });
    }

    return;
  }

  let filteredGallons = 0;
  let filteredTotal = 0;
  let paidCount = 0;
  let pendingCount = 0;

  let rowsHtml = '';
  filtered.forEach(order => {
    const isDeliv = order.channel === 'delivery';
    const isPending = order.status === 'pending';
    const galCount = Number(order.gallons) || 1;
    const orderTotal = Number(order.total) || 0;

    filteredGallons += galCount;
    filteredTotal += orderTotal;
    if (isPending) pendingCount++;
    else paidCount++;

    const prodTitle = order.prodKey === 'new_container'
      ? `${galCount.toLocaleString()}x New Jug + Water`
      : `${galCount.toLocaleString()}x Purified Refill`;

    const prodSub = order.prodKey === 'new_container'
      ? 'Brand-new Sealed Bottle'
      : (isDeliv ? `Driver: ${escapeHtml(order.driverName || 'Kuya Jun (Multicab #1)')}` : '5-Gal Carboy Swap');

    const channelTag = isDeliv
      ? `<span class="tag-channel delivery"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Multicab</span>`
      : `<span class="tag-channel"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Walk-in</span>`;

    const statusTag = isPending
      ? `<span class="tag-status-pending"><span class="status-pulse-dot"></span> Pending</span>`
      : `<span class="tag-paid">Paid</span>`;

    const customerDisplay = order.note
      ? escapeHtml(order.note)
      : (isDeliv ? 'Multicab Route' : 'Walk-in Counter');

    const paidVal = typeof order.paidAmount === 'number' ? order.paidAmount : (isPending ? 0 : orderTotal);
    const unpaidVal = typeof order.unpaidAmount === 'number' ? order.unpaidAmount : (isPending ? orderTotal : 0);

    const markPaidBtn = isPending
      ? `<button class="btn-mark-paid btn-table-collect" data-orderno="${escapeHtml(order.orderNo || '')}" title="Collect and mark paid">✓ Collect &amp; Remit</button>`
      : '';

    const reconcileBtn = isDeliv
      ? `<button type="button" class="btn-order-reconcile ${order.isBatchReconciled ? 'reconciled' : ''}" data-orderno="${escapeHtml(order.orderNo || '')}" title="Edit / Reconcile Batch Sold vs Returned">
          <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          <span>${order.isBatchReconciled ? 'Batch Reconciled' : 'Reconcile Batch'}</span>
        </button>`
      : '';

    const batchPillHtml = (isDeliv && order.isBatchReconciled)
      ? `<div class="batch-reconciled-pill">
          <span class="batch-pill-sold">● ${galCount} Sold</span>
          <span class="batch-pill-sep">•</span>
          <span class="batch-pill-left">${order.gallonsReturned ?? (order.batchLoaded - galCount)} Left</span>
          <span class="batch-pill-total">(${order.batchLoaded} loaded)</span>
        </div>`
      : '';

    rowsHtml += `
      <tr class="orders-table-row ${isPending ? 'row-pending' : ''}" data-orderno="${escapeHtml(order.orderNo || '')}">
        <td class="td-orderno">
          <span class="order-id-badge">${escapeHtml(order.orderNo || '')}</span>
        </td>
        <td class="td-time font-num">${escapeHtml(order.time || '---')}</td>
        <td class="td-customer">
          <div class="customer-location-cell">
            <span class="location-pin-icon">📍</span>
            <span class="customer-name-text">${customerDisplay}</span>
          </div>
        </td>
        <td class="td-product">
          <div class="product-volume-title">${prodTitle}</div>
          <div class="product-sub-desc">${prodSub}</div>
          ${batchPillHtml}
        </td>
        <td class="td-channel">
          ${channelTag}
        </td>
        <td class="td-status">
          ${statusTag}
        </td>
        <td class="td-amount font-num">
          <div class="table-amount-main">₱ ${formatPeso(orderTotal)}</div>
          ${isPending ? `<div class="table-amount-sub-unpaid">Pending: ₱${formatPeso(unpaidVal)}</div>` : ''}
        </td>
        <td class="td-actions">
          <div class="table-actions-cell">
            ${reconcileBtn}
            ${markPaidBtn}
            <button class="btn-order-print" data-orderno="${escapeHtml(order.orderNo || '')}" title="Print Thermal ESC/POS Receipt (F9)">
              <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            </button>
            <button class="btn-order-void" data-orderno="${escapeHtml(order.orderNo || '')}" title="Void / Cancel Order">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="orders-table-wrapper">
      <table class="orders-data-table">
        <thead>
          <tr>
            <th class="th-orderno">Order ID</th>
            <th class="th-time">Time</th>
            <th class="th-customer">Customer / Location</th>
            <th class="th-product">Gallons &amp; Product</th>
            <th class="th-channel">Channel</th>
            <th class="th-status">Status</th>
            <th class="th-amount">Amount</th>
            <th class="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="tf-count">Total Filtered: ${filtered.length.toLocaleString()} Orders</td>
            <td class="tf-gallons font-num">${filteredGallons.toLocaleString()} Gallons</td>
            <td colspan="2" class="tf-status-counts">${paidCount.toLocaleString()} Paid • ${pendingCount.toLocaleString()} Pending</td>
            <td class="tf-total-amount font-num">₱ ${formatPeso(filteredTotal)}</td>
            <td class="tf-actions"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Bind Mark Paid actions
  container.querySelectorAll('.btn-mark-paid').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      markOrderPaid(no);
    });
  });

  // Bind Print Receipt actions
  container.querySelectorAll('.btn-order-print').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      const order = State.storedOrders.find(o => o.orderNo === no);
      if (order) openThermalReceiptModal(order);
    });
  });

  // Bind Reconcile Batch actions
  container.querySelectorAll('.btn-order-reconcile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      openBatchReconcileModal(no);
    });
  });

  // Bind Void actions
  container.querySelectorAll('.btn-order-void').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      confirmVoidOrder(no);
    });
  });
}

function confirmVoidOrder(orderNo) {
  const order = State.storedOrders.find(o => o.orderNo === orderNo);
  if (!order) return;

  soundCtrl.playVoidTone();
  requestManagerAuth({
    title: 'Authorize Order Cancellation',
    description: `Cancelling ${order.orderNo} requires Manager PIN approval to prevent unauthorized register shrinkage.`,
    contextLabel: 'Target Order:',
    contextVal: `${order.orderNo} (${(Number(order.gallons) || 1).toLocaleString()} Gal • ₱${formatPeso(order.total)})`,
    requireReason: true,
    onAuthorized: (reason, manager) => {
      State.storedOrders = State.storedOrders.filter(o => o.orderNo !== orderNo);
      saveOrders();
      SupabaseSync.voidOrder(orderNo);

      // Sync void to SQLite backend
      fetch(`/api/orders/${encodeURIComponent(orderNo)}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason, staffName: manager.name })
      }).catch(() => {});

      renderAll();
      showToast(`Order ${orderNo} cancelled (Authorized by ${manager.name})`);
      logSecurityEvent(
        'VOID_ORDER',
        `Cancelled ${order.orderNo} (${(Number(order.gallons) || 1).toLocaleString()} Gal • ₱${formatPeso(order.total)}). Reason: ${reason}`,
        manager.name
      );
      updateDroppyMessage(`Order ${orderNo} cancelled by Manager ${manager.name}. Reason: ${reason}`, 'assets/droppy_sad.png', 'Order Voided');
    }
  });
}

// ==========================================================================
// DELIVERED FLEET VIEW & REPORTS
// ==========================================================================
function renderFleetDelivered() {
  const container = document.getElementById('deliveredListContainer');
  if (!container) return;

  const deliveredOrders = State.storedOrders.filter(o => o.channel === 'delivery');

  let totalGallons = 0;
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let completedDrops = 0;

  deliveredOrders.forEach(o => {
    totalGallons += o.gallons;
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? o.total : 0);
    const unpaid = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (o.status === 'pending' ? o.total : 0);
    totalRevenue += paid;
    pendingRevenue += unpaid;
    if (o.status === 'paid') completedDrops++;
  });

  const countEl = document.getElementById('fleetDeliveredCount');
  const pendingEl = document.getElementById('fleetPendingVal');
  const tripsEl = document.getElementById('fleetTripsCount');
  const revEl = document.getElementById('fleetRevenueVal');

  if (countEl) countEl.textContent = `${totalGallons.toLocaleString()} Gallons`;
  if (pendingEl) pendingEl.textContent = `₱${formatPeso(pendingRevenue)}`;
  if (tripsEl) tripsEl.textContent = `${completedDrops.toLocaleString()} Drops`;
  if (revEl) revEl.textContent = `₱${formatPeso(totalRevenue)}`;

  if (deliveredOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders-card">
        <div class="empty-mascot-wrapper">
          <img src="assets/droppy_winking.png" alt="Droppy Mascot" class="empty-mascot-img">
        </div>
        <div class="empty-badge-row">
          <span class="empty-status-pill">● Fleet Multicab Standby • Ready For Dispatch</span>
        </div>
        <h3 class="empty-orders-title">No Fleet Deliveries Dispatched</h3>
        <p class="empty-orders-desc">The multicab delivery queue is currently clear. Switch channel to "Multicab" on the POS register to dispatch 5-gallon carboys and record driver routes.</p>
        <div class="empty-orders-actions">
          <button type="button" class="btn-empty-action-primary" id="btnEmptyQueueNewDelivery">
            <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            <span>Dispatch Multicab Batch (F2)</span>
          </button>
        </div>
        <div class="empty-orders-hints">
          <span class="hint-chip"><kbd>F2</kbd> Dispatch Mode</span>
          <span class="hint-chip"><kbd>F8</kbd> Jugs Ledger</span>
        </div>
      </div>
    `;

    const btnQueueDeliv = document.getElementById('btnEmptyQueueNewDelivery');
    if (btnQueueDeliv) {
      btnQueueDeliv.addEventListener('click', () => {
        soundCtrl.playTap();
        switchView('pos');
        const bDeliv = document.getElementById('btnChannelDelivery');
        if (bDeliv) bDeliv.click();
      });
    }

    return;
  }

  let html = '';
  deliveredOrders.forEach(o => {
    const isPending = o.status === 'pending';
    const paidVal = typeof o.paidAmount === 'number' ? o.paidAmount : (isPending ? 0 : o.total);
    const unpaidVal = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (isPending ? o.total : 0);

    const galCount = Number(o.gallons) || 1;
    const prodTitle = o.prodKey === 'new_container'
      ? `${galCount.toLocaleString()}x New Jug + Water`
      : `${galCount.toLocaleString()}x Purified Refill`;

    const statusBadge = isPending
      ? `<span class="tag-status-pending"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Pending</span>`
      : `<span class="tag-paid">✓ DELIVERED</span>`;

    const notePart = o.note ? `<span class="order-meta-sep">•</span><span class="order-meta-note"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${escapeHtml(o.note)}</span>` : '';

    const markPaidBtn = isPending
      ? `<button class="btn-mark-paid" data-orderno="${o.orderNo}">✓ Collect ₱${formatPeso(unpaidVal)} &amp; Remit</button>`
      : '';

    html += `
      <div class="stored-order-card" data-orderno="${o.orderNo}">
        <div class="order-card-col-left">
          <div class="order-badge-pill">${o.orderNo}</div>

          <div class="order-info-details">
            <div class="order-title-row">
              <strong class="order-main-title">${prodTitle}</strong>
              <div class="order-badges-inline">
                ${statusBadge}
                <span class="tag-channel delivery">
                  <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Multicab
                </span>
              </div>
            </div>
            <div class="order-meta-row">
              <span class="order-time-label">${o.time}</span>
              ${notePart}
            </div>
            ${o.isBatchReconciled ? `
              <div class="batch-reconciled-pill" style="margin-top: 5px;">
                <span class="batch-pill-sold">● ${galCount} Sold</span>
                <span class="batch-pill-sep">•</span>
                <span class="batch-pill-left">${o.gallonsReturned ?? (o.batchLoaded - galCount)} Left</span>
                <span class="batch-pill-total">(${o.batchLoaded} loaded)</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="order-card-col-right">
          <div class="order-amounts-box">
            <div class="order-amount-big">₱ ${formatPeso(o.total)}</div>
            ${isPending ? `<span class="tag-amount-unpaid">Pending: ₱${formatPeso(unpaidVal)}</span>${markPaidBtn}` : ''}
            <button type="button" class="btn-order-reconcile btn-fleet-reconcile ${o.isBatchReconciled ? 'reconciled' : ''}" data-orderno="${o.orderNo}" style="margin-top: 6px;" title="Edit / Reconcile Batch Sold vs Returned">
              <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span>${o.isBatchReconciled ? 'Batch Reconciled' : 'Reconcile Batch'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind Mark Paid actions in Fleet view
  container.querySelectorAll('.btn-mark-paid').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      markOrderPaid(no);
    });
  });

  // Bind Batch Reconcile in Fleet view
  container.querySelectorAll('.btn-fleet-reconcile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      openBatchReconcileModal(no);
    });
  });

  const btnLogDel = document.getElementById('btnLogNewDelivery');
  if (btnLogDel) {
    btnLogDel.onclick = () => {
      State.channel = 'delivery';
      switchView('pos');
      const bDel = document.getElementById('btnChannelDelivery');
      const bWalk = document.getElementById('btnChannelWalkin');
      const delivOptions = document.getElementById('orderDeliveryOptions');
      const walkinOptions = document.getElementById('orderWalkinOptions');
      if (bDel) bDel.classList.add('active');
      if (bWalk) bWalk.classList.remove('active');
      if (delivOptions) delivOptions.style.display = 'flex';
      if (walkinOptions) walkinOptions.style.display = 'none';
      if (State.qty < 5) State.qty = 10;
      renderPresets();
      renderOrderSummary();
    };
  }
}

// ==========================================================================
// FIXORIA SAAS REPORTS CONTROLLER (Weekly, Monthly, Yearly, Shift Analytics)
// ==========================================================================

function generateRealisticReportOrders() {
  const now = Date.now();
  const ONE_HOUR = 3600 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  // Exact matching items from reference screenshot + chronological distribution across year/months/weeks/today
  return [
    {
      orderNo: '#8238283',
      note: 'John Mark, +06',
      gallons: 7,
      channel: 'walkin',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 14500,
      tax: 1500,
      total: 16000,
      paidAmount: 16000,
      unpaidAmount: 0,
      status: 'paid',
      time: '08:00 AM',
      timestamp: now - (2 * ONE_HOUR) // Today
    },
    {
      orderNo: '#8238275',
      note: 'Robart Fox, +08',
      gallons: 9,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 19500,
      tax: 1500,
      total: 21000,
      paidAmount: 21000,
      unpaidAmount: 0,
      status: 'paid',
      time: '02:00 PM',
      timestamp: now - (1 * ONE_DAY) // Yesterday (This week)
    },
    {
      orderNo: '#8238270',
      note: 'Janny Wilson, +06',
      gallons: 7,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 23500,
      tax: 1000,
      total: 24500,
      paidAmount: 0,
      unpaidAmount: 24500,
      status: 'pending',
      time: '08:00 PM',
      timestamp: now - (3 * ONE_DAY) // 3 days ago (This week)
    },
    {
      orderNo: '#8238265',
      note: 'Jecob Mara, +03',
      gallons: 4,
      channel: 'walkin',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 14000,
      tax: 2000,
      total: 16000,
      paidAmount: 16000,
      unpaidAmount: 0,
      status: 'paid',
      time: '07:00 PM',
      timestamp: now - (4 * ONE_DAY) // 4 days ago (This week)
    },
    {
      orderNo: '#8238264',
      note: 'Wade Kuttar, +04',
      gallons: 5,
      channel: 'walkin',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 12500,
      tax: 1500,
      total: 14000,
      paidAmount: 0,
      unpaidAmount: 14000,
      status: 'pending',
      time: '10:00 AM',
      timestamp: now - (6 * ONE_DAY) // 6 days ago (This week)
    },
    {
      orderNo: '#8238262',
      note: 'Mile Preden, +06',
      gallons: 7,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 13500,
      tax: 1500,
      total: 15000,
      paidAmount: 15000,
      unpaidAmount: 0,
      status: 'paid',
      time: '06:00 PM',
      timestamp: now - (8 * ONE_DAY) // 8 days ago (This month)
    },
    {
      orderNo: '#8238260',
      note: 'Fox ANderson, +08',
      gallons: 9,
      channel: 'walkin',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 14500,
      tax: 1500,
      total: 16000,
      paidAmount: 16000,
      unpaidAmount: 0,
      status: 'paid',
      time: '03:00 PM',
      timestamp: now - (11 * ONE_DAY) // 11 days ago (This month)
    },
    {
      orderNo: '#8238258',
      note: 'Sarah Miller, +05',
      gallons: 12,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 16500,
      tax: 1500,
      total: 18000,
      paidAmount: 18000,
      unpaidAmount: 0,
      status: 'paid',
      time: '11:30 AM',
      timestamp: now - (14 * ONE_DAY)
    },
    {
      orderNo: '#8238255',
      note: 'Barangay Health Center',
      gallons: 20,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 30,
      fare: 21000,
      tax: 2000,
      total: 23000,
      paidAmount: 23000,
      unpaidAmount: 0,
      status: 'paid',
      time: '09:15 AM',
      timestamp: now - (18 * ONE_DAY)
    },
    {
      orderNo: '#8238251',
      note: 'Purok 4 Mini Mart',
      gallons: 15,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 18000,
      tax: 2500,
      total: 20500,
      paidAmount: 0,
      unpaidAmount: 20500,
      status: 'pending',
      time: '04:45 PM',
      timestamp: now - (22 * ONE_DAY)
    },
    {
      orderNo: '#8238249',
      note: 'Dr. Santos Clinic',
      gallons: 6,
      channel: 'walkin',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 12500,
      tax: 1500,
      total: 14000,
      paidAmount: 14000,
      unpaidAmount: 0,
      status: 'paid',
      time: '01:20 PM',
      timestamp: now - (27 * ONE_DAY)
    },
    {
      orderNo: '#8238240',
      note: 'Grace Academy Canteen',
      gallons: 25,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 30,
      fare: 28000,
      tax: 2000,
      total: 30000,
      paidAmount: 30000,
      unpaidAmount: 0,
      status: 'paid',
      time: '10:00 AM',
      timestamp: now - (45 * ONE_DAY)
    },
    {
      orderNo: '#8238235',
      note: 'St. Joseph Chapel Office',
      gallons: 10,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 35,
      fare: 14000,
      tax: 1000,
      total: 15000,
      paidAmount: 15000,
      unpaidAmount: 0,
      status: 'paid',
      time: '03:15 PM',
      timestamp: now - (70 * ONE_DAY)
    },
    {
      orderNo: '#8238228',
      note: 'New Residence Block 12',
      gallons: 2,
      channel: 'walkin',
      prodKey: 'new_container',
      prodName: 'New 5-Gal Jug + Water',
      unitPrice: 250,
      fare: 18000,
      tax: 2000,
      total: 20000,
      paidAmount: 20000,
      unpaidAmount: 0,
      status: 'paid',
      time: '11:40 AM',
      timestamp: now - (120 * ONE_DAY)
    },
    {
      orderNo: '#8238210',
      note: 'Victory Gym & Fitness',
      gallons: 30,
      channel: 'delivery',
      prodKey: 'purified',
      prodName: '5-Gal Purified Refill',
      unitPrice: 30,
      fare: 32000,
      tax: 3000,
      total: 35000,
      paidAmount: 35000,
      unpaidAmount: 0,
      status: 'paid',
      time: '08:30 AM',
      timestamp: now - (200 * ONE_DAY)
    }
  ];
}

function getReportFilteredOrders() {
  const now = Date.now();
  const ONE_DAY = 24 * 3600 * 1000;
  let minTime = 0;

  if (State.reportPeriod === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    minTime = d.getTime();
  } else if (State.reportPeriod === 'weekly') {
    minTime = now - (7 * ONE_DAY);
  } else if (State.reportPeriod === 'monthly') {
    minTime = now - (30 * ONE_DAY);
  } else if (State.reportPeriod === 'yearly') {
    minTime = now - (365 * ONE_DAY);
  } else {
    minTime = 0; // 'all'
  }

  let orders = (State.storedOrders || []).filter(o => {
    const t = o.timestamp || now;
    return t >= minTime;
  });

  // Filter by Source Channel
  if (State.reportSource === 'walkin') {
    orders = orders.filter(o => o.channel === 'walkin');
  } else if (State.reportSource === 'delivery') {
    orders = orders.filter(o => o.channel === 'delivery');
  } else if (State.reportSource === 'container') {
    orders = orders.filter(o => o.prodKey === 'new_container');
  }

  // Filter by Search Query
  if (State.reportSearch) {
    const q = State.reportSearch.toLowerCase();
    orders = orders.filter(o => {
      const no = (o.orderNo || '').toLowerCase();
      const note = (o.note || '').toLowerCase();
      const prod = (o.prodName || '').toLowerCase();
      const status = (o.status || '').toLowerCase();
      return no.includes(q) || note.includes(q) || prod.includes(q) || status.includes(q);
    });
  }

  return orders;
}

function renderSparklines(dispVal, taxVal, revVal) {
  // SVG 1: Total Dispensed Sparkline (starts steady, dips slightly, climbs up)
  const line1 = document.getElementById('sparkLine1');
  const area1 = document.getElementById('sparkArea1');
  if (line1 && area1) {
    line1.setAttribute('d', 'M 0 34 C 20 34, 38 40, 58 36 C 75 32, 90 14, 120 12');
    area1.setAttribute('d', 'M 0 44 L 0 34 C 20 34, 38 40, 58 36 C 75 32, 90 14, 120 12 L 120 48 L 0 48 Z');
  }

  // SVG 2: Total Uncollected Sparkline (starts low, curves steadily upward)
  const line2 = document.getElementById('sparkLine2');
  const area2 = document.getElementById('sparkArea2');
  if (line2 && area2) {
    line2.setAttribute('d', 'M 0 38 C 28 38, 55 28, 80 18 C 96 12, 110 14, 120 14');
    area2.setAttribute('d', 'M 0 44 L 0 38 C 28 38, 55 28, 80 18 C 96 12, 110 14, 120 14 L 120 48 L 0 48 Z');
  }

  // SVG 3: Total Revenue Sparkline (sharp climb upwards with strong finish)
  const line3 = document.getElementById('sparkLine3');
  const area3 = document.getElementById('sparkArea3');
  if (line3 && area3) {
    line3.setAttribute('d', 'M 0 38 C 25 38, 48 30, 72 20 C 92 20, 106 10, 120 8');
    area3.setAttribute('d', 'M 0 44 L 0 38 C 25 38, 48 30, 72 20 C 92 20, 106 10, 120 8 L 120 48 L 0 48 Z');
  }
}

function renderReports() {
  const container = document.getElementById('stageReports');
  if (!container) return;

  const filteredOrders = getReportFilteredOrders();

  // Sync Select Dropdowns
  const periodSelect = document.getElementById('reportFilterPeriod');
  const sourceSelect = document.getElementById('reportFilterSource');
  if (periodSelect && periodSelect.value !== State.reportPeriod) {
    periodSelect.value = State.reportPeriod;
  }
  if (sourceSelect && sourceSelect.value !== State.reportSource) {
    sourceSelect.value = State.reportSource;
  }

  // Sync Custom Period Dropdown UI
  const periodLabel = document.getElementById('reportPeriodActiveLabel');
  const periodMenu = document.getElementById('reportPeriodMenu');
  if (periodMenu) {
    const periodTitles = {
      'today': "Today's Shift",
      'weekly': "Weekly",
      'monthly': "Monthly",
      'yearly': "Annually",
      'all': "All Time"
    };
    if (periodLabel && periodTitles[State.reportPeriod]) {
      periodLabel.textContent = periodTitles[State.reportPeriod];
    }
    periodMenu.querySelectorAll('.period-menu-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-value') === State.reportPeriod);
    });
  }

  // Compute KPI Totals
  let totalGallons = 0;
  let totalTax = 0;
  let totalRevenue = 0;

  filteredOrders.forEach(o => {
    totalGallons += (o.gallons || 1);
    const tax = typeof o.tax === 'number' ? o.tax : (o.unpaidAmount || (o.status === 'pending' ? o.total : 0));
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? o.total : 0);
    totalTax += tax;
    totalRevenue += (paid || o.total || 0);
  });

  // Calculate Reference Display Values matching Fixoria UI
  const kpiDispensedEl = document.getElementById('kpiDispensedVal');
  const kpiUncollectedEl = document.getElementById('kpiUncollectedVal');
  const kpiRevenueEl = document.getElementById('kpiRevenueVal');

  const kpiDispSubEl = document.getElementById('kpiDispensedSub');
  const kpiUncollSubEl = document.getElementById('kpiUncollectedSub');
  const kpiRevSubEl = document.getElementById('kpiRevenueSub');

  // Format live text from actual orders (Clean 0-state when empty)
  if (kpiDispensedEl) {
    kpiDispensedEl.textContent = totalGallons > 0 ? totalGallons.toLocaleString() : '0';
  }

  if (kpiUncollectedEl) {
    kpiUncollectedEl.textContent = '₱' + totalTax.toLocaleString('en-US');
  }

  if (kpiRevenueEl) {
    kpiRevenueEl.textContent = '₱' + totalRevenue.toLocaleString('en-US');
  }

  // Dynamic Subtexts
  if (kpiDispSubEl) {
    if (State.reportPeriod === 'yearly') kpiDispSubEl.textContent = 'Total Volume last 365 days';
    else if (State.reportPeriod === 'monthly') kpiDispSubEl.textContent = 'Total Volume this month';
    else if (State.reportPeriod === 'weekly') kpiDispSubEl.textContent = 'Total Volume this week';
    else if (State.reportPeriod === 'today') kpiDispSubEl.textContent = 'Total Volume today';
    else kpiDispSubEl.textContent = 'Total Volume all time';
  }

  if (kpiUncollSubEl) {
    kpiUncollSubEl.textContent = 'Pending driver balances';
  }

  if (kpiRevSubEl) {
    if (State.reportPeriod === 'yearly') kpiRevSubEl.textContent = 'Total Amount last 365 days';
    else if (State.reportPeriod === 'monthly') kpiRevSubEl.textContent = 'Total Amount this month';
    else if (State.reportPeriod === 'weekly') kpiRevSubEl.textContent = 'Gross sales this week';
    else if (State.reportPeriod === 'today') kpiRevSubEl.textContent = 'Gross sales today';
    else kpiRevSubEl.textContent = 'Total Amount all time';
  }

  renderSparklines(totalGallons, totalTax, totalRevenue);
  renderReportsTable(filteredOrders);

  if (State.deepDiveActive) {
    renderDeepDiveReport();
  }
}

function toggleDeepDiveReport(showDeepDive) {
  State.deepDiveActive = !!showDeepDive;
  const stdView = document.getElementById('reportsStandardView');
  const ddView = document.getElementById('reportsDeepDiveView');
  if (stdView && ddView) {
    if (showDeepDive) {
      stdView.style.display = 'none';
      ddView.style.display = 'flex';
      renderDeepDiveReport();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      stdView.style.display = 'block';
      ddView.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

function renderDeepDiveReport() {
  const welcomeTitle = document.getElementById('deepDiveWelcomeTitle');
  if (welcomeTitle) {
    const operatorName = State.currentUser && State.currentUser.name ? State.currentUser.name : 'Neil';
    welcomeTitle.textContent = `Welcome, ${operatorName} 👋`;
  }

  // Calculate live metrics strictly from State.storedOrders
  const allOrders = State.storedOrders || [];
  let totalVolume = 0;
  let totalRevenue = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let walkinCount = 0;
  let deliveryCount = 0;
  const customersSet = new Set();

  // Product categories tracking
  let prod1Revenue = 0;
  let prod2Revenue = 0;
  let prod3Revenue = 0;
  let prod4Revenue = 0;

  // Route breakdown tracking
  const routeCounts = {
    purok1: { rev: 0, carboys: 0 },
    purok2: { rev: 0, carboys: 0 },
    purok3: { rev: 0, carboys: 0 },
    highway: { rev: 0, carboys: 0 }
  };

  // Month breakdown tracking
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStats = {};
  monthNames.forEach(m => { monthStats[m] = { gals: 0, rev: 0 }; });

  allOrders.forEach(o => {
    const gals = Number(o.gallons) || 1;
    totalVolume += gals;
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? (Number(o.total) || 0) : 0);
    const unpaid = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (o.status === 'pending' ? (Number(o.total) || 0) : 0);
    totalRevenue += paid;
    if (unpaid > 0 || o.status === 'pending') {
      pendingAmount += unpaid;
      pendingCount++;
    }

    if (o.channel === 'delivery') {
      deliveryCount++;
      const addr = (o.address || o.note || '').toLowerCase();
      if (addr.includes('purok 1') || addr.includes('centro')) {
        routeCounts.purok1.rev += paid;
        routeCounts.purok1.carboys += gals;
      } else if (addr.includes('purok 2') || addr.includes('east')) {
        routeCounts.purok2.rev += paid;
        routeCounts.purok2.carboys += gals;
      } else if (addr.includes('purok 3') || addr.includes('river')) {
        routeCounts.purok3.rev += paid;
        routeCounts.purok3.carboys += gals;
      } else {
        routeCounts.highway.rev += paid;
        routeCounts.highway.carboys += gals;
      }

      if (o.address) customersSet.add(o.address.toLowerCase().trim());
      else if (o.note) customersSet.add(o.note.toLowerCase().trim());
    } else {
      walkinCount++;
      if (o.note) customersSet.add(o.note.toLowerCase().trim());
    }

    // Categorize product revenue
    const itemName = (o.items && o.items[0] && o.items[0].name) ? o.items[0].name.toLowerCase() : '';
    if (itemName.includes('refill')) {
      prod1Revenue += paid;
    } else if (itemName.includes('slim')) {
      prod2Revenue += paid;
    } else if (itemName.includes('round') || itemName.includes('carboy')) {
      prod3Revenue += paid;
    } else if (itemName.includes('loan') || itemName.includes('deposit')) {
      prod4Revenue += paid;
    } else {
      prod1Revenue += paid;
    }

    // Monthly aggregation
    if (o.date || o.createdAt) {
      try {
        const d = new Date(o.date || o.createdAt);
        if (!isNaN(d.getTime())) {
          const m = monthNames[d.getMonth()];
          if (monthStats[m]) {
            monthStats[m].gals += gals;
            monthStats[m].rev += paid;
          }
        }
      } catch (e) {}
    }
  });

  const displaySales = allOrders.length > 0 ? allOrders.length.toLocaleString() : '0';
  const displayCust = customersSet.size > 0 ? customersSet.size.toLocaleString() : '0';
  const displayRev = totalRevenue > 0 ? `₱${formatPeso(totalRevenue)}` : '₱0.00';
  const displayPending = pendingCount > 0 ? pendingCount.toLocaleString() : '0';
  const displayProfitHeadline = totalRevenue > 0 ? `₱${formatPeso(totalRevenue)}` : '₱0.00';

  const elSales = document.getElementById('ddTotalSalesVal');
  const elCust = document.getElementById('ddActiveCustomersVal');
  const elRev = document.getElementById('ddTotalRevenueVal');
  const elPending = document.getElementById('ddRefundVal');
  const elHeadline = document.getElementById('ddProfitHeadlineAmt');
  const elWalkinSales = document.getElementById('ddWalkinSalesCount');
  const elDeliverySales = document.getElementById('ddDeliverySalesCount');
  const elOrdersCycle = document.getElementById('ddOrdersCycleVal');

  if (elSales) elSales.textContent = displaySales;
  if (elCust) elCust.textContent = displayCust;
  if (elRev) elRev.textContent = displayRev;
  if (elPending) elPending.textContent = displayPending;
  if (elHeadline) elHeadline.textContent = displayProfitHeadline;
  if (elWalkinSales) elWalkinSales.textContent = `${walkinCount} Sales`;
  if (elDeliverySales) elDeliverySales.textContent = `${deliveryCount} Sales`;
  if (elOrdersCycle) elOrdersCycle.textContent = displaySales;

  // Update dynamic Top Products
  const elProd1 = document.getElementById('ddProdVol1');
  const elProd2 = document.getElementById('ddProdVol2');
  const elProd3 = document.getElementById('ddProdVol3');
  const elProd4 = document.getElementById('ddProdVol4');
  if (elProd1) elProd1.textContent = prod1Revenue > 0 ? `₱${formatPeso(prod1Revenue)} total` : '₱0.00 total';
  if (elProd2) elProd2.textContent = prod2Revenue > 0 ? `₱${formatPeso(prod2Revenue)} total` : '₱0.00 total';
  if (elProd3) elProd3.textContent = prod3Revenue > 0 ? `₱${formatPeso(prod3Revenue)} total` : '₱0.00 total';
  if (elProd4) elProd4.textContent = prod4Revenue > 0 ? `₱${formatPeso(prod4Revenue)} total` : '₱0.00 total';

  // Update dynamic Delivery Routes
  const totalDelivCarboys = deliveryCount > 0 ? (routeCounts.purok1.carboys + routeCounts.purok2.carboys + routeCounts.purok3.carboys + routeCounts.highway.carboys) : 0;
  const updateRoute = (num, data) => {
    const elAmt = document.getElementById(`ddRoute${num}Amt`);
    const elBar = document.getElementById(`ddRoute${num}Bar`);
    const elShare = document.getElementById(`ddRoute${num}Share`);
    const elCarboys = document.getElementById(`ddRoute${num}Carboys`);
    const pct = totalDelivCarboys > 0 ? Math.round((data.carboys / totalDelivCarboys) * 100) : 0;
    if (elAmt) elAmt.textContent = data.rev > 0 ? `₱${formatPeso(data.rev)}` : '₱0.00';
    if (elBar) elBar.style.width = `${pct}%`;
    if (elShare) elShare.textContent = `${pct}% of deliveries`;
    if (elCarboys) elCarboys.textContent = `${data.carboys} carboys`;
  };
  updateRoute(1, routeCounts.purok1);
  updateRoute(2, routeCounts.purok2);
  updateRoute(3, routeCounts.purok3);
  updateRoute(4, routeCounts.highway);

  // Update dynamic 12-month Bar Chart
  const maxMonthRev = Math.max(...Object.values(monthStats).map(s => s.rev), 100);
  document.querySelectorAll('.dd-bar-col').forEach(col => {
    const m = col.getAttribute('data-month');
    const stats = monthStats[m] || { gals: 0, rev: 0 };
    col.setAttribute('data-gals', stats.gals > 0 ? stats.gals.toLocaleString() : '0');
    col.setAttribute('data-rev', stats.rev > 0 ? `₱${formatPeso(stats.rev)}` : '₱0.00');
    const fill = col.querySelector('.dd-bar-fill');
    if (fill) {
      const heightPct = stats.rev > 0 ? Math.max(6, Math.round((stats.rev / maxMonthRev) * 94)) : 4;
      fill.style.height = `${heightPct}%`;
    }

    col.onclick = () => {
      document.querySelectorAll('.dd-bar-col').forEach(c => {
        c.classList.remove('active');
        const tt = c.querySelector('.dd-active-bar-tooltip');
        if (tt) tt.remove();
      });
      col.classList.add('active');
      const month = col.getAttribute('data-month') || 'Month';
      const gals = col.getAttribute('data-gals') || '0';
      const rev = col.getAttribute('data-rev') || '₱0.00';
      const tooltip = document.createElement('div');
      tooltip.className = 'dd-active-bar-tooltip';
      tooltip.innerHTML = `<strong>${month} 2026</strong><span>● ${gals} Gals</span><span>● ${rev}</span>`;
      col.appendChild(tooltip);
      soundCtrl.playTap();
    };
  });
}

function exportDeepDiveCSV() {
  const allOrders = State.storedOrders || [];
  const rows = [
    ['R&R WATER REFILLING STATION - EXECUTIVE ANALYTICS DEEP DIVE REPORT'],
    ['Generated', new Date().toLocaleString()],
    ['Operator', State.currentUser ? State.currentUser.name : 'Neil'],
    [],
    ['METRIC', 'VALUE', 'NOTE'],
    ['Total Sales (Transactions)', document.getElementById('ddTotalSalesVal')?.textContent || '0', 'Total completed walk-in and delivery orders'],
    ['Active Customers', document.getElementById('ddActiveCustomersVal')?.textContent || '0', 'Unique household accounts & regular patrons'],
    ['Total Revenue', document.getElementById('ddTotalRevenueVal')?.textContent || '₱0.00', 'Gross collections from refills and container sales'],
    ['Uncollected Receivables', document.getElementById('ddRefundVal')?.textContent || '0', 'Pending balances with delivery drivers'],
    ['Total Profit Overview', document.getElementById('ddProfitHeadlineAmt')?.textContent || '₱0.00', 'Net profit overview for current cycle'],
    [],
    ['CHANNEL BREAKDOWN', 'COUNT'],
    ['Walk-in Counter Sales', document.getElementById('ddWalkinSalesCount')?.textContent || '0 Sales'],
    ['Multicab Delivery Sales', document.getElementById('ddDeliverySalesCount')?.textContent || '0 Sales'],
    [],
    ['TOP PRODUCTS', 'UNIT PRICE', 'TOTAL REVENUE'],
    ['5-Gal Purified Refill (Swap)', '₱35.00', document.getElementById('ddProdVol1')?.textContent || '₱0.00 total'],
    ['New Blue Slim Jug + Water', '₱250.00', document.getElementById('ddProdVol2')?.textContent || '₱0.00 total'],
    ['New Round Dispenser Carboy', '₱250.00', document.getElementById('ddProdVol3')?.textContent || '₱0.00 total'],
    ['Carboy Loan & Deposit', '₱200.00', document.getElementById('ddProdVol4')?.textContent || '₱0.00 total'],
    [],
    ['DELIVERY ROUTE', 'REVENUE', 'SHARE', 'ESTIMATED CARBOYS'],
    ['Purok 1 (Centro)', document.getElementById('ddRoute1Amt')?.textContent || '₱0.00', document.getElementById('ddRoute1Share')?.textContent || '0%', document.getElementById('ddRoute1Carboys')?.textContent || '0 carboys'],
    ['Purok 2 (Poblacion East)', document.getElementById('ddRoute2Amt')?.textContent || '₱0.00', document.getElementById('ddRoute2Share')?.textContent || '0%', document.getElementById('ddRoute2Carboys')?.textContent || '0 carboys'],
    ['Purok 3 (Riverside Subd)', document.getElementById('ddRoute3Amt')?.textContent || '₱0.00', document.getElementById('ddRoute3Share')?.textContent || '0%', document.getElementById('ddRoute3Carboys')?.textContent || '0 carboys'],
    ['Highway & Outskirts', document.getElementById('ddRoute4Amt')?.textContent || '₱0.00', document.getElementById('ddRoute4Share')?.textContent || '0%', document.getElementById('ddRoute4Carboys')?.textContent || '0 carboys']
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `RR_Water_Deep_Dive_Report_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Deep Dive Report CSV exported!');
}

function formatReportDateTime(timestamp) {
  const d = new Date(timestamp || Date.now());
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function renderReportsTable(filteredOrders) {
  const tbody = document.getElementById('reportCleanTbody');
  if (!tbody) return;

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <svg style="width: 32px; height: 32px; color: #94a3b8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <strong style="font-size: 0.95rem; color: var(--text-main);">No orders found for this period</strong>
            <span style="font-size: 0.8rem;">Change your period filter or click "•••" in header to reload sample data.</span>
          </div>
        </td>
      </tr>
    `;
    renderReportPagination(0, 1);
    return;
  }

  const pageSize = State.reportPageSize || 7;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  if (State.reportPage > totalPages) State.reportPage = totalPages;

  const startIdx = (State.reportPage - 1) * pageSize;
  const pageOrders = filteredOrders.slice(startIdx, startIdx + pageSize);

  let rowsHtml = '';
  pageOrders.forEach(o => {
    const isPaid = o.status === 'paid';
    const statusPill = isPaid
      ? '<span class="badge-status-paid">Paid</span>'
      : '<span class="badge-status-pending"><span class="status-dot-indicator"></span> Pending</span>';

    const isDelivery = o.channel === 'delivery';
    const sourceLabel = isDelivery ? 'Multicab' : 'Walk-In';
    const sourceClass = isDelivery ? 'source-delivery' : 'source-walkin';

    const numGals = Number(o.gallons) || 1;
    const galSub = `${numGals.toLocaleString()} ${numGals === 1 ? 'Gallon' : 'Gallons'}`;
    const custName = escapeHtml(o.note || (isDelivery ? 'Multicab Route Customer' : 'Walk-in Customer'));
    const dateTimeStr = formatReportDateTime(o.timestamp);

    const priceVal = typeof o.total === 'number' ? o.total : (numGals * 35);

    rowsHtml += `
      <tr>
        <td class="td-cb"><input type="checkbox" class="report-row-cb" data-orderno="${escapeHtml(o.orderNo || '')}"></td>
        <td class="td-orderno">${escapeHtml(o.orderNo || '')}</td>
        <td class="td-guest">
          <div class="td-customer-wrap">
            <span class="td-customer-name">${custName}</span>
            <span class="td-customer-vol">${galSub}</span>
          </div>
        </td>
        <td class="td-source"><span class="td-source-pill ${sourceClass}">${sourceLabel}</span></td>
        <td class="td-date">${dateTimeStr}</td>
        <td class="td-price font-num">₱${formatPeso(priceVal)}</td>
        <td class="td-status">${statusPill}</td>
        <td class="td-dots">
          <button class="td-action-dots-btn" data-orderno="${escapeHtml(o.orderNo || '')}" title="Order Actions">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="19" cy="12" r="2"></circle>
            </svg>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;

  // Bind row action dots
  tbody.querySelectorAll('.td-action-dots-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      const order = State.storedOrders.find(x => x.orderNo === no);
      if (!order) return;
      soundCtrl.playTap();
      if (order.status === 'pending') {
        markOrderPaid(no);
      } else {
        showToast(`Order ${no}: Paid in full (₱${formatPeso(order.total)})`);
      }
    });
  });

  renderReportPagination(totalPages, State.reportPage);
}

function renderReportPagination(totalPages, activePage) {
  const container = document.getElementById('reportPaginationPages');
  const btnPrev = document.getElementById('btnReportPrevPage');
  const btnNext = document.getElementById('btnReportNextPage');

  if (btnPrev) btnPrev.disabled = activePage <= 1;
  if (btnNext) btnNext.disabled = activePage >= totalPages;

  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = `<button class="page-pill active" data-page="1">1</button>`;
    return;
  }

  // Generate pagination sequence matching screenshot style: 1, 2, ..., 10, 12, 13, 14
  let pillsHtml = '';
  if (totalPages <= 6) {
    for (let i = 1; i <= totalPages; i++) {
      pillsHtml += `<button class="page-pill ${i === activePage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
  } else {
    // Multi-page display
    pillsHtml += `<button class="page-pill ${activePage === 1 ? 'active' : ''}" data-page="1">1</button>`;
    pillsHtml += `<button class="page-pill ${activePage === 2 ? 'active' : ''}" data-page="2">2</button>`;
    if (activePage > 3 && activePage < totalPages - 2) {
      pillsHtml += `<span class="page-ellipsis">...</span>`;
      pillsHtml += `<button class="page-pill active" data-page="${activePage}">${activePage}</button>`;
      pillsHtml += `<span class="page-ellipsis">...</span>`;
    } else {
      pillsHtml += `<span class="page-ellipsis">...</span>`;
    }
    const startTail = Math.max(3, totalPages - 3);
    for (let i = startTail; i <= totalPages; i++) {
      pillsHtml += `<button class="page-pill ${i === activePage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
  }

  container.innerHTML = pillsHtml;

  // Bind page clicks
  container.querySelectorAll('.page-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.getAttribute('data-page'), 10);
      if (p && p !== State.reportPage) {
        soundCtrl.playTap();
        State.reportPage = p;
        renderReportsTable(getReportFilteredOrders());
      }
    });
  });
}

// ==========================================================================
// PRE-DESIGNED EXCEL & MINIMAL AESTHETIC CSV EXPORT
// ==========================================================================

function getExportOrdersData(allOrders = false) {
  const orders = allOrders ? (State.storedOrders || []) : getReportFilteredOrders();
  const periodLabel = allOrders
    ? 'All Stored Orders & Shift Ledger'
    : (State.reportPeriod === 'monthly' ? 'Monthly Operations & Revenue Report (30 Days)' :
       State.reportPeriod === 'weekly' ? 'Weekly Operations & Revenue Report (7 Days)' :
       State.reportPeriod === 'yearly' ? 'Yearly Operations & Revenue Report (12 Months)' :
       State.reportPeriod === 'today' ? "Today's Active Shift Operations Report" : 'All Time Comprehensive History');

  let totalGallons = 0;
  let totalFare = 0;
  let totalTax = 0;
  let totalRevenue = 0;
  let settledCount = 0;

  orders.forEach(o => {
    const isPaid = o.status === 'paid';
    const fare = typeof o.fare === 'number' ? o.fare : Math.round((o.total || 0) * 0.9);
    const tax = typeof o.tax === 'number' ? o.tax : (o.unpaidAmount || (isPaid ? 0 : o.total));
    const total = o.total || (fare + tax);

    totalGallons += (o.gallons || 1);
    totalFare += fare;
    totalTax += tax;
    totalRevenue += total;
    if (isPaid) settledCount++;
  });

  const settlementRate = orders.length > 0 ? ((settledCount / orders.length) * 100).toFixed(1) : '100.0';

  return {
    orders,
    periodLabel,
    totalGallons,
    totalFare,
    totalTax,
    totalRevenue,
    settledCount,
    settlementRate
  };
}

function exportReportExcelFile(allOrders = false) {
  soundCtrl.playTap();
  const data = getExportOrdersData(allOrders);
  const { orders, periodLabel, totalGallons, totalFare, totalTax, totalRevenue, settledCount, settlementRate } = data;

  const now = new Date();
  const exportTime = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayDate = now.toISOString().slice(0, 10);

  // Generate Styled MSO-HTML Spreadsheet (Native .xls format compatible with Excel, Sheets, Calc)
  const rowsHtml = orders.length > 0 ? orders.map((o, idx) => {
    const isPaid = o.status === 'paid';
    const numGals = Number(o.gallons) || 1;
    const priceVal = typeof o.total === 'number' ? o.total : (numGals * 35);
    const sourceText = o.channel === 'delivery' ? 'Multicab' : 'Walk-In';
    const guestName = escapeHtml(o.note || (o.channel === 'delivery' ? 'Multicab Route Customer' : 'Walk-in Customer'));
    const dateTimeStr = o.time ? `${todayDate} ${o.time}` : formatReportDateTime(o.timestamp);
    const notesStr = escapeHtml(o.note || (o.channel === 'delivery' ? 'Route Delivery' : 'Walk-in Counter'));

    return `
      <tr class="${idx % 2 === 0 ? 'cell-even' : 'cell-odd'}">
        <td class="cell-orderno">${escapeHtml(o.orderNo || '#ORD-0000')}</td>
        <td>${guestName}</td>
        <td class="cell-num">${numGals.toLocaleString()}</td>
        <td>${sourceText}</td>
        <td class="cell-date">${dateTimeStr}</td>
        <td class="cell-currency cell-total">${formatPeso(priceVal)}</td>
        <td class="${isPaid ? 'pill-booked' : 'pill-refund'}">${isPaid ? 'Paid' : 'Pending'}</td>
        <td class="cell-notes">${notesStr}</td>
      </tr>
    `;
  }).join('') : `
    <tr class="cell-even">
      <td colspan="8" style="text-align: center; color: #64748b; padding: 22px 12px; font-style: italic; background: #ffffff;">
        No active orders recorded for this period yet. Complete transactions at the POS to populate this ledger.
      </td>
    </tr>
  `;

  const excelTemplate = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Station Audit Ledger</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
                <x:Print>
                  <x:ValidPrinterInfo/>
                  <x:PaperSizeIndex>9</x:PaperSizeIndex>
                  <x:HorizontalResolution>600</x:HorizontalResolution>
                  <x:VerticalResolution>600</x:VerticalResolution>
                </x:Print>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body, table, td, th {
          font-family: 'Segoe UI', Calibri, Arial, sans-serif;
          font-size: 10pt;
          color: #0f172a;
        }
        .station-title {
          background-color: #0369a1;
          color: #ffffff;
          font-size: 16pt;
          font-weight: bold;
          text-align: left;
          padding: 14px 16px;
          letter-spacing: 0.5px;
        }
        .station-subtitle {
          background-color: #0284c7;
          color: #f0f9ff;
          font-size: 9.5pt;
          font-weight: normal;
          padding: 4px 16px 12px 16px;
        }
        .meta-row td {
          background-color: #f8fafc;
          color: #475569;
          font-size: 9pt;
          padding: 8px 12px;
          border-bottom: 1px solid #cbd5e1;
        }
        .kpi-title {
          font-size: 8pt;
          font-weight: bold;
          color: #475569;
          text-transform: uppercase;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          text-align: center;
          padding: 8px 6px 3px 6px;
        }
        .kpi-val {
          font-size: 16pt;
          font-weight: bold;
          background-color: #f8fafc;
          border-left: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0;
          text-align: center;
          padding: 2px 6px 3px 6px;
        }
        .kpi-sub {
          font-size: 8pt;
          color: #64748b;
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          border-left: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0;
          text-align: center;
          padding: 2px 6px 8px 6px;
        }
        .th-header {
          background-color: #0f172a;
          color: #ffffff;
          font-weight: bold;
          font-size: 9.5pt;
          text-align: left;
          padding: 10px 10px;
          border: 1px solid #0f172a;
        }
        .th-header-num {
          background-color: #0f172a;
          color: #ffffff;
          font-weight: bold;
          font-size: 9.5pt;
          text-align: right;
          padding: 10px 10px;
          border: 1px solid #0f172a;
        }
        .th-header-center {
          background-color: #0f172a;
          color: #ffffff;
          font-weight: bold;
          font-size: 9.5pt;
          text-align: center;
          padding: 10px 10px;
          border: 1px solid #0f172a;
        }
        .cell-even td, td.cell-even {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 8px 10px;
          vertical-align: middle;
        }
        .cell-odd td, td.cell-odd {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 10px;
          vertical-align: middle;
        }
        .cell-orderno {
          font-weight: bold;
          color: #0284c7;
        }
        .cell-date {
          white-space: nowrap;
          color: #475569;
        }
        .cell-currency {
          text-align: right;
          mso-number-format: "\\₱\\#\\,\\#\\#0\\.00";
          white-space: nowrap;
        }
        .cell-total {
          font-weight: bold;
          color: #0284c7;
        }
        .cell-num {
          text-align: right;
          mso-number-format: "\\#\\,\\#\\#0";
        }
        .pill-booked {
          background-color: #f1f5f9;
          color: #0f172a;
          font-weight: bold;
          text-align: center;
          border: 1px solid #e2e8f0;
        }
        .pill-refund {
          background-color: #f8fafc;
          color: #475569;
          font-weight: bold;
          text-align: center;
          border: 1px solid #e2e8f0;
        }
        .cell-notes {
          color: #64748b;
          font-size: 9pt;
        }
        .totals-row td {
          background-color: #f0f9ff;
          border-top: 2px solid #0284c7;
          border-bottom: 3px double #0284c7;
          font-weight: bold;
          color: #0369a1;
          padding: 10px 10px;
          font-size: 10.5pt;
        }
        .signoff-row td {
          font-size: 8.5pt;
          color: #64748b;
          padding: 14px 6px 4px 6px;
        }
      </style>
    </head>
    <body>
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <col width="115">
        <col width="170">
        <col width="85">
        <col width="135">
        <col width="140">
        <col width="125">
        <col width="95">
        <col width="190">

        <!-- Station Branding Banner -->
        <tr>
          <td colspan="8" class="station-title">R&amp;R WATER REFILLING STATION &mdash; EXECUTIVE SALES &amp; OPERATIONS LEDGER</td>
        </tr>
        <tr>
          <td colspan="8" class="station-subtitle">Standard Purified Operations &bull; Station POS Terminal #01 &bull; Financial Audit Report</td>
        </tr>
        <tr class="meta-row">
          <td colspan="4"><strong>Report Scope:</strong> ${periodLabel}</td>
          <td colspan="4" style="text-align: right;"><strong>Export Generated:</strong> ${exportTime} &bull; <strong>Currency:</strong> Philippine Peso (&#8369;)</td>
        </tr>
        <tr style="height: 12px;"><td colspan="8"></td></tr>

        <!-- Executive KPI Cards -->
        <tr>
          <td colspan="2" class="kpi-title" style="border-top-color:#38bdf8; border-top-width:3px;">GROSS REVENUE</td>
          <td colspan="2" class="kpi-title" style="border-top-color:#34d399; border-top-width:3px;">DISPENSED VOLUME</td>
          <td colspan="2" class="kpi-title" style="border-top-color:#64748b; border-top-width:3px;">PENDING RECEIVABLES</td>
          <td colspan="2" class="kpi-title" style="border-top-color:#0284c7; border-top-width:3px;">SETTLEMENT RATE</td>
        </tr>
        <tr>
          <td colspan="2" class="kpi-val cell-currency" style="color: #0284c7;">&#8369;${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td colspan="2" class="kpi-val" style="color: #059669;">${totalGallons.toLocaleString()} Gals</td>
          <td colspan="2" class="kpi-val cell-currency" style="color: #475569;">&#8369;${totalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td colspan="2" class="kpi-val" style="color: #0284c7;">${settlementRate}%</td>
        </tr>
        <tr>
          <td colspan="2" class="kpi-sub">Total Sales &amp; Collections</td>
          <td colspan="2" class="kpi-sub">Purified Water Dispensed</td>
          <td colspan="2" class="kpi-sub">Uncollected Receivables</td>
          <td colspan="2" class="kpi-sub">${settledCount} of ${orders.length} Orders Settled</td>
        </tr>
        <tr style="height: 14px;"><td colspan="8"></td></tr>

        <!-- Table Column Headers -->
        <tr>
          <th class="th-header">Order No</th>
          <th class="th-header">Customer</th>
          <th class="th-header-num">Gallons</th>
          <th class="th-header">Source</th>
          <th class="th-header">Date &amp; Time</th>
          <th class="th-header-num">Price (&#8369;)</th>
          <th class="th-header-center">Status</th>
          <th class="th-header">Notes / Destination</th>
        </tr>

        <!-- Data Rows -->
        ${rowsHtml}

        <!-- Grand Totals Accounting Row -->
        <tr class="totals-row">
          <td colspan="2" style="font-size: 10pt; text-transform: uppercase;">&bull; TOTAL AUDIT SUMMARY</td>
          <td class="cell-num" style="font-size: 10pt; text-align: right;">${totalGallons.toLocaleString()}</td>
          <td colspan="2" style="font-size: 9pt; color: #0369a1;">${orders.length} Audited Transactions</td>
          <td class="cell-currency" style="color: #0369a1; font-size: 11pt;">&#8369;${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: center; font-size: 9pt;">${settlementRate}% Paid</td>
          <td style="font-size: 8.5pt; color: #64748b;">Ledger Balance Verified</td>
        </tr>
        <tr style="height: 18px;"><td colspan="8"></td></tr>

        <!-- Audit Sign-off Row -->
        <tr class="signoff-row">
          <td colspan="4" style="border-top: 1px solid #cbd5e1; padding-top: 8px;">
            <strong>Prepared By:</strong> Station Cashier / Attendant<br>
            <span>R&amp;R Water Automated Terminal Point</span>
          </td>
          <td colspan="4" style="border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: right;">
            <strong>Audited &amp; Approved By:</strong> Operations Manager<br>
            <span>Certified Pure Water Quality Assurance</span>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + excelTemplate], {
    type: 'application/vnd.ms-excel;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filePrefix = allOrders ? 'RR_Water_Shift_Ledger' : `RR_Water_${State.reportPeriod.toUpperCase()}_Executive_Report`;
  link.download = `${filePrefix}_${todayDate}.xls`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }, 400);

  showToast(orders.length > 0 
    ? `Exported ${orders.length} transactions to Executive Excel Spreadsheet!` 
    : 'Exported Executive Excel Spreadsheet template (Clean Slate)!');
}

function exportReportAestheticCSV(allOrders = false) {
  soundCtrl.playTap();
  const data = getExportOrdersData(allOrders);
  const { orders, periodLabel, totalGallons, totalRevenue, totalTax, settledCount, settlementRate } = data;

  const now = new Date();
  const exportTime = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const todayDate = now.toISOString().slice(0, 10);

  const dataRows = orders.length > 0 ? orders.map(o => {
    const isPaid = o.status === 'paid';
    const numGals = Number(o.gallons) || 1;
    const priceVal = typeof o.total === 'number' ? o.total : (numGals * 35);
    const sourceText = o.channel === 'delivery' ? 'Multicab' : 'Walk-In';
    const guestName = (o.note || (o.channel === 'delivery' ? 'Multicab Route Customer' : 'Walk-in Customer')).replace(/"/g, '""');
    const dateTimeStr = o.time ? `${todayDate} ${o.time}` : formatReportDateTime(o.timestamp);
    const remarks = (o.note || '').replace(/"/g, '""');

    return [
      `"${o.orderNo || '#ORD-0000'}"`,
      `"${guestName}"`,
      `"${numGals.toLocaleString()}"`,
      `"${sourceText}"`,
      `"${dateTimeStr}"`,
      `"${formatPeso(priceVal)}"`,
      `"${isPaid ? 'Paid' : 'Pending'}"`,
      `"${remarks}"`
    ].join(',');
  }) : [
    '"NO ORDERS RECORDED","---","0","---","---","0.00","N/A","Clean Shift State - No Orders Logged Yet"'
  ];

  const lines = [
    '# ==============================================================================',
    '#  R&R WATER REFILLING STATION  --  EXECUTIVE FINANCIAL AUDIT STATEMENT',
    '# ==============================================================================',
    `#  Report Scope    : ${periodLabel}`,
    `#  Export Generated: ${exportTime} (Local Station Time)`,
    '#  Station Terminal: Station Terminal #01 (Clean Pure POS v2.6.4)',
    '#  Base Currency   : Philippine Peso (PHP - ₱)',
    '# ------------------------------------------------------------------------------',
    '#  EXECUTIVE METRICS OVERVIEW:',
    `#  Total Orders Dispensed  : ${orders.length.toLocaleString()} Orders`,
    `#  Total Gallons Delivered : ${totalGallons.toLocaleString()} Gallons`,
    `#  Gross Sales Revenue     : ₱${formatPeso(totalRevenue)}`,
    `#  Pending Receivables     : ₱${formatPeso(totalTax)}`,
    `#  Order Settlement Ratio  : ${settlementRate}% (${settledCount.toLocaleString()} of ${orders.length.toLocaleString()} Settled)`,
    '# ==============================================================================',
    '',
    [
      '"Order No"',
      '"Customer"',
      '"Dispensed (Gals)"',
      '"Source"',
      '"Date & Time"',
      '"Price (PHP)"',
      '"Status"',
      '"Delivery Notes / Remarks"'
    ].join(','),
    ...dataRows,
    [
      '"TOTAL AUDIT SUMMARY"',
      '"---"',
      `"${totalGallons.toLocaleString()}"`,
      '"---"',
      `"${orders.length.toLocaleString()} Transactions"`,
      `"${formatPeso(totalRevenue)}"`,
      `"${settlementRate}% Settled"`,
      '"Ledger Audit Complete"'
    ].join(','),
    '',
    '# ------------------------------------------------------------------------------',
    '#  END OF FINANCIAL AUDIT STATEMENT -- R&R WATER REFILLING STATION',
    '# =============================================================================='
  ];

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filePrefix = allOrders ? 'RR_Water_Shift_Statement' : `RR_Water_${State.reportPeriod.toUpperCase()}_Statement`;
  link.download = `${filePrefix}_${todayDate}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }, 400);

  showToast(orders.length > 0 
    ? `Exported ${orders.length} orders to Clean Aesthetic CSV Statement!` 
    : 'Exported Clean Aesthetic CSV template (Clean Slate)!');
}

// Backward compatibility alias
function exportReportExcelCSV() {
  exportReportExcelFile(false);
}

function bindReportEvents() {
  // Custom Modern Period Dropdown Setup
  const periodDropdown = document.getElementById('reportPeriodDropdown');
  const btnPeriodTrigger = document.getElementById('btnReportPeriodTrigger');
  const periodActiveLabel = document.getElementById('reportPeriodActiveLabel');
  const periodMenu = document.getElementById('reportPeriodMenu');

  if (periodDropdown && btnPeriodTrigger && periodMenu) {
    btnPeriodTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      soundCtrl.playTap();
      const isOpen = periodDropdown.classList.contains('open');
      periodDropdown.classList.toggle('open', !isOpen);
      btnPeriodTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    periodMenu.querySelectorAll('.period-menu-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        soundCtrl.playTap();
        const val = opt.getAttribute('data-value');
        const titleText = opt.querySelector('.period-opt-title')?.textContent || val;

        periodMenu.querySelectorAll('.period-menu-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        if (periodActiveLabel) periodActiveLabel.textContent = titleText;

        periodDropdown.classList.remove('open');
        btnPeriodTrigger.setAttribute('aria-expanded', 'false');

        const periodSelect = document.getElementById('reportFilterPeriod');
        if (periodSelect) periodSelect.value = val;

        State.reportPeriod = val;
        State.reportPage = 1;
        renderReports();
        showToast(`Switched report to ${titleText}`);
      });
    });

    document.addEventListener('click', (e) => {
      if (!periodDropdown.contains(e.target)) {
        periodDropdown.classList.remove('open');
        btnPeriodTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && periodDropdown.classList.contains('open')) {
        periodDropdown.classList.remove('open');
        btnPeriodTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Period filter dropdown fallback (Monthly, Weekly, Yearly, Today, All Time)
  const periodSelect = document.getElementById('reportFilterPeriod');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      soundCtrl.playTap();
      State.reportPeriod = e.target.value;
      State.reportPage = 1;
      renderReports();
      showToast(`Switched report to ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  // Source channel filter dropdown
  const sourceSelect = document.getElementById('reportFilterSource');
  if (sourceSelect) {
    sourceSelect.addEventListener('change', (e) => {
      soundCtrl.playTap();
      State.reportSource = e.target.value;
      State.reportPage = 1;
      renderReports();
    });
  }

  // Search input in reports toolbar
  const reportSearch = document.getElementById('reportSearchInput');
  if (reportSearch) {
    reportSearch.addEventListener('input', (e) => {
      State.reportSearch = e.target.value.toLowerCase().trim();
      State.reportPage = 1;
      renderReports();
    });
  }

  // Filter button (Reset filters)
  const btnFilter = document.getElementById('btnReportFilterToggle');
  if (btnFilter) {
    btnFilter.addEventListener('click', () => {
      soundCtrl.playTap();
      State.reportSource = 'all';
      State.reportSearch = '';
      if (sourceSelect) sourceSelect.value = 'all';
      if (reportSearch) reportSearch.value = '';
      State.reportPage = 1;
      renderReports();
      showToast('Report filters reset to All Sources');
    });
  }

  // Export PDF Button
  const btnPdf = document.getElementById('btnReportExportPdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      soundCtrl.playTap();
      window.print();
    });
  }

  // Export Excel (Pre-Designed Spreadsheet Template) Button
  const btnExcel = document.getElementById('btnReportExportExcel');
  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      exportReportExcelFile(false);
    });
  }

  // Export CSV (Clean Aesthetic Statement) Button
  const btnCsv = document.getElementById('btnReportExportCsv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      exportReportAestheticCSV(false);
    });
  }

  // Header Favorite Star Button
  const btnStar = document.getElementById('btnFavoriteReport');
  if (btnStar) {
    btnStar.addEventListener('click', () => {
      soundCtrl.playTap();
      State.reportFavorite = !State.reportFavorite;
      btnStar.classList.toggle('active', State.reportFavorite);
      showToast(State.reportFavorite ? 'Report favorited!' : 'Report removed from favorites');
    });
  }

  // Breadcrumb home link
  const breadcrumbHome = document.getElementById('reportBreadcrumbHome');
  if (breadcrumbHome) {
    breadcrumbHome.addEventListener('click', () => {
      switchView('pos');
    });
  }

  // Header options button
  const btnMore = document.getElementById('btnReportMenuMore');
  if (btnMore) {
    btnMore.addEventListener('click', () => {
      soundCtrl.playTap();
      openConfirmModal(
        'Reload Analytics Demo Data?',
        'Do you want to reload sample weekly, monthly, and yearly station orders to test the dashboard?',
        () => {
          State.storedOrders = generateRealisticReportOrders();
          saveOrders();
          renderAll();
          showToast('Sample reporting data loaded!');
        },
        'assets/droppy_happy.png'
      );
    });
  }

  // Full Deep Dive Report Buttons & Triggers
  const btnOpenDeepDive = document.getElementById('btnOpenDeepDiveReport');
  if (btnOpenDeepDive) {
    btnOpenDeepDive.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(true);
    });
  }

  const btnCalloutDeepDive = document.getElementById('btnCalloutOpenDeepDive');
  if (btnCalloutDeepDive) {
    btnCalloutDeepDive.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(true);
    });
  }

  const btnBreadcrumbDeepDive = document.getElementById('btnBreadcrumbDeepDive');
  if (btnBreadcrumbDeepDive) {
    btnBreadcrumbDeepDive.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(true);
    });
  }

  // Interactive sparkline cards trigger deep dive
  document.querySelectorAll('.sparkline-card.interactive').forEach(card => {
    card.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(true);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        soundCtrl.playTap();
        toggleDeepDiveReport(true);
      }
    });
  });

  // Back to Standard Report Button
  const btnBackStd = document.getElementById('btnBackToStandardReport');
  if (btnBackStd) {
    btnBackStd.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(false);
    });
  }

  // Deep Dive Print Report Button
  const btnPrintDD = document.getElementById('btnPrintDeepDiveReport');
  if (btnPrintDD) {
    btnPrintDD.addEventListener('click', () => {
      soundCtrl.playTap();
      window.print();
    });
  }

  // Deep Dive Export Report Button
  const btnExportDD = document.getElementById('btnExportDeepDiveReport');
  if (btnExportDD) {
    btnExportDD.addEventListener('click', () => {
      soundCtrl.playTap();
      exportDeepDiveCSV();
    });
  }

  // Deep Dive KPI Quick Navigation Links
  const linkReceivables = document.getElementById('ddLinkReceivableDetails');
  if (linkReceivables) {
    linkReceivables.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(false);
      State.ordersFilter = 'pending';
      switchView('orders');
      showToast('Filtered to pending driver balances');
    });
  }

  const linkSales = document.getElementById('ddLinkSalesDetails');
  if (linkSales) {
    linkSales.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(false);
      State.ordersFilter = 'all';
      switchView('orders');
    });
  }

  const linkRev = document.getElementById('ddLinkRevenueDetails');
  if (linkRev) {
    linkRev.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(false);
    });
  }

  const linkCust = document.getElementById('ddLinkCustomerDetails');
  if (linkCust) {
    linkCust.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleDeepDiveReport(false);
    });
  }

  // Select all checkbox
  const selectAllCb = document.getElementById('reportSelectAllCb');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('#reportCleanTbody .report-row-cb').forEach(cb => {
        cb.checked = checked;
      });
    });
  }

  // Pagination Prev and Next
  const btnPrev = document.getElementById('btnReportPrevPage');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (State.reportPage > 1) {
        soundCtrl.playTap();
        State.reportPage--;
        renderReportsTable(getReportFilteredOrders());
      }
    });
  }

  const btnNext = document.getElementById('btnReportNextPage');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const orders = getReportFilteredOrders();
      const totalPages = Math.max(1, Math.ceil(orders.length / (State.reportPageSize || 7)));
      if (State.reportPage < totalPages) {
        soundCtrl.playTap();
        State.reportPage++;
        renderReportsTable(orders);
      }
    });
  }
}

// ==========================================================================
// EXPORT CSV
// ==========================================================================
function exportOrdersCSV() {
  exportReportAestheticCSV(true);
}

// ==========================================================================
// DROPPY MASCOT DYNAMIC 5-SECOND CYCLE & REACTIONS
// ==========================================================================
const DROPPY_CYCLE_STATES = [
  {
    avatar: 'assets/droppy_winking.png',
    badge: 'Station Assistant',
    text: 'Purified filtration taps running. Tap presets or input quantity, then tap Complete Sale.'
  },
  {
    avatar: 'assets/droppy_happy.png',
    badge: 'Purity: 8 PPM TDS',
    text: 'Reverse osmosis membranes & UV sterilizers humming at peak purity! 8 PPM TDS certified.'
  },
  {
    avatar: 'assets/droppy_love.png',
    badge: 'Hydration Love',
    text: 'Customer favorite: Fresh alkaline & purified mineral refills keeping our neighborhood healthy!'
  },
  {
    avatar: 'assets/droppy_question.png',
    badge: 'Counter Tip',
    text: 'Serving rush customers? Use the 1-Tap Fast Fill buttons below for instant 1 to 5 carboy sales.'
  },
  {
    avatar: 'assets/droppy_happy.png',
    badge: 'Ready On Rack',
    text: '150 sealed 5-gallon blue carboys sanitized and ready for quick doorstep or counter swaps.'
  },
  {
    avatar: 'assets/droppy_winking.png',
    badge: 'Multicab Dispatch',
    text: 'Need to dispatch a delivery? Switch to Multicab mode to track route drivers and collect balances.'
  },
  {
    avatar: 'assets/droppy_sleep.png',
    badge: 'Taps On Standby',
    text: 'Filtration reservoir holding strong at 88% capacity. Pure water pressure steady across all taps.'
  },
  {
    avatar: 'assets/droppy_love.png',
    badge: 'Community Care',
    text: 'Great work, Neil! Every bottle refilled provides clean, dependable hydration for our families.'
  },
  {
    avatar: 'assets/droppy_question.png',
    badge: 'Reports & Export',
    text: 'Wrapping up your shift? Generate beautifully designed Excel and CSV reports from the Reports tab.'
  },
  {
    avatar: 'assets/droppy_happy.png',
    badge: 'Sanitized & Sealed',
    text: 'All washing stations sanitized. Remember to wipe carboy shoulders before capping and sealing!'
  }
];

let droppyCycleTimer = null;
let droppyCycleIndex = 0;
let droppyOverrideUntil = 0;

function setDroppyDisplay(item, animate = true) {
  const avatarEl = document.getElementById('droppyBannerAvatar');
  const msgEl = document.getElementById('droppyBannerMsg');
  const badgeEl = document.getElementById('droppyBannerBadge');
  const bubbleBox = document.querySelector('.droppy-speech-bubble-box');

  if (!msgEl) return;

  if (animate) {
    if (avatarEl) avatarEl.classList.add('avatar-updating');
    if (bubbleBox) bubbleBox.classList.add('bubble-updating');

    setTimeout(() => {
      if (avatarEl && item.avatar) {
        avatarEl.src = item.avatar;
      }
      if (badgeEl && item.badge) {
        badgeEl.textContent = item.badge;
      }
      if (msgEl && item.text) {
        msgEl.textContent = item.text;
      }

      if (avatarEl) {
        avatarEl.classList.remove('avatar-updating');
        avatarEl.classList.add('droppy-pop');
        setTimeout(() => avatarEl.classList.remove('droppy-pop'), 400);
      }
      if (bubbleBox) bubbleBox.classList.remove('bubble-updating');
    }, 160);
  } else {
    if (avatarEl && item.avatar) avatarEl.src = item.avatar;
    if (badgeEl && item.badge) badgeEl.textContent = item.badge;
    if (msgEl && item.text) msgEl.textContent = item.text;
  }
}

function nextDroppyCycle() {
  const now = Date.now();
  if (now < droppyOverrideUntil) {
    return;
  }
  droppyCycleIndex = (droppyCycleIndex + 1) % DROPPY_CYCLE_STATES.length;
  setDroppyDisplay(DROPPY_CYCLE_STATES[droppyCycleIndex], true);
}

function initDroppyMascotCycle() {
  if (droppyCycleTimer) {
    clearInterval(droppyCycleTimer);
  }

  // Check URL parameter for initial pose index (allows instant previewing of poses)
  const urlParams = new URLSearchParams(window.location.search);
  const urlIdx = urlParams.get('droppyIndex');
  if (urlIdx !== null && !isNaN(Number(urlIdx))) {
    droppyCycleIndex = Number(urlIdx) % DROPPY_CYCLE_STATES.length;
    setDroppyDisplay(DROPPY_CYCLE_STATES[droppyCycleIndex], false);
  }

  // Change pose, reaction badge, and dialogue text every 5 seconds (5000ms)
  droppyCycleTimer = setInterval(nextDroppyCycle, 5000);

  // Allow clicking on Droppy to immediately trigger next pose & reaction
  const avatarEl = document.getElementById('droppyBannerAvatar');
  if (avatarEl && !avatarEl._boundCycle) {
    avatarEl._boundCycle = true;
    avatarEl.title = "Click Droppy to cycle pose & reaction!";
    avatarEl.addEventListener('click', () => {
      if (typeof soundCtrl !== 'undefined' && soundCtrl && soundCtrl.playTap) {
        soundCtrl.playTap();
      }
      droppyOverrideUntil = 0;
      nextDroppyCycle();
    });
  }
}

function updateDroppyMessage(msg, avatar = null, badge = null, holdDuration = 6000) {
  const chosenAvatar = avatar || 'assets/droppy_winking.png';
  const chosenBadge = badge || 'Station Update';
  droppyOverrideUntil = Date.now() + holdDuration;
  setDroppyDisplay({ avatar: chosenAvatar, badge: chosenBadge, text: msg }, true);
}

// ==========================================================================
// LITTLE SIDEBAR DROPPY (Independent System & Telemetry Monitor)
// ==========================================================================
const SIDEBAR_DROPPY_STATES = [
  {
    avatar: 'assets/droppy_happy.png',
    status: '● Station Online',
    tag: 'System Monitor',
    text: 'Station is active & ready for refills!'
  },
  {
    avatar: 'assets/droppy_winking.png',
    status: '● UV Sterilizer',
    tag: 'Purity: 8 PPM',
    text: 'Filtration pure at 8 PPM TDS. UV sterilizers running.'
  },
  {
    avatar: 'assets/droppy_love.png',
    status: '● All Systems Good',
    tag: 'Neighborhood Hub',
    text: 'Supplying fresh, pure drinking water with care daily!'
  },
  {
    avatar: 'assets/droppy_question.png',
    status: '● Autosave Active',
    tag: 'Local Persistence',
    text: 'All shift logs & transactions saved safely in browser storage.'
  },
  {
    avatar: 'assets/droppy_sleep.png',
    status: '● Reservoir 88%',
    tag: 'Pressure Nominal',
    text: 'Main storage reservoir holding steady at 88% capacity.'
  },
  {
    avatar: 'assets/droppy_happy.png',
    status: '● Rack Inventory',
    tag: '150 Carboys Ready',
    text: '150 sanitized carboys clean and ready on the rack.'
  },
  {
    avatar: 'assets/droppy_winking.png',
    status: '● Fleet Active',
    tag: 'Doorstep Delivery',
    text: 'Multicab routes mapped. Pending balances tracked.'
  }
];

let sidebarDroppyTimer = null;
let sidebarDroppyIndex = 0;

function setSidebarDroppyDisplay(item, animate = true) {
  const avatar = document.getElementById('sidebarDroppy');
  const msg = document.getElementById('sidebarDroppyMsg');
  const status = document.getElementById('sidebarDroppyStatus');
  const tag = document.getElementById('sidebarDroppyTag');
  const bubble = document.querySelector('.sidebar-droppy-bubble');

  if (!msg) return;

  if (animate) {
    if (avatar) avatar.classList.add('avatar-updating');
    if (bubble) bubble.classList.add('bubble-updating');

    setTimeout(() => {
      if (avatar && item.avatar) avatar.src = item.avatar;
      if (msg && item.text) msg.textContent = item.text;
      if (status && item.status) status.textContent = item.status;
      if (tag && item.tag) tag.textContent = item.tag;

      if (avatar) avatar.classList.remove('avatar-updating');
      if (bubble) bubble.classList.remove('bubble-updating');
    }, 160);
  } else {
    if (avatar && item.avatar) avatar.src = item.avatar;
    if (msg && item.text) msg.textContent = item.text;
    if (status && item.status) status.textContent = item.status;
    if (tag && item.tag) tag.textContent = item.tag;
  }
}

function nextSidebarDroppyCycle() {
  sidebarDroppyIndex = (sidebarDroppyIndex + 1) % SIDEBAR_DROPPY_STATES.length;
  setSidebarDroppyDisplay(SIDEBAR_DROPPY_STATES[sidebarDroppyIndex], true);
}

function initSidebarDroppyCycle() {
  if (sidebarDroppyTimer) {
    clearInterval(sidebarDroppyTimer);
  }
  // Independent cadence: rotates every 7 seconds (7000ms), offset from the big mascot's 5s
  sidebarDroppyTimer = setInterval(nextSidebarDroppyCycle, 7000);

  // Set initial distinct state
  setSidebarDroppyDisplay(SIDEBAR_DROPPY_STATES[0], false);

  // Interactive tap on the little mascot
  const avatar = document.getElementById('sidebarDroppy');
  if (avatar && !avatar._boundCycle) {
    avatar._boundCycle = true;
    avatar.title = "Click Little Droppy to inspect station status!";
    avatar.addEventListener('click', () => {
      if (typeof soundCtrl !== 'undefined' && soundCtrl && soundCtrl.playTap) {
        soundCtrl.playTap();
      }
      nextSidebarDroppyCycle();
    });
  }
}

function showToast(msg) {
  const toast = document.getElementById('posToast');
  const msgEl = document.getElementById('toastMessage');

  if (!toast) return;
  if (msgEl) msgEl.textContent = msg;

  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function openConfirmModal(title, message, onConfirm, avatarSrc = 'assets/droppy_question.png') {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const avatarEl = document.getElementById('modalAvatar');
  const confirmBtn = document.getElementById('btnModalConfirm');

  if (!modal) return;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (avatarEl) avatarEl.src = avatarSrc;

  State.modalCallback = onConfirm;

  confirmBtn.onclick = () => {
    if (State.modalCallback) State.modalCallback();
    closeConfirmModal();
  };

  modal.classList.add('show');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.remove('show');
  State.modalCallback = null;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// MINI ORDERS DRAWER (Quick Flyout Tab for POS Viewing)
// ==========================================================================
let currentMiniOrdersFilter = 'all';

function openMiniOrdersDrawer() {
  if (soundCtrl) soundCtrl.playTap();
  const drawer = document.getElementById('miniOrdersDrawer');
  const backdrop = document.getElementById('miniOrdersBackdrop');
  if (!drawer || !backdrop) return;

  drawer.classList.add('open');
  backdrop.classList.add('active');
  renderMiniOrders(currentMiniOrdersFilter);
  updateDroppyMessage("Viewing Quick Orders Log. Tap any pending order to collect or inspect.", 'assets/droppy_winking.png', 'Orders Log');
}

function closeMiniOrdersDrawer() {
  const drawer = document.getElementById('miniOrdersDrawer');
  const backdrop = document.getElementById('miniOrdersBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
}

function renderMiniOrders(filter = currentMiniOrdersFilter) {
  currentMiniOrdersFilter = filter;
  const container = document.getElementById('miniOrdersListContainer');
  if (!container) return;

  const orders = State.storedOrders || [];

  // Update tab count badges
  const cAll = orders.length;
  const cWalkin = orders.filter(o => o.channel === 'walkin').length;
  const cPending = orders.filter(o => o.status === 'pending').length;
  const cDelivery = orders.filter(o => o.channel === 'delivery').length;

  const elAll = document.getElementById('miniTabCountAll');
  const elWalk = document.getElementById('miniTabCountWalkin');
  const elPend = document.getElementById('miniTabCountPending');
  const elDeliv = document.getElementById('miniTabCountDelivery');

  if (elAll) elAll.textContent = cAll;
  if (elWalk) elWalk.textContent = cWalkin;
  if (elPend) elPend.textContent = cPending;
  if (elDeliv) elDeliv.textContent = cDelivery;

  // Filter
  let filtered = orders;
  if (filter === 'walkin') filtered = orders.filter(o => o.channel === 'walkin');
  else if (filter === 'pending') filtered = orders.filter(o => o.status === 'pending');
  else if (filter === 'delivery') filtered = orders.filter(o => o.channel === 'delivery');

  // Update summary strip
  let totalVol = 0;
  let totalCash = 0;
  orders.forEach(o => {
    totalVol += (o.gallons || 0);
    const isPend = o.status === 'pending';
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (isPend ? 0 : o.total);
    totalCash += paid;
  });

  const elVol = document.getElementById('miniDrawerTotalVol');
  const elCash = document.getElementById('miniDrawerTotalCash');
  if (elVol) elVol.textContent = `${totalVol.toLocaleString()} Gals`;
  if (elCash) elCash.textContent = `₱${formatPeso(totalCash)}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="mini-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16.5 9.4 7.5 4.21"></polyline>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <p>No orders recorded in this tab yet.</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(order => {
    const isPending = order.status === 'pending';
    const isDeliv = order.channel === 'delivery';

    const galCount = Number(order.gallons) || 1;
    const prodTitle = order.prodKey === 'new_container'
      ? `${galCount.toLocaleString()}x New Jug + Water`
      : `${galCount.toLocaleString()}x Purified Refill`;

    const statusTag = isPending
      ? `<span class="tag-status-pending" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Pending</span>`
      : `<span class="tag-paid" style="font-size: 0.65rem; padding: 2px 6px;">✓ PAID</span>`;

    const channelTag = isDeliv
      ? `<span class="tag-channel delivery" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Multicab</span>`
      : `<span class="tag-channel" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Walk-in</span>`;

    const unpaidVal = typeof order.unpaidAmount === 'number' ? order.unpaidAmount : (isPending ? order.total : 0);

    const collectBtn = isPending
      ? `<button class="mini-btn-collect" data-orderno="${order.orderNo}">✓ Collect ₱${formatPeso(unpaidVal)}</button>`
      : '';

    html += `
      <div class="mini-order-card" data-orderno="${order.orderNo}">
        <div class="mini-card-head">
          <span class="mini-card-id">${order.orderNo}</span>
          <span class="mini-card-time">${order.time}</span>
          <div class="mini-card-status">
            ${statusTag}
            ${channelTag}
          </div>
        </div>
        <div class="mini-card-body">
          <div class="mini-card-prod">${prodTitle}</div>
          ${order.note ? `<div class="mini-card-note"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${escapeHtml(order.note)}</div>` : ''}
        </div>
        <div class="mini-card-foot">
          <div class="mini-card-amount">₱ ${formatPeso(order.total)}</div>
          ${collectBtn}
        </div>
        ${order.channel === 'delivery' ? `
          <div style="display: flex; gap: 6px; align-items: center; justify-content: flex-end; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
            ${order.isBatchReconciled ? `
              <span class="batch-reconciled-pill" style="font-size: 0.65rem; padding: 2px 6px;">
                ● ${order.gallons} Sold • ${order.gallonsReturned ?? (order.batchLoaded - order.gallons)} Left
              </span>
            ` : ''}
            <button class="mini-btn-reconcile" data-orderno="${order.orderNo}" style="background: #f0fdf4; border: 1px solid #16a34a; color: #166534; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
              📦 Reconcile
            </button>
          </div>
        ` : ''}
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind collect actions
  container.querySelectorAll('.mini-btn-collect').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      markOrderPaid(no);
      renderMiniOrders(currentMiniOrdersFilter);
    });
  });

  // Bind mini reconcile actions
  container.querySelectorAll('.mini-btn-reconcile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const no = btn.getAttribute('data-orderno');
      openBatchReconcileModal(no);
    });
  });
}

// ==========================================================================
// SECURITY, PIN ACCESS CONTROL & AUDIT SYSTEM
// ==========================================================================

let activeAuthCallback = null;
let activeAuthCancelCallback = null;
let authPinBuffer = '';
let staffLoginPinBuffer = '';
let staffLoginSelectedId = null;
let lockPinBuffer = '';

function getCurrentUser() {
  const staff = State.staff || DEFAULT_STAFF;
  return staff.find(s => s.id === State.currentUserId) || staff[0];
}

function renderHeaderUser() {
  const user = getCurrentUser();
  const welcomeTitle = document.querySelector('.welcome-title');
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome, ${user.name}`;
  }

  const headerAvatar = document.getElementById('headerCashierAvatar');
  if (headerAvatar) {
    headerAvatar.textContent = user.name.charAt(0).toUpperCase();
    headerAvatar.style.background = user.avatarColor || '#0284c7';
    headerAvatar.title = `Cashier: ${user.name} (${user.title || user.role})`;
  }

  const headerName = document.getElementById('headerCashierName');
  if (headerName) headerName.textContent = user.name;

  const headerRole = document.getElementById('headerCashierRole');
  if (headerRole) {
    headerRole.textContent = user.role.toUpperCase();
    headerRole.className = `cashier-role-badge role-${user.role}`;
  }

  const dropdownAvatar = document.getElementById('dropdownCashierAvatar');
  if (dropdownAvatar) {
    dropdownAvatar.textContent = user.name.charAt(0).toUpperCase();
    dropdownAvatar.style.background = user.avatarColor || '#0284c7';
  }

  const dropdownFull = document.getElementById('dropdownCashierFull');
  if (dropdownFull) dropdownFull.textContent = user.name;

  const dropdownTitle = document.getElementById('dropdownCashierTitle');
  if (dropdownTitle) dropdownTitle.textContent = user.title || (user.role.toUpperCase());

  // Also update standard cashier-avatar elements if present
  document.querySelectorAll('.cashier-avatar:not(#headerCashierAvatar):not(#dropdownCashierAvatar):not(#lockUserAvatar):not(#selectedStaffAvatar)').forEach(el => {
    el.textContent = user.name.charAt(0).toUpperCase();
    el.title = `Cashier: ${user.name} (${user.title || user.role})`;
  });
}

function toggleCashierMenu(forceState) {
  const menu = document.getElementById('cashierDropdownMenu');
  const wrap = document.getElementById('cashierProfileWrapper');
  if (!menu || !wrap) return;

  const isShowing = menu.classList.contains('show');
  const nextState = typeof forceState === 'boolean' ? forceState : !isShowing;

  if (nextState) {
    soundCtrl.playTap();
    menu.classList.add('show');
    wrap.classList.add('menu-open');
  } else {
    menu.classList.remove('show');
    wrap.classList.remove('menu-open');
  }
}

function closeCashierDropdown() {
  toggleCashierMenu(false);
}

// --- MANAGER PIN AUTHORIZATION ---
function requestManagerAuth(options) {
  const modal = document.getElementById('managerAuthModal');
  if (!modal) {
    if (options.onAuthorized) options.onAuthorized('Authorized', getCurrentUser());
    return;
  }

  activeAuthCallback = options.onAuthorized;
  activeAuthCancelCallback = options.onCancelled;
  authPinBuffer = '';

  const titleEl = document.getElementById('authModalTitle');
  const descEl = document.getElementById('authModalDesc');
  const contextBox = document.getElementById('authContextBox');
  const contextLabel = document.getElementById('authContextLabel');
  const contextVal = document.getElementById('authContextVal');
  const reasonWrap = document.getElementById('authReasonWrapper');
  const errorEl = document.getElementById('authPinError');

  if (titleEl) titleEl.textContent = options.title || 'Manager Authorization Required';
  if (descEl) descEl.textContent = options.description || 'Enter 4-digit Manager PIN to authorize this sensitive action.';

  if (contextBox) {
    if (options.contextLabel && options.contextVal) {
      contextBox.style.display = 'flex';
      if (contextLabel) contextLabel.textContent = options.contextLabel;
      if (contextVal) contextVal.textContent = options.contextVal;
    } else {
      contextBox.style.display = 'none';
    }
  }

  if (reasonWrap) {
    reasonWrap.style.display = options.requireReason ? 'flex' : 'none';
  }

  if (errorEl) errorEl.textContent = '';
  updateAuthPinDots(false);

  modal.classList.add('show');
}

function updateAuthPinDots(isError = false) {
  const dots = document.querySelectorAll('#authPinDots .pin-dot');
  dots.forEach((dot, idx) => {
    dot.className = 'pin-dot';
    if (isError) {
      dot.classList.add('error');
    } else if (idx < authPinBuffer.length) {
      dot.classList.add('filled');
    }
  });
}

function submitAuthPin() {
  if (authPinBuffer.length < 4) {
    const errorEl = document.getElementById('authPinError');
    if (errorEl) errorEl.textContent = 'Please enter full 4-digit PIN.';
    soundCtrl.playVoidTone();
    return;
  }

  const staff = State.staff || DEFAULT_STAFF;
  const manager = staff.find(s => s.role === 'manager' && s.pin === authPinBuffer);

  if (manager) {
    soundCtrl.playSuccessTone();
    let reasonText = '';
    const reasonSelect = document.getElementById('authVoidReasonSelect');
    const customNote = document.getElementById('authVoidCustomNote');
    if (reasonSelect) {
      reasonText = reasonSelect.value;
      if (customNote && customNote.value.trim()) {
        reasonText += ` - ${customNote.value.trim()}`;
      }
    }
    const cb = activeAuthCallback;
    closeManagerAuthModal();
    if (cb) cb(reasonText, manager);
  } else {
    soundCtrl.playVoidTone();
    const errorEl = document.getElementById('authPinError');
    if (errorEl) errorEl.textContent = 'Incorrect Manager PIN. Access denied.';
    updateAuthPinDots(true);
    const dotsWrap = document.getElementById('authPinDots');
    if (dotsWrap) {
      dotsWrap.classList.remove('pin-shake');
      void dotsWrap.offsetWidth;
      dotsWrap.classList.add('pin-shake');
    }
    setTimeout(() => {
      authPinBuffer = '';
      updateAuthPinDots(false);
      if (dotsWrap) dotsWrap.classList.remove('pin-shake');
    }, 700);
  }
}

function closeManagerAuthModal() {
  const modal = document.getElementById('managerAuthModal');
  if (modal) modal.classList.remove('show');
  authPinBuffer = '';
  if (activeAuthCancelCallback) {
    activeAuthCancelCallback();
  }
  activeAuthCallback = null;
  activeAuthCancelCallback = null;
}

// --- TERMINAL LOCK SYSTEM ---
function lockTerminal() {
  soundCtrl.playTap();
  State.isTerminalLocked = true;
  localStorage.setItem('rr_pos_terminal_locked', 'true');
  const overlay = document.getElementById('terminalLockOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    updateLockScreenInfo();
  }
  lockPinBuffer = '';
  updateLockPinDots(false);
  closeCashierDropdown();
  logSecurityEvent('LOCK', `Terminal locked at ${State.settings.stationBranch || 'Counter #1'}`);
}

function unlockTerminal() {
  if (lockPinBuffer.length < 4) {
    const errorEl = document.getElementById('lockPinError');
    if (errorEl) errorEl.textContent = 'Please enter 4 digits.';
    soundCtrl.playVoidTone();
    return;
  }

  const staff = State.staff || DEFAULT_STAFF;
  const currentUser = getCurrentUser();
  const authorized = (currentUser.pin === lockPinBuffer) ||
    staff.some(s => s.role === 'manager' && s.pin === lockPinBuffer);

  if (authorized) {
    soundCtrl.playSuccessTone();
    State.isTerminalLocked = false;
    localStorage.removeItem('rr_pos_terminal_locked');
    const overlay = document.getElementById('terminalLockOverlay');
    if (overlay) overlay.style.display = 'none';
    lockPinBuffer = '';
    showToast(`Welcome back, ${currentUser.name}! Terminal unlocked.`);
    logSecurityEvent('UNLOCK', `Terminal unlocked by ${currentUser.name}`);
  } else {
    soundCtrl.playVoidTone();
    const errorEl = document.getElementById('lockPinError');
    if (errorEl) errorEl.textContent = 'Incorrect PIN. Try again.';
    updateLockPinDots(true);
    const dotsWrap = document.getElementById('lockPinDots');
    if (dotsWrap) {
      dotsWrap.classList.remove('pin-shake');
      void dotsWrap.offsetWidth;
      dotsWrap.classList.add('pin-shake');
    }
    setTimeout(() => {
      lockPinBuffer = '';
      updateLockPinDots(false);
      if (dotsWrap) dotsWrap.classList.remove('pin-shake');
    }, 700);
  }
}

function updateLockScreenInfo() {
  const user = getCurrentUser();
  const userNameEl = document.getElementById('lockUserName');
  const userRoleEl = document.getElementById('lockUserRole');
  const userAvatarEl = document.getElementById('lockUserAvatar');
  const timeEl = document.getElementById('lockTimeDisplay');
  const dateEl = document.getElementById('lockDateDisplay');

  if (userNameEl) userNameEl.textContent = user.name;
  if (userRoleEl) userRoleEl.textContent = user.title || (user.role.toUpperCase());
  if (userAvatarEl) {
    userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
    userAvatarEl.style.background = user.avatarColor || '#0284c7';
  }

  const now = new Date();
  if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function updateLockPinDots(isError = false) {
  const dots = document.querySelectorAll('#lockPinDots .pin-dot');
  dots.forEach((dot, idx) => {
    dot.className = 'pin-dot';
    if (isError) {
      dot.classList.add('error');
    } else if (idx < lockPinBuffer.length) {
      dot.classList.add('filled');
    }
  });
}

// --- SWITCH STAFF MODAL ---
function openSwitchUserModal() {
  soundCtrl.playTap();
  closeCashierDropdown();
  const modal = document.getElementById('switchUserModal');
  const listEl = document.getElementById('staffPickerList');
  const subview = document.getElementById('staffPinEntrySubview');
  if (!modal) return;

  if (subview) subview.style.display = 'none';
  if (listEl) {
    listEl.style.display = 'flex';
    renderStaffPickerCards();
  }

  modal.classList.add('show');
}

function closeSwitchUserModal() {
  const modal = document.getElementById('switchUserModal');
  if (modal) modal.classList.remove('show');
  staffLoginPinBuffer = '';
  staffLoginSelectedId = null;
}

function renderStaffPickerCards() {
  const listEl = document.getElementById('staffPickerList');
  if (!listEl) return;
  const staff = State.staff || DEFAULT_STAFF;

  let html = '';
  staff.forEach(s => {
    const isCurrent = s.id === State.currentUserId;
    html += `
      <div class="staff-picker-card ${isCurrent ? 'active' : ''}" data-staffid="${s.id}">
        <div class="staff-picker-left">
          <div class="cashier-avatar sm" style="background: ${s.avatarColor || '#0284c7'};">${s.name.charAt(0).toUpperCase()}</div>
          <div class="staff-picker-info">
            <strong class="staff-picker-name">${escapeHtml(s.name)} ${isCurrent ? '(Active)' : ''}</strong>
            <span class="staff-picker-title">${escapeHtml(s.title || s.role)}</span>
          </div>
        </div>
        <span class="staff-picker-role-tag ${s.role}">${s.role}</span>
      </div>
    `;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll('.staff-picker-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-staffid');
      startStaffPinLogin(id);
    });
  });
}

function startStaffPinLogin(staffId) {
  const staff = State.staff || DEFAULT_STAFF;
  const user = staff.find(s => s.id === staffId);
  if (!user) return;

  staffLoginSelectedId = staffId;
  staffLoginPinBuffer = '';

  const listEl = document.getElementById('staffPickerList');
  const subview = document.getElementById('staffPinEntrySubview');
  const avatarEl = document.getElementById('selectedStaffAvatar');
  const nameEl = document.getElementById('selectedStaffName');
  const roleEl = document.getElementById('selectedStaffRoleTitle');
  const promptEl = document.getElementById('staffPromptName');
  const errorEl = document.getElementById('staffLoginPinError');

  if (listEl) listEl.style.display = 'none';
  if (subview) subview.style.display = 'block';

  if (avatarEl) {
    avatarEl.textContent = user.name.charAt(0).toUpperCase();
    avatarEl.style.background = user.avatarColor || '#0284c7';
  }
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.title || user.role;
  if (promptEl) promptEl.textContent = user.name;
  if (errorEl) errorEl.textContent = '';

  updateStaffLoginPinDots(false);
}

function updateStaffLoginPinDots(isError = false) {
  const dots = document.querySelectorAll('#staffLoginPinDots .pin-dot');
  dots.forEach((dot, idx) => {
    dot.className = 'pin-dot';
    if (isError) {
      dot.classList.add('error');
    } else if (idx < staffLoginPinBuffer.length) {
      dot.classList.add('filled');
    }
  });
}

function submitStaffLoginPin() {
  if (staffLoginPinBuffer.length < 4) {
    const errorEl = document.getElementById('staffLoginPinError');
    if (errorEl) errorEl.textContent = 'Please enter 4 digits.';
    soundCtrl.playVoidTone();
    return;
  }

  const staff = State.staff || DEFAULT_STAFF;
  const targetUser = staff.find(s => s.id === staffLoginSelectedId);

  if (targetUser && targetUser.pin === staffLoginPinBuffer) {
    soundCtrl.playSuccessTone();
    State.currentUserId = targetUser.id;
    localStorage.setItem('rr_pos_current_user_id', targetUser.id);
    if (State.settings) State.settings.cashierName = targetUser.name;
    saveSettings();
    renderHeaderUser();
    closeSwitchUserModal();

    if (State.isTerminalLocked) {
      State.isTerminalLocked = false;
      localStorage.removeItem('rr_pos_terminal_locked');
      const overlay = document.getElementById('terminalLockOverlay');
      if (overlay) overlay.style.display = 'none';
    }

    showToast(`✓ Switched cashier: Signed in as ${targetUser.name} (${targetUser.role.toUpperCase()})`);
    logSecurityEvent('LOGIN', `User signed in as ${targetUser.name} (${targetUser.title})`);
    updateDroppyMessage(`Welcome back, ${targetUser.name}! Station ready for dispensing.`, 'assets/droppy_happy.png', 'Operator Active');
  } else {
    soundCtrl.playVoidTone();
    const errorEl = document.getElementById('staffLoginPinError');
    if (errorEl) errorEl.textContent = 'Incorrect PIN. Try again.';
    updateStaffLoginPinDots(true);
    const dotsWrap = document.getElementById('staffLoginPinDots');
    if (dotsWrap) {
      dotsWrap.classList.remove('pin-shake');
      void dotsWrap.offsetWidth;
      dotsWrap.classList.add('pin-shake');
    }
    setTimeout(() => {
      staffLoginPinBuffer = '';
      updateStaffLoginPinDots(false);
      if (dotsWrap) dotsWrap.classList.remove('pin-shake');
    }, 700);
  }
}

// --- SHIFT RESET SECURED WITH MANAGER AUTH ---
function handleShiftResetRequest() {
  soundCtrl.playTap();
  let todayVol = 0;
  let todayCash = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  (State.storedOrders || []).forEach(o => {
    if ((o.timestamp || 0) >= todayMs) {
      todayVol += Number(o.gallons) || 0;
      const isPaid = o.status === 'paid';
      const paidVal = typeof o.paidAmount === 'number' ? o.paidAmount : (isPaid ? o.total : 0);
      todayCash += paidVal;
    }
  });

  requestManagerAuth({
    title: 'Authorize Shift Close & Reset',
    description: 'This will close the active shift drawer and reset today\'s running sales counter to ₱0.00. Historical reports remain securely archived.',
    contextLabel: 'Closing Shift Ledger:',
    contextVal: `₱${formatPeso(todayCash)} (${todayVol.toLocaleString()} Gallons)`,
    requireReason: false,
    onAuthorized: (reason, manager) => {
      const pastOrders = (State.storedOrders || []).filter(o => (o.timestamp || 0) < todayMs);
      State.storedOrders = pastOrders;
      saveOrders();
      renderAll();
      showToast(`New day/shift started! Drawer reset to ₱0.00 (Authorized by ${manager.name}).`);
      logSecurityEvent(
        'SHIFT_RESET',
        `Closed shift. Final output: ${todayVol.toLocaleString()} Gal, Cash remitted: ₱${formatPeso(todayCash)}`,
        manager.name
      );
      updateDroppyMessage(`New shift started! Drawer reset to ₱0.00 by Manager ${manager.name}.`, 'assets/droppy_happy.png', 'Shift Reset');
    }
  });
}

// --- AUDIT LOGGING & SETTINGS PANELS ---
function logSecurityEvent(action, details, managerOverrideName = null) {
  const user = getCurrentUser();
  const now = new Date();
  const timeStr = formatReportDateTime(now.getTime());
  const entry = {
    id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: now.getTime(),
    timeStr: timeStr,
    action: action,
    user: user.name,
    role: user.role,
    manager: managerOverrideName || (user.role === 'manager' ? user.name : '—'),
    details: details
  };
  if (!Array.isArray(State.auditLogs)) State.auditLogs = [];
  State.auditLogs.unshift(entry);
  if (State.auditLogs.length > 250) State.auditLogs = State.auditLogs.slice(0, 250);
  saveAuditLogs();
  renderAuditLogTable();
}

function renderStaffSettingsList() {
  const container = document.getElementById('settingsStaffList');
  if (!container) return;
  const staff = State.staff || DEFAULT_STAFF;

  let html = '';
  staff.forEach(s => {
    html += `
      <div class="staff-setting-row" data-staffid="${s.id}">
        <div class="staff-row-left">
          <div class="cashier-avatar sm" style="background: ${s.avatarColor || '#0284c7'};">${s.name.charAt(0).toUpperCase()}</div>
          <div class="staff-row-details">
            <strong>${escapeHtml(s.name)}</strong>
            <span>${escapeHtml(s.title || s.role)} • PIN: ••••</span>
          </div>
        </div>
        <div class="staff-row-right">
          <span class="staff-picker-role-tag ${s.role}">${s.role}</span>
          <button class="btn-edit-staff-pin" data-staffid="${s.id}">Change PIN</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll('.btn-edit-staff-pin').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-staffid');
      promptChangeStaffPin(id);
    });
  });
}

function promptChangeStaffPin(staffId) {
  const staff = State.staff || DEFAULT_STAFF;
  const target = staff.find(s => s.id === staffId);
  if (!target) return;

  requestManagerAuth({
    title: `Change PIN: ${target.name}`,
    description: `Enter Manager PIN to authorize setting a new security PIN for ${target.name}.`,
    requireReason: false,
    onAuthorized: () => {
      const newPin = prompt(`Enter new 4-digit PIN for ${target.name}:`, target.pin);
      if (newPin && /^\d{4}$/.test(newPin.trim())) {
        target.pin = newPin.trim();
        saveStaff();
        renderStaffSettingsList();
        showToast(`PIN updated for ${target.name}!`);
        logSecurityEvent('PIN_CHANGE', `Updated 4-digit PIN for ${target.name} (${target.role})`);
      } else if (newPin !== null) {
        alert('PIN must be exactly 4 numeric digits.');
      }
    }
  });
}

function renderAuditLogTable() {
  const tbody = document.getElementById('auditLogTbody');
  const countBadge = document.getElementById('auditCountBadge');
  if (!tbody) return;

  const logs = State.auditLogs || [];
  if (countBadge) countBadge.textContent = `${logs.length} Recorded Events`;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No security events recorded yet.</td></tr>`;
    return;
  }

  let html = '';
  logs.slice(0, 100).forEach(log => {
    let badgeClass = 'lock';
    if (log.action === 'VOID_ORDER') badgeClass = 'void';
    else if (log.action === 'SHIFT_RESET') badgeClass = 'reset';
    else if (log.action === 'LOGIN') badgeClass = 'login';
    else if (log.action === 'PIN_CHANGE' || log.action === 'SETTINGS_CHANGE') badgeClass = 'price';

    html += `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.72rem; white-space: nowrap;">${escapeHtml(log.timeStr || '')}</td>
        <td><span class="badge-audit ${badgeClass}">${escapeHtml(log.action || '')}</span></td>
        <td><strong>${escapeHtml(log.user || '')}</strong> <span style="font-size: 0.7rem; color: var(--text-muted);">(${escapeHtml(log.role || '')})</span></td>
        <td><span style="color: #0284c7; font-weight: 700;">${escapeHtml(log.manager || '—')}</span></td>
        <td>${escapeHtml(log.details || '')}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function exportAuditLogCsv() {
  const logs = State.auditLogs || [];
  if (logs.length === 0) {
    showToast('No audit events to export yet.');
    return;
  }

  let csv = 'Timestamp,Event,Operator,Role,Manager Approval,Details\n';
  logs.forEach(l => {
    csv += `"${(l.timeStr || '').replace(/"/g, '""')}","${l.action || ''}","${l.user || ''}","${l.role || ''}","${l.manager || ''}","${(l.details || '').replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RR_Water_Security_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Security audit log exported as CSV!');
}

function activateSettingsTab(tabKey) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabKey);
  });
  document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
  const targetPane = document.getElementById('pane' + tabKey.charAt(0).toUpperCase() + tabKey.slice(1));
  if (targetPane) targetPane.classList.add('active');
  if (tabKey === 'security') {
    renderStaffSettingsList();
    renderAuditLogTable();
  }
}

function initSecuritySystem() {
  // 1. Manager Auth Keypad clicks
  document.querySelectorAll('.btn-auth-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      const d = btn.getAttribute('data-digit');
      if (authPinBuffer.length < 4) {
        authPinBuffer += d;
        updateAuthPinDots(false);
        if (authPinBuffer.length === 4) {
          setTimeout(submitAuthPin, 100);
        }
      }
    });
  });

  const btnAuthClear = document.getElementById('btnAuthClear');
  if (btnAuthClear) {
    btnAuthClear.addEventListener('click', () => {
      soundCtrl.playTap();
      authPinBuffer = '';
      updateAuthPinDots(false);
    });
  }

  const btnAuthBack = document.getElementById('btnAuthBackspace');
  if (btnAuthBack) {
    btnAuthBack.addEventListener('click', () => {
      soundCtrl.playTap();
      authPinBuffer = authPinBuffer.slice(0, -1);
      updateAuthPinDots(false);
    });
  }

  const btnAuthCancel = document.getElementById('btnAuthCancel');
  if (btnAuthCancel) btnAuthCancel.addEventListener('click', closeManagerAuthModal);

  const btnAuthConfirm = document.getElementById('btnAuthConfirm');
  if (btnAuthConfirm) btnAuthConfirm.addEventListener('click', submitAuthPin);

  // 2. Switch User Keypad clicks
  document.querySelectorAll('.btn-staff-login-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      const d = btn.getAttribute('data-digit');
      if (staffLoginPinBuffer.length < 4) {
        staffLoginPinBuffer += d;
        updateStaffLoginPinDots(false);
        if (staffLoginPinBuffer.length === 4) {
          setTimeout(submitStaffLoginPin, 100);
        }
      }
    });
  });

  const btnStaffLoginClear = document.getElementById('btnStaffLoginClear');
  if (btnStaffLoginClear) {
    btnStaffLoginClear.addEventListener('click', () => {
      soundCtrl.playTap();
      staffLoginPinBuffer = '';
      updateStaffLoginPinDots(false);
    });
  }

  const btnStaffLoginBack = document.getElementById('btnStaffLoginBackspace');
  if (btnStaffLoginBack) {
    btnStaffLoginBack.addEventListener('click', () => {
      soundCtrl.playTap();
      staffLoginPinBuffer = staffLoginPinBuffer.slice(0, -1);
      updateStaffLoginPinDots(false);
    });
  }

  const btnBackStaff = document.getElementById('btnBackToStaffList');
  if (btnBackStaff) {
    btnBackStaff.addEventListener('click', () => {
      soundCtrl.playTap();
      const listEl = document.getElementById('staffPickerList');
      const subview = document.getElementById('staffPinEntrySubview');
      if (subview) subview.style.display = 'none';
      if (listEl) listEl.style.display = 'flex';
      staffLoginPinBuffer = '';
      updateStaffLoginPinDots(false);
    });
  }

  const btnSwitchCancel = document.getElementById('btnSwitchUserCancel');
  if (btnSwitchCancel) btnSwitchCancel.addEventListener('click', closeSwitchUserModal);

  // 3. Lock Screen Keypad clicks
  document.querySelectorAll('.btn-lock-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      const d = btn.getAttribute('data-digit');
      if (lockPinBuffer.length < 4) {
        lockPinBuffer += d;
        updateLockPinDots(false);
        if (lockPinBuffer.length === 4) {
          setTimeout(unlockTerminal, 100);
        }
      }
    });
  });

  const btnLockClear = document.getElementById('btnLockPinClear');
  if (btnLockClear) {
    btnLockClear.addEventListener('click', () => {
      soundCtrl.playTap();
      lockPinBuffer = '';
      updateLockPinDots(false);
    });
  }

  const btnLockBack = document.getElementById('btnLockPinBackspace');
  if (btnLockBack) {
    btnLockBack.addEventListener('click', () => {
      soundCtrl.playTap();
      lockPinBuffer = lockPinBuffer.slice(0, -1);
      updateLockPinDots(false);
    });
  }

  const btnLockSwitch = document.getElementById('btnLockSwitchStaff');
  if (btnLockSwitch) {
    btnLockSwitch.addEventListener('click', () => {
      openSwitchUserModal();
    });
  }

  // 4. Export Audit Log button
  const btnExportAudit = document.getElementById('btnExportAuditLog');
  if (btnExportAudit) {
    btnExportAudit.addEventListener('click', exportAuditLogCsv);
  }

  // 5. Global Keyboard Listeners for PIN Entry and Lock Shortcut
  document.addEventListener('keydown', (e) => {
    // Ctrl+L or Alt+L: Lock Station
    if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      lockTerminal();
      return;
    }

    // Lock Screen Active: Intercept typing
    const lockOverlay = document.getElementById('terminalLockOverlay');
    if (lockOverlay && lockOverlay.style.display === 'flex') {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        soundCtrl.playTap();
        if (lockPinBuffer.length < 4) {
          lockPinBuffer += e.key;
          updateLockPinDots(false);
          if (lockPinBuffer.length === 4) setTimeout(unlockTerminal, 100);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        soundCtrl.playTap();
        lockPinBuffer = lockPinBuffer.slice(0, -1);
        updateLockPinDots(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        unlockTerminal();
      }
      return;
    }

    // Manager Auth Modal Active
    const authModal = document.getElementById('managerAuthModal');
    if (authModal && authModal.classList.contains('show')) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        soundCtrl.playTap();
        if (authPinBuffer.length < 4) {
          authPinBuffer += e.key;
          updateAuthPinDots(false);
          if (authPinBuffer.length === 4) setTimeout(submitAuthPin, 100);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        soundCtrl.playTap();
        authPinBuffer = authPinBuffer.slice(0, -1);
        updateAuthPinDots(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeManagerAuthModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitAuthPin();
      }
      return;
    }

    // Switch User Modal on PIN step
    const switchModal = document.getElementById('switchUserModal');
    const subview = document.getElementById('staffPinEntrySubview');
    if (switchModal && switchModal.classList.contains('show') && subview && subview.style.display === 'block') {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        soundCtrl.playTap();
        if (staffLoginPinBuffer.length < 4) {
          staffLoginPinBuffer += e.key;
          updateStaffLoginPinDots(false);
          if (staffLoginPinBuffer.length === 4) setTimeout(submitStaffLoginPin, 100);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        soundCtrl.playTap();
        staffLoginPinBuffer = staffLoginPinBuffer.slice(0, -1);
        updateStaffLoginPinDots(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSwitchUserModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitStaffLoginPin();
      }
    }
  });

  // If station was locked prior to refresh, restore lock
  if (State.isTerminalLocked) {
    const overlay = document.getElementById('terminalLockOverlay');
    if (overlay) {
      overlay.style.display = 'flex';
      updateLockScreenInfo();
    }
  }
}

// ==========================================================================
// 13. QUICK CASH TENDER & CHANGE DUE CALCULATOR
// ==========================================================================
function initQuickCashTender() {
  document.querySelectorAll('.btn-quick-cash').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      document.querySelectorAll('.btn-quick-cash').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tender = btn.getAttribute('data-tender');
      State.selectedTender = tender;
      updateTenderAndChange();
    });
  });
  updateTenderAndChange();
}

function updateTenderAndChange() {
  const badge = document.getElementById('changeDueBadge');
  if (!badge) return;

  const total = calculateTotal();
  const isPending = State.channel === 'delivery' && State.deliveryPayMode === 'pending';

  if (isPending) {
    badge.textContent = 'Pay on Delivery';
    badge.className = 'change-due-badge exact';
    return;
  }

  if (State.selectedTender === 'exact') {
    badge.textContent = 'Change: ₱0.00';
    badge.className = 'change-due-badge exact';
  } else {
    const tender = Number(State.selectedTender) || 0;
    const diff = tender - total;
    if (diff >= 0) {
      badge.textContent = `Change: ₱${formatPeso(diff)}`;
      badge.className = 'change-due-badge';
    } else {
      badge.textContent = `Short: ₱${formatPeso(Math.abs(diff))}`;
      badge.className = 'change-due-badge insufficient';
    }
  }
}

// ==========================================================================
// 14. CARBOY LOAN & RETURN STEPPERS ON REGISTER
// ==========================================================================
function initCarboySteppers() {
  const btnLoanMinus = document.getElementById('btnLoanMinus');
  const btnLoanPlus = document.getElementById('btnLoanPlus');
  const btnReturnMinus = document.getElementById('btnReturnMinus');
  const btnReturnPlus = document.getElementById('btnReturnPlus');

  const valLoan = document.getElementById('carboysLoanedVal');
  const valReturn = document.getElementById('carboysReturnedVal');

  if (btnLoanMinus && btnLoanPlus && valLoan) {
    btnLoanMinus.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.carboysLoaned > 0) {
        State.carboysLoaned--;
        valLoan.textContent = State.carboysLoaned;
      }
    });
    btnLoanPlus.addEventListener('click', () => {
      soundCtrl.playTap();
      State.carboysLoaned++;
      valLoan.textContent = State.carboysLoaned;
    });
  }

  if (btnReturnMinus && btnReturnPlus && valReturn) {
    btnReturnMinus.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.carboysReturned > 0) {
        State.carboysReturned--;
        valReturn.textContent = State.carboysReturned;
      }
    });
    btnReturnPlus.addEventListener('click', () => {
      soundCtrl.playTap();
      State.carboysReturned++;
      valReturn.textContent = State.carboysReturned;
    });
  }
}

function recordCarboyTransaction(order) {
  const customerName = (order.note || '').trim() || (order.channel === 'delivery' ? 'Multicab Customer' : 'Walk-in Customer');
  let customer = State.customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());

  const loaned = Number(order.carboysLoaned) || 0;
  const returned = Number(order.carboysReturned) || 0;

  if (!customer) {
    customer = {
      id: 'cust_' + Date.now(),
      name: customerName,
      contact: '',
      address: order.channel === 'delivery' ? (order.note || 'Route Delivery') : 'Station Counter',
      carboysHeld: Math.max(0, loaned - returned),
      depositAmount: Math.max(0, loaned - returned) * 200
    };
    State.customers.push(customer);
  } else {
    customer.carboysHeld = Math.max(0, (customer.carboysHeld || 0) + loaned - returned);
    customer.depositAmount = customer.carboysHeld * 200;
  }

  saveCustomers();
  updateCarboyHeaderBadge();

  // Sync to SQLite backend
  fetch(`/api/customers/${encodeURIComponent(customer.id)}/empties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loanedDelta: loaned,
      returnedDelta: returned,
      note: `Order ${order.orderNo}`
    })
  }).catch(() => {});
}

// ==========================================================================
// 15. THERMAL ESC/POS RECEIPT & MULTICAB DISPATCH SLIP MODAL
// ==========================================================================
function initThermalReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  const btnClose = document.getElementById('btnThermalClose');
  const btnPrintNow = document.getElementById('btnThermalPrintNow');
  const btnPrintSlip = document.getElementById('btnThermalPrintSlip');
  const btnKickDrawer = document.getElementById('btnThermalKickDrawer');
  const btnFmt80 = document.getElementById('btnPaperFormat80');
  const btnFmt58 = document.getElementById('btnPaperFormat58');
  const target = document.getElementById('thermalPrintTarget');

  if (btnClose) {
    btnClose.addEventListener('click', closeThermalReceiptModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeThermalReceiptModal();
    });
  }

  if (btnPrintNow) {
    btnPrintNow.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.activePrintMode === 'shift_summary') {
        renderShiftSummaryReceipt(getCurrentUser());
      } else if (State.activePrintOrder) {
        renderThermalReceipt(State.activePrintOrder);
      }
      setTimeout(() => { window.print(); }, 150);
    });
  }

  if (btnPrintSlip) {
    btnPrintSlip.addEventListener('click', () => {
      soundCtrl.playTap();
      if (State.activePrintOrder) renderDispatchSlip(State.activePrintOrder);
      setTimeout(() => { window.print(); }, 150);
    });
  }

  if (btnKickDrawer) {
    btnKickDrawer.addEventListener('click', () => {
      kickCashDrawer();
    });
  }

  if (btnFmt80 && btnFmt58 && target) {
    btnFmt80.addEventListener('click', () => {
      soundCtrl.playTap();
      btnFmt80.classList.add('active');
      btnFmt58.classList.remove('active');
      target.classList.remove('format-58mm');
      State.receiptFormat = '80mm';
    });
    btnFmt58.addEventListener('click', () => {
      soundCtrl.playTap();
      btnFmt58.classList.add('active');
      btnFmt80.classList.remove('active');
      target.classList.add('format-58mm');
      State.receiptFormat = '58mm';
    });
  }
}

function openThermalReceiptModal(order, isTripTicket = false) {
  const modal = document.getElementById('thermalReceiptModal');
  if (!modal) return;

  State.activePrintOrder = order || State.storedOrders[0] || null;
  const headingEl = document.getElementById('thermalModalHeading');

  if (isTripTicket === 'shift_summary') {
    State.activePrintMode = 'shift_summary';
    if (headingEl) headingEl.textContent = 'Cashier Shift X-Report (Thermal ESC/POS)';
    renderShiftSummaryReceipt(getCurrentUser());
  } else if (isTripTicket === true || isTripTicket === 'slip') {
    State.activePrintMode = 'slip';
    if (headingEl) headingEl.textContent = 'Multicab Trip Dispatch Ticket';
    renderDispatchSlip(State.activePrintOrder);
  } else {
    State.activePrintMode = 'receipt';
    if (headingEl) headingEl.textContent = 'Thermal ESC/POS Print';
    renderThermalReceipt(State.activePrintOrder);
  }

  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeThermalReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

function renderThermalReceipt(order) {
  const target = document.getElementById('thermalPrintTarget');
  if (!target) return;

  const o = order || State.storedOrders[0] || {
    orderNo: State.currentOrderNo,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    prodName: PRODUCTS[State.prodKey].name,
    gallons: State.qty,
    unitPrice: PRODUCTS[State.prodKey].price,
    total: calculateTotal(),
    status: State.channel === 'delivery' && State.deliveryPayMode === 'pending' ? 'pending' : 'paid',
    channel: State.channel,
    note: State.channel === 'delivery' ? State.deliveryAddress : State.note,
    tendered: State.selectedTender === 'exact' ? calculateTotal() : Number(State.selectedTender) || calculateTotal(),
    change: State.selectedTender === 'exact' ? 0 : Math.max(0, (Number(State.selectedTender) || calculateTotal()) - calculateTotal()),
    cashierName: (typeof getCurrentUser === 'function' ? getCurrentUser().name : 'Neil')
  };

  const isPending = o.status === 'pending';
  const tendered = typeof o.tendered === 'number' ? o.tendered : (isPending ? 0 : o.total);
  const change = typeof o.change === 'number' ? o.change : 0;
  const now = new Date(o.timestamp || Date.now());
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const headingText = isPending ? 'DELIVERY RECEIPT / INVOICE' : 'OFFICIAL SALES RECEIPT';
  const statusStamp = isPending ? 'PENDING PAYMENT' : 'PAID IN CASH';

  let carboyLine = '';
  if (o.carboysLoaned || o.carboysReturned) {
    carboyLine = `
      <div class="receipt-divider-dash"></div>
      <div class="receipt-meta-grid" style="font-size: 11px;">
        ${o.carboysLoaned ? `<div class="receipt-meta-row"><span>Blue Carboys Loaned:</span><span>+${o.carboysLoaned} jug(s)</span></div>` : ''}
        ${o.carboysReturned ? `<div class="receipt-meta-row"><span>Empty Jugs Returned:</span><span>-${o.carboysReturned} jug(s)</span></div>` : ''}
      </div>
    `;
  }

  let batchReceiptBlock = '';
  if (o.isBatchReconciled) {
    batchReceiptBlock = `
      <div class="receipt-divider-dash"></div>
      <div class="receipt-meta-grid" style="font-size: 11px;">
        <div class="receipt-meta-row" style="font-weight: 700; color: #0284c7;"><span>MULTICAB BATCH LOAD:</span><span>${o.batchLoaded} Gals Dispatched</span></div>
        <div class="receipt-meta-row"><span>Actual Sold (Orders Tab):</span><strong>${o.gallons} Gals</strong></div>
        <div class="receipt-meta-row"><span>Unsold / Returned:</span><span style="color: #d97706; font-weight: 700;">${o.gallonsReturned ?? (o.batchLoaded - o.gallons)} Gals Left</span></div>
      </div>
    `;
  }

  target.innerHTML = `
    <div class="receipt-center-header">
      <div class="receipt-store-title">R&amp;R WATER REFILLING</div>
      <div class="receipt-subline">PURE RO &amp; ALKALINE MINERAL WATER</div>
      <div class="receipt-subline">Purok 1, Main Road • Tel: 0917-829-4102</div>
      <div class="receipt-subline" style="margin-top: 4px; font-weight: 700;">${headingText}</div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div class="receipt-meta-grid">
      <div class="receipt-meta-row"><span>Order / Slip No:</span><strong>${escapeHtml(o.orderNo)}</strong></div>
      <div class="receipt-meta-row"><span>Date &amp; Time:</span><span>${dateStr} ${escapeHtml(o.time)}</span></div>
      <div class="receipt-meta-row"><span>Cashier:</span><span>${escapeHtml(o.cashierName || 'Neil')}</span></div>
      <div class="receipt-meta-row"><span>Channel:</span><span>${o.channel === 'delivery' ? 'Multicab Delivery' : 'Station Walk-in'}</span></div>
      ${o.note ? `<div class="receipt-meta-row"><span>Customer / Note:</span><span>${escapeHtml(o.note)}</span></div>` : ''}
    </div>

    <div class="receipt-divider-dash"></div>

    <table class="receipt-items-table">
      <thead>
        <tr>
          <th>Item / Gallons</th>
          <th class="col-right">Rate</th>
          <th class="col-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(o.prodName || '5-Gal Purified Refill')}<br><small>${Number(o.gallons || 1).toLocaleString()} gal @ ₱${formatPeso(o.unitPrice || 35)}</small></td>
          <td class="col-right">₱${formatPeso(o.unitPrice || 35)}</td>
          <td class="col-right">₱${formatPeso(o.total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="receipt-divider-double"></div>

    <div class="receipt-totals-box">
      <div class="receipt-total-large">
        <span>TOTAL DUE:</span>
        <span>₱ ${formatPeso(o.total)}</span>
      </div>
      <div class="receipt-meta-row" style="margin-top: 4px;">
        <span>Cash Tendered:</span>
        <span>₱ ${formatPeso(tendered)}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Change Due:</span>
        <span>₱ ${formatPeso(change)}</span>
      </div>
    </div>

    ${carboyLine}
    ${batchReceiptBlock}

    <div class="receipt-status-stamp">${statusStamp}</div>

    <div class="receipt-footer-text">
      <div>*** THANK YOU FOR YOUR PATRONAGE ***</div>
      <div>Clean, Healthy Hydration for the Family</div>
      <div style="margin-top: 4px; font-size: 9px; color: #6b7280;">Terminal #1 • Built for R&amp;R Water</div>
    </div>
  `;
}

function renderDispatchSlip(order) {
  const target = document.getElementById('thermalPrintTarget');
  if (!target) return;

  const o = order || State.storedOrders.find(ord => ord.channel === 'delivery') || State.storedOrders[0] || {
    orderNo: State.currentOrderNo,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    prodName: PRODUCTS[State.prodKey].name,
    gallons: State.qty,
    total: calculateTotal(),
    status: 'pending',
    channel: 'delivery',
    note: State.deliveryAddress || 'Multicab Route #1',
    cashierName: (typeof getCurrentUser === 'function' ? getCurrentUser().name : 'Neil')
  };

  const isPending = o.status === 'pending';
  const now = new Date(o.timestamp || Date.now());
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  target.innerHTML = `
    <div class="receipt-center-header">
      <div class="receipt-store-title">*** MULTICAB TRIP TICKET ***</div>
      <div class="receipt-subline">R&amp;R WATER DELIVERY DISPATCH</div>
      <div class="receipt-subline">Driver: Kuya Jun • Multicab Vehicle #1</div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div class="receipt-meta-grid">
      <div class="receipt-meta-row"><span>Trip Ticket:</span><strong>${escapeHtml(o.orderNo)}</strong></div>
      <div class="receipt-meta-row"><span>Dispatch Time:</span><span>${dateStr} ${escapeHtml(o.time)}</span></div>
      <div class="receipt-meta-row"><span>Destination:</span><strong style="font-size: 13px;">${escapeHtml(o.note || 'Purok Delivery Route')}</strong></div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div style="margin: 8px 0; font-size: 13px; font-weight: 800;">
      CARGO LOAD: ${Number(o.isBatchReconciled ? o.batchLoaded : (o.gallons || 1)).toLocaleString()} Sealed 5-Gal Blue Carboys
    </div>
    ${o.isBatchReconciled ? `
      <div style="background: #f0f9ff; border: 1px dashed #0284c7; padding: 6px; border-radius: 4px; margin: 6px 0; font-size: 11px;">
        <div style="font-weight: 700; color: #0284c7;">✓ BATCH TRIP RECONCILED:</div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
          <span>• Actual Sold (Orders Tab):</span>
          <strong>${o.gallons} Gallons</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px; color: #b45309;">
          <span>• Unsold Left (Returned):</span>
          <strong>${o.gallonsReturned ?? (o.batchLoaded - o.gallons)} Left</strong>
        </div>
      </div>
    ` : `
      <div style="font-size: 11px; color: #374151;">
        Empties to Retrieve: ${Number(o.gallons || 1).toLocaleString()} empty swapped jugs
      </div>
    `}

    <div class="receipt-divider-double"></div>

    <div class="receipt-totals-box">
      ${isPending ? `
        <div style="background: #fee2e2; border: 2px solid #ef4444; padding: 6px; text-align: center; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 800; color: #b91c1c;">DRIVER ACTION REQUIRED:</div>
          <div style="font-size: 17px; font-weight: 900; color: #b91c1c; margin-top: 2px;">COLLECT ₱ ${formatPeso(o.total)}</div>
          <div style="font-size: 10px; color: #7f1d1d; margin-top: 2px;">Remit payment to Cashier upon return</div>
        </div>
      ` : `
        <div style="background: #dcfce7; border: 2px solid #10b981; padding: 6px; text-align: center; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 800; color: #047857;">PRE-PAID AT COUNTER</div>
          <div style="font-size: 15px; font-weight: 900; color: #047857;">DO NOT COLLECT CASH</div>
        </div>
      `}
    </div>

    <div class="receipt-signature-line" style="margin-top: 24px;">
      Driver Departure Sign-off: ___________________________
    </div>
    <div class="receipt-signature-line" style="margin-top: 18px;">
      Customer Received Sign-off: ___________________________
    </div>

    <div class="receipt-footer-text" style="margin-top: 12px;">
      <div>R&amp;R Water Refilling Station • Multicab Trip Slip</div>
    </div>
  `;
}

function kickCashDrawer() {
  soundCtrl.playDrawerChime();
  showToast('⚡ [ESC/POS] Cash drawer solenoid pulse fired (Drawer opened)');
  logSecurityEvent(
    'CASH_DRAWER_KICK',
    'Triggered manual ESC/POS hardware cash drawer kick pulse',
    (typeof getCurrentUser === 'function' ? getCurrentUser().name : 'Neil')
  );
}

// ==========================================================================
// 16. CARBOY & EMPTIES LEDGER MODAL
// ==========================================================================
function initCarboyEmptiesModal() {
  const btnHeader = document.getElementById('btnHeaderEmpties');
  const btnCloseIcon = document.getElementById('btnCloseEmptiesModal');
  const btnCloseFooter = document.getElementById('btnEmptiesCloseFooter');
  const modal = document.getElementById('carboyEmptiesModal');
  const searchInput = document.getElementById('emptiesCustomerSearch');
  const btnAddCustomer = document.getElementById('btnQuickAddCustomer');

  if (btnHeader) {
    btnHeader.addEventListener('click', () => {
      soundCtrl.playTap();
      openEmptiesModal();
    });
  }

  if (btnCloseIcon) btnCloseIcon.addEventListener('click', closeEmptiesModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeEmptiesModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeEmptiesModal();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderEmptiesTable(e.target.value.toLowerCase().trim());
    });
  }

  if (btnAddCustomer) {
    btnAddCustomer.addEventListener('click', () => {
      quickAddCustomer();
    });
  }
}

function openEmptiesModal() {
  const modal = document.getElementById('carboyEmptiesModal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.classList.add('show');
  renderEmptiesTable();
}

function closeEmptiesModal() {
  const modal = document.getElementById('carboyEmptiesModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

function toggleEmptiesModal() {
  const modal = document.getElementById('carboyEmptiesModal');
  if (!modal) return;
  if (modal.style.display === 'flex' || modal.classList.contains('show')) {
    closeEmptiesModal();
  } else {
    openEmptiesModal();
  }
}

function renderEmptiesTable(filter = '') {
  const tbody = document.getElementById('emptiesTableBody');
  if (!tbody) return;

  const customers = State.customers || [];
  let filtered = customers;

  if (filter) {
    filtered = customers.filter(c => {
      const matchName = (c.name || '').toLowerCase().includes(filter);
      const matchContact = (c.contact || '').toLowerCase().includes(filter);
      const matchAddr = (c.address || '').toLowerCase().includes(filter);
      return matchName || matchContact || matchAddr;
    });
  }

  // Update KPIs
  let totalJugs = 0;
  let activeBorrowers = 0;
  let totalDeposits = 0;

  customers.forEach(c => {
    const held = Number(c.carboysHeld) || 0;
    totalJugs += held;
    if (held > 0) activeBorrowers++;
    totalDeposits += (Number(c.depositAmount) || (held * 200));
  });

  const kpiJugs = document.getElementById('kpiTotalCarboysOut');
  const kpiBorrowers = document.getElementById('kpiActiveBorrowers');
  const kpiDeposits = document.getElementById('kpiTotalDepositsHeld');

  if (kpiJugs) kpiJugs.textContent = totalJugs.toLocaleString();
  if (kpiBorrowers) kpiBorrowers.textContent = activeBorrowers.toLocaleString();
  if (kpiDeposits) kpiDeposits.textContent = `₱${formatPeso(totalDeposits)}`;

  updateCarboyHeaderBadge();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
          No customers found matching "${escapeHtml(filter)}". Tap "New Customer" to register one.
        </td>
      </tr>
    `;
    return;
  }

  let rows = '';
  filtered.forEach(c => {
    const held = Number(c.carboysHeld) || 0;
    const dep = Number(c.depositAmount) || (held * 200);

    rows += `
      <tr>
        <td>
          <strong style="font-size: 0.88rem; color: var(--text-main);">${escapeHtml(c.name)}</strong>
          ${c.contact ? `<div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(c.contact)}</div>` : ''}
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.address || '—')}</td>
        <td style="text-align: center;">
          <span class="order-id-badge" style="${held > 0 ? 'background: rgba(2, 132, 199, 0.15); color: #0284c7; font-size: 0.85rem;' : ''}">
            ${held} jugs
          </span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">₱${formatPeso(dep)}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button type="button" class="btn-loan-action return" data-custid="${c.id}" data-action="return" title="Customer returns 1 empty carboy">
              -1 Ret
            </button>
            <button type="button" class="btn-loan-action borrow" data-custid="${c.id}" data-action="borrow" title="Customer borrows 1 extra carboy">
              +1 Loan
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows;

  // Bind Quick Actions
  tbody.querySelectorAll('.btn-loan-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      soundCtrl.playTap();
      const id = btn.getAttribute('data-custid');
      const action = btn.getAttribute('data-action');
      const cust = State.customers.find(c => c.id === id);
      if (!cust) return;

      if (action === 'borrow') {
        cust.carboysHeld = (Number(cust.carboysHeld) || 0) + 1;
        cust.depositAmount = cust.carboysHeld * 200;
        showToast(`Loaned 1 carboy to ${cust.name}. Total held: ${cust.carboysHeld}`);
        fetch(`/api/customers/${encodeURIComponent(cust.id)}/empties`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanedDelta: 1, returnedDelta: 0, note: 'Quick loan via ledger' })
        }).catch(() => {});
      } else {
        if ((Number(cust.carboysHeld) || 0) > 0) {
          cust.carboysHeld = Number(cust.carboysHeld) - 1;
          cust.depositAmount = cust.carboysHeld * 200;
          showToast(`Returned 1 empty from ${cust.name}. Remaining held: ${cust.carboysHeld}`);
          fetch(`/api/customers/${encodeURIComponent(cust.id)}/empties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loanedDelta: 0, returnedDelta: 1, note: 'Quick return via ledger' })
          }).catch(() => {});
        } else {
          showToast(`${cust.name} currently holds 0 carboys.`);
        }
      }

      saveCustomers();
      renderEmptiesTable(filter);
    });
  });
}

function updateCarboyHeaderBadge() {
  const badge = document.getElementById('headerCarboyBadge');
  if (!badge) return;
  const customers = State.customers || [];
  const totalHeld = customers.reduce((acc, c) => acc + (Number(c.carboysHeld) || 0), 0);
  badge.textContent = totalHeld;
}

function quickAddCustomer() {
  soundCtrl.playTap();
  const name = prompt('Customer Full Name / Business:');
  if (!name || !name.trim()) return;

  const address = prompt('Delivery Address / Area (e.g. Purok 2):', 'Purok 1') || '';
  const contact = prompt('Contact Phone Number (optional):', '0917-') || '';

  const newCust = {
    id: 'cust_' + Date.now(),
    name: name.trim(),
    contact: contact.trim(),
    address: address.trim(),
    carboysHeld: 0,
    depositAmount: 0
  };

  State.customers.push(newCust);
  saveCustomers();
  renderEmptiesTable();
  showToast(`Added customer: ${newCust.name}!`);

  // Sync to SQLite backend
  fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCust)
  }).catch(() => {});
}

// ==========================================================================
// 17. BACKEND SQLITE & OFFLINE REST SYNCHRONIZATION
// ==========================================================================
function syncWithBackend() {
  if (!navigator.onLine) return;

  // 1. Fetch server status and inventory
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        if (typeof data.carboysOnLoan === 'number') {
          const badge = document.getElementById('headerCarboyBadge');
          if (badge) badge.textContent = data.carboysOnLoan;
        }
      }
    })
    .catch(() => {});

  // 2. Fetch customer registry
  fetch('/api/customers')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        State.customers = data;
        saveCustomers();
        updateCarboyHeaderBadge();
        const emptiesModal = document.getElementById('carboyEmptiesModal');
        if (emptiesModal && emptiesModal.style.display === 'flex') {
          renderEmptiesTable();
        }
      }
    })
    .catch(() => {});

  // 3. Sync offline orders
  if (State.storedOrders && State.storedOrders.length > 0) {
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: State.storedOrders })
    }).catch(() => {});
  }
}

function postOrderToBackend(order) {
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order)
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.order) {
        // Backend successfully persisted order and updated inventory
      }
    })
    .catch(err => {
      console.warn('Backend SQLite sync queued in offline mode:', err);
    });
}

// ==========================================================================
// 18. KEYBOARD SHORTCUTS (POS Hardware Friendly)
// ==========================================================================
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // If typing in input, ignore function keys except escape
    if (e.target.matches('input') && e.key !== 'Escape') return;

    if (e.key === 'F1') {
      e.preventDefault();
      const bWalk = document.getElementById('btnChannelWalkin');
      if (bWalk) bWalk.click();
    } else if (e.key === 'F2') {
      e.preventDefault();
      const bDel = document.getElementById('btnChannelDelivery');
      if (bDel) bDel.click();
    } else if (e.key === 'F4') {
      e.preventDefault();
      const bClear = document.getElementById('btnBottomClear');
      if (bClear) bClear.click();
    } else if (e.key === 'F8') {
      e.preventDefault();
      toggleEmptiesModal();
    } else if (e.key === 'F9') {
      e.preventDefault();
      openThermalReceiptModal(State.storedOrders[0] || null);
    } else if (e.key === 'Escape') {
      closeThermalReceiptModal();
      closeEmptiesModal();
      closeConfirmModal();
    }
  });
}

// ==========================================================================
// 19. PROGRESSIVE WEB APP & OFFLINE-FIRST SERVICE WORKER
// ==========================================================================
function initOfflinePWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          // PWA service worker registered
        })
        .catch(err => {
          console.warn('ServiceWorker registration error:', err);
        });
    });
  }

  window.addEventListener('online', () => {
    showToast('🟢 Online: Connected to Station Backend Database');
    syncWithBackend();
  });

  window.addEventListener('offline', () => {
    showToast('🟠 Offline: Operating in Offline-First Local Mode');
  });
}

// ==========================================================================
// 20. PROFILE TAB, ACTIVE SHIFT PERFORMANCE & SECURITY CONTROLLER
// ==========================================================================
let profileActiveFilter = 'all';

function renderProfileView() {
  const user = getCurrentUser();
  if (!user) return;

  // 1. Hero Operator Elements
  const heroAvatar = document.getElementById('profileHeroAvatar');
  if (heroAvatar) {
    heroAvatar.textContent = user.name.charAt(0).toUpperCase();
    heroAvatar.style.background = user.avatarColor || 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
  }

  const opName = document.getElementById('profileOperatorName');
  if (opName) opName.textContent = user.name;

  const roleBadge = document.getElementById('profileRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = user.role.toUpperCase();
    roleBadge.className = `cashier-role-badge role-${user.role}`;
  }

  const staffIdEl = document.getElementById('profileStaffId');
  if (staffIdEl) staffIdEl.textContent = `Staff ID: ${(user.id || 'usr_1').toUpperCase().replace('_', '-')}`;

  const statusText = document.getElementById('profileShiftStatusText');
  if (statusText) statusText.textContent = `On Duty • Counter #1`;

  if (!State.sessionStartTime) {
    State.sessionStartTime = Date.now();
  }

  const clockInEl = document.getElementById('profileClockInTime');
  if (clockInEl) {
    const d = new Date(State.sessionStartTime);
    const timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    clockInEl.textContent = `Shift Start: Today ${timeFormatted}`;
  }

  const durationEl = document.getElementById('profileShiftDuration');
  if (durationEl) {
    const elapsedMs = Math.max(0, Date.now() - State.sessionStartTime);
    const hrs = Math.floor(elapsedMs / 3600000);
    const mins = Math.floor((elapsedMs % 3600000) / 60000);
    durationEl.textContent = `Shift Active: ${hrs}h ${mins}m`;
  }

  // 2. Performance Metrics
  const allOrders = State.storedOrders || [];
  // Attribute orders to active user (fallback to all orders if only single user in system)
  const userOrders = allOrders.filter(o => !o.cashierName || o.cashierName === user.name);
  const paidOrders = userOrders.filter(o => o.status === 'paid');
  const pendingOrders = userOrders.filter(o => o.status === 'pending');

  const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalGallons = userOrders.reduce((sum, o) => sum + (o.qty || 0), 0);
  const orderCount = userOrders.length;
  const avgTicket = paidOrders.length > 0 ? (totalRevenue / paidOrders.length) : 0;
  const cashHandled = paidOrders.reduce((sum, o) => sum + (o.tendered ? Math.min(o.tendered, o.total) : o.total), 0);
  const changeGiven = paidOrders.reduce((sum, o) => sum + (o.change || 0), 0);
  const carboysLoaned = userOrders.reduce((sum, o) => sum + (o.carboysLoaned || 0), 0);
  const carboysReturned = userOrders.reduce((sum, o) => sum + (o.carboysReturned || 0), 0);
  const deliveryCount = userOrders.filter(o => o.channel === 'delivery').length;
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + (o.unpaidAmount || o.total || 0), 0);

  // Update Hero Stats
  const heroSales = document.getElementById('profileHeroTotalSales');
  if (heroSales) heroSales.textContent = `₱ ${formatPeso(totalRevenue)}`;

  const heroCount = document.getElementById('profileHeroOrderCount');
  if (heroCount) heroCount.textContent = `${orderCount} transactions completed`;

  // Update KPIs
  const kpiRev = document.getElementById('kpiProfileShiftRevenue');
  if (kpiRev) kpiRev.textContent = `₱ ${formatPeso(totalRevenue)}`;

  const kpiGals = document.getElementById('kpiProfileGallons');
  if (kpiGals) kpiGals.textContent = `${totalGallons} Gals`;

  const kpiCarboysFilled = document.getElementById('kpiProfileCarboysFilled');
  if (kpiCarboysFilled) kpiCarboysFilled.textContent = `${totalGallons} Carboys`;

  const kpiOrders = document.getElementById('kpiProfileOrderCount');
  if (kpiOrders) kpiOrders.textContent = `${orderCount} Orders`;

  const kpiAvg = document.getElementById('kpiProfileAvgTicket');
  if (kpiAvg) kpiAvg.textContent = `₱ ${formatPeso(avgTicket)} / order`;

  const kpiCash = document.getElementById('kpiProfileCashHandled');
  if (kpiCash) kpiCash.textContent = `₱ ${formatPeso(cashHandled)}`;

  const kpiChange = document.getElementById('kpiProfileChangeGiven');
  if (kpiChange) kpiChange.textContent = `₱ ${formatPeso(changeGiven)} change`;

  const kpiCarboys = document.getElementById('kpiProfileCarboyFlow');
  if (kpiCarboys) kpiCarboys.textContent = `${carboysLoaned} Loan / ${carboysReturned} Ret`;

  const kpiCarboyNet = document.getElementById('kpiProfileCarboyNet');
  if (kpiCarboyNet) {
    const net = carboysLoaned - carboysReturned;
    kpiCarboyNet.textContent = `${net >= 0 ? '+' : ''}${net} Net Diff`;
  }

  const kpiDeliv = document.getElementById('kpiProfileDeliveries');
  if (kpiDeliv) kpiDeliv.textContent = `${deliveryCount} Trips`;

  const kpiPending = document.getElementById('kpiProfilePendingReceivables');
  if (kpiPending) kpiPending.textContent = `₱ ${formatPeso(pendingAmount)} Pending`;

  // Activity subtext
  const actSub = document.getElementById('profileActivitySub');
  if (actSub) actSub.textContent = `Orders processed by ${user.name} during this active session`;

  // 3. Render Orders Table
  renderProfileOrdersTable(profileActiveFilter, userOrders);

  // 4. Quick Preferences
  const soundToggle = document.getElementById('profilePrefSoundToggle');
  if (soundToggle) soundToggle.checked = soundCtrl.isEnabled();

  const autoPrintToggle = document.getElementById('profilePrefAutoPrint');
  if (autoPrintToggle && State.settings) autoPrintToggle.checked = Boolean(State.settings.autoPrint);

  const themeLabel = document.getElementById('profileThemeStatusLabel');
  if (themeLabel) {
    themeLabel.textContent = document.body.classList.contains('light-mode') ? 'Switch to Dark' : 'Switch to Light';
  }
}

function renderProfileOrdersTable(filter = 'all', sourceOrders = null) {
  const tbody = document.getElementById('profileOrdersTbody');
  const emptyBox = document.getElementById('profileEmptyOrders');
  if (!tbody) return;

  const user = getCurrentUser();
  const allOrders = sourceOrders || (State.storedOrders || []).filter(o => !o.cashierName || o.cashierName === user.name);

  let filtered = allOrders;
  if (filter === 'walkin') {
    filtered = allOrders.filter(o => o.channel === 'walkin');
  } else if (filter === 'delivery') {
    filtered = allOrders.filter(o => o.channel === 'delivery');
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'flex';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  tbody.innerHTML = filtered.slice(0, 20).map(o => {
    const isDelivery = o.channel === 'delivery';
    const channelBadge = isDelivery
      ? `<span class="profile-channel-badge delivery">Multicab</span>`
      : `<span class="profile-channel-badge walkin">Walk-in</span>`;
    const statusBadge = `<span class="profile-status-tag ${o.status || 'paid'}">${(o.status || 'paid').toUpperCase()}</span>`;
    const itemName = o.prodName || (PRODUCTS[o.prodKey] ? PRODUCTS[o.prodKey].name : 'Purified Refill');

    return `
      <tr>
        <td class="profile-order-no">#${escapeHtml(o.orderNo || '')}</td>
        <td>${escapeHtml(o.time || '--:--')}</td>
        <td>${channelBadge}</td>
        <td><strong>${o.qty || 1} Gals</strong> <span style="font-size: 0.72rem; color: var(--text-muted);">(${escapeHtml(itemName)})</span></td>
        <td class="profile-order-total">₱ ${formatPeso(o.total || 0)}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="btn-profile-reprint" data-orderno="${escapeHtml(o.orderNo || '')}" title="Reprint Receipt (ESC/POS)">
            <svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            <span>Receipt</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-profile-reprint').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderNo = btn.getAttribute('data-orderno');
      const order = State.storedOrders.find(o => String(o.orderNo) === String(orderNo));
      if (order) {
        openThermalReceiptModal(order, order.channel === 'delivery' && order.status === 'pending');
      }
    });
  });
}

function bindProfileEvents() {
  // Breadcrumb home return
  const homeBtn = document.getElementById('profileBreadcrumbHome');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => switchView('pos'));
  }

  // Top header action buttons
  const btnXReport = document.getElementById('btnProfilePrintXReport');
  if (btnXReport) {
    btnXReport.addEventListener('click', printProfileShiftXReport);
  }

  const btnEndShiftPrint = document.getElementById('btnProfileEndShiftPrint');
  if (btnEndShiftPrint) {
    btnEndShiftPrint.addEventListener('click', printProfileShiftXReport);
  }

  const btnSwitchStaff = document.getElementById('btnProfileSwitchStaff');
  if (btnSwitchStaff) {
    btnSwitchStaff.addEventListener('click', () => openSwitchUserModal());
  }

  const btnLockTerm = document.getElementById('btnProfileLockTerminal');
  if (btnLockTerm) {
    btnLockTerm.addEventListener('click', () => lockTerminal());
  }

  const btnEndShiftSignOut = document.getElementById('btnProfileEndShiftSignOut');
  if (btnEndShiftSignOut) {
    btnEndShiftSignOut.addEventListener('click', () => {
      soundCtrl.playTap();
      const user = getCurrentUser();
      if (confirm(`Close active shift for ${user.name} and return to cashier sign in?`)) {
        lockTerminal();
        openSwitchUserModal();
      }
    });
  }

  // Activity table filters
  const filters = [
    { id: 'profileFilterAll', key: 'all' },
    { id: 'profileFilterWalkin', key: 'walkin' },
    { id: 'profileFilterDelivery', key: 'delivery' }
  ];

  filters.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        soundCtrl.playTap();
        profileActiveFilter = key;
        filters.forEach(f => {
          const btn = document.getElementById(f.id);
          if (btn) btn.classList.toggle('active', f.key === key);
        });
        renderProfileOrdersTable(key);
      });
    }
  });

  // Change PIN Form
  const btnSavePin = document.getElementById('btnProfileSavePin');
  if (btnSavePin) {
    btnSavePin.addEventListener('click', handleProfileChangePin);
  }

  // Quick Preferences
  const soundToggle = document.getElementById('profilePrefSoundToggle');
  if (soundToggle) {
    soundToggle.addEventListener('change', () => {
      soundCtrl.toggle();
      showToast(`Station audio ${soundCtrl.isEnabled() ? 'enabled' : 'muted'}.`);
    });
  }

  const autoPrintToggle = document.getElementById('profilePrefAutoPrint');
  if (autoPrintToggle) {
    autoPrintToggle.addEventListener('change', () => {
      if (!State.settings) State.settings = {};
      State.settings.autoPrint = autoPrintToggle.checked;
      saveSettings();
      showToast(`Thermal receipt auto-print ${State.settings.autoPrint ? 'enabled' : 'disabled'}.`);
    });
  }

  const btnToggleTheme = document.getElementById('btnProfileToggleTheme');
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const themeBtn = document.getElementById('themeToggleBtn');
      if (themeBtn) themeBtn.click();
      const themeLabel = document.getElementById('profileThemeStatusLabel');
      if (themeLabel) {
        themeLabel.textContent = document.body.classList.contains('light-mode') ? 'Switch to Dark' : 'Switch to Light';
      }
    });
  }
}

function handleProfileChangePin() {
  const currentPinInput = document.getElementById('profileInputCurrentPin');
  const newPinInput = document.getElementById('profileInputNewPin');
  const confirmPinInput = document.getElementById('profileInputConfirmPin');
  const feedback = document.getElementById('profilePinFeedback');

  if (!currentPinInput || !newPinInput || !confirmPinInput || !feedback) return;

  const currentPin = currentPinInput.value.trim();
  const newPin = newPinInput.value.trim();
  const confirmPin = confirmPinInput.value.trim();

  const user = getCurrentUser();

  if (currentPin !== user.pin) {
    soundCtrl.playVoidTone();
    feedback.className = 'profile-pin-feedback error';
    feedback.textContent = 'Current PIN is incorrect.';
    currentPinInput.focus();
    return;
  }

  if (!/^\d{4}$/.test(newPin)) {
    soundCtrl.playVoidTone();
    feedback.className = 'profile-pin-feedback error';
    feedback.textContent = 'New PIN must be exactly 4 digits (0-9).';
    newPinInput.focus();
    return;
  }

  if (newPin !== confirmPin) {
    soundCtrl.playVoidTone();
    feedback.className = 'profile-pin-feedback error';
    feedback.textContent = 'New PIN and confirmation do not match.';
    confirmPinInput.focus();
    return;
  }

  // Update PIN
  user.pin = newPin;
  saveStaff();
  soundCtrl.playSuccessTone();

  feedback.className = 'profile-pin-feedback success';
  feedback.textContent = 'PIN updated successfully!';
  showToast(`✓ Cashier PIN updated for ${user.name}.`);

  logSecurityEvent('PIN_CHANGE', `Operator ${user.name} updated security PIN`, user.name);

  currentPinInput.value = '';
  newPinInput.value = '';
  confirmPinInput.value = '';

  setTimeout(() => {
    if (feedback) feedback.textContent = '';
  }, 4000);
}

function printProfileShiftXReport() {
  soundCtrl.playTap();
  openThermalReceiptModal(null, 'shift_summary');
}

function renderShiftSummaryReceipt(currentUser) {
  const target = document.getElementById('thermalPrintTarget');
  if (!target) return;

  const user = currentUser || getCurrentUser();
  const allOrders = State.storedOrders || [];
  const userOrders = allOrders.filter(o => !o.cashierName || o.cashierName === user.name);
  const paidOrders = userOrders.filter(o => o.status === 'paid');
  const pendingOrders = userOrders.filter(o => o.status === 'pending');

  const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalGallons = userOrders.reduce((sum, o) => sum + (o.qty || 0), 0);
  const cashHandled = paidOrders.reduce((sum, o) => sum + (o.tendered ? Math.min(o.tendered, o.total) : o.total), 0);
  const changeGiven = paidOrders.reduce((sum, o) => sum + (o.change || 0), 0);
  const carboysLoaned = userOrders.reduce((sum, o) => sum + (o.carboysLoaned || 0), 0);
  const carboysReturned = userOrders.reduce((sum, o) => sum + (o.carboysReturned || 0), 0);
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + (o.unpaidAmount || o.total || 0), 0);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const diffMs = Math.max(0, Date.now() - (State.sessionStartTime || Date.now()));
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  target.innerHTML = `
    <div class="receipt-center-header">
      <div class="receipt-brand-title">R&amp;R WATER REFILLING STATION</div>
      <div class="receipt-sub-addr">Purified • Alkaline • Mineral Drinking Water</div>
      <div class="receipt-sub-addr">Station Terminal #1 • Main Counter</div>
      <div class="receipt-divider-double"></div>
      <div class="receipt-slip-title" style="letter-spacing: 0.08em; font-size: 13px; font-weight: 900;">
        CASHIER SHIFT X-REPORT
      </div>
      <div class="receipt-order-stamp" style="font-size: 11px; margin-top: 4px;">
        OFFICIAL SHIFT SUMMARY
      </div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div class="receipt-meta-grid">
      <div class="receipt-meta-row">
        <span>Report Date:</span>
        <span>${escapeHtml(dateStr)}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Print Time:</span>
        <span>${escapeHtml(timeStr)}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Operator:</span>
        <span><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.role.toUpperCase())})</span>
      </div>
      <div class="receipt-meta-row">
        <span>Staff ID:</span>
        <span>${escapeHtml((user.id || 'usr_1').toUpperCase().replace('_', '-'))}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Shift Duration:</span>
        <span>${hrs}h ${mins}m active</span>
      </div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div style="font-size: 11px; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
      ACTIVITY SUMMARY
    </div>
    <div class="receipt-meta-grid" style="font-size: 11px;">
      <div class="receipt-meta-row">
        <span>Total Transactions:</span>
        <span>${userOrders.length} orders</span>
      </div>
      <div class="receipt-meta-row">
        <span>Walk-in Refills:</span>
        <span>${userOrders.filter(o => o.channel === 'walkin').length} orders</span>
      </div>
      <div class="receipt-meta-row">
        <span>Multicab Deliveries:</span>
        <span>${userOrders.filter(o => o.channel === 'delivery').length} trips</span>
      </div>
      <div class="receipt-meta-row">
        <span>Total Gallons Dispensed:</span>
        <span>${totalGallons} Gals</span>
      </div>
    </div>

    <div class="receipt-divider-dash"></div>

    <div style="font-size: 11px; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
      CASH &amp; FINANCIAL TOTALS
    </div>
    <div class="receipt-meta-grid" style="font-size: 11px;">
      <div class="receipt-meta-row">
        <span>Paid Sales Revenue:</span>
        <span>₱ ${formatPeso(totalSales)}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Cash Tender Received:</span>
        <span>₱ ${formatPeso(cashHandled)}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Total Change Disbursed:</span>
        <span>-₱ ${formatPeso(changeGiven)}</span>
      </div>
      <div class="receipt-meta-row" style="font-weight: 800; border-top: 1px dashed #000; padding-top: 3px;">
        <span>NET CASH IN DRAWER:</span>
        <span>₱ ${formatPeso(Math.max(0, cashHandled - changeGiven))}</span>
      </div>
      ${pendingAmount > 0 ? `
      <div class="receipt-meta-row" style="color: #b91c1c;">
        <span>Pending Receivables:</span>
        <span>₱ ${formatPeso(pendingAmount)}</span>
      </div>
      ` : ''}
    </div>

    <div class="receipt-divider-dash"></div>

    <div style="font-size: 11px; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
      CARBOY EMPTIES MOVEMENT
    </div>
    <div class="receipt-meta-grid" style="font-size: 11px;">
      <div class="receipt-meta-row">
        <span>Blue Carboys Loaned:</span>
        <span>+${carboysLoaned} jugs</span>
      </div>
      <div class="receipt-meta-row">
        <span>Empty Jugs Returned:</span>
        <span>-${carboysReturned} jugs</span>
      </div>
      <div class="receipt-meta-row">
        <span>Net Empties Balance:</span>
        <span>${carboysLoaned - carboysReturned}</span>
      </div>
    </div>

    <div class="receipt-signature-line" style="margin-top: 24px;">
      Operator Shift Sign-off: ___________________________
    </div>
    <div class="receipt-signature-line" style="margin-top: 18px;">
      Manager / Verifier Sign-off: ___________________________
    </div>

    <div class="receipt-footer-text" style="margin-top: 14px;">
      <div>End of Cashier Shift X-Report • Keep for station audit</div>
      <div>*** R&amp;R WATER POS SYSTEM ***</div>
    </div>
  `;
}

/* ==========================================================================
   STATION LIVE SUMMARY SIDE DRAWER & FLOATING MINITAB LOGIC
   ========================================================================== */
function toggleStationSummaryDrawer(forceOpen) {
  const drawer = document.getElementById('stationSummaryDrawer');
  const overlay = document.getElementById('stationSummaryOverlay');
  if (!drawer || !overlay) return;

  const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');

  if (isOpen) {
    soundCtrl.playTap();
    updateStationSummaryDrawer();
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
  } else {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function updateStationSummaryDrawer() {
  const allOrders = State.storedOrders || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter orders for today
  let todaySales = 0;
  let todayGallons = 0;
  let cashInDrawer = 0;
  let uncollected = 0;
  let todayOrdersCount = 0;
  let paidOrdersCount = 0;
  let pendingDelivCount = 0;
  const pendingDelivRoutes = [];

  allOrders.forEach(o => {
    // Check if order belongs to today or is part of current active shift
    const orderDate = o.timestamp ? new Date(o.timestamp).toISOString().slice(0, 10) : todayStr;
    const isToday = orderDate === todayStr;

    if (isToday) {
      todayOrdersCount++;
      const gals = Number(o.gallons) || 1;
      todayGallons += gals;

      const isPaid = o.status === 'paid';
      const paidAmt = typeof o.paidAmount === 'number' ? o.paidAmount : (isPaid ? (Number(o.total) || 0) : 0);
      const unpaidAmt = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (!isPaid ? (Number(o.total) || 0) : 0);

      todaySales += paidAmt;
      uncollected += unpaidAmt;

      if (isPaid) {
        paidOrdersCount++;
        if (o.paymentMethod === 'cash' || !o.paymentMethod) {
          cashInDrawer += paidAmt;
        }
      }
    }

    // Pending delivery check across field
    if (o.channel === 'delivery' && o.status === 'pending') {
      pendingDelivCount++;
      if (o.address && pendingDelivRoutes.length < 2) {
        pendingDelivRoutes.push(o.address.split(',')[0].trim());
      }
    }
  });

  const settlementRate = todayOrdersCount > 0 ? Math.round((paidOrdersCount / todayOrdersCount) * 100) : 100;

  // DOM Updates - Sales
  const elSales = document.getElementById('drawerShiftSales');
  const elOrdersCount = document.getElementById('drawerShiftOrdersCount');
  const elGallons = document.getElementById('drawerShiftGallons');
  const elCash = document.getElementById('drawerShiftCash');
  const elUncollected = document.getElementById('drawerShiftUncollected');
  const elPaidPct = document.getElementById('drawerShiftPaidPct');

  if (elSales) elSales.textContent = formatPeso(todaySales);
  if (elOrdersCount) elOrdersCount.textContent = `${todayOrdersCount} order${todayOrdersCount === 1 ? '' : 's'} processed today`;
  if (elGallons) elGallons.textContent = `${todayGallons.toLocaleString()} Gals`;
  if (elCash) elCash.textContent = formatPeso(cashInDrawer);
  if (elUncollected) elUncollected.textContent = formatPeso(uncollected);
  if (elPaidPct) elPaidPct.textContent = `${settlementRate}%`;

  // DOM Updates - Active Personnel
  const cashierName = State.currentUser && State.currentUser.name ? State.currentUser.name : 'Neil';
  const cashierRole = State.currentUser && State.currentUser.role ? State.currentUser.role : 'Manager';
  const elCashierName = document.getElementById('drawerCashierName');
  const elCashierAvatar = document.getElementById('drawerAvatarChar');
  const elCashierStatus = document.getElementById('drawerCashierStatus');

  if (elCashierName) elCashierName.textContent = cashierName;
  if (elCashierAvatar) elCashierAvatar.textContent = cashierName.charAt(0).toUpperCase();
  if (elCashierStatus) {
    elCashierStatus.textContent = `● On Duty • Counter #1 (${cashierRole})`;
  }

  // DOM Updates - Delivery Drivers
  const elDriver1Status = document.getElementById('drawerDriver1Status');
  const elDriver2Status = document.getElementById('drawerDriver2Status');

  if (elDriver1Status) {
    if (pendingDelivCount > 0) {
      const routeText = pendingDelivRoutes.length > 0 ? ` (${pendingDelivRoutes.join(', ')})` : '';
      elDriver1Status.textContent = `● En Route • ${pendingDelivCount} delivery drop${pendingDelivCount === 1 ? '' : 's'} pending${routeText}`;
      elDriver1Status.className = 'person-sub-status en-route';
    } else {
      elDriver1Status.textContent = '● Available at Station • Ready for dispatch';
      elDriver1Status.className = 'person-sub-status ready';
    }
  }

  if (elDriver2Status) {
    elDriver2Status.textContent = '● Available at Station • Multicab #2 Standby';
    elDriver2Status.className = 'person-sub-status ready';
  }
}

function initStationSummaryDrawer() {
  const btnNotif = document.getElementById('btnNotifications');
  const btnHeaderPill = document.getElementById('btnHeaderSummaryPill');
  const floatingTab = document.getElementById('floatingSideMinitab');
  const btnClose = document.getElementById('btnSummaryDrawerClose');
  const overlay = document.getElementById('stationSummaryOverlay');

  const handleOpen = (e) => {
    if (e) e.stopPropagation();
    toggleStationSummaryDrawer();
  };

  if (btnNotif) {
    btnNotif.addEventListener('click', handleOpen);
  }

  if (btnHeaderPill) {
    btnHeaderPill.addEventListener('click', handleOpen);
  }

  if (floatingTab) {
    floatingTab.addEventListener('click', handleOpen);
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleStationSummaryDrawer(false);
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      toggleStationSummaryDrawer(false);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('stationSummaryDrawer');
      if (drawer && drawer.classList.contains('open')) {
        toggleStationSummaryDrawer(false);
      }
    }
  });

  // Function shortcuts in drawer
  const bindShortcut = (id, action) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        soundCtrl.playTap();
        toggleStationSummaryDrawer(false);
        action();
      });
    }
  };

  bindShortcut('shortcutNavPos', () => {
    switchView('pos');
    const bWalk = document.getElementById('btnChannelWalkin');
    if (bWalk) bWalk.click();
  });

  bindShortcut('shortcutNavDelivery', () => {
    switchView('pos');
    const bDel = document.getElementById('btnChannelDelivery');
    if (bDel) bDel.click();
  });

  bindShortcut('shortcutNavOrders', () => {
    switchView('orders');
  });

  bindShortcut('shortcutNavDeepDive', () => {
    switchView('reports');
    toggleDeepDiveReport(true);
  });

  bindShortcut('shortcutNavEmpties', () => {
    openCarboyEmptiesModal();
  });

  bindShortcut('shortcutNavProfile', () => {
    switchView('profile');
  });

  const btnSync = document.getElementById('btnDrawerRefreshSync');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      soundCtrl.playTap();
      syncWithBackend();
      updateStationSummaryDrawer();
      showToast('Station synced with SQLite database!');
    });
  }

  const btnOpenReport = document.getElementById('btnDrawerOpenReport');
  if (btnOpenReport) {
    btnOpenReport.addEventListener('click', () => {
      soundCtrl.playTap();
      toggleStationSummaryDrawer(false);
      switchView('reports');
    });
  }
}



// ==========================================================================
// SUPABASE CLOUD DATABASE CONTROLLER (Real-time Cloud Sync)
// ==========================================================================
const SupabaseSync = {
  client: null,
  isConfigured: false,
  isConnected: false,
  realtimeChannel: null,

  init() {
    // 1-Time Setup Priority: If station credentials are configured in supabase_config.js,
    // all devices (phones, tablets, laptops) connect automatically on first visit without any typing!
    let url = (window.ENV_SUPABASE_URL && window.ENV_SUPABASE_URL.trim() && !window.ENV_SUPABASE_URL.includes('YOUR_PROJECT_ID'))
      ? window.ENV_SUPABASE_URL.trim()
      : (localStorage.getItem('rr_supabase_url') || '');

    let key = (window.ENV_SUPABASE_KEY && window.ENV_SUPABASE_KEY.trim() && !window.ENV_SUPABASE_KEY.includes('YOUR_ANON_KEY'))
      ? window.ENV_SUPABASE_KEY.trim()
      : (localStorage.getItem('rr_supabase_key') || '');

    if (url && key) {
      localStorage.setItem('rr_supabase_url', url);
      localStorage.setItem('rr_supabase_key', key);
    }
    
    // Fill settings inputs if present
    const elUrl = document.getElementById('settingSupabaseUrl');
    const elKey = document.getElementById('settingSupabaseKey');
    if (elUrl && url) elUrl.value = url;
    if (elKey && key) elKey.value = key;

    if (url && key) {
      this.connect(url, key, false);
    } else {
      // Check server API config if running on local Node server
      fetch('/api/config/supabase')
        .then(res => res.json())
        .then(data => {
          if (data && data.configured && data.url && data.anonKey) {
            localStorage.setItem('rr_supabase_url', data.url);
            localStorage.setItem('rr_supabase_key', data.anonKey);
            if (elUrl) elUrl.value = data.url;
            if (elKey) elKey.value = data.anonKey;
            this.connect(data.url, data.anonKey, false);
          } else {
            this.updateUI();
          }
        })
        .catch(() => {
          this.updateUI();
        });
    }

    this.bindEvents();
  },

  bindEvents() {
    const btnConnect = document.getElementById('btnConnectSupabase');
    if (btnConnect) {
      btnConnect.onclick = () => {
        const url = (document.getElementById('settingSupabaseUrl')?.value || '').trim();
        const key = (document.getElementById('settingSupabaseKey')?.value || '').trim();
        if (!url || !key) {
          showToast('Please enter both Supabase Project URL and Anon Key');
          return;
        }
        localStorage.setItem('rr_supabase_url', url);
        localStorage.setItem('rr_supabase_key', key);
        this.connect(url, key, true);
      };
    }

    const btnToggle = document.getElementById('btnToggleSupabaseKey');
    if (btnToggle) {
      btnToggle.onclick = () => {
        const elKey = document.getElementById('settingSupabaseKey');
        if (elKey) {
          elKey.type = elKey.type === 'password' ? 'text' : 'password';
        }
      };
    }

    const btnSyncNow = document.getElementById('btnSyncSupabaseNow');
    if (btnSyncNow) {
      btnSyncNow.onclick = async () => {
        if (!this.client || !this.isConnected) {
          showToast('Please connect to Supabase first');
          return;
        }
        btnSyncNow.disabled = true;
        btnSyncNow.innerHTML = '<span>Syncing...</span>';
        const ok = await this.syncAllOfflineData();
        btnSyncNow.disabled = false;
        btnSyncNow.innerHTML = '<svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg><span>Upload &amp; Sync Local Data</span>';
        if (ok) {
          showToast('Supabase cloud sync completed successfully!');
        } else {
          showToast('Supabase sync had warnings. Check connection.');
        }
      };
    }
  },

  async connect(url, key, showToasts = false) {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      this.isConnected = false;
      this.updateUI();
      if (showToasts) showToast('Supabase client library is still loading...');
      return;
    }

    try {
      this.client = window.supabase.createClient(url, key);
      this.isConfigured = true;

      // Test connection with a lightweight count query
      const { data, error } = await this.client.from('orders').select('order_no', { count: 'exact', head: true });
      if (error) {
        if (error.code === 'PGRST205') {
          // Connected, but tables not yet created in Supabase SQL editor
          this.isConnected = true;
          this.needsSchema = true;
          this.updateUI();
          if (showToasts) showToast('Supabase connected! Run supabase_schema.sql in Supabase SQL Editor to finish table setup.');
          return;
        } else if (error.code !== 'PGRST116') {
          this.isConnected = false;
          this.updateUI();
          if (showToasts) showToast('Supabase connection failed: ' + (error.message || 'Check URL/Key'));
          return;
        }
      }

      this.isConnected = true;
      this.needsSchema = false;
      this.updateUI();
      this.setupRealtime();
      this.pullAll();
      if (showToasts) showToast('Connected to Supabase! Real-time cloud sync is active.');
    } catch (err) {
      this.isConnected = false;
      this.updateUI();
      if (showToasts) showToast('Connection error: ' + err.message);
    }
  },

  updateUI() {
    const badge = document.getElementById('supabaseStatusBadge');
    const desc = document.getElementById('supabaseStatusDesc');
    if (!badge || !desc) return;

    if (this.isConnected && this.needsSchema) {
      badge.className = 'meta-badge active-live';
      badge.innerHTML = '<span class="pulse-indicator"></span> Connected (Tables Pending Setup)';
      desc.textContent = 'Connected to your Supabase project! Run supabase_schema.sql in Supabase SQL Editor to finish table setup.';
    } else if (this.isConnected) {
      badge.className = 'meta-badge active-live';
      badge.innerHTML = '<span class="pulse-indicator"></span> Connected (Live Realtime)';
      desc.textContent = 'Cloud database connected. Changes sync automatically across all devices.';
    } else if (this.isConfigured) {
      badge.className = 'meta-badge disconnected';
      badge.innerHTML = '<span class="dot-disconnected">✕</span> Connection Error';
      desc.textContent = 'Configured, but unable to reach Supabase. Operating in offline-safe mode.';
    } else {
      badge.className = 'meta-badge disconnected';
      badge.innerHTML = '<span class="dot-disconnected">○</span> Disconnected';
      desc.textContent = 'Cloud database credentials not configured. Data is stored locally on this device.';
    }
  },

  async pushOrder(order) {
    if (!this.client || !this.isConnected) return;
    try {
      const row = {
        id: order.id || ('ord_' + Date.now()),
        order_no: order.orderNo,
        timestamp: Number(order.timestamp) || Date.now(),
        date_str: order.dateStr || '',
        channel: order.channel || 'walkin',
        prod_key: order.items && order.items[0] && order.items[0].name ? order.items[0].name.toLowerCase() : 'refill',
        prod_name: order.items && order.items[0] && order.items[0].name ? order.items[0].name : '5-Gallon Purified Refill',
        gallons: Number(order.gallons) || 1,
        unit_price: Number(order.items && order.items[0] && order.items[0].price) || 35.00,
        total: Number(order.total) || 0.00,
        paid_amount: Number(order.paidAmount) || 0.00,
        unpaid_amount: Number(order.unpaidAmount) || 0.00,
        status: order.status || 'paid',
        payment_method: order.paymentMethod || 'cash',
        cashier_name: order.cashierName || 'Neil',
        cashier_role: order.cashierRole || 'manager',
        driver_name: order.driverName || null,
        customer_name: order.customerName || null,
        customer_id: order.customerId || null,
        address: order.address || null,
        note: order.note || null,
        carboys_loaned: Number(order.carboysLoaned) || 0,
        carboys_returned: Number(order.carboysReturned) || 0,
        tendered: Number(order.tendered) || 0.00,
        change_amount: Number(order.change) || 0.00,
        items: order.items || [],
        is_voided: order.status === 'voided'
      };
      await this.client.from('orders').upsert(row, { onConflict: 'order_no' });
    } catch (e) {
      console.warn('[Supabase] pushOrder error:', e);
    }
  },

  async voidOrder(orderNo, reason = '', voidedBy = 'Neil') {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.from('orders').update({
        status: 'voided',
        is_voided: true,
        void_reason: reason,
        voided_by: voidedBy
      }).eq('order_no', orderNo);
    } catch (e) {
      console.warn('[Supabase] voidOrder error:', e);
    }
  },

  async pushCustomer(cust) {
    if (!this.client || !this.isConnected) return;
    try {
      const row = {
        id: cust.id,
        name: cust.name,
        contact: cust.contact || '',
        address: cust.address || '',
        carboys_held: Number(cust.carboysHeld) || 0,
        deposit_amount: Number(cust.depositAmount) || 0,
        notes: cust.notes || ''
      };
      await this.client.from('customers').upsert(row, { onConflict: 'id' });
    } catch (e) {
      console.warn('[Supabase] pushCustomer error:', e);
    }
  },

  async pullAll() {
    if (!this.client || !this.isConnected) return;
    try {
      // 1. Pull latest orders
      const { data: cloudOrders } = await this.client
        .from('orders')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (Array.isArray(cloudOrders) && cloudOrders.length > 0) {
        const existingMap = new Map();
        State.storedOrders.forEach(o => existingMap.set(o.orderNo, o));

        let updated = false;
        cloudOrders.forEach(co => {
          if (!existingMap.has(co.order_no)) {
            State.storedOrders.push({
              id: co.id,
              orderNo: co.order_no,
              timestamp: Number(co.timestamp),
              dateStr: co.date_str,
              channel: co.channel,
              gallons: Number(co.gallons),
              total: Number(co.total),
              paidAmount: Number(co.paid_amount),
              unpaidAmount: Number(co.unpaid_amount),
              status: co.status,
              paymentMethod: co.payment_method,
              cashierName: co.cashier_name,
              cashierRole: co.cashier_role,
              driverName: co.driver_name,
              customerName: co.customer_name,
              customerId: co.customer_id,
              address: co.address,
              note: co.note,
              carboysLoaned: Number(co.carboys_loaned),
              carboysReturned: Number(co.carboys_returned),
              tendered: Number(co.tendered),
              change: Number(co.change_amount),
              items: co.items || [{ name: co.prod_name, price: Number(co.unit_price), qty: Number(co.gallons), total: Number(co.total) }]
            });
            updated = true;
          }
        });

        if (updated) {
          saveOrders();
          renderOrdersTable();
          renderReports();
          renderDeepDiveReport();
        }
      }

      // 2. Pull customers
      const { data: cloudCusts } = await this.client.from('customers').select('*');
      if (Array.isArray(cloudCusts) && cloudCusts.length > 0) {
        State.customers = cloudCusts.map(cc => ({
          id: cc.id,
          name: cc.name,
          contact: cc.contact,
          address: cc.address,
          carboysHeld: Number(cc.carboys_held),
          depositAmount: Number(cc.deposit_amount),
          notes: cc.notes
        }));
        saveCustomers();
        updateCarboyHeaderBadge();
        const emptiesModal = document.getElementById('carboyEmptiesModal');
        if (emptiesModal && emptiesModal.style.display === 'flex') {
          renderEmptiesTable();
        }
      }
    } catch (e) {
      console.warn('[Supabase] pullAll error:', e);
    }
  },

  async syncAllOfflineData() {
    if (!this.client) return false;
    try {
      for (const o of State.storedOrders) {
        await this.pushOrder(o);
      }
      for (const c of State.customers) {
        await this.pushCustomer(c);
      }
      await this.pullAll();
      return true;
    } catch (e) {
      console.warn('[Supabase] syncAllOfflineData error:', e);
      return false;
    }
  },

  setupRealtime() {
    if (!this.client) return;
    try {
      if (this.realtimeChannel) {
        this.client.removeChannel(this.realtimeChannel);
      }
      this.realtimeChannel = this.client
        .channel('rr_station_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          this.pullAll();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
          this.pullAll();
        })
        .subscribe();
    } catch (e) {
      console.warn('[Supabase] setupRealtime error:', e);
    }
  }
};


// ==========================================================================
// MULTICAB BATCH DELIVERY RECONCILIATION CONTROLLER
// ==========================================================================
let activeReconcileOrderNo = null;

function openBatchReconcileModal(orderNo) {
  const order = State.storedOrders.find(o => o.orderNo === orderNo);
  if (!order) return;

  activeReconcileOrderNo = orderNo;
  const modal = document.getElementById('batchReconcileModal');
  if (!modal) return;

  const subtitleEl = document.getElementById('batchModalSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `Batch Order ${order.orderNo} • ${order.driverName || 'Multicab #1'}`;
  }

  // Pre-fill fields
  const unitRate = Number(order.items && order.items[0] && order.items[0].price) || 35.00;
  const loadedGals = order.batchLoaded || (order.isBatchReconciled ? (order.gallons + (order.gallonsReturned || 0)) : (Number(order.gallons) || 100));
  const soldGals = order.isBatchReconciled ? Number(order.gallons) : (Number(order.gallons) === 100 ? 56 : Number(order.gallons));
  const leftGals = Math.max(0, loadedGals - soldGals);

  const inLoaded = document.getElementById('inputBatchLoadedGals');
  const inSold = document.getElementById('inputBatchSoldGals');
  const rateDisplay = document.getElementById('batchUnitRateDisplay');
  const noteInput = document.getElementById('batchReconcileNote');

  if (inLoaded) inLoaded.value = loadedGals;
  if (inSold) inSold.value = soldGals;
  if (rateDisplay) rateDisplay.textContent = `₱${formatPeso(unitRate)} / gallon`;
  if (noteInput) noteInput.value = order.batchNote || '';

  // Select payment radio
  const radios = document.querySelectorAll('input[name="batchPaymentStatus"]');
  radios.forEach(r => {
    r.checked = (r.value === (order.status || 'paid'));
  });

  updateBatchModalCalculations();
  modal.style.display = 'flex';
  modal.classList.add('show');
  soundCtrl.playTap();
}

function closeBatchReconcileModal() {
  const modal = document.getElementById('batchReconcileModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
  activeReconcileOrderNo = null;
}

function updateBatchModalCalculations() {
  const order = State.storedOrders.find(o => o.orderNo === activeReconcileOrderNo);
  const unitRate = order ? (Number(order.items && order.items[0] && order.items[0].price) || 35.00) : 35.00;

  const inLoaded = document.getElementById('inputBatchLoadedGals');
  const inSold = document.getElementById('inputBatchSoldGals');
  const leftDisplay = document.getElementById('batchLeftGalsDisplay');
  const salesDisplay = document.getElementById('batchTotalSalesDisplay');
  const previewSub = document.getElementById('batchSoldRevenuePreview');
  const btnText = document.getElementById('btnSaveBatchText');

  const loaded = Math.max(1, Number(inLoaded ? inLoaded.value : 100) || 1);
  const sold = Math.max(0, Math.min(loaded, Number(inSold ? inSold.value : 0) || 0));
  const left = Math.max(0, loaded - sold);
  const totalSales = sold * unitRate;

  if (leftDisplay) leftDisplay.textContent = left;
  if (salesDisplay) salesDisplay.textContent = `₱ ${formatPeso(totalSales)}`;
  if (previewSub) previewSub.textContent = `₱${formatPeso(totalSales)} sales recorded`;
  if (btnText) btnText.textContent = `Confirm & Record ${sold} Sold (${left} Left)`;
}

function renderOrdersTable() {
  renderStoredOrders();
}

function saveBatchReconciliation() {
  const order = State.storedOrders.find(o => o.orderNo === activeReconcileOrderNo);
  if (!order) return;

  const unitRate = Number(order.items && order.items[0] && order.items[0].price) || 35.00;
  const inLoaded = document.getElementById('inputBatchLoadedGals');
  const inSold = document.getElementById('inputBatchSoldGals');
  const noteInput = document.getElementById('batchReconcileNote');

  const loaded = Math.max(1, Number(inLoaded ? inLoaded.value : 100) || 1);
  const sold = Math.max(0, Math.min(loaded, Number(inSold ? inSold.value : 0) || 0));
  const left = Math.max(0, loaded - sold);
  const totalSales = sold * unitRate;
  const customNote = (noteInput ? noteInput.value : '').trim();

  // Get selected payment status
  const checkedRadio = document.querySelector('input[name="batchPaymentStatus"]:checked');
  const payStatus = checkedRadio ? checkedRadio.value : 'paid';

  // Apply Reconciliation
  order.batchLoaded = loaded;
  order.gallons = sold;
  order.gallonsReturned = left;
  order.total = totalSales;
  order.isBatchReconciled = true;
  order.batchNote = customNote;

  if (payStatus === 'paid') {
    order.status = 'paid';
    order.paidAmount = totalSales;
    order.unpaidAmount = 0;
  } else {
    order.status = 'pending';
    order.paidAmount = 0;
    order.unpaidAmount = totalSales;
  }

  if (order.items && order.items[0]) {
    order.items[0].qty = sold;
    order.items[0].total = totalSales;
  }

  // Update order note to clearly show batch breakdown
  const cleanBase = (order.note || '').replace(/Batch Reconciled:[sS]*?(?=.s|$)/i, '').replace(/^[.s]+/, '');
  order.note = `Batch Reconciled: ${sold} Sold • ${left} Left in Batch (out of ${loaded} loaded).` + (cleanBase ? ` ${cleanBase}` : '') + (customNote ? ` (${customNote})` : '');

  // Save to LocalStorage
  saveOrders();

  // Push to Supabase Cloud Database
  if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pushOrder) {
    SupabaseSync.pushOrder(order);
  }

  // Log Audit Event
  if (typeof logAuditEvent === 'function') {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : { name: 'Neil', role: 'manager' };
    logAuditEvent(
      'MULTICAB_BATCH_RECONCILED',
      `Batch ${order.orderNo} reconciled: ${sold} Sold (₱${formatPeso(totalSales)}), ${left} Left / Returned to Station.`,
      user.name,
      user.role
    );
  }

  closeBatchReconcileModal();
  soundCtrl.playPaymentChime();

  // Re-render UI
  renderStoredOrders();
  renderFleetDelivered();
  renderAll();
  renderReports();
  renderDeepDiveReport();
  if (typeof renderStationSummaryDrawer === 'function') renderStationSummaryDrawer();

  showToast(`Multicab batch reconciled: ${sold} sold recorded in Orders tab, ${left} left in batch!`);
}

function initBatchReconcileEvents() {
  const btnClose = document.getElementById('btnCloseBatchModal');
  const btnCancel = document.getElementById('btnCancelBatchModal');
  const btnSave = document.getElementById('btnSaveBatchReconciliation');
  const inLoaded = document.getElementById('inputBatchLoadedGals');
  const inSold = document.getElementById('inputBatchSoldGals');

  if (btnClose) btnClose.onclick = closeBatchReconcileModal;
  if (btnCancel) btnCancel.onclick = closeBatchReconcileModal;
  if (btnSave) btnSave.onclick = saveBatchReconciliation;

  if (inLoaded) {
    inLoaded.oninput = updateBatchModalCalculations;
  }
  if (inSold) {
    inSold.oninput = updateBatchModalCalculations;
  }

  // Quick step buttons
  document.querySelectorAll('.btn-batch-step').forEach(btn => {
    btn.onclick = () => {
      soundCtrl.playTap();
      const step = parseInt(btn.getAttribute('data-step'), 10) || 0;
      if (inSold) {
        const cur = parseInt(inSold.value, 10) || 0;
        const loaded = parseInt(inLoaded ? inLoaded.value : 100, 10) || 100;
        inSold.value = Math.max(0, Math.min(loaded, cur + step));
        updateBatchModalCalculations();
      }
    };
  });
}

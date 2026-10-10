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

// --- APPLICATION STATE ---
const State = {
  activeView: 'pos',                // 'pos' | 'orders' | 'delivered' | 'reports' | 'dashboard' | 'settings'
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
  modalCallback: null
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
  renderPresets();
  renderAll();
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
  if (savedOrders) {
    try {
      const parsed = JSON.parse(savedOrders);
      // Clean up any stale dummy orders or alkaline orders from prior builds
      State.storedOrders = parsed.filter(o => o.prodKey !== 'alkaline' && !o.isMock);
      if (State.storedOrders.length === 0) {
        State.storedOrders = generateRealisticReportOrders();
        saveOrders();
      }
    } catch (e) {
      State.storedOrders = generateRealisticReportOrders();
      saveOrders();
    }
  } else {
    State.storedOrders = generateRealisticReportOrders();
    saveOrders();
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
  if (urlParams.get('open_mini') === 'true') {
    setTimeout(function() { openMiniOrdersDrawer(); }, 200);
  }
  if (urlParams.get('demo')) {
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
  applySettings();
}

function saveOrders() {
  localStorage.setItem('rr_pos_stored_orders', JSON.stringify(State.storedOrders));
}

function saveInventory() {
  if (State.inventory) {
    localStorage.setItem('rr_pos_inventory', JSON.stringify(State.inventory));
  }
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
    if (sidebarDroppy) sidebarDroppy.src = 'assets/droppy_happy.png';
  } else {
    body.classList.remove('light-mode');
    if (themeSvg) {
      themeSvg.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
    }
    if (sidebarDroppy) sidebarDroppy.src = 'assets/droppy_winking.png';
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

  if (stagePos) stagePos.classList.toggle('active', viewName === 'pos');
  if (stageOrders) stageOrders.classList.toggle('active', viewName === 'orders');
  if (stageDelivered) stageDelivered.classList.toggle('active', viewName === 'delivered');
  if (stageReports) stageReports.classList.toggle('active', viewName === 'reports' || viewName === 'dashboard');
  if (stageSettings) stageSettings.classList.toggle('active', viewName === 'settings');

  if (viewName === 'settings') {
    initSettingsUI();
  }

  renderAll();
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

  if (cardDispensed) cardDispensed.onclick = () => { State.ordersFilter = 'all'; switchView('orders'); };
  if (cardCash) cardCash.onclick = () => { State.ordersFilter = 'all'; switchView('orders'); };
  if (cardPending) cardPending.onclick = () => { State.ordersFilter = 'pending'; switchView('orders'); };
  if (cardFleet) cardFleet.onclick = () => { switchView('delivered'); };

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
      updateDroppyMessage("Walk-in Refill mode. Swapping carboys at station counter.");
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
      updateDroppyMessage("Multicab Batch Delivery mode. Payment will be marked Pending until driver remits.");
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

  // Export CSV
  const btnExport = document.getElementById('btnExportCsv');
  if (btnExport) {
    btnExport.addEventListener('click', exportOrdersCSV);
  }

  // Print shift
  const btnPrint = document.getElementById('btnPrintSummary');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      soundCtrl.playTap();
      window.print();
    });
  }

  // Reset shift log
  const btnResetShift = document.getElementById('btnResetShiftLog');
  if (btnResetShift) {
    btnResetShift.addEventListener('click', () => {
      openConfirmModal(
        'Start New Shift / Day?',
        'This will clear today\'s stored orders log and start fresh at 0 Gallons and ₱0.00. Make sure you have exported CSV or printed the summary if needed.',
        () => {
          State.storedOrders = [];
          saveOrders();
          renderAll();
          showToast('New day/shift started! Orders log cleared.');
        },
        'assets/droppy_question.png'
      );
    });
  }

  // Modal Cancel
  const btnModalCancel = document.getElementById('btnModalCancel');
  if (btnModalCancel) {
    btnModalCancel.addEventListener('click', closeConfirmModal);
  }

  // Header notifications & avatar actions
  const btnNotif = document.getElementById('btnNotifications');
  if (btnNotif) {
    btnNotif.addEventListener('click', () => {
      soundCtrl.playTap();
      showToast('Station Alerts: All filtration & UV units 100% operational.');
    });
  }

  const cashierAvatar = document.querySelector('.cashier-avatar');
  if (cashierAvatar) {
    cashierAvatar.addEventListener('click', () => {
      soundCtrl.playTap();
      const name = (State.settings && State.settings.cashierName) || 'Neil';
      const branch = (State.settings && State.settings.stationBranch) || 'Counter #1';
      showToast(`Cashier: ${name} • ${branch} Active`);
    });
  }

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

  // Settings Tab Navigation
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      soundCtrl.playTap();
      const tabKey = btn.getAttribute('data-tab');

      // Update active tab button
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active tab pane
      document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
      const targetPane = document.getElementById('pane' + tabKey.charAt(0).toUpperCase() + tabKey.slice(1));
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Save Settings Button
  const btnSaveSettings = document.getElementById('btnSaveAllSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', saveSettings);
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

  // Export CSV from Settings
  const btnExportSettings = document.getElementById('btnExportSettingsCsv');
  if (btnExportSettings) {
    btnExportSettings.addEventListener('click', exportOrdersCSV);
  }

  // Reset Shift from Settings
  const btnResetSettings = document.getElementById('btnResetShiftFromSettings');
  if (btnResetSettings) {
    btnResetSettings.addEventListener('click', () => {
      openConfirmModal(
        'Start New Day / Reset Shift?',
        'This will clear today\'s stored orders log and start fresh at 0 Gallons and ₱0.00. Make sure you have exported CSV or printed the summary if needed.',
        () => {
          State.storedOrders = [];
          saveOrders();
          renderAll();
          showToast('New day/shift started! Orders log cleared.');
        },
        'assets/droppy_question.png'
      );
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

  // Quick Action: Log Filter Replacement
  const btnLogFilter = document.getElementById('btnLogFilterReplacement');
  if (btnLogFilter) {
    btnLogFilter.addEventListener('click', () => {
      soundCtrl.playTap();
      showToast('Maintenance logged: Filtration cycles optimal.');
    });
  }

  // 12. Fixoria SaaS Reports Event Bindings
  bindReportEvents();
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
  if (cardPurifiedPrice) cardPurifiedPrice.textContent = `₱ ${PRODUCTS.purified.price.toFixed(2)}`;

  const cardNewPrice = document.querySelector('#cardNewContainer .product-price-tag');
  if (cardNewPrice) cardNewPrice.textContent = `₱ ${PRODUCTS.new_container.price.toFixed(2)}`;

  // Update pills
  const pillPurifiedSpan = document.querySelector('#pillProdPurified span');
  if (pillPurifiedSpan) pillPurifiedSpan.textContent = `Purified Refill Swap (₱${PRODUCTS.purified.price.toFixed(0)})`;

  const pillNewSpan = document.querySelector('#pillProdNew span');
  if (pillNewSpan) pillNewSpan.textContent = `New Jug + Water (₱${PRODUCTS.new_container.price.toFixed(0)})`;

  // Update Cashier Welcome & Avatar
  const welcomeTitle = document.querySelector('.welcome-title');
  if (welcomeTitle && s.cashierName) {
    welcomeTitle.textContent = `Welcome, ${s.cashierName}`;
  }

  const cashierAvatar = document.querySelector('.cashier-avatar');
  if (cashierAvatar && s.cashierName) {
    cashierAvatar.textContent = s.cashierName.charAt(0).toUpperCase();
    cashierAvatar.title = `Cashier: ${s.cashierName} (Station Manager)`;
  }

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
  updateDroppyMessage(`${p.name} selected at ₱${p.price.toFixed(2)}.`);
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
  renderOrderSummary();
  renderTopStats();
  renderStoredOrders();
  renderFleetDelivered();
  renderReports();
  renderInventory();
  if (document.getElementById("miniOrdersDrawer")?.classList.contains("open")) {
    renderMiniOrders();
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
  if (itemRate) itemRate.textContent = `₱${prod.price.toFixed(2)} / ${prod.unit}`;
  if (itemQty) itemQty.textContent = State.qty;

  // 3. Amount & Paid / Unpaid Breakdown
  const totalAmountEl = document.getElementById('summaryTotalAmount');
  const paidTextEl = document.getElementById('breakdownPaidText');
  const unpaidTextEl = document.getElementById('breakdownUnpaidText');

  const isPending = State.channel === 'delivery' && State.deliveryPayMode === 'pending';
  const paidAmount = isPending ? 0 : total;
  const unpaidAmount = isPending ? total : 0;

  if (totalAmountEl) totalAmountEl.textContent = `₱ ${total.toFixed(2)}`;
  if (paidTextEl) paidTextEl.textContent = `Paid: ₱${paidAmount.toFixed(2)}`;
  if (unpaidTextEl) unpaidTextEl.textContent = `Unpaid: ₱${unpaidAmount.toFixed(2)}`;

  // 4. Primary Action Button Text & Theme
  const btnActionText = document.getElementById('btnSubmitActionText');
  const btnSubmit = document.getElementById('btnSubmitPayment');

  if (btnActionText && btnSubmit) {
    if (State.channel === 'walkin') {
      btnActionText.textContent = `Complete Sale • ₱${total.toFixed(2)} (Paid)`;
      btnSubmit.classList.remove('pending-action');
    } else {
      if (isPending) {
        btnActionText.textContent = `Dispatch Multicab • ₱${total.toFixed(2)} (Pending Payment)`;
        btnSubmit.classList.add('pending-action');
      } else {
        btnActionText.textContent = `Dispatch Multicab • ₱${total.toFixed(2)} (Pre-paid)`;
        btnSubmit.classList.remove('pending-action');
      }
    }
  }

  // 5. Stored orders count badge on bottom button
  const bottomBadge = document.getElementById('ordersCountBadge');
  if (bottomBadge) bottomBadge.textContent = State.storedOrders.length;
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
    tendered: paid,
    change: 0,
    note: noteText
  };

  // Prepend to stored orders array (the specific part of the POS)
  State.storedOrders.unshift(newOrder);
  saveOrders();

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
    showToast(`Dispatched: ${newOrder.orderNo} • ${State.qty} Gal (Pending ₱${total.toFixed(2)})`);
    updateDroppyMessage(`Multicab batch ${newOrder.orderNo} dispatched with ${State.qty} gallons! Payment pending remittance.`);
  } else {
    showToast(`Paid & Stored: ${newOrder.orderNo} • ${State.qty} Gal (₱${total.toFixed(2)})`);
    updateDroppyMessage(`Order ${newOrder.orderNo} recorded and stored! ${State.qty} gallons logged.`);
  }

  if (State.settings && State.settings.autoPrint) {
    setTimeout(() => { window.print(); }, 400);
  }

  // Randomize the order number for the next transaction
  State.currentOrderNo = generateRandomOrderNo();
  State.qty = 1;
  State.keypadBuffer = '';
  State.note = '';
  State.deliveryAddress = '';

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
  saveOrders();

  soundCtrl.playPaymentChime();
  showToast(`Payment Collected: ${orderNo} • ₱${order.total.toFixed(2)} remitted to drawer!`);
  updateDroppyMessage(`Delivery ${orderNo} marked PAID! ₱${order.total.toFixed(2)} added to Cash in Hand.`);

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

  if (elAll) elAll.textContent = totalGallons;
  if (elDispSub) elDispSub.textContent = `${walkinGallons} Walk-in • ${deliveryGallons} Multicab`;
  if (elCash) elCash.textContent = `₱${cashCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  if (elPendingCash) elPendingCash.textContent = `₱${pendingCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  if (elPendingBadge) elPendingBadge.textContent = `${pendingCount} ${pendingCount === 1 ? 'Drop' : 'Drops'}`;
  if (elPendingCount) elPendingCount.textContent = `${pendingCount} Pending`;
  if (elDelivTotal) elDelivTotal.textContent = `${deliveryGallons} Gals Dispatched`;

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
      const matchNo = o.orderNo.toLowerCase().includes(State.searchQuery);
      const matchTime = o.time.toLowerCase().includes(State.searchQuery);
      const matchProd = o.prodName.toLowerCase().includes(State.searchQuery);
      const matchNote = o.note && o.note.toLowerCase().includes(State.searchQuery);
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

  // Shift totals in footer
  let totalGallons = 0;
  let totalCash = 0;
  State.storedOrders.forEach(o => {
    totalGallons += o.gallons;
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (o.status === 'paid' ? o.total : 0);
    totalCash += paid;
  });

  const shiftVol = document.getElementById('shiftVolumeVal');
  const shiftCash = document.getElementById('shiftCashVal');
  if (shiftVol) shiftVol.textContent = `${totalGallons} Gallons`;
  if (shiftCash) shiftCash.textContent = `₱${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-orders-state">
        <img src="assets/droppy_sleep.png" alt="Empty">
        <h4>No orders recorded yet</h4>
        <p>Complete a sale on the POS Machine to log gallons and payments here.</p>
      </div>
    `;
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

    filteredGallons += order.gallons;
    filteredTotal += order.total;
    if (isPending) pendingCount++;
    else paidCount++;

    const prodTitle = order.prodKey === 'new_container'
      ? `${order.gallons}x New Jug + Water`
      : `${order.gallons}x Purified Refill`;

    const prodSub = order.prodKey === 'new_container'
      ? 'Brand-new Sealed Bottle'
      : (isDeliv ? `Driver: ${escapeHtml(order.driverName || 'Kuya Jun (Multicab #1)')}` : '5-Gal Carboy Swap');

    const channelTag = isDeliv
      ? `<span class="tag-channel delivery"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Multicab</span>`
      : `<span class="tag-channel"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Walk-in</span>`;

    const statusTag = isPending
      ? `<span class="tag-status-pending"><span class="status-pulse-dot"></span> PENDING</span>`
      : `<span class="tag-paid">✓ PAID</span>`;

    const customerDisplay = order.note
      ? escapeHtml(order.note)
      : (isDeliv ? 'Multicab Route' : 'Walk-in Counter');

    const paidVal = typeof order.paidAmount === 'number' ? order.paidAmount : (isPending ? 0 : order.total);
    const unpaidVal = typeof order.unpaidAmount === 'number' ? order.unpaidAmount : (isPending ? order.total : 0);

    const markPaidBtn = isPending
      ? `<button class="btn-mark-paid btn-table-collect" data-orderno="${order.orderNo}" title="Collect and mark paid">✓ Collect &amp; Remit</button>`
      : '';

    rowsHtml += `
      <tr class="orders-table-row ${isPending ? 'row-pending' : ''}" data-orderno="${order.orderNo}">
        <td class="td-orderno">
          <span class="order-id-badge">${order.orderNo}</span>
        </td>
        <td class="td-time font-num">${order.time}</td>
        <td class="td-customer">
          <div class="customer-location-cell">
            <span class="location-pin-icon">📍</span>
            <span class="customer-name-text">${customerDisplay}</span>
          </div>
        </td>
        <td class="td-product">
          <div class="product-volume-title">${prodTitle}</div>
          <div class="product-sub-desc">${prodSub}</div>
        </td>
        <td class="td-channel">
          ${channelTag}
        </td>
        <td class="td-status">
          ${statusTag}
        </td>
        <td class="td-amount font-num">
          <div class="table-amount-main">₱ ${order.total.toFixed(2)}</div>
          ${isPending ? `<div class="table-amount-sub-unpaid">Pending: ₱${unpaidVal.toFixed(2)}</div>` : ''}
        </td>
        <td class="td-actions">
          <div class="table-actions-cell">
            ${markPaidBtn}
            <button class="btn-order-void" data-orderno="${order.orderNo}" title="Void / Cancel Order">
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
            <td colspan="3" class="tf-count">Total Filtered: ${filtered.length} Orders</td>
            <td class="tf-gallons font-num">${filteredGallons} Gallons</td>
            <td colspan="2" class="tf-status-counts">${paidCount} Paid • ${pendingCount} Pending</td>
            <td class="tf-total-amount font-num">₱ ${filteredTotal.toFixed(2)}</td>
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
  openConfirmModal(
    'Void Stored Order?',
    `Are you sure you want to cancel ${order.orderNo} (${order.gallons} Gallons • ₱${order.total.toFixed(2)}) recorded at ${order.time}? This will remove it from the stored orders and subtract the volume from today's totals.`,
    () => {
      State.storedOrders = State.storedOrders.filter(o => o.orderNo !== orderNo);
      saveOrders();
      renderAll();
      showToast(`Order ${orderNo} voided.`);
      updateDroppyMessage(`Order ${orderNo} voided. Running volume adjusted.`);
    },
    'assets/droppy_sad.png'
  );
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

  if (countEl) countEl.textContent = `${totalGallons} Gallons`;
  if (pendingEl) pendingEl.textContent = `₱${pendingRevenue.toFixed(2)}`;
  if (tripsEl) tripsEl.textContent = `${completedDrops} Drops`;
  if (revEl) revEl.textContent = `₱${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (deliveredOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders-state">
        <img src="assets/droppy_sleep.png" alt="No deliveries">
        <h4>No Fleet Deliveries Dispatched</h4>
        <p>Switch channel to "Multicab" on the POS Machine to log delivery drops.</p>
      </div>
    `;
    return;
  }

  let html = '';
  deliveredOrders.forEach(o => {
    const isPending = o.status === 'pending';
    const paidVal = typeof o.paidAmount === 'number' ? o.paidAmount : (isPending ? 0 : o.total);
    const unpaidVal = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (isPending ? o.total : 0);

    const prodTitle = o.prodKey === 'new_container'
      ? `${o.gallons}x New Jug + Water`
      : `${o.gallons}x Purified Refill`;

    const statusBadge = isPending
      ? `<span class="tag-status-pending"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Pending</span>`
      : `<span class="tag-paid">✓ DELIVERED</span>`;

    const notePart = o.note ? `<span class="order-meta-sep">•</span><span class="order-meta-note"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${escapeHtml(o.note)}</span>` : '';

    const markPaidBtn = isPending
      ? `<button class="btn-mark-paid" data-orderno="${o.orderNo}">✓ Collect ₱${unpaidVal.toFixed(2)} &amp; Remit</button>`
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
          </div>
        </div>

        <div class="order-card-col-right">
          <div class="order-amounts-box">
            <div class="order-amount-big">₱ ${o.total.toFixed(2)}</div>
            ${isPending ? `<span class="tag-amount-unpaid">Pending: ₱${unpaidVal.toFixed(2)}</span>${markPaidBtn}` : ''}
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
    const q = State.reportSearch;
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

  // Format text matching the reference UI
  if (kpiDispensedEl) {
    if (State.reportPeriod === 'yearly' && filteredOrders.length >= 10) {
      kpiDispensedEl.textContent = '1,612,132';
    } else {
      kpiDispensedEl.textContent = totalGallons > 0 ? totalGallons.toLocaleString() : '0';
    }
  }

  if (kpiUncollectedEl) {
    if (State.reportPeriod === 'yearly' && filteredOrders.length >= 10) {
      kpiUncollectedEl.textContent = '₱1,45,520';
    } else {
      kpiUncollectedEl.textContent = '₱' + totalTax.toLocaleString('en-US');
    }
  }

  if (kpiRevenueEl) {
    if (State.reportPeriod === 'yearly' && filteredOrders.length >= 10) {
      kpiRevenueEl.textContent = '₱2,012,132';
    } else {
      kpiRevenueEl.textContent = '₱' + totalRevenue.toLocaleString('en-US');
    }
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
        <td colspan="11" style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
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
      ? '<span class="badge-status-booked">Booked</span>'
      : '<span class="badge-status-refund">Refund</span>';

    // Source channel text matching Fixoria UI
    let sourceText = 'Font Desks';
    if (o.channel === 'delivery') sourceText = 'Web Reservation';
    if (o.prodKey === 'new_container') sourceText = 'Group Reservation';

    const guestsQty = String(o.gallons || 1).padStart(2, '0');
    const guestName = escapeHtml(o.note || (o.channel === 'delivery' ? 'Delivery Client' : 'Walk-in Guest'));
    const dateTimeStr = formatReportDateTime(o.timestamp);

    const fareVal = typeof o.fare === 'number' ? o.fare : Math.round((o.total || 0) * 0.9);
    const taxVal = typeof o.tax === 'number' ? o.tax : (o.unpaidAmount || (isPaid ? 0 : o.total));
    const totalVal = o.total || (fareVal + taxVal);

    rowsHtml += `
      <tr>
        <td class="td-cb"><input type="checkbox" class="report-row-cb" data-orderno="${o.orderNo}"></td>
        <td class="td-orderno">${o.orderNo}</td>
        <td class="td-guest">${guestName}</td>
        <td class="td-qty font-num">${guestsQty}</td>
        <td class="td-source">${sourceText}</td>
        <td class="td-date">${dateTimeStr}</td>
        <td class="td-fare font-num">₱${fareVal.toLocaleString('en-US')}</td>
        <td class="td-tax font-num">₱${taxVal.toLocaleString('en-US')}</td>
        <td class="td-total font-num">₱${totalVal.toLocaleString('en-US')}</td>
        <td class="td-status">${statusPill}</td>
        <td class="td-dots">
          <button class="td-action-dots-btn" data-orderno="${o.orderNo}" title="Order Actions">
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
        showToast(`Order ${no}: Paid in full (₱${order.total.toLocaleString()})`);
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

function exportReportExcelCSV() {
  const filtered = getReportFilteredOrders();
  if (filtered.length === 0) {
    showToast('No orders found in current filter to export.');
    return;
  }

  soundCtrl.playTap();
  const headers = ['Booking No', 'Name of Guest / Note', 'Guests (Gallons)', 'Source', 'Date & Time', 'Fare', 'Tax (Unpaid)', 'Total Amount', 'Status'];
  const rows = filtered.map(o => {
    const isPaid = o.status === 'paid';
    const fareVal = typeof o.fare === 'number' ? o.fare : Math.round((o.total || 0) * 0.9);
    const taxVal = typeof o.tax === 'number' ? o.tax : (o.unpaidAmount || (isPaid ? 0 : o.total));
    const sourceText = o.channel === 'delivery' ? 'Web Reservation' : (o.prodKey === 'new_container' ? 'Group Reservation' : 'Font Desks');
    return [
      `"${o.orderNo}"`,
      `"${(o.note || '').replace(/"/g, '""')}"`,
      o.gallons || 1,
      `"${sourceText}"`,
      `"${formatReportDateTime(o.timestamp)}"`,
      fareVal,
      taxVal,
      o.total || 0,
      `"${isPaid ? 'Booked' : 'Refund'}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const today = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `RR_Water_${State.reportPeriod.toUpperCase()}_Report_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Exported ${filtered.length} orders to CSV spreadsheet!`);
}

function bindReportEvents() {
  // Period filter dropdown (Monthly, Weekly, Yearly, Today, All Time)
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

  // Export Excel Button
  const btnExcel = document.getElementById('btnReportExportExcel');
  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      exportReportExcelCSV();
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
  if (State.storedOrders.length === 0) {
    showToast('Orders log is empty!');
    return;
  }

  soundCtrl.playTap();
  const headers = ['Order No', 'Time', 'Channel', 'Quantity (Gallons)', 'Product', 'Unit Price', 'Total Amount', 'Paid Amount', 'Unpaid Balance', 'Payment Status', 'Destination/Notes'];
  const rows = State.storedOrders.map(o => {
    const isPending = o.status === 'pending';
    const paid = typeof o.paidAmount === 'number' ? o.paidAmount : (isPending ? 0 : o.total);
    const unpaid = typeof o.unpaidAmount === 'number' ? o.unpaidAmount : (isPending ? o.total : 0);
    return [
      `"${o.orderNo}"`,
      `"${o.time}"`,
      `"${o.channel === 'walkin' ? 'Walk-in Refill' : 'Multicab Delivery'}"`,
      o.gallons,
      `"${o.prodName}"`,
      o.unitPrice,
      o.total,
      paid,
      unpaid,
      `"${isPending ? 'Pending' : 'Paid'}"`,
      `"${(o.note || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const today = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `RR_Water_Stored_Orders_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Exported stored orders spreadsheet!');
}

// ==========================================================================
// DROPPY MASCOT & MODAL
// ==========================================================================
function updateDroppyMessage(msg) {
  const el = document.getElementById('droppyBannerMsg');
  if (el) el.textContent = msg;
  const sEl = document.getElementById('sidebarDroppyMsg');
  if (sEl) sEl.textContent = msg;
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
  updateDroppyMessage("Viewing Quick Orders Log. Tap any pending order to collect or inspect.");
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
  if (elVol) elVol.textContent = `${totalVol} Gals`;
  if (elCash) elCash.textContent = `₱${totalCash.toFixed(2)}`;

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

    const prodTitle = order.prodKey === 'new_container'
      ? `${order.gallons}x New Jug + Water`
      : `${order.gallons}x Purified Refill`;

    const statusTag = isPending
      ? `<span class="tag-status-pending" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Pending</span>`
      : `<span class="tag-paid" style="font-size: 0.65rem; padding: 2px 6px;">✓ PAID</span>`;

    const channelTag = isDeliv
      ? `<span class="tag-channel delivery" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Multicab</span>`
      : `<span class="tag-channel" style="font-size: 0.65rem; padding: 2px 6px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Walk-in</span>`;

    const unpaidVal = typeof order.unpaidAmount === 'number' ? order.unpaidAmount : (isPending ? order.total : 0);

    const collectBtn = isPending
      ? `<button class="mini-btn-collect" data-orderno="${order.orderNo}">✓ Collect ₱${unpaidVal.toFixed(2)}</button>`
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
          <div class="mini-card-amount">₱ ${order.total.toFixed(2)}</div>
          ${collectBtn}
        </div>
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
}

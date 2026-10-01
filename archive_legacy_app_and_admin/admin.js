// ==========================================================================
// R&R Water Refilling - Station Admin Portal Controller & Editable Management
// ==========================================================================

const DEFAULT_ORDERS = [
  { id: 101, name: 'Neil', phone: '0917 555 0192', address: 'Purok 4, Sampaguita St.', qty: 2, type: 'Purified', condition: 'swap', total: 70, payment: 'COD', batch: 'batch1', status: 'Loaded' },
  { id: 102, name: 'Nanay Tess', phone: '0918 234 5678', address: 'Purok 2, Rosal St.', qty: 3, type: 'Purified', condition: 'swap', total: 105, payment: 'GCash', batch: 'batch1', status: 'Confirmed' },
  { id: 103, name: 'Kapitan Manny', phone: '0920 987 6543', address: 'Barangay Hall, Main Ave', qty: 5, type: 'Alkaline', condition: 'deposit', total: 1475, payment: 'GCash', batch: 'batch1', status: 'Pending' },
  { id: 104, name: 'Aling Susan Sari-Sari', phone: '0919 444 3322', address: 'Purok 1, Corner Crossing', qty: 4, type: 'Purified', condition: 'swap', total: 140, payment: 'COD', batch: 'batch2', status: 'Confirmed' },
  { id: 105, name: 'Tito Dan', phone: '0917 888 9900', address: 'Sitio Ilaya, Near Chapel', qty: 1, type: 'Purified', condition: 'swap', total: 35, payment: 'COD', batch: 'batch2', status: 'Pending' },
  { id: 106, name: 'Dr. Ramos Clinic', phone: '0922 111 2233', address: 'Commercial Strip, Hwy', qty: 2, type: 'Purified', condition: 'swap', total: 70, payment: 'GCash', batch: 'batch1', status: 'Delivered' }
];

const DEFAULT_NOTICES = [
  {
    id: 1,
    badge: 'Notice to All',
    title: 'Saturday Rest Day Notice',
    body: 'R&R Water Refilling is closed every Saturday for scheduled equipment sanitization and UV filter maintenance. Multicab deliveries resume Sunday 8:00 AM.'
  },
  {
    id: 2,
    badge: 'Batch Roving',
    title: 'Batch #1 Roving Today',
    body: 'Water delivery multicab is currently dispatching in your Purok/Sitio cluster. Keep empty 5-gal carboys ready at the gate for fast swap!'
  },
  {
    id: 3,
    badge: 'Hygiene & Quality',
    title: 'Hygiene & Tamper Cap Seal',
    body: 'All gallons undergo 16-stage ultrafiltration and UV sanitization. Please ensure swapped carboys have no chemical residue or broken neck collars.'
  }
];

const DEFAULT_SETTINGS = {
  driverName: 'Kuya Jun & Delivery Crew',
  plateNumber: 'NBD-2841',
  truckCapacity: 50,
  fullStock: 52,
  emptyStock: 38,
  pricePurified: 35,
  priceAlkaline: 45,
  priceNewJug: 250
};

const DEFAULT_CUSTOMERS = [
  { id: 1, name: 'Neil', phone: '0917 555 0192', sitio: 'Cambarong', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Cambarong, Canhaway, Guindulman', purok: 'Cambarong, Canhaway', full: 2, empty: 1, velocity: 'Every 5 days', status: 'Active' },
  { id: 2, name: 'Nanay Tess', phone: '0918 234 5678', sitio: 'Purok 2', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Purok 2, Canhaway, Guindulman', purok: 'Purok 2, Canhaway', full: 1, empty: 2, velocity: 'Every 4 days', status: 'Active' },
  { id: 3, name: 'Kapitan Manny', phone: '0920 987 6543', sitio: 'Barangay Hall', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Barangay Hall, Canhaway, Guindulman', purok: 'Barangay Hall, Canhaway', full: 3, empty: 2, velocity: 'Every 7 days', status: 'Active' },
  { id: 4, name: 'Aling Susan Sari-Sari', phone: '0919 444 3322', sitio: 'Purok 1', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Purok 1, Canhaway, Guindulman', purok: 'Purok 1, Canhaway', full: 4, empty: 0, velocity: 'Every 3 days', status: 'Active' },
  { id: 5, name: 'Tito Dan', phone: '0917 888 9900', sitio: 'Sitio Ilaya', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Sitio Ilaya, Canhaway, Guindulman', purok: 'Sitio Ilaya, Canhaway', full: 1, empty: 0, velocity: 'Every 6 days', status: 'Active' },
  { id: 6, name: 'Dr. Ramos Clinic', phone: '0922 111 2233', sitio: 'Commercial Strip', barangay: 'Canhaway', municipality: 'Guindulman', address: 'Commercial Strip, Canhaway, Guindulman', purok: 'Commercial Strip, Canhaway', full: 2, empty: 1, velocity: 'Every 5 days', status: 'Active' }
];

// App State
let orders = [];
let notices = [];
let settings = {};
let customers = [];
let activeTab = 'orders';
let editingNoticeIndex = 0;

// DOM references
const htmlRoot = document.documentElement;
const themeToggleBtn = document.getElementById('adminThemeToggle');
const themeIcon = document.getElementById('adminThemeIcon');
const themeLabel = document.getElementById('adminThemeLabel');
const toastEl = document.getElementById('adminToast');
const toastText = document.getElementById('adminToastText');

// --- Authentication Guard for Station Admin Portal ---
function checkAdminAuth() {
  const rawSession = localStorage.getItem('rr_session');
  if (!rawSession) {
    window.location.replace('login.html');
    return false;
  }
  try {
    const session = JSON.parse(rawSession);
    if (!session || session.role !== 'admin') {
      window.location.replace('login.html');
      return false;
    }
    return true;
  } catch (e) {
    window.location.replace('login.html');
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isAuthed = checkAdminAuth();
  if (!isAuthed) return;

  loadState();
  initAdminSession();
  initTheme();
  initTabs();
  initOrders();
  initBroadcaster();
  initLedger();
  initCustomers();
  initAdminRealTimeSync();
  renderAll();
});

function initAdminSession() {
  const btnSignOut = document.getElementById('btnAdminSignOut');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', () => {
      localStorage.removeItem('rr_session');
      showToast('Admin signed out. Redirecting...');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 450);
    });
  }
}

// Toast Helper
function showToast(message) {
  toastText.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

// State Persistence
function loadState() {
  const storedOrders = localStorage.getItem('rr_admin_orders');
  orders = storedOrders ? JSON.parse(storedOrders) : [...DEFAULT_ORDERS];

  const storedNotices = localStorage.getItem('rr_notices');
  notices = storedNotices ? JSON.parse(storedNotices) : [...DEFAULT_NOTICES];

  const storedSettings = localStorage.getItem('rr_admin_settings');
  settings = storedSettings ? JSON.parse(storedSettings) : { ...DEFAULT_SETTINGS };

  const storedCustomers = localStorage.getItem('rr_admin_customers');
  customers = storedCustomers ? JSON.parse(storedCustomers) : [...DEFAULT_CUSTOMERS];
}

function saveState() {
  localStorage.setItem('rr_admin_orders', JSON.stringify(orders));
  localStorage.setItem('rr_notices', JSON.stringify(notices));
  localStorage.setItem('rr_admin_settings', JSON.stringify(settings));
  localStorage.setItem('rr_admin_customers', JSON.stringify(customers));
}

// Theme
function initTheme() {
  const savedTheme = localStorage.getItem('rr_theme') || 'light';
  setTheme(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = htmlRoot.classList.contains('dark') ? 'light' : 'dark';
    setTheme(nextTheme);
  });
}

function setTheme(theme) {
  localStorage.setItem('rr_theme', theme);
  const svgSun = '<svg class="mono-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  const svgMoon = '<svg class="mono-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  if (theme === 'dark') {
    htmlRoot.classList.add('dark');
    themeIcon.innerHTML = svgSun;
    themeLabel.textContent = 'Light Mode';
  } else {
    htmlRoot.classList.remove('dark');
    themeIcon.innerHTML = svgMoon;
    themeLabel.textContent = 'Dark Mode';
  }
}

// Tabs
function initTabs() {
  const tabButtons = document.querySelectorAll('.admin-tab-pill');
  const sections = {
    orders: document.getElementById('tabContentOrders'),
    broadcast: document.getElementById('tabContentBroadcast'),
    ledger: document.getElementById('tabContentLedger'),
    customers: document.getElementById('tabContentCustomers')
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      activeTab = target;

      tabButtons.forEach(b => b.classList.toggle('active', b === btn));
      Object.keys(sections).forEach(key => {
        if (sections[key]) {
          sections[key].style.display = key === target ? 'block' : 'none';
        }
      });
    });
  });
}

// --- Render All ---
function renderAll() {
  renderMetrics();
  renderOrdersTable();
  renderBroadcasterView();
  renderLedgerView();
  renderCustomersTable();
}

// Metrics
function renderMetrics() {
  // Revenue
  const totalRev = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const codRev = orders.filter(o => o.payment === 'COD').reduce((s, o) => s + (o.total || 0), 0);
  const gcashRev = orders.filter(o => o.payment === 'GCash').reduce((s, o) => s + (o.total || 0), 0);

  document.getElementById('statRevenue').textContent = `₱${totalRev.toLocaleString()}.00`;
  document.getElementById('statRevenueBreakdown').innerHTML = `<span>₱${codRev.toLocaleString()} COD</span> • <span>₱${gcashRev.toLocaleString()} GCash</span>`;

  // Multicab Truck
  const batch1Orders = orders.filter(o => o.batch === 'batch1' && o.status !== 'Delivered');
  const batch1Jugs = batch1Orders.reduce((s, o) => s + (o.qty || 0), 0);
  const capacity = settings.truckCapacity || 50;
  const pct = Math.min(100, Math.round((batch1Jugs / capacity) * 100));

  document.getElementById('statTruckCapacity').textContent = `${batch1Jugs} / ${capacity} Gallons`;
  document.getElementById('statTruckBar').style.width = `${pct}%`;
  document.getElementById('statDriverInfo').textContent = `${settings.driverName} • Plate: ${settings.plateNumber}`;

  // Station Stock
  document.getElementById('statStationStock').textContent = `${settings.fullStock} Full / ${settings.emptyStock} Empty`;

  // Order count badge
  document.getElementById('badgeOrderCount').textContent = orders.length;
}

// --- Orders Management ---
function initOrders() {
  const filterSelect = document.getElementById('selectOrderFilter');
  filterSelect.addEventListener('change', () => {
    renderOrdersTable(filterSelect.value);
  });

  // Mark Current Batch Arrived (Deliver All in Batch)
  const btnBatchArrived = document.getElementById('btnMarkBatchArrived');
  if (btnBatchArrived) {
    btnBatchArrived.addEventListener('click', async () => {
      const filter = filterSelect ? filterSelect.value : 'batch1';
      let targetOrders = orders.filter(o => o.status !== 'Delivered');

      if (filter === 'batch1' || filter === 'batch2') {
        targetOrders = targetOrders.filter(o => o.batch === filter);
      } else {
        targetOrders = targetOrders.filter(o => o.batch === 'batch1');
      }

      if (targetOrders.length === 0) {
        showToast('No active orders in this batch to mark delivered.');
        return;
      }

      const confirmed = await showConfirmDialog({
        title: 'Confirm Batch Arrival',
        message: `Mark ${targetOrders.length} order(s) as Delivered? Each customer will receive their ordered gallons and empty gallons will be set to 0.`,
        confirmText: 'Confirm Arrival',
        cancelText: 'Cancel',
        isDanger: false
      });

      if (!confirmed) return;

      targetOrders.forEach(order => {
        order.status = 'Delivered';
        applyOrderDeliveryStockUpdate(order);
        broadcastOrderStatusUpdate(order);
      });

      saveState();
      renderAll();
      showToast(`Batch arrived! ${targetOrders.length} customer inventories updated to ordered gallons & 0 empty.`);
    });
  }

  // New Order Modal
  const modalOverlay = document.getElementById('orderModalOverlay');
  const btnOpen = document.getElementById('btnOpenNewOrderModal');
  const btnClose = document.getElementById('btnOrderModalClose');
  const btnCancel = document.getElementById('btnCancelOrderModal');
  const form = document.getElementById('orderForm');

  btnOpen.addEventListener('click', () => {
    openOrderModal(null);
  });

  const closeModal = () => modalOverlay.classList.remove('open');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveOrderFromForm();
    closeModal();
  });

  // Edit Station Metrics Modal
  const metricsModal = document.getElementById('metricsModalOverlay');
  const btnEditMetrics = document.getElementById('btnEditStationMetrics');
  const btnEditDriver = document.getElementById('btnEditDriver');
  const btnEditInv = document.getElementById('btnEditInventoryQuick');
  const btnMetricsClose = document.getElementById('btnMetricsModalClose');
  const btnMetricsCancel = document.getElementById('btnCancelMetricsModal');
  const metricsForm = document.getElementById('metricsForm');

  const openMetrics = () => {
    document.getElementById('inputFullStock').value = settings.fullStock;
    document.getElementById('inputEmptyStock').value = settings.emptyStock;
    document.getElementById('inputDriverName').value = settings.driverName;
    document.getElementById('inputPlateNumber').value = settings.plateNumber;
    document.getElementById('inputTruckCapacity').value = settings.truckCapacity;
    metricsModal.classList.add('open');
  };

  if (btnEditMetrics) btnEditMetrics.addEventListener('click', openMetrics);
  if (btnEditDriver) btnEditDriver.addEventListener('click', openMetrics);
  if (btnEditInv) btnEditInv.addEventListener('click', openMetrics);

  const closeMetrics = () => metricsModal.classList.remove('open');
  if (btnMetricsClose) btnMetricsClose.addEventListener('click', closeMetrics);
  if (btnMetricsCancel) btnMetricsCancel.addEventListener('click', closeMetrics);

  metricsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    settings.fullStock = parseInt(document.getElementById('inputFullStock').value, 10) || 0;
    settings.emptyStock = parseInt(document.getElementById('inputEmptyStock').value, 10) || 0;
    settings.driverName = document.getElementById('inputDriverName').value.trim();
    settings.plateNumber = document.getElementById('inputPlateNumber').value.trim();
    settings.truckCapacity = parseInt(document.getElementById('inputTruckCapacity').value, 10) || 50;

    saveState();
    renderAll();
    closeMetrics();
    showToast('Station stock and driver details updated!');
  });
}

function openOrderModal(orderId = null) {
  const modal = document.getElementById('orderModalOverlay');
  const title = document.getElementById('orderModalTitle');
  document.getElementById('editOrderId').value = orderId ? orderId : '';

  if (orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    title.textContent = `Edit Order #${order.id}`;
    document.getElementById('orderCustomerName').value = order.name;
    document.getElementById('orderCustomerPhone').value = order.phone || '';
    document.getElementById('orderCustomerAddress').value = order.address;
    document.getElementById('orderQuantity').value = order.qty;
    document.getElementById('orderWaterType').value = order.type;
    document.getElementById('orderBottleCondition').value = order.condition;
    document.getElementById('orderPaymentMethod').value = order.payment;
    document.getElementById('orderBatch').value = order.batch || 'batch1';
    document.getElementById('orderStatus').value = order.status;
  } else {
    title.textContent = 'New Customer Order';
    document.getElementById('orderCustomerName').value = '';
    document.getElementById('orderCustomerPhone').value = '';
    document.getElementById('orderCustomerAddress').value = '';
    document.getElementById('orderQuantity').value = 2;
    document.getElementById('orderWaterType').value = 'Purified';
    document.getElementById('orderBottleCondition').value = 'swap';
    document.getElementById('orderPaymentMethod').value = 'COD';
    document.getElementById('orderBatch').value = 'batch1';
    document.getElementById('orderStatus').value = 'Pending';
  }

  modal.classList.add('open');
}

function saveOrderFromForm() {
  const editId = document.getElementById('editOrderId').value;
  const name = document.getElementById('orderCustomerName').value.trim();
  const phone = document.getElementById('orderCustomerPhone').value.trim();
  const address = document.getElementById('orderCustomerAddress').value.trim();
  const qty = parseInt(document.getElementById('orderQuantity').value, 10) || 1;
  const type = document.getElementById('orderWaterType').value;
  const condition = document.getElementById('orderBottleCondition').value;
  const payment = document.getElementById('orderPaymentMethod').value;
  const batch = document.getElementById('orderBatch').value;
  const status = document.getElementById('orderStatus').value;

  const unitPrice = type === 'Alkaline' ? settings.priceAlkaline : settings.pricePurified;
  const deposit = condition === 'deposit' ? (settings.priceNewJug * qty) : 0;
  const total = (unitPrice * qty) + deposit;

  if (editId) {
    const idNum = parseInt(editId, 10);
    const index = orders.findIndex(o => o.id === idNum);
    if (index !== -1) {
      const oldStatus = orders[index].status;
      orders[index] = { ...orders[index], name, phone, address, qty, type, condition, payment, batch, status, total };
      showToast(`Order #${idNum} updated!`);
      if (status !== oldStatus && (status === 'Confirmed' || status === 'Loaded' || status === 'Ready' || status === 'Delivered')) {
        if (status === 'Delivered') {
          applyOrderDeliveryStockUpdate(orders[index]);
        }
        broadcastOrderStatusUpdate(orders[index]);
      }
    }
  } else {
    const newId = (orders.length > 0 ? Math.max(...orders.map(o => o.id)) : 100) + 1;
    const newOrder = { id: newId, name, phone, address, qty, type, condition, payment, batch, status, total };
    orders.unshift(newOrder);
    showToast(`Order #${newId} created!`);
    if (status === 'Confirmed' || status === 'Loaded' || status === 'Ready' || status === 'Delivered') {
      if (status === 'Delivered') {
        applyOrderDeliveryStockUpdate(newOrder);
      }
      broadcastOrderStatusUpdate(newOrder);
    }
  }

  saveState();
  renderAll();
}

function renderOrdersTable(filter = null, highlightId = null) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filterSelect = document.getElementById('selectOrderFilter');
  const activeFilter = filter !== null ? filter : (filterSelect ? filterSelect.value : 'all');

  let filtered = [...orders];
  if (activeFilter === 'batch1') filtered = filtered.filter(o => o.batch === 'batch1');
  else if (activeFilter === 'batch2') filtered = filtered.filter(o => o.batch === 'batch2');
  else if (activeFilter === 'pending') filtered = filtered.filter(o => o.status === 'Pending');
  else if (activeFilter === 'delivered') filtered = filtered.filter(o => o.status === 'Delivered');

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-muted); padding: 30px;">No matching orders found.</td></tr>`;
    return;
  }

  filtered.forEach(order => {
    const tr = document.createElement('tr');
    tr.id = `order-row-${order.id}`;
    if (highlightId && order.id === highlightId) {
      tr.classList.add('row-new-order-highlight');
    }

    const statusClass = `status-${(order.status || 'Pending').toLowerCase().replace(/\s+/g, '')}`;
    const paymentClass = order.payment === 'GCash' ? 'payment-gcash' : 'payment-cod';

    const isNewTag = (highlightId && order.id === highlightId);
    let conditionLabel = 'Swap Empty';
    if (order.condition === 'deposit') {
      conditionLabel = 'New Gallon Deposit';
    } else if (order.condition === 'swap+new') {
      conditionLabel = 'Swap + New';
    }

    tr.innerHTML = `
      <td>
        <b>#${order.id}</b>
        ${isNewTag ? '<span class="live-pill-tag">NEW</span>' : ''}
      </td>
      <td>
        <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(order.name)}</div>
        <div style="font-size: 0.6875rem; color: var(--text-muted);">${escapeHtml(order.phone || '')}</div>
      </td>
      <td>${escapeHtml(order.address)}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          <img src="assets/water_jug.png" style="width: 16px; height: 20px; object-fit: contain;" />
          <b>${order.qty}x</b>
        </div>
      </td>
      <td>${order.type || 'Purified'}</td>
      <td>
        <span style="font-size: 0.75rem; color: ${order.condition === 'deposit' ? 'var(--color-sky-blue)' : 'var(--text-muted)'}; font-weight: ${order.condition === 'deposit' ? '700' : '500'};">
          ${conditionLabel}
        </span>
      </td>
      <td><b style="color: var(--text-main);">₱${Number(order.total || 0).toLocaleString()}</b></td>
      <td><span class="payment-pill ${paymentClass}">${order.payment}</span></td>
      <td>
        <span class="status-pill ${statusClass}" title="Click to advance status" data-order-status-id="${order.id}">
          ● ${order.status}
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn-icon-action" data-edit-order="${order.id}" title="Edit order">
          <svg class="mono-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="btn-icon-action delete" data-delete-order="${order.id}" title="Delete order">
          <svg class="mono-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach event listeners for row actions
  tbody.querySelectorAll('[data-order-status-id]').forEach(badge => {
    badge.addEventListener('click', () => {
      const id = parseInt(badge.dataset.orderStatusId, 10);
      advanceOrderStatus(id);
    });
  });

  tbody.querySelectorAll('[data-edit-order]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.editOrder, 10);
      openOrderModal(id);
    });
  });

  tbody.querySelectorAll('[data-delete-order]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.deleteOrder, 10);
      deleteOrder(id);
    });
  });

  // If a specific row was highlighted, smoothly bring it into view
  if (highlightId) {
    setTimeout(() => {
      const row = document.getElementById(`order-row-${highlightId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 60);
  }
}

function broadcastOrderStatusUpdate(order) {
  if (!order) return;
  const statusNormalized = (order.status === 'Loaded' || order.status === 'Ready') ? 'Ready' : order.status;
  
  const payload = {
    orderId: order.id,
    customerName: order.name,
    customerPhone: order.phone,
    address: order.address,
    qty: order.qty,
    type: order.type || 'Purified',
    total: order.total,
    payment: order.payment,
    batch: order.batch || 'batch1',
    status: order.status,
    statusNormalized: statusNormalized,
    timestamp: Date.now()
  };

  // 1. Broadcast instant storage event for real-time notification in customer tabs
  try {
    localStorage.setItem('rr_latest_order_status_update', JSON.stringify(payload));
  } catch (err) {
    console.warn('Could not broadcast order status update:', err);
  }

  // 2. Broadcast live across tabs/windows via BroadcastChannel
  try {
    const channel = new BroadcastChannel('rr_sync_channel');
    channel.postMessage({
      type: 'ORDER_STATUS_UPDATED',
      order: payload,
      timestamp: Date.now()
    });
  } catch (e) {}

  // 3. Persist in customer order notifications list
  try {
    const rawNotifs = localStorage.getItem('rr_customer_order_notifications');
    let notifs = rawNotifs ? JSON.parse(rawNotifs) : [];
    if (!Array.isArray(notifs)) notifs = [];
    notifs.unshift(payload);
    if (notifs.length > 25) notifs = notifs.slice(0, 25);
    localStorage.setItem('rr_customer_order_notifications', JSON.stringify(notifs));
  } catch (err) {
    console.warn('Could not persist customer order notification:', err);
  }
}

function applyOrderDeliveryStockUpdate(order) {
  if (!order) return;
  const custName = (order.name || '').toLowerCase();
  
  // 1. Update customer in the Customer Directory registry: ordered gallons and 0 empty
  const custIdx = customers.findIndex(c => c.name.toLowerCase() === custName);
  if (custIdx !== -1) {
    customers[custIdx].full = order.qty;
    customers[custIdx].empty = 0;
    try {
      localStorage.setItem('rr_admin_customers', JSON.stringify(customers));
    } catch (e) {}
    renderCustomersTable();
  }

  // 2. If it's Neil (or customer app user), sync app inventory to ordered gallons & 0 empty
  if (custName === 'neil' || custName.includes('neil')) {
    const inv = {
      fullJugs: order.qty,
      emptyJugs: 0,
      daysLeft: Math.max(4, order.qty * 4),
      swapReady: 0
    };
    try {
      localStorage.setItem('rr_inventory', JSON.stringify(inv));
    } catch (e) {}
  }
}

function advanceOrderStatus(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const cycle = ['Pending', 'Confirmed', 'Loaded', 'Delivered'];
  let curIdx = cycle.indexOf(order.status);
  if (curIdx === -1 && order.status === 'Ready') curIdx = cycle.indexOf('Loaded');
  const nextIdx = (curIdx + 1) % cycle.length;
  order.status = cycle[nextIdx];

  // When order arrives (marked Delivered): apply ordered gallons and 0 empty!
  if (order.status === 'Delivered') {
    applyOrderDeliveryStockUpdate(order);
  }

  saveState();
  renderAll();

  // Notify customer whenever order is marked as Confirmed, Loaded/Ready, or Delivered
  if (order.status === 'Confirmed' || order.status === 'Loaded' || order.status === 'Ready' || order.status === 'Delivered') {
    broadcastOrderStatusUpdate(order);
    if (order.status === 'Delivered') {
      showToast(`Order #${orderId} Delivered! Stock updated to ${order.qty} full, 0 empty.`);
    } else {
      showToast(`Order #${orderId} marked as ${order.status}! User notified.`);
    }
  } else {
    showToast(`Order #${orderId} set to ${order.status}.`);
  }
}

// --- Custom In-App Confirmation Pop-up Dialog (replaces native browser confirm) ---
function showConfirmDialog({
  title = 'Confirmation Required',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = true
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customConfirmOverlay');
    const titleEl = document.getElementById('confirmModalTitle');
    const descEl = document.getElementById('confirmModalDesc');
    const btnCancel = document.getElementById('btnConfirmCancel');
    const btnAccept = document.getElementById('btnConfirmAccept');
    const iconWrap = document.getElementById('confirmModalIconWrap');

    if (!overlay || !titleEl || !descEl || !btnCancel || !btnAccept) {
      resolve(confirm(message));
      return;
    }

    titleEl.textContent = title;
    descEl.textContent = message;
    btnAccept.textContent = confirmText;
    btnCancel.textContent = cancelText;

    if (isDanger) {
      btnAccept.className = 'btn-danger-dialog';
      if (iconWrap) {
        iconWrap.style.background = 'rgba(239, 68, 68, 0.12)';
        iconWrap.style.color = '#ef4444';
      }
    } else {
      btnAccept.className = 'btn-primary';
      if (iconWrap) {
        iconWrap.style.background = 'rgba(2, 132, 199, 0.12)';
        iconWrap.style.color = 'var(--color-sky-blue)';
      }
    }

    overlay.classList.add('open');

    function cleanup() {
      overlay.classList.remove('open');
      btnAccept.removeEventListener('click', onAccept);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
    }

    function onAccept() {
      cleanup();
      resolve(true);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    function onBackdrop(e) {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    }

    btnAccept.addEventListener('click', onAccept);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKey);
  });
}

async function deleteOrder(orderId) {
  const confirmed = await showConfirmDialog({
    title: 'Cancel Order',
    message: `Are you sure you want to cancel Order #${orderId}? This will remove it from the active delivery queue.`,
    confirmText: 'Yes, Cancel Order',
    cancelText: 'Keep Order',
    isDanger: true
  });

  if (confirmed) {
    orders = orders.filter(o => o.id !== orderId);
    saveState();
    renderAll();
    showToast(`Order #${orderId} canceled.`);
  }
}

// --- Station Notice Broadcaster ---
function initBroadcaster() {
  const selectSlide = document.getElementById('selectNoticeSlide');
  const inputTitle = document.getElementById('inputNoticeTitle');
  const inputBadge = document.getElementById('inputNoticeBadge');
  const inputBody = document.getElementById('inputNoticeBody');
  const btnSave = document.getElementById('btnSaveNotice');
  const btnDelete = document.getElementById('btnDeleteNotice');
  const btnAddNew = document.getElementById('btnAddNewNoticeSlide');

  selectSlide.addEventListener('change', () => {
    editingNoticeIndex = parseInt(selectSlide.value, 10);
    loadNoticeIntoForm();
  });

  const updatePreview = () => {
    document.getElementById('prevBadgeText').textContent = inputBadge.value || 'Notice';
    document.getElementById('prevHeadingText').textContent = inputTitle.value || 'Headline';
    document.getElementById('prevBodyText').textContent = inputBody.value || 'Notice description...';
  };

  inputTitle.addEventListener('input', updatePreview);
  inputBadge.addEventListener('input', updatePreview);
  inputBody.addEventListener('input', updatePreview);

  btnSave.addEventListener('click', () => {
    let savedNotice;
    if (notices[editingNoticeIndex]) {
      notices[editingNoticeIndex].title = inputTitle.value.trim() || 'Notice';
      notices[editingNoticeIndex].badge = inputBadge.value.trim() || 'Notice';
      notices[editingNoticeIndex].body = inputBody.value.trim();
      savedNotice = notices[editingNoticeIndex];
    } else {
      savedNotice = {
        id: Date.now(),
        title: inputTitle.value.trim() || 'Notice',
        badge: inputBadge.value.trim() || 'Notice',
        body: inputBody.value.trim()
      };
      notices.push(savedNotice);
      editingNoticeIndex = notices.length - 1;
    }
    saveState();
    // Broadcast in real-time across tabs for customer notifications
    try {
      localStorage.setItem('rr_latest_announcement', JSON.stringify({
        ...savedNotice,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.warn('Could not trigger broadcast storage event:', err);
    }
    renderBroadcasterView();
    showToast('Broadcast published! Synced to all customer apps.');
  });

  btnDelete.addEventListener('click', async () => {
    if (notices.length <= 1) {
      showToast('You must keep at least one active announcement slide.');
      return;
    }
    const confirmed = await showConfirmDialog({
      title: 'Delete Announcement',
      message: 'Are you sure you want to delete this announcement slide from customer carousels?',
      confirmText: 'Delete Slide',
      cancelText: 'Keep',
      isDanger: true
    });
    if (confirmed) {
      notices.splice(editingNoticeIndex, 1);
      editingNoticeIndex = 0;
      saveState();
      renderBroadcasterView();
      showToast('Announcement slide removed.');
    }
  });

  btnAddNew.addEventListener('click', () => {
    notices.push({
      id: Date.now(),
      badge: 'New Announcement',
      title: 'Water Station Advisory',
      body: 'Type your message details here for customer visibility.'
    });
    editingNoticeIndex = notices.length - 1;
    saveState();
    renderBroadcasterView();
    showToast('New slide added. Edit details and click Save!');
  });
}

function renderBroadcasterView() {
  const selectSlide = document.getElementById('selectNoticeSlide');
  selectSlide.innerHTML = '';

  notices.forEach((n, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `Slide ${idx + 1}: ${n.title}`;
    selectSlide.appendChild(opt);
  });

  if (editingNoticeIndex >= notices.length) {
    editingNoticeIndex = 0;
  }
  selectSlide.value = editingNoticeIndex;
  loadNoticeIntoForm();
}

function loadNoticeIntoForm() {
  const current = notices[editingNoticeIndex];
  if (!current) return;

  document.getElementById('inputNoticeTitle').value = current.title;
  document.getElementById('inputNoticeBadge').value = current.badge;
  document.getElementById('inputNoticeBody').value = current.body;

  document.getElementById('prevBadgeText').textContent = current.badge;
  document.getElementById('prevHeadingText').textContent = current.title;
  document.getElementById('prevBodyText').textContent = current.body;
  document.getElementById('prevCounterText').textContent = `${editingNoticeIndex + 1} of ${notices.length}`;
}

// --- 5-Gal Carboy Bottle Ledger ---
function initLedger() {
  const btnSavePricing = document.getElementById('btnSavePricing');
  if (btnSavePricing) {
    btnSavePricing.addEventListener('click', () => {
      settings.pricePurified = parseFloat(document.getElementById('priceRefillPurified').value) || 35;
      settings.priceAlkaline = parseFloat(document.getElementById('priceRefillAlkaline').value) || 45;
      settings.priceNewJug = parseFloat(document.getElementById('priceNewJug').value) || 250;

      saveState();
      showToast('Station pricing rules updated successfully!');
    });
  }
}

function renderLedgerView() {
  const totalCarboys = 250;
  const stationFull = settings.fullStock;
  const stationEmpty = settings.emptyStock;
  const fieldCarboys = totalCarboys - (stationFull + stationEmpty);

  document.getElementById('ledgerTotalCarboys').textContent = totalCarboys;
  document.getElementById('ledgerStationFull').textContent = stationFull;
  document.getElementById('ledgerStationEmpty').textContent = stationEmpty;
  document.getElementById('ledgerFieldCarboys').textContent = Math.max(0, fieldCarboys);

  document.getElementById('priceRefillPurified').value = settings.pricePurified;
  document.getElementById('priceRefillAlkaline').value = settings.priceAlkaline;
  document.getElementById('priceNewJug').value = settings.priceNewJug;
}

// --- Customer Directory ---
function initCustomers() {
  const modal = document.getElementById('customerModalOverlay');
  const btnOpen = document.getElementById('btnAddNewCustomerModal');
  const btnClose = document.getElementById('btnCustomerModalClose');
  const btnCancel = document.getElementById('btnCancelCustomerModal');
  const form = document.getElementById('customerForm');

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      document.getElementById('customerModalTitle').textContent = 'Add New Customer';
      document.getElementById('editCustomerId').value = '';
      document.getElementById('custName').value = '';
      document.getElementById('custPhone').value = '';
      if (document.getElementById('custSitio')) document.getElementById('custSitio').value = 'Cambarong';
      if (document.getElementById('custBarangay')) document.getElementById('custBarangay').value = 'Canhaway';
      if (document.getElementById('custMunicipality')) document.getElementById('custMunicipality').value = 'Guindulman';
      document.getElementById('custFull').value = 2;
      document.getElementById('custEmpty').value = 0;
      modal.classList.add('open');
    });
  }

  const closeModal = () => modal.classList.remove('open');
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('editCustomerId').value;
      const name = document.getElementById('custName').value.trim();
      const phone = document.getElementById('custPhone').value.trim();
      const sitio = document.getElementById('custSitio') ? document.getElementById('custSitio').value.trim() : '';
      const barangay = document.getElementById('custBarangay') ? document.getElementById('custBarangay').value.trim() : '';
      const municipality = document.getElementById('custMunicipality') ? document.getElementById('custMunicipality').value.trim() : '';
      const fullAddress = `${sitio}, ${barangay}, ${municipality}`;
      const full = parseInt(document.getElementById('custFull').value, 10) || 0;
      const empty = parseInt(document.getElementById('custEmpty').value, 10) || 0;

      if (editId) {
        const idNum = parseInt(editId, 10);
        const idx = customers.findIndex(c => c.id === idNum);
        if (idx !== -1) {
          customers[idx] = { 
            ...customers[idx], 
            name, 
            phone, 
            sitio, 
            barangay, 
            municipality, 
            address: fullAddress, 
            purok: `${sitio}, ${barangay}`, 
            full, 
            empty 
          };
          showToast(`Customer ${name} updated!`);
        }
      } else {
        const newId = customers.length + 1;
        customers.push({ 
          id: newId, 
          name, 
          phone, 
          sitio, 
          barangay, 
          municipality, 
          address: fullAddress, 
          purok: `${sitio}, ${barangay}`, 
          full, 
          empty, 
          velocity: 'Every 5 days', 
          status: 'Active' 
        });
        showToast(`Customer ${name} added!`);
      }

      saveState();
      renderCustomersTable();
      closeModal();
    });
  }
}

// --- Real-time Audio Notification Chime (Web Audio API - zero external assets) ---
function playOrderChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    
    // Note 1: E5 (659.25 Hz) - bright pleasant chime tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Note 2: B5 (987.77 Hz) - harmonic uplifting second bell
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.12);
    gain2.gain.setValueAtTime(0.24, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    // Graceful fallback if audio is blocked
  }
}

// --- Pulse Live Orders Tab Badge ---
function pulseOrderBadge() {
  const badge = document.getElementById('badgeOrderCount');
  if (badge) {
    badge.textContent = orders.length;
    badge.classList.remove('badge-pulse-active');
    void badge.offsetWidth;
    badge.classList.add('badge-pulse-active');
    setTimeout(() => {
      badge.classList.remove('badge-pulse-active');
    }, 2200);
  }
}

// --- Real-Time Incoming Order Processor ---
let lastHandledOrderId = null;

function handleIncomingNewOrder(order) {
  if (!order || !order.id) return;

  const isDuplicate = (lastHandledOrderId === order.id);
  lastHandledOrderId = order.id;

  // 1. Reload live database state
  loadState();

  // 2. Ensure order is present in live memory array
  const existingIdx = orders.findIndex(o => o.id === order.id);
  if (existingIdx === -1) {
    orders.unshift(order);
    saveState();
  } else {
    orders[existingIdx] = { ...orders[existingIdx], ...order };
    saveState();
  }

  // 3. Re-render Live Order Queue with real-time glow highlight
  renderOrdersTable(null, order.id);

  // 4. Update Admin Metrics (Revenue, Multicab Capacity, Badge counts)
  renderMetrics();

  // 5. Update 5-Gal Ledger
  renderLedgerView();

  // 6. Pulse Tab Badge
  pulseOrderBadge();

  // 7. Alert & Audio (skip duplicate triggers)
  if (!isDuplicate) {
    playOrderChime();
    showToast(`New Refill Order #${order.id} received from ${order.name}! (${order.qty}x ${order.type || 'Purified'} • ₱${(order.total || 0).toLocaleString()})`);
  }
}

// --- Centralized Station Admin Real-Time Synchronization Engine ---
function initAdminRealTimeSync() {
  // 1. Cross-Tab/Window Live BroadcastChannel
  try {
    const channel = new BroadcastChannel('rr_sync_channel');
    channel.onmessage = (event) => {
      if (!event.data) return;

      // Real-time new order placed
      if (event.data.type === 'NEW_ORDER_PLACED' && event.data.order) {
        handleIncomingNewOrder(event.data.order);
      }

      // Real-time customer registration or jug balance update
      if (event.data.type === 'CUSTOMER_REGISTERED' || event.data.type === 'CUSTOMER_UPDATED') {
        loadState();
        renderCustomersTable();
        renderMetrics();
        if (event.data.type === 'CUSTOMER_REGISTERED' && event.data.customer) {
          showToast(`New Customer Registered: ${event.data.customer.name} (${event.data.customer.sitio || 'Sitio'}, ${event.data.customer.barangay || 'Brgy'})!`);
        } else if (event.data.type === 'CUSTOMER_UPDATED' && event.data.customer) {
          showToast(`Customer balance updated: ${event.data.customer.name} (${event.data.customer.full} full, ${event.data.customer.empty} empty)`);
        }
      }
    };
  } catch (e) {
    console.warn('BroadcastChannel error', e);
  }

  // 2. Storage Event (fires across windows, tabs, and sessions)
  window.addEventListener('storage', (e) => {
    // New Order received via storage event
    if (e.key === 'rr_last_new_order' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        if (payload && payload.order) {
          handleIncomingNewOrder(payload.order);
        }
      } catch (err) {}
    } else if (e.key === 'rr_admin_orders') {
      loadState();
      renderOrdersTable();
      renderMetrics();
      renderLedgerView();
    }

    // Customer Directory updates
    if (e.key === 'rr_admin_customers' || e.key === 'rr_last_registered_customer') {
      loadState();
      renderCustomersTable();
      renderMetrics();
    }
  });
}

function renderCustomersTable() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Update Customer Directory count badge
  const custBadge = document.getElementById('badgeCustomerCount');
  if (custBadge) {
    custBadge.textContent = customers.length;
  }

  customers.forEach(cust => {
    const displayAddr = cust.address || (cust.sitio ? `${cust.sitio}, ${cust.barangay}, ${cust.municipality}` : cust.purok);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${escapeHtml(cust.name)}</b></td>
      <td>${escapeHtml(cust.phone)}</td>
      <td>${escapeHtml(displayAddr)}</td>
      <td>
        <span style="font-weight: 700; color: var(--color-sky-blue);">${cust.full} Full</span>, 
        <span style="color: var(--text-muted);">${cust.empty} Empty</span>
      </td>
      <td>${cust.velocity}</td>
      <td>
        <span style="font-size: 0.6875rem; font-weight: 700; color: #16a34a; background: #dcfce7; padding: 2px 8px; border-radius: 999px;">
          ${cust.status}
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn-icon-action" data-edit-cust="${cust.id}" title="Edit customer">
          <svg class="mono-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="btn-icon-action delete" data-delete-cust="${cust.id}" title="Delete customer">
          <svg class="mono-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit-cust]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.editCust, 10);
      const cust = customers.find(c => c.id === id);
      if (!cust) return;

      document.getElementById('customerModalTitle').textContent = `Edit ${cust.name}`;
      document.getElementById('editCustomerId').value = cust.id;
      document.getElementById('custName').value = cust.name;
      document.getElementById('custPhone').value = cust.phone;
      if (document.getElementById('custSitio')) document.getElementById('custSitio').value = cust.sitio || cust.purok || 'Cambarong';
      if (document.getElementById('custBarangay')) document.getElementById('custBarangay').value = cust.barangay || 'Canhaway';
      if (document.getElementById('custMunicipality')) document.getElementById('custMunicipality').value = cust.municipality || 'Guindulman';
      document.getElementById('custFull').value = cust.full;
      document.getElementById('custEmpty').value = cust.empty;
      document.getElementById('customerModalOverlay').classList.add('open');
    });
  });

  tbody.querySelectorAll('[data-delete-cust]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.deleteCust, 10);
      const confirmed = await showConfirmDialog({
        title: 'Delete Customer',
        message: 'Are you sure you want to remove this customer from the station directory?',
        confirmText: 'Delete Customer',
        cancelText: 'Cancel',
        isDanger: true
      });
      if (confirmed) {
        customers = customers.filter(c => c.id !== id);
        saveState();
        renderCustomersTable();
        showToast('Customer removed.');
      }
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// ==========================================================================
// R&R Water Refilling Station - Interactive App State & Controller
// ==========================================================================

const AppState = {
  theme: 'light',
  activeTab: 'home',
  bottleLimit: 0,
  isGallonsLocked: false,
  lockedLimit: 0,
  user: {
    name: 'Customer',
    email: '',
    sitio: 'Cambarong',
    barangay: 'Canhaway',
    municipality: 'Guindulman',
    address: 'Cambarong, Canhaway, Guindulman',
    phone: ''
  },
  inventory: {
    fullJugs: 0,
    emptyJugs: 0,
    daysLeft: 0,
    swapReady: 0
  },
  order: {
    quantity: 1,
    pricePerJug: 35,
    bottleSwap: true,
    paymentMethod: 'gcash' // 'gcash' or 'cod'
  },
  delivery: {
    batch: 'Batch #1 (Morning Dispatch)',
    status: 'Loaded',
    step: 3,
    driver: 'Kuya Jun & Delivery Crew',
    plate: 'NBD-2841'
  }
};

// --- DOM Elements ---
const htmlRoot = document.documentElement;
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const toastEl = document.getElementById('toastMsg');
const toastText = document.getElementById('toastText');

// --- Authentication Guard for Customer Mobile App ---
function checkCustomerAuthGuard() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'newuser') {
      localStorage.setItem('rr_session', JSON.stringify({
        role: 'customer',
        user: {
          id: 99,
          name: 'Bryl',
          email: 'bryl@gmail.com',
          sitio: 'Purok 1',
          barangay: 'Canhaway',
          municipality: 'Guindulman',
          address: 'Purok 1, Canhaway, Guindulman',
          phone: '0917 123 4567'
        }
      }));
      localStorage.removeItem('rr_gallons_configured_bryl@gmail.com');
      localStorage.setItem('rr_inventory', JSON.stringify({ fullJugs: 0, emptyJugs: 0, daysLeft: 0, swapReady: 0 }));
      localStorage.setItem('rr_inventory_bryl@gmail.com', JSON.stringify({ fullJugs: 0, emptyJugs: 0, daysLeft: 0, swapReady: 0 }));
    } else if (urlParams.get('demo') === 'configured') {
      localStorage.setItem('rr_session', JSON.stringify({
        role: 'customer',
        user: {
          id: 1,
          name: 'Neil',
          email: 'neil@gmail.com',
          sitio: 'Cambarong',
          barangay: 'Canhaway',
          municipality: 'Guindulman',
          address: 'Cambarong, Canhaway, Guindulman',
          phone: '0917 555 0192'
        }
      }));
      localStorage.setItem('rr_gallons_configured_neil@gmail.com', 'true');
      localStorage.setItem('rr_inventory', JSON.stringify({ fullJugs: 2, emptyJugs: 1, daysLeft: 6, swapReady: 1 }));
      localStorage.setItem('rr_inventory_neil@gmail.com', JSON.stringify({ fullJugs: 2, emptyJugs: 1, daysLeft: 6, swapReady: 1 }));
    } else if (urlParams.get('demo') === 'true' && !localStorage.getItem('rr_session')) {
      localStorage.setItem('rr_session', JSON.stringify({
        role: 'customer',
        user: {
          id: 1,
          name: 'Neil',
          email: 'neil@gmail.com',
          sitio: 'Cambarong',
          barangay: 'Canhaway',
          municipality: 'Guindulman',
          address: 'Cambarong, Canhaway, Guindulman',
          phone: '0917 555 0192'
        }
      }));
    }
  } catch (e) {}

  const rawSession = localStorage.getItem('rr_session');
  if (!rawSession) {
    window.location.replace('login.html');
    return false;
  }
  try {
    const session = JSON.parse(rawSession);
    if (!session || session.role !== 'customer' || !session.user) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  } catch (e) {
    window.location.replace('login.html');
    return false;
  }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const isAuthed = checkCustomerAuthGuard();
  if (!isAuthed) return;

  initSession();
  initTheme();
  initFluidWaveCanvas();
  initParallax3D();
  initTabs();
  initMetricCards();
  initCheckout();
  syncActiveOrderWithAdminState();
  initLeafletMap();
  initAnnouncementCarousel();
  initTopAnnouncementPopup();
  initNotificationBellTray();
  checkNewUserGallonsOnboarding();
});

// --- Toast Notification Helper ---
function showToast(message) {
  toastText.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3200);
}

// --- Auto-popup Onboarding Modal for New Users (Questioning Water Mascot) ---
function checkNewUserGallonsOnboarding() {
  const emailKey = (AppState.user && AppState.user.email) ? AppState.user.email.toLowerCase() : 'guest';
  const isConfigured = localStorage.getItem(`rr_gallons_configured_${emailKey}`);

  // If this user has not explicitly configured their container balance yet,
  // start at 0 bottles (never assume 2 or 3!) and pop up the onboarding modal!
  if (!isConfigured) {
    setTimeout(() => {
      if (typeof window.openSetGallonsModal === 'function') {
        window.openSetGallonsModal(true); // true = onboarding mode
      }
    }, 450);
  }
}

// --- 0. Session & Personalization Management ---
function initSession() {
  const rawSession = localStorage.getItem('rr_session');
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession);
      if (session && session.user && session.user.name) {
        AppState.user.name = session.user.name;
        AppState.user.email = session.user.email || '';
        AppState.user.phone = session.user.phone || '0917 555 0192';
        AppState.user.sitio = session.user.sitio || 'Cambarong';
        AppState.user.barangay = session.user.barangay || 'Canhaway';
        AppState.user.municipality = session.user.municipality || 'Guindulman';
        AppState.user.address = session.user.address || `${AppState.user.sitio}, ${AppState.user.barangay}, ${AppState.user.municipality}`;

        // Format live date like "SUNDAY, SEPTEMBER 20" (Inspired by reference UI)
        const dateEl = document.getElementById('headerLiveDate');
        if (dateEl) {
          const now = new Date();
          const options = { weekday: 'long', month: 'long', day: 'numeric' };
          dateEl.textContent = now.toLocaleDateString('en-US', options).toUpperCase();
        }

        // Time of day personalized greeting (Morning / Afternoon / Evening)
        const greetingTextEl = document.getElementById('headerGreetingText');
        if (greetingTextEl) {
          const hour = new Date().getHours();
          let timeGreeting = 'Good morning';
          if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
          else if (hour >= 17 || hour < 5) timeGreeting = 'Good evening';

          greetingTextEl.innerHTML = `${timeGreeting}, <span class="user-highlight" id="headerUserName">${AppState.user.name}</span>!`;
        }

        // Update greeting in DOM
        const greetingSpan = document.querySelector('.header-greeting span');
        if (greetingSpan) {
          greetingSpan.textContent = `R&R Water`;
        }

        // Update Account & Profile tab in DOM
        const profileUserName = document.getElementById('profileUserName');
        if (profileUserName) {
          profileUserName.textContent = AppState.user.name;
        }

        const profileAddressText = document.getElementById('profileAddressText');
        if (profileAddressText) {
          profileAddressText.textContent = `${AppState.user.address} • ${AppState.user.phone}`;
        }

        // Pull customer's live inventory balance from Station Admin Customer Directory
        loadCustomerDirectoryInventory();
      }
    } catch (e) {
      console.warn('Session parse error', e);
    }
  }

  // Handle Sign Out from both Desktop Header and In-App Mobile Tab
  const handleSignOut = () => {
    localStorage.removeItem('rr_session');
    showToast('Signed out. Redirecting to login...');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 450);
  };

  const btnSignOut = document.getElementById('btnCustomerSignOut');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', handleSignOut);
  }

  const btnMobileSignOut = document.getElementById('btnMobileSignOut');
  if (btnMobileSignOut) {
    btnMobileSignOut.addEventListener('click', handleSignOut);
  }
}

// --- Load Individual Customer Jug Inventory from Station Admin Directory ---
function loadCustomerDirectoryInventory() {
  const rawCustomers = localStorage.getItem('rr_admin_customers');
  if (!rawCustomers) return;
  try {
    const custList = JSON.parse(rawCustomers);
    const myCust = custList.find(c => 
      (c.email && AppState.user.email && c.email.toLowerCase() === AppState.user.email.toLowerCase()) ||
      (c.name && c.name.toLowerCase() === AppState.user.name.toLowerCase())
    );
    if (myCust) {
      if (typeof myCust.full === 'number') AppState.inventory.fullJugs = myCust.full;
      if (typeof myCust.empty === 'number') AppState.inventory.emptyJugs = myCust.empty;
      AppState.inventory.daysLeft = AppState.inventory.fullJugs > 0 ? AppState.inventory.fullJugs * 3 : 0;
      AppState.inventory.swapReady = AppState.inventory.emptyJugs;
      AppState.bottleLimit = (typeof myCust.bottleLimit === 'number' && myCust.bottleLimit > 0)
        ? myCust.bottleLimit
        : (AppState.inventory.fullJugs + AppState.inventory.emptyJugs);
    }
  } catch (e) {}
}

// --- Live Synchronize Customer Jug Updates to Station Admin Directory ---
function syncCustomerInventoryToAdminDirectory(customerName, full, empty) {
  const rawCust = localStorage.getItem('rr_admin_customers');
  if (!rawCust) return;
  try {
    let custList = JSON.parse(rawCust);
    const idx = custList.findIndex(c => 
      (c.email && AppState.user.email && c.email.toLowerCase() === AppState.user.email.toLowerCase()) ||
      (c.name && c.name.toLowerCase() === customerName.toLowerCase())
    );
    if (idx !== -1) {
      custList[idx].full = full;
      custList[idx].empty = empty;
      localStorage.setItem('rr_admin_customers', JSON.stringify(custList));

      try {
        const channel = new BroadcastChannel('rr_sync_channel');
        channel.postMessage({
          type: 'CUSTOMER_UPDATED',
          customer: custList[idx],
          timestamp: Date.now()
        });
      } catch (e) {}
    }
  } catch (e) {}
}

// --- 1. Theme Management (Light / Dark Mode) ---
function initTheme() {
  const savedTheme = localStorage.getItem('rr_theme') || 'light';
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const newTheme = AppState.theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }
}

function setTheme(theme) {
  AppState.theme = theme;
  localStorage.setItem('rr_theme', theme);

  const svgSun = '<svg class="mono-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  const svgMoon = '<svg class="mono-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  if (theme === 'dark') {
    htmlRoot.classList.add('dark');
    if (themeIcon) themeIcon.innerHTML = svgSun;
    if (themeLabel) themeLabel.textContent = 'Light Mode';
  } else {
    htmlRoot.classList.remove('dark');
    if (themeIcon) themeIcon.innerHTML = svgMoon;
    if (themeLabel) themeLabel.textContent = 'Dark Mode';
  }

  // Update map tiles if map exists
  if (window.leafletMap && window.tileLayerLight && window.tileLayerDark) {
    if (theme === 'dark') {
      window.leafletMap.removeLayer(window.tileLayerLight);
      window.tileLayerDark.addTo(window.leafletMap);
    } else {
      window.leafletMap.removeLayer(window.tileLayerDark);
      window.tileLayerLight.addTo(window.leafletMap);
    }
  }
}

// --- 2. Live HTML5 3D Fluid Wave Canvas Animation Engine ---
function initFluidWaveCanvas() {
  const canvas = document.getElementById('fluidCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth || 240;
    canvas.height = canvas.parentElement.clientHeight || 280;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  let step = 0;
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    step += 0.045;

    const w = canvas.width;
    const h = canvas.height;
    const waterLevel = h * 0.42;

    // Gradient 1: Deep Aqua Back Wave
    const gradBack = ctx.createLinearGradient(0, waterLevel - 20, 0, h);
    gradBack.addColorStop(0, 'rgba(2, 132, 199, 0.45)');
    gradBack.addColorStop(1, 'rgba(3, 105, 161, 0.75)');

    ctx.fillStyle = gradBack;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = waterLevel + Math.sin(x * 0.025 + step) * 9;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Gradient 2: Crisp Foreground Blue Wave
    const gradFront = ctx.createLinearGradient(0, waterLevel - 15, 0, h);
    gradFront.addColorStop(0, 'rgba(14, 165, 233, 0.7)');
    gradFront.addColorStop(0.5, 'rgba(2, 132, 199, 0.85)');
    gradFront.addColorStop(1, 'rgba(3, 105, 161, 0.95)');

    ctx.fillStyle = gradFront;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = waterLevel + Math.cos(x * 0.02 + step * 1.15) * 8 + 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Floating micro-bubbles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    const b1x = (w * 0.3 + Math.sin(step * 0.7) * 15) % w;
    const b1y = (h - ((step * 30) % (h - waterLevel)));
    ctx.beginPath();
    ctx.arc(b1x, b1y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const b2x = (w * 0.65 + Math.cos(step * 0.9) * 20) % w;
    const b2y = (h - (((step + 2) * 24) % (h - waterLevel)));
    ctx.beginPath();
    ctx.arc(b2x, b2y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(render);
  }

  render();
}

// --- 3. Parallax 3D Perspective Tilt on Water Jug Hero ---
function initParallax3D() {
  const card = document.getElementById('heroCard');
  const stage = document.getElementById('bottleStage');
  const reflection = document.getElementById('bottleReflection');

  if (!card || !stage) return;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    const rotX = -(y / (rect.height / 2)) * 16;
    const rotY = (x / (rect.width / 2)) * 16;

    stage.style.animation = 'none';
    stage.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(30px)`;

    if (reflection) {
      reflection.style.transform = `translateX(${rotY * 1.5}px) scale(${1 - Math.abs(rotX)/50})`;
    }
  });

  card.addEventListener('mouseleave', () => {
    stage.style.animation = 'float-bottle 4.5s ease-in-out infinite alternate';
    stage.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
    if (reflection) {
      reflection.style.transform = 'translateX(0px) scale(1)';
    }
  });
}

// --- 4. Tab Navigation Controller ---
function initTabs() {
  const dockItems = document.querySelectorAll('.dock-item');

  dockItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab) {
      switchTab(initialTab);
    }
  } catch (e) {}
}

function switchTab(tabName) {
  AppState.activeTab = tabName;

  document.querySelectorAll('.dock-item').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `tab-${tabName}`);
  });

  if (tabName === 'map' && window.leafletMap) {
    setTimeout(() => {
      window.leafletMap.invalidateSize();
      if (window.truckMarkerRef) {
        window.leafletMap.panTo(window.truckMarkerRef.getLatLng());
      }
    }, 180);
  }
}

// --- 5. Interactive 2x2 Metric Cards & Set Gallons Controller ---
function initMetricCards() {
  const fullEmptyVal = document.getElementById('valFullEmpty');
  const daysLeftVal = document.getElementById('valDaysLeft');
  const emptiesSwapVal = document.getElementById('valEmptiesSwap');
  const btnEditDays = document.getElementById('btnEditDays');
  const btnLogFinished = document.getElementById('btnLogFinished');
  const cardEmptiesSwap = document.getElementById('cardEmptiesSwap');
  const emptyBanner = document.getElementById('emptyStateBanner');

  // Modal elements
  const gallonsModal = document.getElementById('setGallonsModalOverlay');
  const btnCloseGallons = document.getElementById('btnSetGallonsClose');
  const btnCancelGallons = document.getElementById('btnCancelSetGallons');
  const formGallons = document.getElementById('setGallonsForm');
  const inputFull = document.getElementById('inputHomeFull');
  const inputEmpty = document.getElementById('inputHomeEmpty');
  const previewTotal = document.getElementById('totalGallonsPreview');

  // Load persisted inventory if available
  const emailKey = (AppState.user && AppState.user.email) ? AppState.user.email.toLowerCase() : 'guest';
  const userKey = AppState.user.email ? `rr_inventory_${AppState.user.email}` : 'rr_inventory';
  const savedInv = localStorage.getItem(userKey) || localStorage.getItem('rr_inventory');
  if (savedInv) {
    try {
      const parsed = JSON.parse(savedInv);
      if (parsed && typeof parsed.fullJugs === 'number') {
        AppState.inventory.fullJugs = Number(parsed.fullJugs);
        AppState.inventory.emptyJugs = Number(parsed.emptyJugs);
        AppState.inventory.daysLeft = typeof parsed.daysLeft === 'number' ? Number(parsed.daysLeft) : (parsed.fullJugs * 3);
        AppState.inventory.swapReady = parsed.swapReady !== undefined ? Number(parsed.swapReady) : Number(parsed.emptyJugs);
        AppState.bottleLimit = AppState.inventory.fullJugs + AppState.inventory.emptyJugs;
      }
    } catch (e) {}
  }

  // Load gallon capacity lock state
  const savedLocked = localStorage.getItem(`rr_gallons_locked_${emailKey}`);
  if (savedLocked === 'true') {
    AppState.isGallonsLocked = true;
    AppState.lockedLimit = parseInt(localStorage.getItem(`rr_gallons_locked_limit_${emailKey}`), 10) || (AppState.inventory.fullJugs + AppState.inventory.emptyJugs);
    AppState.bottleLimit = AppState.lockedLimit;
  }

  // Expand capacity quantity state (1 - 20)
  let expandGallonsQty = 1;
  let buyGallonPaymentMethod = 'cod';

  function updateExpandCapacityUI() {
    const valQty = document.getElementById('valExpandQty');
    const valPrice = document.getElementById('valExpandPrice');
    const btnBuy = document.getElementById('btnConfirmBuyExpand');

    if (valQty) valQty.textContent = expandGallonsQty;
    const totalPrice = expandGallonsQty * 250;
    if (valPrice) valPrice.textContent = `₱${totalPrice.toLocaleString()}.00`;
    if (btnBuy) {
      btnBuy.innerHTML = `+ Buy ${expandGallonsQty} Gallon${expandGallonsQty > 1 ? 's' : ''} &amp; Expand Limit (₱${totalPrice.toLocaleString()})`;
    }
  }

  function updateCards() {
    if (fullEmptyVal) fullEmptyVal.textContent = `${AppState.inventory.fullJugs} full, ${AppState.inventory.emptyJugs} empty`;
    if (daysLeftVal) daysLeftVal.textContent = `${AppState.inventory.daysLeft} day${AppState.inventory.daysLeft === 1 ? '' : 's'} left`;
    if (emptiesSwapVal) emptiesSwapVal.textContent = `${AppState.inventory.emptyJugs} gallon${AppState.inventory.emptyJugs === 1 ? '' : 's'} ready`;

    // Update dedicated Gallons Tab UI elements
    const tabFull = document.getElementById('valGallonsTabFull');
    const tabEmpty = document.getElementById('valGallonsTabEmpty');
    const tabTotal = document.getElementById('valGallonsTabTotal');
    const tabInputFull = document.getElementById('inputTabFull');
    const tabInputEmpty = document.getElementById('inputTabEmpty');
    const tabTotalPreview = document.getElementById('tabGallonsTotalPreview');
    const lockedBanner = document.getElementById('lockedLimitBanner');
    const lblLockedLimit = document.getElementById('lblLockedLimit');
    const tabLockBadge = document.getElementById('tabGallonLockStatusBadge');
    const btnSaveTab = document.getElementById('btnSaveGallonsFromTab');

    const totalContainers = (AppState.inventory.fullJugs || 0) + (AppState.inventory.emptyJugs || 0);

    if (tabFull) tabFull.textContent = AppState.inventory.fullJugs;
    if (tabEmpty) tabEmpty.textContent = AppState.inventory.emptyJugs;
    if (tabTotal) tabTotal.textContent = totalContainers;
    if (tabInputFull) tabInputFull.value = AppState.inventory.fullJugs;
    if (tabInputEmpty) tabInputEmpty.value = AppState.inventory.emptyJugs;
    if (tabTotalPreview) tabTotalPreview.textContent = `${totalContainers} Gallons`;

    if (AppState.isGallonsLocked) {
      if (lockedBanner) lockedBanner.style.display = 'flex';
      if (lblLockedLimit) lblLockedLimit.textContent = AppState.lockedLimit;
      if (tabLockBadge) tabLockBadge.style.display = 'inline-block';
      if (btnSaveTab) btnSaveTab.textContent = `Save Gallons Allocation (${AppState.lockedLimit} Max)`;
    } else {
      if (lockedBanner) lockedBanner.style.display = 'none';
      if (tabLockBadge) tabLockBadge.style.display = 'none';
      if (btnSaveTab) btnSaveTab.textContent = 'Save & Remember Gallons';
    }

    updateExpandCapacityUI();

    // Update Mascot Speech Bubble Banner
    const mascotImg = document.getElementById('homeMascotImg');
    const mascotSpeaker = document.getElementById('mascotSpeakerName');
    const mascotText = document.getElementById('mascotSpeechText');
    const mascotActionLabel = document.getElementById('mascotActionLabel');
    const mascotBanner = document.getElementById('mascotSpeechBanner');
    const mascotInlineInput = document.getElementById('mascotInlineInput');
    const mascotSavedStatus = document.getElementById('mascotSavedStatus');
    const mascotStatusSummary = document.getElementById('mascotStatusSummary');
    const inputBannerFull = document.getElementById('inputBannerFull');
    const inputBannerEmpty = document.getElementById('inputBannerEmpty');

    const full = AppState.inventory.fullJugs || 0;
    const empty = AppState.inventory.emptyJugs || 0;

    if (inputBannerFull) inputBannerFull.value = full;
    if (inputBannerEmpty) inputBannerEmpty.value = empty;

    if (mascotSpeaker) {
      mascotSpeaker.innerHTML = '<span>Droppy</span>';
    }

    const isConfigured = localStorage.getItem(`rr_gallons_configured_${emailKey}`) === 'true';

    if (!isConfigured && full === 0 && empty === 0) {
      if (mascotImg) mascotImg.src = 'assets/water_mascot_question_transparent.png';
      if (mascotText) mascotText.textContent = "How many gallons do you have right now? Let's configure your water inventory so you never run out of refills!";
      if (mascotActionLabel) mascotActionLabel.textContent = 'Set Gallons';
      if (mascotInlineInput) mascotInlineInput.style.display = 'block';
      if (mascotSavedStatus) mascotSavedStatus.style.display = 'none';
    } else if (empty > 0) {
      if (mascotImg) mascotImg.src = 'assets/water_mascot_question_transparent.png';
      if (mascotText) mascotText.textContent = `You have ${empty} empty gallon${empty > 1 ? 's' : ''} ready for swap! Let's schedule your doorstep multicab refill.`;
      if (mascotActionLabel) mascotActionLabel.textContent = 'Order Refill';
      if (mascotInlineInput) mascotInlineInput.style.display = 'none';
      if (mascotSavedStatus) {
        mascotSavedStatus.style.display = 'flex';
        if (mascotStatusSummary) {
          mascotStatusSummary.textContent = `${full} full, ${empty} empty (${AppState.isGallonsLocked ? 'Limit: ' + AppState.lockedLimit + ' Locked' : 'Total: ' + (full + empty)})`;
        }
      }
    } else {
      if (mascotImg) mascotImg.src = 'assets/water_mascot_waving_transparent.png';
      if (mascotText) mascotText.textContent = `All set! You have ${full} full gallon${full > 1 ? 's' : ''} ready for drinking. Stay refreshed and hydrated today!`;
      if (mascotActionLabel) mascotActionLabel.textContent = 'My Gallons';
      if (mascotInlineInput) mascotInlineInput.style.display = 'none';
      if (mascotSavedStatus) {
        mascotSavedStatus.style.display = 'flex';
        if (mascotStatusSummary) {
          mascotStatusSummary.textContent = `${full} full, ${empty} empty (${AppState.isGallonsLocked ? 'Limit: ' + AppState.lockedLimit + ' Locked' : 'Total: ' + (full + empty)})`;
        }
      }
    }
  }

  // --- Modal Open / Close Logic with Questioning Mascot & Onboarding Support ---
  function openSetGallonsModal(isOnboarding = false) {
    if (!gallonsModal) return;
    if (inputFull) inputFull.value = AppState.inventory.fullJugs;
    if (inputEmpty) inputEmpty.value = AppState.inventory.emptyJugs;
    updateGallonsPreview();

    const titleEl = document.getElementById('setGallonsModalTitle');
    const descEl = document.getElementById('setGallonsModalDesc');
    const badgeEl = document.getElementById('modalOnboardingBadge');
    const modalLockedAlert = document.getElementById('modalLockedLimitAlert');
    const modalLockedNum = document.getElementById('modalLockedLimitNumber');
    const btnModalBuy = document.getElementById('btnModalBuyExpand');

    if (AppState.isGallonsLocked) {
      if (modalLockedAlert) modalLockedAlert.style.display = 'block';
      if (modalLockedNum) modalLockedNum.textContent = AppState.lockedLimit;
      if (btnModalBuy) btnModalBuy.style.display = 'flex';
    } else {
      if (modalLockedAlert) modalLockedAlert.style.display = 'none';
      if (btnModalBuy) btnModalBuy.style.display = 'none';
    }

    if (isOnboarding) {
      if (titleEl) titleEl.textContent = 'How many gallons do you have?';
      if (descEl) descEl.textContent = 'Welcome! Tell us how many 5-gal carboys you currently have at home so we can track your swaps and water supply. We never assume 2 or 3!';
      if (badgeEl) badgeEl.textContent = 'New Customer Setup';
    } else {
      if (titleEl) titleEl.textContent = 'Set Home Gallons';
      if (descEl) descEl.textContent = 'Input how many 5-gallon containers you have at home. We remember your gallon count and dynamically update your swap limits.';
      if (badgeEl) badgeEl.textContent = 'Container Balance';
    }

    gallonsModal.classList.add('open');
  }

  window.openSetGallonsModal = openSetGallonsModal;

  function closeSetGallonsModal() {
    if (gallonsModal) gallonsModal.classList.remove('open');
  }

  function updateGallonsPreview() {
    const f = parseInt(inputFull?.value, 10) || 0;
    const e = parseInt(inputEmpty?.value, 10) || 0;
    if (previewTotal) {
      previewTotal.textContent = `${f + e} Gallons (${f} full, ${e} empty)`;
    }
  }

  if (inputFull) inputFull.addEventListener('input', updateGallonsPreview);
  if (inputEmpty) inputEmpty.addEventListener('input', updateGallonsPreview);

  // Stepper buttons inside the popup modal
  const btnModalMinusFull = document.getElementById('btnModalMinusFull');
  const btnModalPlusFull = document.getElementById('btnModalPlusFull');
  const btnModalMinusEmpty = document.getElementById('btnModalMinusEmpty');
  const btnModalPlusEmpty = document.getElementById('btnModalPlusEmpty');

  if (btnModalMinusFull) {
    btnModalMinusFull.addEventListener('click', () => {
      const cur = parseInt(inputFull.value, 10) || 0;
      if (cur > 0) {
        inputFull.value = cur - 1;
        updateGallonsPreview();
      }
    });
  }

  if (btnModalPlusFull) {
    btnModalPlusFull.addEventListener('click', () => {
      const cur = parseInt(inputFull.value, 10) || 0;
      const curEmpty = parseInt(inputEmpty.value, 10) || 0;
      if (AppState.isGallonsLocked && (cur + curEmpty) >= AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons! Tap "+ Buy New Gallon" to expand.`);
        return;
      }
      inputFull.value = cur + 1;
      updateGallonsPreview();
    });
  }

  if (btnModalMinusEmpty) {
    btnModalMinusEmpty.addEventListener('click', () => {
      const cur = parseInt(inputEmpty.value, 10) || 0;
      if (cur > 0) {
        inputEmpty.value = cur - 1;
        updateGallonsPreview();
      }
    });
  }

  if (btnModalPlusEmpty) {
    btnModalPlusEmpty.addEventListener('click', () => {
      const cur = parseInt(inputEmpty.value, 10) || 0;
      const curFull = parseInt(inputFull.value, 10) || 0;
      if (AppState.isGallonsLocked && (cur + curFull) >= AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons! Tap "+ Buy New Gallon" to expand.`);
        return;
      }
      inputEmpty.value = cur + 1;
      updateGallonsPreview();
    });
  }

  // "I don't have bottles yet (Start with 0)" button
  const btnZeroGallons = document.getElementById('btnZeroGallonsStart');
  if (btnZeroGallons) {
    btnZeroGallons.addEventListener('click', () => {
      const emailKey = (AppState.user && AppState.user.email) ? AppState.user.email.toLowerCase() : 'guest';
      localStorage.setItem(`rr_gallons_configured_${emailKey}`, 'true');

      AppState.inventory.fullJugs = 0;
      AppState.inventory.emptyJugs = 0;
      AppState.inventory.daysLeft = 0;
      AppState.inventory.swapReady = 0;
      AppState.bottleLimit = 0;
      AppState.isGallonsLocked = false;
      AppState.lockedLimit = 0;

      const invPayload = { fullJugs: 0, emptyJugs: 0, daysLeft: 0, swapReady: 0, isLocked: false, lockedLimit: 0 };
      localStorage.setItem('rr_inventory', JSON.stringify(invPayload));
      if (AppState.user.email) {
        localStorage.setItem(`rr_inventory_${AppState.user.email}`, JSON.stringify(invPayload));
      }

      syncCustomerInventoryToAdminDirectory(AppState.user.name, 0, 0);
      updateCards();
      if (typeof window.updateCheckoutOrderUI === 'function') {
        window.updateCheckoutOrderUI();
      }

      closeSetGallonsModal();
      showToast('Started at 0 bottles. Tap "+ Buy New Gallon" (+₱250) anytime or set your gallons on the Gallons tab!');
    });
  }

  // --- Dedicated Gallons Tab Steppers and Form ---
  const inputTabFull = document.getElementById('inputTabFull');
  const inputTabEmpty = document.getElementById('inputTabEmpty');
  const tabGallonsPreview = document.getElementById('tabGallonsTotalPreview');
  const btnTabMinusFull = document.getElementById('btnTabMinusFull');
  const btnTabPlusFull = document.getElementById('btnTabPlusFull');
  const btnTabMinusEmpty = document.getElementById('btnTabMinusEmpty');
  const btnTabPlusEmpty = document.getElementById('btnTabPlusEmpty');
  const btnSaveGallonsFromTab = document.getElementById('btnSaveGallonsFromTab');
  const btnTabLogFinished = document.getElementById('btnTabLogFinished');
  const btnTabOrderEmpties = document.getElementById('btnTabOrderEmpties');

  function updateTabGallonsPreview() {
    const f = parseInt(inputTabFull?.value, 10) || 0;
    const e = parseInt(inputTabEmpty?.value, 10) || 0;
    if (tabGallonsPreview) {
      tabGallonsPreview.textContent = `${f + e} Gallons`;
    }
  }

  if (inputTabFull) {
    inputTabFull.addEventListener('input', updateTabGallonsPreview);
    inputTabFull.addEventListener('change', () => {
      let f = parseInt(inputTabFull.value, 10) || 0;
      let e = parseInt(inputTabEmpty?.value, 10) || 0;
      if (f < 0) { f = 0; inputTabFull.value = 0; }
      if (AppState.isGallonsLocked && (f + e) > AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons. Purchase new gallons below to expand!`);
        f = Math.max(0, AppState.lockedLimit - e);
        inputTabFull.value = f;
      }
      updateTabGallonsPreview();
    });
  }

  if (inputTabEmpty) {
    inputTabEmpty.addEventListener('input', updateTabGallonsPreview);
    inputTabEmpty.addEventListener('change', () => {
      let f = parseInt(inputTabFull?.value, 10) || 0;
      let e = parseInt(inputTabEmpty.value, 10) || 0;
      if (e < 0) { e = 0; inputTabEmpty.value = 0; }
      if (AppState.isGallonsLocked && (f + e) > AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons. Purchase new gallons below to expand!`);
        e = Math.max(0, AppState.lockedLimit - f);
        inputTabEmpty.value = e;
      }
      updateTabGallonsPreview();
    });
  }

  if (btnTabMinusFull) {
    btnTabMinusFull.addEventListener('click', () => {
      const cur = parseInt(inputTabFull.value, 10) || 0;
      if (cur > 0) {
        inputTabFull.value = cur - 1;
        updateTabGallonsPreview();
      }
    });
  }

  if (btnTabPlusFull) {
    btnTabPlusFull.addEventListener('click', () => {
      const curFull = parseInt(inputTabFull.value, 10) || 0;
      const curEmpty = parseInt(inputTabEmpty.value, 10) || 0;
      if (AppState.isGallonsLocked && (curFull + curEmpty) >= AppState.lockedLimit) {
        showToast(`Container limit is locked at ${AppState.lockedLimit} Gallons! To expand, buy new gallons below (+₱250 each).`);
        const cardExpand = document.getElementById('cardExpandCapacity');
        if (cardExpand) cardExpand.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      inputTabFull.value = curFull + 1;
      updateTabGallonsPreview();
    });
  }

  if (btnTabMinusEmpty) {
    btnTabMinusEmpty.addEventListener('click', () => {
      const cur = parseInt(inputTabEmpty.value, 10) || 0;
      if (cur > 0) {
        inputTabEmpty.value = cur - 1;
        updateTabGallonsPreview();
      }
    });
  }

  if (btnTabPlusEmpty) {
    btnTabPlusEmpty.addEventListener('click', () => {
      const curFull = parseInt(inputTabFull.value, 10) || 0;
      const curEmpty = parseInt(inputTabEmpty.value, 10) || 0;
      if (AppState.isGallonsLocked && (curFull + curEmpty) >= AppState.lockedLimit) {
        showToast(`Container limit is locked at ${AppState.lockedLimit} Gallons! To expand, buy new gallons below (+₱250 each).`);
        const cardExpand = document.getElementById('cardExpandCapacity');
        if (cardExpand) cardExpand.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      inputTabEmpty.value = curEmpty + 1;
      updateTabGallonsPreview();
    });
  }

  // --- Capacity Expansion & Buy Gallons Steppers ---
  const btnExpandMinus = document.getElementById('btnExpandMinus');
  const btnExpandPlus = document.getElementById('btnExpandPlus');
  const btnConfirmBuyExpand = document.getElementById('btnConfirmBuyExpand');
  const buyGallonModal = document.getElementById('buyGallonModalOverlay');
  const btnCloseBuyGallonModal = document.getElementById('btnCloseBuyGallonModal');
  const btnSubmitBuyGallon = document.getElementById('btnSubmitBuyGallon');
  const btnBuyPayCOD = document.getElementById('btnBuyPayCOD');
  const btnBuyPayGCash = document.getElementById('btnBuyPayGCash');
  const btnModalBuyExpand = document.getElementById('btnModalBuyExpand');

  if (btnExpandMinus) {
    btnExpandMinus.addEventListener('click', () => {
      if (expandGallonsQty > 1) {
        expandGallonsQty--;
        updateExpandCapacityUI();
      }
    });
  }

  if (btnExpandPlus) {
    btnExpandPlus.addEventListener('click', () => {
      if (expandGallonsQty < 20) {
        expandGallonsQty++;
        updateExpandCapacityUI();
      }
    });
  }

  function openBuyGallonModal() {
    if (!buyGallonModal) return;
    const itemsEl = document.getElementById('buyModalItems');
    const limitChangeEl = document.getElementById('buyModalLimitChange');
    const totalEl = document.getElementById('buyModalTotal');

    const curLimit = AppState.lockedLimit || (AppState.inventory.fullJugs + AppState.inventory.emptyJugs) || 0;
    const newLimit = curLimit + expandGallonsQty;
    const totalAmount = expandGallonsQty * 250;

    if (itemsEl) itemsEl.textContent = `${expandGallonsQty}x Brand-New 5-Gal Carboy (+Water)`;
    if (limitChangeEl) limitChangeEl.textContent = `${curLimit} → ${newLimit} Gallons`;
    if (totalEl) totalEl.textContent = `₱${totalAmount.toLocaleString()}.00`;

    buyGallonModal.classList.add('open');
  }

  function closeBuyGallonModal() {
    if (buyGallonModal) buyGallonModal.classList.remove('open');
  }

  if (btnConfirmBuyExpand) btnConfirmBuyExpand.addEventListener('click', openBuyGallonModal);
  if (btnCloseBuyGallonModal) btnCloseBuyGallonModal.addEventListener('click', closeBuyGallonModal);
  if (btnModalBuyExpand) {
    btnModalBuyExpand.addEventListener('click', () => {
      closeSetGallonsModal();
      openBuyGallonModal();
    });
  }

  if (btnBuyPayCOD) {
    btnBuyPayCOD.addEventListener('click', () => {
      buyGallonPaymentMethod = 'cod';
      btnBuyPayCOD.style.borderColor = '#0284c7';
      btnBuyPayCOD.style.color = '#0284c7';
      btnBuyPayCOD.style.background = 'rgba(2, 132, 199, 0.08)';
      if (btnBuyPayGCash) {
        btnBuyPayGCash.style.borderColor = '';
        btnBuyPayGCash.style.color = '';
        btnBuyPayGCash.style.background = '';
      }
    });
  }

  if (btnBuyPayGCash) {
    btnBuyPayGCash.addEventListener('click', () => {
      buyGallonPaymentMethod = 'gcash';
      btnBuyPayGCash.style.borderColor = '#0284c7';
      btnBuyPayGCash.style.color = '#0284c7';
      btnBuyPayGCash.style.background = 'rgba(2, 132, 199, 0.08)';
      if (btnBuyPayCOD) {
        btnBuyPayCOD.style.borderColor = '';
        btnBuyPayCOD.style.color = '';
        btnBuyPayCOD.style.background = '';
      }
    });
  }

  if (btnSubmitBuyGallon) {
    btnSubmitBuyGallon.addEventListener('click', () => {
      const curLimit = AppState.lockedLimit || (AppState.inventory.fullJugs + AppState.inventory.emptyJugs) || 0;
      const added = expandGallonsQty;
      const newLimit = curLimit + added;
      const totalCost = added * 250;

      // Update state
      AppState.isGallonsLocked = true;
      AppState.lockedLimit = newLimit;
      AppState.bottleLimit = newLimit;
      AppState.inventory.fullJugs += added;
      AppState.inventory.daysLeft = AppState.inventory.fullJugs * 3;

      const emailKey = (AppState.user && AppState.user.email) ? AppState.user.email.toLowerCase() : 'guest';
      localStorage.setItem(`rr_gallons_configured_${emailKey}`, 'true');
      localStorage.setItem(`rr_gallons_locked_${emailKey}`, 'true');
      localStorage.setItem(`rr_gallons_locked_limit_${emailKey}`, String(newLimit));

      // Save inventory
      const invPayload = {
        fullJugs: AppState.inventory.fullJugs,
        emptyJugs: AppState.inventory.emptyJugs,
        daysLeft: AppState.inventory.daysLeft,
        swapReady: AppState.inventory.emptyJugs,
        isLocked: true,
        lockedLimit: newLimit
      };
      localStorage.setItem('rr_inventory', JSON.stringify(invPayload));
      if (AppState.user.email) {
        localStorage.setItem(`rr_inventory_${AppState.user.email}`, JSON.stringify(invPayload));
      }

      // Update in accounts
      const rawAccounts = localStorage.getItem('rr_accounts');
      if (rawAccounts) {
        try {
          const accounts = JSON.parse(rawAccounts);
          const idx = accounts.findIndex(a => 
            (a.email && AppState.user.email && a.email.toLowerCase() === AppState.user.email.toLowerCase()) ||
            (a.name && a.name.toLowerCase() === AppState.user.name.toLowerCase())
          );
          if (idx !== -1) {
            accounts[idx].fullJugs = AppState.inventory.fullJugs;
            accounts[idx].bottleLimit = newLimit;
            accounts[idx].isGallonsLocked = true;
            accounts[idx].lockedLimit = newLimit;
            localStorage.setItem('rr_accounts', JSON.stringify(accounts));
          }
        } catch (e) {}
      }

      // Sync customer inventory to Admin Directory
      syncCustomerInventoryToAdminDirectory(AppState.user.name, AppState.inventory.fullJugs, AppState.inventory.emptyJugs);

      // Create new order record in admin orders and notify live sync!
      const newOrderId = Math.floor(100 + Math.random() * 900);
      const newOrder = {
        id: newOrderId,
        name: AppState.user.name || 'Customer',
        sitio: AppState.user.sitio || 'Cambarong',
        barangay: AppState.user.barangay || 'Canhaway',
        address: AppState.user.address || 'Cambarong, Canhaway, Guindulman',
        phone: AppState.user.phone || '0917 555 0192',
        qty: added,
        type: 'New 5-Gal Container Purchase',
        total: totalCost,
        status: 'Preparing',
        method: buyGallonPaymentMethod === 'gcash' ? 'GCash' : 'COD',
        batch: 'Batch #1 (Morning Dispatch)',
        time: 'Just now',
        condition: 'New Gallon Deposit',
        conditionClass: 'status-new-jug'
      };

      try {
        const rawAdminOrders = localStorage.getItem('rr_admin_orders') || '[]';
        const adminOrders = JSON.parse(rawAdminOrders);
        adminOrders.unshift(newOrder);
        localStorage.setItem('rr_admin_orders', JSON.stringify(adminOrders));
      } catch (err) {}

      // Broadcast to Admin Live Queue
      try {
        const channel = new BroadcastChannel('rr_sync_channel');
        channel.postMessage({ type: 'NEW_ORDER_PLACED', order: newOrder });
      } catch (e) {}
      localStorage.setItem('rr_last_new_order', JSON.stringify({ order: newOrder, timestamp: Date.now() }));

      closeBuyGallonModal();
      updateCards();
      if (typeof window.updateCheckoutOrderUI === 'function') {
        window.updateCheckoutOrderUI();
      }

      triggerCardWaterAnimation(document.getElementById('cardJugsHome'));
      showToast(`Success! Purchased ${added} new gallon(s). Your capacity expanded to ${newLimit} Gallons!`);
    });
  }

  // --- Save Gallons Logic (Locks Capacity Upon Saving) ---
  function applyAndSaveGallons(newFull, newEmpty, successMessage) {
    const totalBottles = newFull + newEmpty;

    // If already locked, prevent exceeding the locked limit
    if (AppState.isGallonsLocked && totalBottles > AppState.lockedLimit) {
      showToast(`Cannot exceed locked limit of ${AppState.lockedLimit} Gallons! Purchase new gallons below to expand.`);
      return;
    }

    // Lock the limit upon saving!
    AppState.isGallonsLocked = true;
    AppState.lockedLimit = Math.max(AppState.lockedLimit || 0, totalBottles);
    AppState.bottleLimit = AppState.lockedLimit;

    AppState.inventory.fullJugs = newFull;
    AppState.inventory.emptyJugs = newEmpty;
    AppState.inventory.daysLeft = newFull > 0 ? newFull * 3 : 0;
    AppState.inventory.swapReady = newEmpty;

    const emailKey = (AppState.user && AppState.user.email) ? AppState.user.email.toLowerCase() : 'guest';
    localStorage.setItem(`rr_gallons_configured_${emailKey}`, 'true');
    localStorage.setItem(`rr_gallons_locked_${emailKey}`, 'true');
    localStorage.setItem(`rr_gallons_locked_limit_${emailKey}`, String(AppState.lockedLimit));

    // Save user inventory
    const invPayload = {
      fullJugs: newFull,
      emptyJugs: newEmpty,
      daysLeft: AppState.inventory.daysLeft,
      swapReady: newEmpty,
      isLocked: true,
      lockedLimit: AppState.lockedLimit
    };
    localStorage.setItem('rr_inventory', JSON.stringify(invPayload));
    if (AppState.user.email) {
      localStorage.setItem(`rr_inventory_${AppState.user.email}`, JSON.stringify(invPayload));
    }

    // Update in accounts database
    const rawAccounts = localStorage.getItem('rr_accounts');
    if (rawAccounts) {
      try {
        const accounts = JSON.parse(rawAccounts);
        const idx = accounts.findIndex(a => 
          (a.email && AppState.user.email && a.email.toLowerCase() === AppState.user.email.toLowerCase()) ||
          (a.name && a.name.toLowerCase() === AppState.user.name.toLowerCase())
        );
        if (idx !== -1) {
          accounts[idx].fullJugs = newFull;
          accounts[idx].emptyJugs = newEmpty;
          accounts[idx].bottleLimit = AppState.lockedLimit;
          accounts[idx].isGallonsLocked = true;
          accounts[idx].lockedLimit = AppState.lockedLimit;
          localStorage.setItem('rr_accounts', JSON.stringify(accounts));
        }
      } catch (err) {}
    }

    // Sync to Station Admin Customer Directory
    syncCustomerInventoryToAdminDirectory(AppState.user.name, newFull, newEmpty);

    updateCards();
    if (typeof window.updateCheckoutOrderUI === 'function') {
      window.updateCheckoutOrderUI();
    }

    showToast(successMessage || `Gallons saved & locked at ${AppState.lockedLimit} containers. To expand capacity, buy new gallons (+₱250 each).`);
  }

  if (btnSaveGallonsFromTab) {
    btnSaveGallonsFromTab.addEventListener('click', () => {
      const f = parseInt(inputTabFull?.value, 10) || 0;
      const e = parseInt(inputTabEmpty?.value, 10) || 0;
      applyAndSaveGallons(f, e, `Gallons balance saved: ${f} full, ${e} empty (Locked Limit: ${AppState.lockedLimit} Gallons).`);
    });
  }

  // --- Mascot Speech Banner Steppers & Actions ---
  const btnBannerMinusFull = document.getElementById('btnBannerMinusFull');
  const btnBannerPlusFull = document.getElementById('btnBannerPlusFull');
  const btnBannerMinusEmpty = document.getElementById('btnBannerMinusEmpty');
  const btnBannerPlusEmpty = document.getElementById('btnBannerPlusEmpty');
  const btnBannerSaveGallons = document.getElementById('btnBannerSaveGallons');
  const btnBannerMoreOptions = document.getElementById('btnBannerMoreOptions');
  const btnBannerEditGallons = document.getElementById('btnBannerEditGallons');
  const inputBannerFull = document.getElementById('inputBannerFull');
  const inputBannerEmpty = document.getElementById('inputBannerEmpty');

  if (btnBannerMinusFull) {
    btnBannerMinusFull.addEventListener('click', () => {
      const cur = parseInt(inputBannerFull?.value, 10) || 0;
      if (cur > 0 && inputBannerFull) inputBannerFull.value = cur - 1;
    });
  }

  if (btnBannerPlusFull) {
    btnBannerPlusFull.addEventListener('click', () => {
      const cur = parseInt(inputBannerFull?.value, 10) || 0;
      const curEmpty = parseInt(inputBannerEmpty?.value, 10) || 0;
      if (AppState.isGallonsLocked && (cur + curEmpty) >= AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons! Tap to buy new gallons (+₱250).`);
        return;
      }
      if (inputBannerFull) inputBannerFull.value = cur + 1;
    });
  }

  if (btnBannerMinusEmpty) {
    btnBannerMinusEmpty.addEventListener('click', () => {
      const cur = parseInt(inputBannerEmpty?.value, 10) || 0;
      if (cur > 0 && inputBannerEmpty) inputBannerEmpty.value = cur - 1;
    });
  }

  if (btnBannerPlusEmpty) {
    btnBannerPlusEmpty.addEventListener('click', () => {
      const cur = parseInt(inputBannerEmpty?.value, 10) || 0;
      const curFull = parseInt(inputBannerFull?.value, 10) || 0;
      if (AppState.isGallonsLocked && (cur + curFull) >= AppState.lockedLimit) {
        showToast(`Limit locked at ${AppState.lockedLimit} Gallons! Tap to buy new gallons (+₱250).`);
        return;
      }
      if (inputBannerEmpty) inputBannerEmpty.value = cur + 1;
    });
  }

  if (btnBannerSaveGallons) {
    btnBannerSaveGallons.addEventListener('click', () => {
      const f = parseInt(inputBannerFull?.value, 10) || 0;
      const e = parseInt(inputBannerEmpty?.value, 10) || 0;
      applyAndSaveGallons(f, e);
    });
  }

  if (btnBannerMoreOptions) {
    btnBannerMoreOptions.addEventListener('click', () => {
      openSetGallonsModal(false);
    });
  }

  if (btnBannerEditGallons) {
    btnBannerEditGallons.addEventListener('click', () => {
      switchTab('gallons');
    });
  }

  if (btnTabLogFinished) {
    btnTabLogFinished.addEventListener('click', () => {
      const logBtn = document.getElementById('btnLogFinished');
      if (logBtn) logBtn.click();
      updateCards();
    });
  }

  if (btnTabOrderEmpties) {
    btnTabOrderEmpties.addEventListener('click', () => {
      const cardEmpties = document.getElementById('cardEmptiesSwap');
      if (cardEmpties) cardEmpties.click();
    });
  }

  const cardJugsHome = document.getElementById('cardJugsHome');
  if (cardJugsHome) cardJugsHome.addEventListener('click', () => openSetGallonsModal(false));

  const btnEditJugs = document.getElementById('btnEditJugs');
  if (btnEditJugs) {
    btnEditJugs.addEventListener('click', (e) => {
      e.stopPropagation();
      openSetGallonsModal(false);
    });
  }

  const btnOpenPrompt = document.getElementById('btnOpenSetGallonsPrompt');
  if (btnOpenPrompt) btnOpenPrompt.addEventListener('click', () => openSetGallonsModal(false));

  const mascotBubbleEl = document.getElementById('mascotSpeechBubble');
  if (mascotBubbleEl) {
    mascotBubbleEl.addEventListener('click', (e) => {
      if (e.target.closest('#mascotInlineInput') || e.target.closest('#mascotSavedStatus')) return;
      const full = AppState.inventory.fullJugs || 0;
      const empty = AppState.inventory.emptyJugs || 0;
      if (full === 0 && empty === 0) {
        openSetGallonsModal(false);
      } else if (empty > 0) {
        AppState.order.quantity = empty;
        switchTab('orders');
        if (typeof window.updateCheckoutOrderUI === 'function') {
          window.updateCheckoutOrderUI();
        }
      } else {
        switchTab('gallons');
      }
    });
  }

  const btnProfileEdit = document.getElementById('btnProfileEditGallons');
  if (btnProfileEdit) btnProfileEdit.addEventListener('click', () => openSetGallonsModal(false));

  if (btnCloseGallons) btnCloseGallons.addEventListener('click', closeSetGallonsModal);
  if (btnCancelGallons) btnCancelGallons.addEventListener('click', closeSetGallonsModal);

  if (formGallons) {
    formGallons.addEventListener('submit', (e) => {
      e.preventDefault();
      const newFull = parseInt(inputFull.value, 10) || 0;
      const newEmpty = parseInt(inputEmpty.value, 10) || 0;
      applyAndSaveGallons(newFull, newEmpty);
      closeSetGallonsModal();
    });
  }

  function triggerCardWaterAnimation(cardEl) {
    if (!cardEl) return;
    cardEl.classList.remove('water-fulfilling-pop');
    void cardEl.offsetWidth; // Force CSS reflow
    cardEl.classList.add('water-fulfilling-pop');

    const shimmer = cardEl.querySelector('.card-water-shimmer');
    if (shimmer) {
      shimmer.classList.remove('wave-active');
      void shimmer.offsetWidth; // Force CSS reflow
      shimmer.classList.add('wave-active');
    }

    const icon = cardEl.querySelector('svg');
    if (icon) {
      icon.classList.remove('water-drop-pulse');
      void icon.offsetWidth; // Force CSS reflow
      icon.classList.add('water-drop-pulse');
    }
  }

  // 1-Tap Log Finished Jug with Fulfilling Water Wave Animation
  if (btnLogFinished) {
    btnLogFinished.addEventListener('click', () => {
      if (AppState.inventory.fullJugs > 0) {
        AppState.inventory.fullJugs -= 1;
        AppState.inventory.emptyJugs += 1;
        AppState.inventory.daysLeft = Math.max(0, AppState.inventory.fullJugs * 3);
        AppState.inventory.swapReady = AppState.inventory.emptyJugs;
        updateCards();

        try {
          localStorage.setItem('rr_inventory', JSON.stringify(AppState.inventory));
          if (AppState.user.email) {
            localStorage.setItem(`rr_inventory_${AppState.user.email}`, JSON.stringify(AppState.inventory));
          }
        } catch (e) {}

        // Sync live jug counts directly to Station Admin Customer Directory!
        syncCustomerInventoryToAdminDirectory(AppState.user.name, AppState.inventory.fullJugs, AppState.inventory.emptyJugs);

        // Fulfilling Water Wave Shimmer on Log Finished, Empties Ready, and Jugs Home!
        triggerCardWaterAnimation(btnLogFinished);
        const cardJugsHome = document.getElementById('cardJugsHome');
        if (cardJugsHome) triggerCardWaterAnimation(cardJugsHome);
        if (cardEmptiesSwap) {
          setTimeout(() => triggerCardWaterAnimation(cardEmptiesSwap), 120);
        }

        if (typeof window.updateCheckoutOrderUI === 'function') {
          window.updateCheckoutOrderUI();
        }

        showToast(`Finished 1 gallon logged! +1 empty gallon ready for swap (${AppState.inventory.emptyJugs} total).`);
      } else {
        showToast('No full gallons left at home! Tap "Gallons at Home" to set your gallons or order refills.');
      }
    });
  }

  // Edit Supply Days
  if (btnEditDays) {
    btnEditDays.addEventListener('click', (e) => {
      e.stopPropagation();
      const newDays = prompt('Enter estimated days remaining:', AppState.inventory.daysLeft);
      if (newDays !== null && !isNaN(newDays) && Number(newDays) >= 0) {
        AppState.inventory.daysLeft = parseInt(newDays, 10);
        updateCards();
        try {
          localStorage.setItem('rr_inventory', JSON.stringify(AppState.inventory));
        } catch (e) {}
        showToast(`Estimated supply updated to ${AppState.inventory.daysLeft} days left.`);
      }
    });
  }

  // 1-Tap "Empties to Swap" Card -> Fulfilling Wave + Leads to Order tab with exact amount ready!
  if (cardEmptiesSwap) {
    cardEmptiesSwap.addEventListener('click', () => {
      triggerCardWaterAnimation(cardEmptiesSwap);

      const readyEmpties = AppState.inventory.emptyJugs > 0 ? AppState.inventory.emptyJugs : 1;
      AppState.order.quantity = readyEmpties;
      AppState.order.bottleSwap = AppState.inventory.emptyJugs > 0;

      const swapToggle = document.getElementById('toggleSwap');
      if (swapToggle) swapToggle.checked = AppState.order.bottleSwap;

      if (typeof window.updateCheckoutOrderUI === 'function') {
        window.updateCheckoutOrderUI();
      }

      setTimeout(() => {
        switchTab('orders');
        showToast(AppState.inventory.emptyJugs > 0 
          ? `Prepared ${readyEmpties}x Refill Swap for your ${readyEmpties} empty bottle${readyEmpties === 1 ? '' : 's'} ready!`
          : `You have 0 empty bottles ready. Buy new gallon or set your gallons on Home!`);
      }, 160);
    });
  }

  updateCards();
}

// --- 6. Orders & Simplified Checkout Controller ---
function initCheckout() {
  const btnMinus = document.getElementById('btnQtyMinus');
  const btnPlus = document.getElementById('btnQtyPlus');
  const qtyDisplay = document.getElementById('orderQtyDisplay');
  const btnPlaceOrder = document.getElementById('btnPlaceOrder');
  const pillGCash = document.getElementById('pillGCash');
  const pillCOD = document.getElementById('pillCOD');
  const swapToggle = document.getElementById('toggleSwap');
  const buyNewGallonCard = document.getElementById('buyNewGallonCard');
  const btnBuyNewGallon = document.getElementById('btnBuyNewGallon');
  const breakdownNote = document.getElementById('orderBreakdownNote');
  const bottleLimitBadge = document.getElementById('bottleLimitBadge');

  function getSwapLimit() {
    if (typeof AppState.bottleLimit === 'number' && AppState.bottleLimit > 0) {
      return AppState.bottleLimit;
    }
    return (AppState.inventory.fullJugs || 0) + (AppState.inventory.emptyJugs || 0);
  }

  let allowNewGallons = false;

  function calculatePricing() {
    const qty = AppState.order.quantity;
    const isSwap = AppState.order.bottleSwap;
    const refillPrice = AppState.order.pricePerJug; // 35
    const newGallonPrice = 250; // New container with water
    const swapLimit = getSwapLimit();

    if (!isSwap) {
      return {
        swapCount: 0,
        swapTotal: 0,
        newCount: qty,
        newTotal: qty * newGallonPrice,
        grandTotal: qty * newGallonPrice,
        isMixed: false
      };
    }

    if (swapLimit === 0) {
      // Customer has 0 containers at home; all must be new container purchases
      return {
        swapCount: 0,
        swapTotal: 0,
        newCount: qty,
        newTotal: qty * newGallonPrice,
        grandTotal: qty * newGallonPrice,
        isMixed: false
      };
    }

    if (qty <= swapLimit) {
      return {
        swapCount: qty,
        swapTotal: qty * refillPrice,
        newCount: 0,
        newTotal: 0,
        grandTotal: qty * refillPrice,
        isMixed: false
      };
    } else {
      const newCount = qty - swapLimit;
      const swapCount = swapLimit;
      const swapTotal = swapCount * refillPrice;
      const newTotal = newCount * newGallonPrice;
      return {
        swapCount: swapCount,
        swapTotal: swapTotal,
        newCount: newCount,
        newTotal: newTotal,
        grandTotal: swapTotal + newTotal,
        isMixed: true
      };
    }
  }

  function calculateTotal() {
    return calculatePricing().grandTotal;
  }

  function updateOrderUI() {
    const pricing = calculatePricing();
    const qty = AppState.order.quantity;
    const isSwap = AppState.order.bottleSwap;
    const swapLimit = getSwapLimit();

    if (qtyDisplay) {
      qtyDisplay.textContent = qty;
    }

    if (bottleLimitBadge) {
      if (!isSwap) {
        bottleLimitBadge.textContent = 'New Containers';
      } else if (swapLimit === 0) {
        bottleLimitBadge.textContent = '0 Bottles (Buy New)';
      } else {
        bottleLimitBadge.textContent = `Limit: ${swapLimit} Swap`;
      }
    }

    // Show or hide Buy New Gallon Banner
    if (buyNewGallonCard) {
      if (isSwap && (qty >= swapLimit || swapLimit === 0) && !allowNewGallons) {
        buyNewGallonCard.style.display = 'block';
        const cardTitle = buyNewGallonCard.querySelector('div div div:first-child');
        const cardDesc = buyNewGallonCard.querySelector('div div div:last-child');
        if (cardTitle && cardDesc) {
          if (swapLimit === 0) {
            cardTitle.textContent = '0 Containers at Home';
            cardDesc.textContent = 'Need containers? Buy brand-new 5-gal carboys with water for ₱250 each, or set your home gallons on the Gallons tab!';
          } else {
            cardTitle.textContent = `Swap Limit Reached (${swapLimit} Gallons)`;
            cardDesc.textContent = `Need more than ${swapLimit} gallons? Buy brand-new 5-gal carboys with purified water for ₱250 each.`;
          }
        }
      } else {
        buyNewGallonCard.style.display = 'none';
      }
    }

    // Show or hide Order Breakdown Note
    if (breakdownNote) {
      if (isSwap && pricing.isMixed) {
        breakdownNote.style.display = 'block';
        breakdownNote.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>${pricing.swapCount}x Bottle Swap Refill (₱${AppState.order.pricePerJug}/ea):</span>
            <b>₱${pricing.swapTotal.toFixed(2)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--color-sky-blue);">
            <span>+ ${pricing.newCount}x New 5-Gal Container (₱250/ea):</span>
            <b>₱${pricing.newTotal.toFixed(2)}</b>
          </div>
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 4px; display: flex; justify-content: space-between; font-weight: 700; color: var(--text-main);">
            <span>Order Total:</span>
            <span>₱${pricing.grandTotal.toFixed(2)}</span>
          </div>
        `;
      } else if (!isSwap) {
        breakdownNote.style.display = 'block';
        breakdownNote.innerHTML = `
          <div style="display: flex; justify-content: space-between;">
            <span>${qty}x New 5-Gal Container + Water (₱250/ea):</span>
            <b>₱${pricing.grandTotal.toFixed(2)}</b>
          </div>
        `;
      } else {
        breakdownNote.style.display = 'none';
      }
    }

    if (btnPlaceOrder) {
      btnPlaceOrder.textContent = `Place Refill Order • ₱${pricing.grandTotal.toFixed(2)}`;
    }

    if (pillGCash) pillGCash.classList.toggle('selected', AppState.order.paymentMethod === 'gcash');
    if (pillCOD) pillCOD.classList.toggle('selected', AppState.order.paymentMethod === 'cod');
  }

  // Expose globally so cardEmptiesSwap can refresh UI
  window.updateCheckoutOrderUI = updateOrderUI;

  if (btnMinus) {
    btnMinus.addEventListener('click', () => {
      if (AppState.order.quantity > 1) {
        AppState.order.quantity -= 1;
        const swapLimit = getSwapLimit();
        if (AppState.order.quantity <= swapLimit) {
          allowNewGallons = false;
        }
        updateOrderUI();
      }
    });
  }

  if (btnPlus) {
    btnPlus.addEventListener('click', () => {
      const isSwap = AppState.order.bottleSwap;
      const currentQty = AppState.order.quantity;
      const swapLimit = getSwapLimit();

      if (isSwap && !allowNewGallons && (currentQty >= swapLimit || swapLimit === 0)) {
        if (buyNewGallonCard) buyNewGallonCard.style.display = 'block';
        showToast(swapLimit > 0 
          ? `Limit of ${swapLimit} gallons reached based on your home containers. Tap "+ Buy New Gallon" to order additional gallons!`
          : `You currently have 0 gallons logged. Tap "+ Buy New Gallon" (+₱250) or set your gallons on the Gallons tab!`);
        return;
      }

      AppState.order.quantity += 1;
      updateOrderUI();
    });
  }

  if (btnBuyNewGallon) {
    btnBuyNewGallon.addEventListener('click', () => {
      allowNewGallons = true;
      AppState.order.quantity += 1;
      updateOrderUI();
      showToast(`Added 1x New 5-Gal Container (+₱250). Total order: ${AppState.order.quantity} gallons.`);
    });
  }

  if (pillGCash) {
    pillGCash.addEventListener('click', () => {
      AppState.order.paymentMethod = 'gcash';
      updateOrderUI();
    });
  }

  if (pillCOD) {
    pillCOD.addEventListener('click', () => {
      AppState.order.paymentMethod = 'cod';
      updateOrderUI();
    });
  }

  if (swapToggle) {
    swapToggle.addEventListener('change', (e) => {
      AppState.order.bottleSwap = e.target.checked;
      updateOrderUI();
      showToast(
        e.target.checked
          ? 'Gallon swap enabled: Prepare empty gallons for delivery crew.'
          : 'New container deposit applies (₱250/gallon).'
      );
    });
  }

  if (btnPlaceOrder) {
    btnPlaceOrder.addEventListener('click', () => {
      const qty = AppState.order.quantity;
      const pricing = calculatePricing();
      const total = pricing.grandTotal;
      const methodLabel = AppState.order.paymentMethod === 'gcash' ? 'GCash' : 'COD';
      const isSwap = AppState.order.bottleSwap;
      const customerName = AppState.user.name || 'Neil';
      const customerAddress = AppState.user.address || 'Cambarong, Canhaway, Guindulman';
      const customerPhone = AppState.user.phone || '0917 555 0192';
      const conditionType = isSwap ? (pricing.isMixed ? 'swap+new' : 'swap') : 'deposit';

      // 1. Sync order directly into Station Admin Orders Store!
      const rawOrders = localStorage.getItem('rr_admin_orders');
      let ordersList = rawOrders ? JSON.parse(rawOrders) : null;
      if (!ordersList || !Array.isArray(ordersList)) {
        ordersList = [
          { id: 101, name: 'Neil', phone: '0917 555 0192', address: 'Purok 4, Sampaguita St.', qty: 2, type: 'Purified', condition: 'swap', total: 70, payment: 'COD', batch: 'batch1', status: 'Loaded' },
          { id: 102, name: 'Nanay Tess', phone: '0918 234 5678', address: 'Purok 2, Rosal St.', qty: 3, type: 'Purified', condition: 'swap', total: 105, payment: 'GCash', batch: 'batch1', status: 'Confirmed' },
          { id: 103, name: 'Kapitan Manny', phone: '0920 987 6543', address: 'Barangay Hall, Main Ave', qty: 5, type: 'Alkaline', condition: 'deposit', total: 1475, payment: 'GCash', batch: 'batch1', status: 'Pending' },
          { id: 104, name: 'Aling Susan Sari-Sari', phone: '0919 444 3322', address: 'Purok 1, Corner Crossing', qty: 4, type: 'Purified', condition: 'swap', total: 140, payment: 'COD', batch: 'batch2', status: 'Confirmed' },
          { id: 105, name: 'Tito Dan', phone: '0917 888 9900', address: 'Sitio Ilaya, Near Chapel', qty: 1, type: 'Purified', condition: 'swap', total: 35, payment: 'COD', batch: 'batch2', status: 'Pending' },
          { id: 106, name: 'Dr. Ramos Clinic', phone: '0922 111 2233', address: 'Commercial Strip, Hwy', qty: 2, type: 'Purified', condition: 'swap', total: 70, payment: 'GCash', batch: 'batch1', status: 'Delivered' }
        ];
      }

      // Generate a new, strictly unique order ID (e.g. #107, #108...)
      const orderId = (ordersList.length > 0 ? Math.max(...ordersList.map(o => Number(o.id) || 0)) : 100) + 1;
      const newOrder = {
        id: orderId,
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        qty: qty,
        type: 'Purified',
        condition: conditionType,
        total: total,
        payment: methodLabel,
        batch: 'batch1',
        status: 'Confirmed',
        createdAt: new Date().toISOString()
      };

      // Always unshift so it sits at the very top of Live Orders Queue!
      ordersList.unshift(newOrder);

      // Save to localStorage so Station Admin immediately receives the exact updated list
      localStorage.setItem('rr_admin_orders', JSON.stringify(ordersList));

      // Trigger cross-window storage event
      localStorage.setItem('rr_last_new_order', JSON.stringify({
        order: newOrder,
        timestamp: Date.now()
      }));

      // Broadcast immediately across all open tabs/windows via BroadcastChannel
      try {
        const channel = new BroadcastChannel('rr_sync_channel');
        channel.postMessage({
          type: 'NEW_ORDER_PLACED',
          order: newOrder,
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('BroadcastChannel error', e);
      }

      // Track active order for this user session
      AppState.currentOrderId = orderId;
      if (AppState.user.email) {
        localStorage.setItem(`rr_current_order_id_${AppState.user.email}`, String(orderId));
      }

      // 2. Update Customer Tracking UI live
      updateTrackingUI(newOrder);

      // 3. Show Dynamic Confirmation Toast with EXACT quantity & amount
      showToast(`Order #${orderId} Placed! ${qty}x Refill via ${methodLabel} (₱${total.toFixed(2)}). Delivering Today!`);

      // 4. Smooth transition to Delivery Tracking Map
      setTimeout(() => {
        switchTab('map');
      }, 950);
    });
  }

  updateOrderUI();
}

// --- Sync Customer Display with Station Admin Orders ---
function syncActiveOrderWithAdminState() {
  const currentUserName = AppState.user.name || 'Neil';
  const rawOrders = localStorage.getItem('rr_admin_orders');
  if (rawOrders) {
    try {
      const ordersList = JSON.parse(rawOrders);
      if (Array.isArray(ordersList)) {
        let myOrder = ordersList.find(o => 
          o.name.toLowerCase() === currentUserName.toLowerCase() && o.status !== 'Delivered'
        );
        if (!myOrder) {
          myOrder = ordersList.find(o => o.name.toLowerCase() === currentUserName.toLowerCase());
        }
        if (myOrder) {
          AppState.order.quantity = myOrder.qty || 2;
          AppState.order.paymentMethod = myOrder.payment && myOrder.payment.toLowerCase() === 'gcash' ? 'gcash' : 'cod';
          AppState.order.bottleSwap = myOrder.condition !== 'deposit';
          
          const qtyDisplay = document.getElementById('orderQtyDisplay');
          if (qtyDisplay) qtyDisplay.textContent = myOrder.qty;

          const btnPlaceOrder = document.getElementById('btnPlaceOrder');
          if (btnPlaceOrder) btnPlaceOrder.textContent = `Place Refill Order • ₱${myOrder.total.toFixed(2)}`;

          updateTrackingUI(myOrder);

          // When order arrives (Delivered): update inventory to ordered gallons & 0 empty!
          if (myOrder.status === 'Delivered') {
            handleOrderDeliveredInventory(myOrder);
          }
        }
      }
    } catch (e) {
      console.warn('Sync orders error', e);
    }
  }
}

// Update Customer Live Tracking Card, 4-Stage Stepper, and Recent Order History
function updateTrackingUI(order) {
  if (!order) return;
  const orderId = order.orderId || order.id || 101;
  const qty = order.qty || 2;
  const type = order.type || 'Purified';
  const total = Number(order.total || 70).toFixed(2);
  const payment = order.payment || 'COD';
  const status = order.status || 'Confirmed';

  const trackQtyTitle = document.getElementById('trackOrderQtyTitle');
  if (trackQtyTitle) {
    trackQtyTitle.textContent = `${qty}x 5-Gal ${type} Refill`;
  }

  const trackPriceTotal = document.getElementById('trackOrderPriceTotal');
  if (trackPriceTotal) {
    trackPriceTotal.textContent = `₱${total} (${payment})`;
  }

  const recentSummary = document.getElementById('recentOrderSummary');
  if (recentSummary) {
    recentSummary.textContent = `Order #${orderId} • ${qty}x ${type}`;
  }

  const recentStatus = document.getElementById('recentOrderStatus');
  if (recentStatus) {
    if (status === 'Loaded' || status === 'Ready') {
      recentStatus.textContent = 'Loaded on Multicab';
      recentStatus.style.color = '#7c3aed';
    } else if (status === 'Delivered') {
      recentStatus.textContent = 'Delivered';
      recentStatus.style.color = '#16a34a';
    } else if (status === 'Confirmed') {
      recentStatus.textContent = 'Confirmed';
      recentStatus.style.color = '#0284c7';
    } else {
      recentStatus.textContent = status;
      recentStatus.style.color = '#b45309';
    }
  }

  // Update Status Badge on Tab 2
  const badgeEl = document.getElementById('trackDeliveryBadge');
  if (badgeEl) {
    if (status === 'Confirmed') {
      badgeEl.textContent = '• Order Confirmed';
      badgeEl.style.background = '#e0f2fe';
      badgeEl.style.color = '#0284c7';
    } else if (status === 'Loaded' || status === 'Ready') {
      badgeEl.textContent = '• Loaded & Out for delivery';
      badgeEl.style.background = '#ede9fe';
      badgeEl.style.color = '#7c3aed';
    } else if (status === 'Delivered') {
      badgeEl.textContent = '• Delivered & Completed';
      badgeEl.style.background = '#dcfce7';
      badgeEl.style.color = '#16a34a';
    } else {
      badgeEl.textContent = '• Queued / Pending';
      badgeEl.style.background = '#fef3c7';
      badgeEl.style.color = '#b45309';
    }
  }

  // Update 4-Stage Stepper
  const fill = document.getElementById('stepperLineFill');
  const node1 = document.getElementById('stepNode1');
  const node2 = document.getElementById('stepNode2');
  const node3 = document.getElementById('stepNode3');
  const node4 = document.getElementById('stepNode4');

  if (node1 && node2 && node3 && node4) {
    [node1, node2, node3, node4].forEach(n => {
      n.classList.remove('completed', 'active');
    });

    if (status === 'Pending') {
      if (fill) fill.style.width = '10%';
      node1.classList.add('active');
    } else if (status === 'Confirmed') {
      if (fill) fill.style.width = '33%';
      node1.classList.add('completed');
      node2.classList.add('active');
    } else if (status === 'Loaded' || status === 'Ready') {
      if (fill) fill.style.width = '66%';
      node1.classList.add('completed');
      node2.classList.add('completed');
      node3.classList.add('active');
    } else if (status === 'Delivered') {
      if (fill) fill.style.width = '100%';
      node1.classList.add('completed');
      node2.classList.add('completed');
      node3.classList.add('completed');
      node4.classList.add('completed');
    }
  }
}

// --- 7. Leaflet.js Delivery Map Controller ---
function initLeafletMap() {
  const mapElement = document.getElementById('leafletMapContainer');
  if (!mapElement) return;

  const stationCoords = [14.5995, 120.9842];
  const customerCoords = [14.6065, 120.9920];
  const truckStartCoords = [14.6030, 120.9880];

  const map = L.map('leafletMapContainer', {
    zoomControl: false,
    attributionControl: false
  }).setView([14.6035, 120.9885], 15);

  window.leafletMap = map;

  window.tileLayerLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  });

  window.tileLayerDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  });

  if (AppState.theme === 'dark') {
    window.tileLayerDark.addTo(map);
  } else {
    window.tileLayerLight.addTo(map);
  }

  // Delivery Route Polyline
  L.polyline([
    stationCoords,
    [14.6015, 120.9855],
    truckStartCoords,
    [14.6050, 120.9900],
    customerCoords
  ], {
    color: '#0284c7',
    weight: 5,
    opacity: 0.85,
    dashArray: '8, 8'
  }).addTo(map);

  // Station Dispatch Marker
  L.circleMarker(stationCoords, {
    radius: 9,
    fillColor: '#0f172a',
    color: '#38bdf8',
    weight: 2,
    fillOpacity: 1
  }).addTo(map).bindPopup('<b>R&R Water Refilling Station</b><br>Dispatch Center');

  // Customer Home Marker
  L.circleMarker(customerCoords, {
    radius: 10,
    fillColor: '#0ea5e9',
    color: '#ffffff',
    weight: 3,
    fillOpacity: 1
  }).addTo(map).bindPopup('<b>Neil (Home)</b><br>Purok 4, Sampaguita St.');

  // High-Visibility Delivery Multicab Truck Pin with Radar Ping
  const truckIcon = L.divIcon({
    html: `
      <div class="truck-pin-container">
        <div class="truck-pulse-ring"></div>
        <div class="truck-icon-badge" title="R&R Multicab #1">
          <svg class="mono-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5" fill="#38bdf8"></circle>
            <circle cx="18.5" cy="18.5" r="2.5" fill="#38bdf8"></circle>
          </svg>
        </div>
        <div class="truck-callout-tag">Multicab #1</div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    className: 'truck-marker-pin'
  });

  const truckMarker = L.marker(truckStartCoords, { icon: truckIcon, zIndexOffset: 1000 }).addTo(map);
  truckMarker.bindPopup('<b>R&R Multicab on Route</b><br>Kuya Jun & Delivery Crew • Plate: NBD-2841');
  window.truckMarkerRef = truckMarker;

  // Truck Simulation button
  const simBtn = document.getElementById('btnSimulateTruck');
  let simStep = 0;
  const pathWaypoints = [
    [14.6030, 120.9880],
    [14.6040, 120.9890],
    [14.6048, 120.9898],
    [14.6055, 120.9908],
    [14.6065, 120.9920]
  ];

  if (simBtn) {
    simBtn.addEventListener('click', () => {
      simStep = (simStep + 1) % pathWaypoints.length;
      const nextPos = pathWaypoints[simStep];
      truckMarker.setLatLng(nextPos);
      map.panTo(nextPos);
      showToast(`Multicab location updated: Heading closer to your gate (${simStep + 1}/5)`);
    });
  }
}

// ==========================================================================
// 8. Swipeable Announcement Carousel (Notice to All)
// ==========================================================================
function initAnnouncementCarousel() {
  const track = document.getElementById('carouselTrack');
  const viewport = document.getElementById('carouselViewport');
  const prevBtn = document.getElementById('carouselPrevBtn');
  const nextBtn = document.getElementById('carouselNextBtn');
  const counter = document.getElementById('carouselCounter');
  const dotsContainer = document.getElementById('carouselDots');
  const badgeEl = document.querySelector('.carousel-badge');

  if (!track || !viewport) return;

  // 1. Load active notices
  let currentNoticesList = [];
  const storedNotices = localStorage.getItem('rr_notices');
  if (storedNotices) {
    try {
      const parsed = JSON.parse(storedNotices);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentNoticesList = parsed;
      }
    } catch (e) {
      console.warn('Could not parse rr_notices', e);
    }
  }

  if (currentNoticesList.length === 0) {
    currentNoticesList = [
      { id: 1, badge: 'Notice to All', title: 'Saturday Rest Day Notice', body: 'R&R Water Refilling is closed every Saturday for scheduled equipment sanitization and UV filter maintenance. Multicab deliveries resume Sunday 8:00 AM.' },
      { id: 2, badge: 'Batch Roving', title: 'Batch #1 Roving Today', body: 'Water delivery multicab is currently dispatching in your Purok/Sitio cluster. Keep empty 5-gal carboys ready at the gate for fast swap!' },
      { id: 3, badge: 'Hygiene & Quality', title: 'Hygiene & Tamper Cap Seal', body: 'All gallons undergo 16-stage ultrafiltration and UV sanitization. Please ensure swapped carboys have no chemical residue or broken neck collars.' }
    ];
  }

  // 2. Render slides into track
  track.innerHTML = '';
  if (dotsContainer) dotsContainer.innerHTML = '';

  currentNoticesList.forEach((n, idx) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    slide.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px; width: 100%; box-sizing: border-box;">
        <div class="alert-icon-box" style="flex-shrink: 0; margin-top: 2px;">
          <svg class="mono-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div class="slide-heading" style="font-size: 0.875rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${escapeHtml(n.title)}</div>
          <div class="slide-body" style="font-size: 0.75rem; line-height: 1.45; color: var(--text-muted);">${escapeHtml(n.body)}</div>
        </div>
      </div>
    `;
    track.appendChild(slide);

    if (dotsContainer) {
      const dot = document.createElement('span');
      dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
      dot.dataset.index = idx;
      dotsContainer.appendChild(dot);
    }
  });

  const totalSlides = currentNoticesList.length;
  let currentIndex = 0;
  let startX = 0;
  let isDragging = false;

  function triggerAnnouncementWaterAnimation() {
    const shimmer = document.getElementById('announcementWaterShimmer');
    const badge = document.querySelector('.carousel-badge');
    if (shimmer) {
      shimmer.classList.remove('wave-active');
      void shimmer.offsetWidth; // Force CSS reflow
      shimmer.classList.add('wave-active');
    }
    if (badge) {
      badge.classList.remove('water-pulse');
      void badge.offsetWidth; // Force CSS reflow
      badge.classList.add('water-pulse');
    }
  }

  function updateCarousel(index) {
    if (index < 0) index = 0;
    if (index >= totalSlides) index = totalSlides - 1;
    currentIndex = index;

    // Use exact viewport client width for pixel-perfect sliding
    const slideWidth = viewport.clientWidth;
    track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;

    if (counter) {
      counter.textContent = `${currentIndex + 1} of ${totalSlides}`;
    }

    if (badgeEl && currentNoticesList[currentIndex] && currentNoticesList[currentIndex].badge) {
      badgeEl.textContent = currentNoticesList[currentIndex].badge;
    }

    const dots = dotsContainer ? dotsContainer.querySelectorAll('.carousel-dot') : [];
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });

    // Trigger minimal 1.2s water wave animation to draw notice
    triggerAnnouncementWaterAnimation();
  }

  // Initial water wave attention sweep (1.2s)
  setTimeout(triggerAnnouncementWaterAnimation, 500);

  // Subtle periodic wave pulse every 6.5 seconds
  setInterval(triggerAnnouncementWaterAnimation, 6500);

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      updateCarousel(currentIndex > 0 ? currentIndex - 1 : totalSlides - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      updateCarousel((currentIndex + 1) % totalSlides);
    });
  }

  if (dotsContainer) {
    dotsContainer.addEventListener('click', (e) => {
      const dot = e.target.closest('.carousel-dot');
      if (dot) {
        const idx = parseInt(dot.getAttribute('data-index'), 10);
        if (!isNaN(idx)) updateCarousel(idx);
      }
    });
  }

  // Adjust translation on window resize
  window.addEventListener('resize', () => {
    updateCarousel(currentIndex);
  });

  // Touch & Swipe Event Listeners (Mobile / Android)
  viewport.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    const endX = e.changedTouches[0].clientX;
    const diffX = startX - endX;
    if (diffX > 35) {
      updateCarousel((currentIndex + 1) % totalSlides);
    } else if (diffX < -35) {
      updateCarousel(currentIndex > 0 ? currentIndex - 1 : totalSlides - 1);
    }
    isDragging = false;
  }, { passive: true });

  // Initial alignment
  setTimeout(() => {
    updateCarousel(0);
  }, 60);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================================================
// 9. Real-Time Top Announcement Pop-down Banner & Bell Tray
// ==========================================================================
let topAnnouncementDismissTimer = null;

function showTopAnnouncementPopup(notice) {
  const popup = document.getElementById('topAnnouncementPopup');
  const card = document.getElementById('topAnnouncementCard');
  const badgeText = document.getElementById('topAnnouncementBadgeText');
  const badgeEl = document.getElementById('topAnnouncementBadge');
  const timeEl = document.getElementById('topAnnouncementTime');
  const titleEl = document.getElementById('topAnnouncementTitle');
  const bodyEl = document.getElementById('topAnnouncementBody');
  const bellBtn = document.getElementById('btnNotificationBell');
  const dotEl = document.getElementById('notificationDot');

  if (!popup || !notice) return;

  if (card) card.dataset.type = 'announcement';
  if (badgeText) badgeText.textContent = notice.badge || 'Station Notice';
  if (badgeEl) {
    badgeEl.style.background = 'var(--color-sky-light)';
    badgeEl.style.color = 'var(--color-sky-blue)';
  }
  if (timeEl) timeEl.textContent = 'Just now';
  if (titleEl) titleEl.textContent = notice.title || 'Station Announcement';
  if (bodyEl) bodyEl.textContent = notice.body || 'New announcement published by station manager.';

  // Show banner
  popup.classList.add('show');

  // Ring the notification bell
  if (bellBtn) {
    bellBtn.classList.remove('bell-ringing');
    void bellBtn.offsetWidth; // Force reflow to replay CSS keyframe
    bellBtn.classList.add('bell-ringing');
  }
  if (dotEl) {
    dotEl.style.display = 'block';
    dotEl.style.opacity = '1';
  }

  // Clear existing timer
  if (topAnnouncementDismissTimer) {
    clearTimeout(topAnnouncementDismissTimer);
  }

  // Auto-dismiss after 6.5s
  topAnnouncementDismissTimer = setTimeout(() => {
    hideTopAnnouncementPopup();
  }, 6500);
}

function showOrderStatusNotification(order) {
  const popup = document.getElementById('topAnnouncementPopup');
  const card = document.getElementById('topAnnouncementCard');
  const badgeText = document.getElementById('topAnnouncementBadgeText');
  const badgeEl = document.getElementById('topAnnouncementBadge');
  const timeEl = document.getElementById('topAnnouncementTime');
  const titleEl = document.getElementById('topAnnouncementTitle');
  const bodyEl = document.getElementById('topAnnouncementBody');
  const bellBtn = document.getElementById('btnNotificationBell');
  const dotEl = document.getElementById('notificationDot');

  if (!popup || !order) return;

  const orderId = order.orderId || order.id || 101;
  const qty = order.qty || 2;
  const status = order.status || 'Confirmed';
  const total = Number(order.total || 70).toFixed(2);

  if (card) {
    card.dataset.type = 'order';
    card.dataset.orderId = orderId;
  }

  if (timeEl) timeEl.textContent = 'Just now';

  if (status === 'Confirmed') {
    if (badgeText) badgeText.textContent = 'Order Confirmed';
    if (badgeEl) {
      badgeEl.style.background = '#e0f2fe';
      badgeEl.style.color = '#0284c7';
    }
    if (titleEl) titleEl.textContent = `Order #${orderId} Confirmed`;
    if (bodyEl) bodyEl.textContent = `R&R Station confirmed your refill order for ${qty}x 5-Gal refills (₱${total}). Batch #1 scheduled.`;
  } else if (status === 'Loaded' || status === 'Ready') {
    if (badgeText) badgeText.textContent = 'Ready • Loaded on Truck';
    if (badgeEl) {
      badgeEl.style.background = '#ede9fe';
      badgeEl.style.color = '#7c3aed';
    }
    if (titleEl) titleEl.textContent = `Order #${orderId} Ready & En Route`;
    if (bodyEl) bodyEl.textContent = `Multicab Batch #1 is loaded with your ${qty}x water carboys and roving in your area.`;
  } else if (status === 'Delivered') {
    if (badgeText) badgeText.textContent = 'Delivered & Swapped';
    if (badgeEl) {
      badgeEl.style.background = '#dcfce7';
      badgeEl.style.color = '#16a34a';
    }
    if (titleEl) titleEl.textContent = `Order #${orderId} Delivered!`;
    if (bodyEl) bodyEl.textContent = `Your ${qty}x 5-gallon water carboys have been safely delivered to your gate. Thank you!`;
  } else {
    if (badgeText) badgeText.textContent = `Order ${status}`;
    if (titleEl) titleEl.textContent = `Order #${orderId} Updated`;
    if (bodyEl) bodyEl.textContent = `Order status is now ${status}.`;
  }

  // Slide down banner
  popup.classList.add('show');

  // Ring the notification bell
  if (bellBtn) {
    bellBtn.classList.remove('bell-ringing');
    void bellBtn.offsetWidth;
    bellBtn.classList.add('bell-ringing');
  }
  if (dotEl) {
    dotEl.style.display = 'block';
    dotEl.style.opacity = '1';
  }

  // Clear existing timer
  if (topAnnouncementDismissTimer) {
    clearTimeout(topAnnouncementDismissTimer);
  }

  // Auto-dismiss after 6.5s
  topAnnouncementDismissTimer = setTimeout(() => {
    hideTopAnnouncementPopup();
  }, 6500);
}

function handleOrderDeliveredInventory(order) {
  if (!order) return;
  const orderGallons = parseInt(order.qty, 10) || 2;

  // When the new batch of order arrives: exactly the ordered gallons and 0 empty!
  AppState.inventory.fullJugs = orderGallons;
  AppState.inventory.emptyJugs = 0;
  AppState.inventory.daysLeft = Math.max(4, orderGallons * 4);
  AppState.inventory.swapReady = 0;

  const fullEmptyVal = document.getElementById('valFullEmpty');
  const daysLeftVal = document.getElementById('valDaysLeft');
  const emptiesSwapVal = document.getElementById('valEmptiesSwap');
  if (fullEmptyVal) fullEmptyVal.textContent = `${orderGallons} full, 0 empty`;
  if (daysLeftVal) daysLeftVal.textContent = `${AppState.inventory.daysLeft} days left`;
  if (emptiesSwapVal) emptiesSwapVal.textContent = `0 bottles ready`;

  try {
    localStorage.setItem('rr_inventory', JSON.stringify(AppState.inventory));
  } catch (e) {}

  // Fulfilling ripple animation on overview cards
  const cardJugsHome = document.getElementById('cardJugsHome');
  const cardEmpties = document.getElementById('cardEmptiesSwap');
  if (cardJugsHome) {
    cardJugsHome.classList.remove('water-fulfilling-pop');
    void cardJugsHome.offsetWidth;
    cardJugsHome.classList.add('water-fulfilling-pop');
  }
  if (cardEmpties) {
    cardEmpties.classList.remove('water-fulfilling-pop');
    void cardEmpties.offsetWidth;
    cardEmpties.classList.add('water-fulfilling-pop');
  }
}

function hideTopAnnouncementPopup() {
  const popup = document.getElementById('topAnnouncementPopup');
  if (popup) {
    popup.classList.remove('show');
  }
  if (topAnnouncementDismissTimer) {
    clearTimeout(topAnnouncementDismissTimer);
    topAnnouncementDismissTimer = null;
  }
}

function initTopAnnouncementPopup() {
  const popup = document.getElementById('topAnnouncementPopup');
  const closeBtn = document.getElementById('topAnnouncementClose');
  const card = document.getElementById('topAnnouncementCard');

  if (!popup) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTopAnnouncementPopup();
    });
  }

  if (card) {
    card.addEventListener('click', () => {
      const type = card.dataset.type || 'announcement';
      hideTopAnnouncementPopup();

      if (type === 'order') {
        const tabBtnTrack = document.querySelector('.bottom-nav-item[data-tab="tab-track"]');
        if (tabBtnTrack) tabBtnTrack.click();
      } else {
        const tabBtnHome = document.querySelector('.bottom-nav-item[data-tab="tab-home"]');
        if (tabBtnHome) tabBtnHome.click();
        const carousel = document.getElementById('stationNoticeCarousel');
        if (carousel) {
          setTimeout(() => {
            carousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        }
      }
    });
  }

  // Listen for storage events (fired across browser tabs when admin updates anything)
  window.addEventListener('storage', (e) => {
    // 1. Station announcement broadcast
    if (e.key === 'rr_latest_announcement' && e.newValue) {
      try {
        const notice = JSON.parse(e.newValue);
        showTopAnnouncementPopup(notice);
        initAnnouncementCarousel();
        renderNotificationTray();
      } catch (err) {
        console.warn('Error handling latest announcement:', err);
      }
    }

    // 2. Order status update (Ready, Confirmed, Delivered)
    if (e.key === 'rr_latest_order_status_update' && e.newValue) {
      try {
        const update = JSON.parse(e.newValue);
        const currentUserName = (AppState.user.name || 'Neil').toLowerCase();
        const orderCustomer = (update.customerName || '').toLowerCase();
        const isMyOrder = !orderCustomer || orderCustomer === currentUserName || orderCustomer.includes(currentUserName) || currentUserName.includes(orderCustomer) || (update.orderId && update.orderId === AppState.currentOrderId);

        if (isMyOrder) {
          showOrderStatusNotification(update);
          updateTrackingUI(update);
          renderNotificationTray();
          if (update.status === 'Delivered') {
            handleOrderDeliveredInventory(update);
          }
        }
      } catch (err) {
        console.warn('Error handling order status update:', err);
      }
    }

    // 3. Database orders sync
    if (e.key === 'rr_admin_orders') {
      syncActiveOrderWithAdminState();
      renderNotificationTray();
    }
  });

  // Real-time cross-tab BroadcastChannel listener
  try {
    const channel = new BroadcastChannel('rr_sync_channel');
    channel.onmessage = (event) => {
      if (!event.data) return;
      if (event.data.type === 'ORDER_STATUS_UPDATED' && event.data.order) {
        const update = event.data.order;
        const currentUserName = (AppState.user.name || 'Neil').toLowerCase();
        const orderCustomer = (update.customerName || '').toLowerCase();
        const isMyOrder = !orderCustomer || orderCustomer === currentUserName || orderCustomer.includes(currentUserName) || currentUserName.includes(orderCustomer) || (update.orderId && update.orderId === AppState.currentOrderId);
        if (isMyOrder) {
          showOrderStatusNotification(update);
          updateTrackingUI(update);
          renderNotificationTray();
          if (update.status === 'Delivered') {
            handleOrderDeliveredInventory(update);
          }
        }
      }
    };
  } catch (e) {}

  // Check on load if an order update or announcement was broadcasted in the last 15 seconds
  try {
    const rawOrderUpdate = localStorage.getItem('rr_latest_order_status_update');
    if (rawOrderUpdate) {
      const update = JSON.parse(rawOrderUpdate);
      if (update && update.timestamp && (Date.now() - update.timestamp < 15000)) {
        setTimeout(() => {
          showOrderStatusNotification(update);
        }, 500);
        return;
      }
    }

    const latestRaw = localStorage.getItem('rr_latest_announcement');
    if (latestRaw) {
      const latest = JSON.parse(latestRaw);
      if (latest && latest.timestamp && (Date.now() - latest.timestamp < 15000)) {
        setTimeout(() => {
          showTopAnnouncementPopup(latest);
        }, 600);
      }
    }
  } catch (err) {
    // ignore
  }
}

function renderNotificationTray() {
  const listEl = document.getElementById('notificationTrayList');
  if (!listEl) return;

  listEl.innerHTML = '';

  // 1. Render Order Updates (if any)
  let orderNotifs = [];
  const rawOrderNotifs = localStorage.getItem('rr_customer_order_notifications');
  if (rawOrderNotifs) {
    try {
      const parsed = JSON.parse(rawOrderNotifs);
      if (Array.isArray(parsed)) orderNotifs = parsed;
    } catch (e) {}
  }

  if (orderNotifs.length === 0) {
    orderNotifs = [
      { orderId: 101, customerName: 'Neil', status: 'Loaded', qty: 2, total: 70, timestamp: Date.now() - 1000 * 60 * 12 }
    ];
  }

  const currentUserName = (AppState.user.name || 'Neil').toLowerCase();
  const myOrderNotifs = orderNotifs.filter(o => 
    !o.customerName || o.customerName.toLowerCase() === currentUserName || o.customerName.toLowerCase().includes(currentUserName)
  ).slice(0, 4);

  if (myOrderNotifs.length > 0) {
    const orderHeader = document.createElement('div');
    orderHeader.style.cssText = 'font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; padding-left: 2px;';
    orderHeader.textContent = 'Order Updates';
    listEl.appendChild(orderHeader);

    myOrderNotifs.forEach((item) => {
      const status = item.status || 'Confirmed';
      let badgeBg = '#e0f2fe';
      let badgeColor = '#0284c7';
      let label = status;

      if (status === 'Loaded' || status === 'Ready') {
        badgeBg = '#ede9fe';
        badgeColor = '#7c3aed';
        label = 'Ready / Loaded';
      } else if (status === 'Delivered') {
        badgeBg = '#dcfce7';
        badgeColor = '#16a34a';
        label = 'Delivered';
      }

      const el = document.createElement('div');
      el.className = 'notification-item';
      el.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.6875rem; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 1px 6px; border-radius: 999px;">
            ● ${escapeHtml(label)}
          </span>
          <span style="font-size: 0.6875rem; color: var(--text-muted);">Order #${item.orderId || item.id}</span>
        </div>
        <div style="font-size: 0.8125rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px;">
          ${escapeHtml(item.qty || 2)}x 5-Gal Refill • ₱${Number(item.total || 70).toFixed(2)}
        </div>
        <div style="font-size: 0.72rem; color: var(--color-sky-blue); font-weight: 600;">
          Tap to track live delivery →
        </div>
      `;
      el.addEventListener('click', () => {
        const tray = document.getElementById('notificationTrayDropdown');
        if (tray) tray.classList.remove('open');
        const tabBtnTrack = document.querySelector('.bottom-nav-item[data-tab="tab-track"]');
        if (tabBtnTrack) tabBtnTrack.click();
      });
      listEl.appendChild(el);
    });
  }

  // 2. Render Station Broadcasts
  let currentNoticesList = [];
  const storedNotices = localStorage.getItem('rr_notices');
  if (storedNotices) {
    try {
      const parsed = JSON.parse(storedNotices);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentNoticesList = parsed;
      }
    } catch (e) {
      console.warn('Could not parse rr_notices', e);
    }
  }

  if (currentNoticesList.length === 0) {
    currentNoticesList = [
      { id: 1, badge: 'Notice to All', title: 'Saturday Rest Day Notice', body: 'R&R Water Refilling is closed every Saturday for scheduled equipment sanitization and UV filter maintenance. Multicab deliveries resume Sunday 8:00 AM.' },
      { id: 2, badge: 'Batch Roving', title: 'Batch #1 Roving Today', body: 'Water delivery multicab is currently dispatching in your Purok/Sitio cluster. Keep empty 5-gal carboys ready at the gate for fast swap!' }
    ];
  }

  const broadcastHeader = document.createElement('div');
  broadcastHeader.style.cssText = 'font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 6px 0; padding-left: 2px;';
  broadcastHeader.textContent = 'Station Broadcasts';
  listEl.appendChild(broadcastHeader);

  currentNoticesList.forEach((notice) => {
    const item = document.createElement('div');
    item.className = 'notification-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-size: 0.6875rem; font-weight: 700; color: var(--color-sky-blue); background: var(--color-sky-light); padding: 1px 6px; border-radius: 999px;">
          ${escapeHtml(notice.badge || 'Broadcast')}
        </span>
        <span style="font-size: 0.6875rem; color: var(--text-muted);">Active</span>
      </div>
      <div style="font-size: 0.8125rem; font-weight: 700; color: var(--text-main); margin-bottom: 3px;">
        ${escapeHtml(notice.title)}
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        ${escapeHtml(notice.body)}
      </div>
    `;
    item.addEventListener('click', () => {
      const tray = document.getElementById('notificationTrayDropdown');
      if (tray) tray.classList.remove('open');
      const tabBtnHome = document.querySelector('.bottom-nav-item[data-tab="tab-home"]');
      if (tabBtnHome) tabBtnHome.click();
      const carousel = document.getElementById('stationNoticeCarousel');
      if (carousel) {
        setTimeout(() => {
          carousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      }
    });
    listEl.appendChild(item);
  });
}

function initNotificationBellTray() {
  const bellBtn = document.getElementById('btnNotificationBell');
  const tray = document.getElementById('notificationTrayDropdown');
  const closeBtn = document.getElementById('btnCloseNotificationTray');
  const dotEl = document.getElementById('notificationDot');

  if (!bellBtn || !tray) return;

  renderNotificationTray();

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = tray.classList.contains('open');
    if (isOpen) {
      tray.classList.remove('open');
    } else {
      renderNotificationTray();
      tray.classList.add('open');
      if (dotEl) {
        dotEl.style.opacity = '0.35';
      }
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tray.classList.remove('open');
    });
  }

  // Close tray when clicking outside
  document.addEventListener('click', (e) => {
    if (tray.classList.contains('open') && !tray.contains(e.target) && !bellBtn.contains(e.target)) {
      tray.classList.remove('open');
    }
  });
}

// Expose globally for testing or cross-script invocation
window.showOrderStatusNotification = showOrderStatusNotification;
window.showTopAnnouncementPopup = showTopAnnouncementPopup;
window.hideTopAnnouncementPopup = hideTopAnnouncementPopup;
window.renderNotificationTray = renderNotificationTray;
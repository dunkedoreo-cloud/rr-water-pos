// ==========================================================================
// R&R Water Refilling - Unified Gmail Authentication & Role Detection
// ==========================================================================

const htmlRoot = document.documentElement;
const themeToggleBtn = document.getElementById('authThemeToggle');
const themeIcon = document.getElementById('authThemeIcon');
const themeLabel = document.getElementById('authThemeLabel');
const toastEl = document.getElementById('authToast');
const toastText = document.getElementById('authToastText');

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSegmentTabs();
  initUnifiedAuth();
  initAuthWaterCanvas();
});

// Toast Helper
function showToast(message) {
  toastText.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

// 1. Theme Management (Synchronized with R&R Theme)
function initTheme() {
  const savedTheme = localStorage.getItem('rr_theme') || 'light';
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = htmlRoot.classList.contains('dark') ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }
}

function setTheme(theme) {
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
}

// 2. Tab Navigation (Sign In vs Register)
function initSegmentTabs() {
  const segmentBtns = document.querySelectorAll('.auth-segment-btn');
  const panes = document.querySelectorAll('.auth-form-pane');

  function switchTab(targetId) {
    segmentBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === targetId);
    });
    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === targetId);
    });
  }

  segmentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.target);
    });
  });

  const linkToRegister = document.getElementById('linkSwitchToRegister');
  if (linkToRegister) {
    linkToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('paneRegister');
    });
  }

  const linkToLogin = document.getElementById('linkSwitchToLogin');
  if (linkToLogin) {
    linkToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('paneLogin');
    });
  }

  // Quick fill demo admin credentials
  const btnQuickFillAdmin = document.getElementById('btnQuickFillAdmin');
  if (btnQuickFillAdmin) {
    btnQuickFillAdmin.addEventListener('click', () => {
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');
      if (emailInput) emailInput.value = 'admin@gmail.com';
      if (passInput) passInput.value = 'admin123';
      showToast('Admin demo credentials populated! Click Sign In.');
    });
  }

  // Quick fill demo customer credentials
  const btnQuickFillCustomer = document.getElementById('btnQuickFillCustomer');
  if (btnQuickFillCustomer) {
    btnQuickFillCustomer.addEventListener('click', () => {
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');
      if (emailInput) emailInput.value = 'neil@gmail.com';
      if (passInput) passInput.value = 'password123';
      showToast('Customer demo credentials populated! Click Sign In.');
    });
  }
}

// --- Accounts Database Model (Persistent in LocalStorage) ---
const DEFAULT_ACCOUNTS = [
  {
    id: 1,
    name: 'Neil',
    email: 'neil@gmail.com',
    password: 'password123',
    phone: '0917 555 0192',
    sitio: 'Cambarong',
    barangay: 'Canhaway',
    municipality: 'Guindulman',
    address: 'Cambarong, Canhaway, Guindulman',
    createdAt: '2026-09-01T08:00:00.000Z'
  },
  {
    id: 2,
    name: 'Nanay Tess',
    email: 'tess@gmail.com',
    password: 'password123',
    phone: '0918 234 5678',
    sitio: 'Purok 2',
    barangay: 'Canhaway',
    municipality: 'Guindulman',
    address: 'Purok 2, Canhaway, Guindulman',
    createdAt: '2026-09-01T08:00:00.000Z'
  }
];

function getAccounts() {
  const raw = localStorage.getItem('rr_accounts');
  if (!raw) {
    localStorage.setItem('rr_accounts', JSON.stringify(DEFAULT_ACCOUNTS));
    return [...DEFAULT_ACCOUNTS];
  }
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [...DEFAULT_ACCOUNTS];
  } catch (e) {
    return [...DEFAULT_ACCOUNTS];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem('rr_accounts', JSON.stringify(accounts));
}

// --- Check and Display Existing Session Status Banner ---
function checkExistingSession() {
  const sessionBanner = document.getElementById('authSessionStatus');
  const sessionName = document.getElementById('sessionUserName');
  const sessionRole = document.getElementById('sessionUserRole');
  const btnContinue = document.getElementById('btnContinueSession');
  const btnSwitch = document.getElementById('btnSwitchAccount');

  if (!sessionBanner) return;

  const rawSession = localStorage.getItem('rr_session');
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession);
      if (session && session.user && session.user.name) {
        if (sessionName) sessionName.textContent = session.user.name;
        if (sessionRole) sessionRole.textContent = session.role === 'admin' ? 'Station Admin' : 'Customer';
        sessionBanner.style.display = 'block';

        if (btnContinue) {
          btnContinue.onclick = () => {
            window.location.href = session.role === 'admin' ? 'admin.html' : 'index.html';
          };
        }

        if (btnSwitch) {
          btnSwitch.onclick = () => {
            localStorage.removeItem('rr_session');
            sessionBanner.style.display = 'none';
            showToast('Signed out from current session. Ready for new sign in or registration.');
          };
        }
      }
    } catch (e) {}
  } else {
    sessionBanner.style.display = 'none';
  }
}

// 3. Unified Sign In & Register Controller
function initUnifiedAuth() {
  checkExistingSession();

  const loginForm = document.getElementById('paneLogin');
  const regForm = document.getElementById('paneRegister');

  // --- UNIFIED SIGN IN ---
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value.trim();

      // Check if Admin Credentials
      const isAdminEmail = (email === 'admin@gmail.com' || email === 'admin' || email === 'admin@rrwater.com');
      
      if (isAdminEmail) {
        if (password === 'admin123' || password === 'admin' || password === 'password123') {
          // ADMIN SUCCESS
          localStorage.setItem('rr_session', JSON.stringify({
            role: 'admin',
            user: {
              name: 'Station Admin Manager',
              email: 'admin@gmail.com',
              role: 'admin'
            }
          }));

          showToast('Admin verified! Entering Station Admin Portal...');
          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 550);
          return;
        } else {
          showToast('Incorrect admin password. (Hint: admin123)');
          return;
        }
      }

      // CUSTOMER SIGN IN
      const accounts = getAccounts();
      let matchedAccount = accounts.find(a => 
        (a.email && a.email.toLowerCase() === email) ||
        (a.name && a.name.toLowerCase() === email.split('@')[0].toLowerCase())
      );

      // Fallback lookup into customer directory (if seeded admin customer)
      if (!matchedAccount) {
        const rawCust = localStorage.getItem('rr_admin_customers');
        const custList = rawCust ? JSON.parse(rawCust) : [];
        const matchedCust = custList.find(c => 
          (c.email && c.email.toLowerCase() === email) ||
          (c.name && c.name.toLowerCase() === email.split('@')[0].toLowerCase())
        );
        if (matchedCust) {
          matchedAccount = {
            id: accounts.length + 1,
            name: matchedCust.name,
            email: matchedCust.email || email,
            password: password || 'password123',
            phone: matchedCust.phone || '0917 555 0192',
            sitio: matchedCust.sitio || 'Cambarong',
            barangay: matchedCust.barangay || 'Canhaway',
            municipality: matchedCust.municipality || 'Guindulman',
            address: matchedCust.address || `${matchedCust.sitio || 'Cambarong'}, ${matchedCust.barangay || 'Canhaway'}, ${matchedCust.municipality || 'Guindulman'}`,
            createdAt: new Date().toISOString()
          };
          accounts.push(matchedAccount);
          saveAccounts(accounts);
        }
      }

      if (!matchedAccount) {
        showToast('Account not found! Please check your email or click Register.');
        return;
      }

      // Verify Password
      if (matchedAccount.password && matchedAccount.password !== password) {
        showToast('Incorrect password. Please try again! (Hint: password123)');
        return;
      }

      // Persist Customer Session
      localStorage.setItem('rr_session', JSON.stringify({
        role: 'customer',
        user: matchedAccount
      }));

      showToast(`Welcome back, ${matchedAccount.name}! Opening customer app...`);
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 550);
    });
  }

  // --- CUSTOMER REGISTRATION ---
  if (regForm) {
    regForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim().toLowerCase();
      const phone = document.getElementById('regPhone').value.trim();
      const sitio = document.getElementById('regSitio') ? document.getElementById('regSitio').value.trim() : 'Cambarong';
      const barangay = document.getElementById('regBarangay') ? document.getElementById('regBarangay').value.trim() : 'Canhaway';
      const municipality = document.getElementById('regMunicipality') ? document.getElementById('regMunicipality').value.trim() : 'Guindulman';
      const password = document.getElementById('regPass') ? document.getElementById('regPass').value.trim() : 'password123';
      const regFullInput = document.getElementById('regFullJugs');
      const regEmptyInput = document.getElementById('regEmptyJugs');
      const fullJugs = regFullInput ? (parseInt(regFullInput.value, 10) || 0) : 0;
      const emptyJugs = regEmptyInput ? (parseInt(regEmptyInput.value, 10) || 0) : 0;
      const bottleCount = fullJugs + emptyJugs;

      // Guard: Admin email cannot be registered as customer
      if (email === 'admin@gmail.com' || email === 'admin' || name.toLowerCase() === 'admin') {
        showToast('Admin account already exists! Please sign in on the Sign In tab.');
        return;
      }

      // 1. Check Accounts Database for Duplicate Email
      const accounts = getAccounts();
      const duplicateAccount = accounts.find(a => a.email && a.email.toLowerCase() === email);
      if (duplicateAccount) {
        showToast('An account with this email is already registered! Please sign in.');
        return;
      }

      const fullAddress = `${sitio}, ${barangay}, ${municipality}`;

      // 2. Save to Persistent Accounts Database with User's Inputted Gallons
      const newAccountId = (accounts.length > 0 ? Math.max(...accounts.map(a => a.id || 0)) : 0) + 1;
      const newAccount = {
        id: newAccountId,
        name: name,
        email: email,
        password: password,
        phone: phone,
        sitio: sitio,
        barangay: barangay,
        municipality: municipality,
        address: fullAddress,
        fullJugs: fullJugs,
        emptyJugs: emptyJugs,
        bottleLimit: bottleCount,
        createdAt: new Date().toISOString()
      };
      accounts.push(newAccount);
      saveAccounts(accounts);

      // Save user inventory directly
      const invPayload = {
        fullJugs: fullJugs,
        emptyJugs: emptyJugs,
        daysLeft: fullJugs > 0 ? fullJugs * 3 : 0,
        swapReady: emptyJugs
      };
      localStorage.setItem('rr_inventory', JSON.stringify(invPayload));
      localStorage.setItem(`rr_inventory_${email}`, JSON.stringify(invPayload));

      if (bottleCount > 0) {
        localStorage.setItem(`rr_gallons_configured_${email}`, 'true');
      } else {
        localStorage.removeItem(`rr_gallons_configured_${email}`);
      }

      // 3. Log into Station Admin Customer Directory (`rr_admin_customers`)
      const rawCustomers = localStorage.getItem('rr_admin_customers');
      let customersList = rawCustomers ? JSON.parse(rawCustomers) : [];
      
      const newCustId = (customersList.length > 0 ? Math.max(...customersList.map(c => c.id || 0)) : 0) + 1;
      const newCustomerEntry = {
        id: newCustId,
        name: name,
        email: email,
        phone: phone,
        sitio: sitio,
        barangay: barangay,
        municipality: municipality,
        address: fullAddress,
        purok: `${sitio}, ${barangay}`,
        full: fullJugs,
        empty: emptyJugs,
        velocity: fullJugs > 0 ? `Every ${Math.max(3, fullJugs * 2)} days` : 'New Customer',
        status: 'Active',
        registeredAt: new Date().toISOString()
      };

      // Add new customer at the beginning of the Admin Directory table
      customersList.unshift(newCustomerEntry);
      localStorage.setItem('rr_admin_customers', JSON.stringify(customersList));

      // 4. Real-time Broadcast to Open Admin Dashboard & Other Tabs
      try {
        const channel = new BroadcastChannel('rr_sync_channel');
        channel.postMessage({
          type: 'CUSTOMER_REGISTERED',
          customer: newCustomerEntry,
          timestamp: Date.now()
        });
      } catch (e) {}

      localStorage.setItem('rr_last_registered_customer', JSON.stringify({
        customer: newCustomerEntry,
        timestamp: Date.now()
      }));

      // 5. Save and Remember Logged In Account
      localStorage.setItem('rr_session', JSON.stringify({
        role: 'customer',
        user: newAccount
      }));

      showToast(`Account registered for ${name}! Saved to Directory. Opening app...`);
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 650);
    });
  }
}

// --- 4. Dynamic Fullscreen Water Wave Canvas Animation Engine ---
function initAuthWaterCanvas() {
  const canvas = document.getElementById('authWaterCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Create persistent micro-bubbles
  const bubbleCount = 28;
  const bubbles = [];
  for (let i = 0; i < bubbleCount; i++) {
    bubbles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 2.5 + 1.5,
      speed: Math.random() * 0.8 + 0.4,
      wobbleSpeed: Math.random() * 0.03 + 0.015,
      wobbleOffset: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.4 + 0.2
    });
  }

  let step = 0;
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    step += 0.028;

    const w = canvas.width;
    const h = canvas.height;
    const isDark = document.documentElement.classList.contains('dark');

    // Baseline sits around 52% from top, framing the login card gracefully
    const waterLevel = h * 0.52;

    // --- Wave 1: Deep Background Aqua/Navy Wave ---
    const gradBack = ctx.createLinearGradient(0, waterLevel - 60, 0, h);
    if (isDark) {
      gradBack.addColorStop(0, 'rgba(7, 89, 133, 0.35)');
      gradBack.addColorStop(1, 'rgba(12, 74, 110, 0.65)');
    } else {
      gradBack.addColorStop(0, 'rgba(2, 132, 199, 0.22)');
      gradBack.addColorStop(1, 'rgba(3, 105, 161, 0.42)');
    }

    ctx.fillStyle = gradBack;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const y = waterLevel + Math.sin(x * 0.008 + step * 0.85) * 18 + Math.cos(x * 0.004 + step * 0.4) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // --- Wave 2: Mid-Layer Harmonic Turquoise/Cyan Wave ---
    const gradMid = ctx.createLinearGradient(0, waterLevel - 40, 0, h);
    if (isDark) {
      gradMid.addColorStop(0, 'rgba(3, 105, 161, 0.45)');
      gradMid.addColorStop(0.6, 'rgba(8, 47, 73, 0.70)');
      gradMid.addColorStop(1, 'rgba(15, 23, 42, 0.90)');
    } else {
      gradMid.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
      gradMid.addColorStop(0.5, 'rgba(2, 132, 199, 0.55)');
      gradMid.addColorStop(1, 'rgba(3, 105, 161, 0.70)');
    }

    ctx.fillStyle = gradMid;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const y = waterLevel + Math.cos(x * 0.009 + step * 1.1) * 16 + Math.sin(x * 0.005 + step * 0.7) * 10 + 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // --- Wave 3: Foreground Crisp Luminous Blue Wave ---
    const gradFront = ctx.createLinearGradient(0, waterLevel - 30, 0, h);
    if (isDark) {
      gradFront.addColorStop(0, 'rgba(56, 189, 248, 0.40)');
      gradFront.addColorStop(0.3, 'rgba(2, 132, 199, 0.65)');
      gradFront.addColorStop(1, 'rgba(10, 25, 47, 0.92)');
    } else {
      gradFront.addColorStop(0, 'rgba(56, 189, 248, 0.50)');
      gradFront.addColorStop(0.4, 'rgba(2, 132, 199, 0.70)');
      gradFront.addColorStop(1, 'rgba(3, 105, 161, 0.90)');
    }

    ctx.fillStyle = gradFront;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const frontWavePoints = [];
    for (let x = 0; x <= w; x += 10) {
      const y = waterLevel + Math.sin(x * 0.01 + step * 1.3) * 14 + Math.cos(x * 0.006 + step * 0.9) * 8 + 10;
      frontWavePoints.push({ x, y });
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Subtle Crest Shimmer Highlight on Foreground Wave
    ctx.beginPath();
    if (frontWavePoints.length > 0) {
      ctx.moveTo(frontWavePoints[0].x, frontWavePoints[0].y);
      for (let i = 1; i < frontWavePoints.length; i++) {
        ctx.lineTo(frontWavePoints[i].x, frontWavePoints[i].y);
      }
      ctx.strokeStyle = isDark ? 'rgba(125, 211, 252, 0.55)' : 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // --- Floating Rising Micro-Bubbles ---
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.y -= b.speed;
      b.wobbleOffset += b.wobbleSpeed;
      const wobbleX = b.x + Math.sin(b.wobbleOffset) * 12;

      // Reset when bubble breaks through water level or reaches top
      if (b.y < waterLevel - 20) {
        b.y = h + Math.random() * 20;
        b.x = Math.random() * w;
      }

      ctx.fillStyle = isDark
        ? `rgba(186, 230, 253, ${b.opacity * 0.75})`
        : `rgba(255, 255, 255, ${b.opacity})`;

      ctx.beginPath();
      ctx.arc(wobbleX, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}
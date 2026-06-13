// ===== VAULTIAC AUTH MODULE =====
// Handles signup, login, logout, session persistence via localStorage + JWT

const VaultAuth = (() => {
  const TOKEN_KEY = 'vaultiac_token';
  const USER_KEY  = 'vaultiac_user';

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function isLoggedIn(){ return !!getToken() && !!getUser(); }

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function signup(email, password, username, notify_updates, agreed_to_terms) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username, notify_updates, agreed_to_terms })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    saveSession(data.token, data.user);
    return data.user;
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveSession(data.token, data.user);
    return data.user;
  }

  function logout() {
    clearSession();
    window.location.reload();
  }

  async function checkUsername(username) {
    const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
    return res.json();
  }

  return { getToken, getUser, isLoggedIn, signup, login, logout, checkUsername };
})();

// ===== AUTH MODAL HTML =====
// Inject modal + account button into every page

(function initAuthUI() {
  // ---- STYLES ----
  const style = document.createElement('style');
  style.textContent = `
    .va-auth-btn {
      font-family: inherit; font-size: 12px; font-weight: 700;
      color: #9a93a6; background: #1a1728;
      border: 1px solid rgba(255,255,255,.09); border-radius: 10px;
      padding: 7px 14px; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      transition: .2s; white-space: nowrap;
    }
    .va-auth-btn:hover { color: #f3eee6; border-color: rgba(255,255,255,.2); }
    .va-auth-btn.logged-in { color: #e8c27a; border-color: rgba(232,194,122,.25); background: rgba(232,194,122,.06); }

    .va-modal-overlay {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,.7); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      opacity: 0; pointer-events: none; transition: opacity .25s;
    }
    .va-modal-overlay.open { opacity: 1; pointer-events: all; }

    .va-modal {
      background: #16121e; border: 1px solid rgba(255,255,255,.1);
      border-radius: 24px; padding: 32px 28px 28px;
      width: 100%; max-width: 400px;
      position: relative;
      transform: translateY(16px); transition: transform .25s;
    }
    .va-modal-overlay.open .va-modal { transform: translateY(0); }

    .va-modal-close {
      position: absolute; top: 16px; right: 16px;
      background: none; border: none; color: #7a7488;
      font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: .2s;
    }
    .va-modal-close:hover { color: #f3eee6; background: rgba(255,255,255,.08); }

    .va-modal-brand {
      font-family: Fraunces, serif; font-weight: 900; font-size: 22px;
      background: linear-gradient(120deg, #fff, #e8c27a); -webkit-background-clip: text;
      background-clip: text; color: transparent; margin-bottom: 6px;
    }
    .va-modal-sub { font-size: 13px; color: #7a7488; margin-bottom: 24px; }

    .va-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 24px; }
    .va-tab {
      flex: 1; font-family: inherit; font-size: 13px; font-weight: 700;
      color: #7a7488; background: none; border: none; cursor: pointer;
      padding: 10px 0; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: .2s;
    }
    .va-tab.active { color: #e8c27a; border-bottom-color: #e8c27a; }

    .va-form { display: flex; flex-direction: column; gap: 12px; }
    .va-input {
      width: 100%; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
      border-radius: 12px; padding: 13px 16px; font-family: inherit; font-size: 14px;
      color: #f3eee6; outline: none; transition: .2s;
    }
    .va-input::placeholder { color: rgba(255,255,255,.2); }
    .va-input:focus { border-color: rgba(167,139,250,.5); background: rgba(255,255,255,.07); }
    .va-input.error { border-color: rgba(240,100,100,.5); }
    .va-input.success { border-color: rgba(124,232,214,.5); }

    .va-username-row { position: relative; }
    .va-username-status {
      position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
      font-size: 11px; font-weight: 700;
    }
    .va-username-status.ok { color: #7ce8d6; }
    .va-username-status.taken { color: #f09090; }
    .va-username-status.checking { color: #9a93a6; }

    .va-submit {
      width: 100%; font-family: Fraunces, serif; font-weight: 900; font-size: 15px;
      background: linear-gradient(90deg, #a78bfa, #f0a6c8);
      color: #0c0a10; border: none; border-radius: 12px; padding: 14px;
      cursor: pointer; margin-top: 4px; transition: .2s;
    }
    .va-submit:hover { opacity: .9; transform: translateY(-1px); }
    .va-submit:disabled { opacity: .4; cursor: default; transform: none; }

    .va-error { font-size: 12px; color: #f09090; text-align: center; min-height: 18px; }
    .va-switch { font-size: 12px; color: #7a7488; text-align: center; margin-top: 8px; }
    .va-switch button { background: none; border: none; color: #a78bfa; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; }

    .va-logged-in-panel { text-align: center; }
    .va-user-avatar {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #a78bfa, #f0a6c8);
      display: flex; align-items: center; justify-content: center;
      font-family: Fraunces, serif; font-weight: 900; font-size: 22px; color: #0c0a10;
      margin: 0 auto 12px;
    }
    .va-user-name { font-family: Fraunces, serif; font-weight: 700; font-size: 20px; margin-bottom: 4px; }
    .va-user-email { font-size: 12px; color: #7a7488; margin-bottom: 20px; }
    .va-logout-btn {
      font-family: inherit; font-size: 13px; font-weight: 600;
      color: #7a7488; background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
      padding: 10px 24px; cursor: pointer; transition: .2s;
    }
    .va-logout-btn:hover { color: #f09090; border-color: rgba(240,100,100,.3); }

    .va-checkbox-row {
      display: flex !important; align-items: flex-start !important;
      gap: 10px !important; cursor: pointer !important;
      padding: 4px 0 !important; margin: 0 !important;
    }
    .va-checkbox-row input[type="checkbox"] {
      display: inline-block !important;
      width: 16px !important; height: 16px !important;
      min-width: 16px !important; min-height: 16px !important;
      margin: 2px 0 0 0 !important; padding: 0 !important;
      flex-shrink: 0 !important;
      accent-color: #a78bfa !important; cursor: pointer !important;
      appearance: checkbox !important; -webkit-appearance: checkbox !important;
    }
    .va-checkbox-label {
      display: block !important;
      font-size: 12px !important; color: #7a7488 !important;
      line-height: 1.5 !important; cursor: pointer !important;
      margin: 0 !important; padding: 0 !important;
    }
    .va-checkbox-label a {
      color: #a78bfa !important; text-decoration: underline !important;
      text-underline-offset: 2px !important;
    }
    .va-checkbox-label a:hover { color: #f0a6c8 !important; }
  `;
  document.head.appendChild(style);

  // ---- MODAL HTML ----
  const overlay = document.createElement('div');
  overlay.className = 'va-modal-overlay';
  overlay.id = 'vaModalOverlay';
  overlay.innerHTML = `
    <div class="va-modal" id="vaModal">
      <button class="va-modal-close" id="vaModalClose">✕</button>
      <div class="va-modal-brand">VAULTIAC</div>
      <div class="va-modal-sub" id="vaModalSub">Join to save your progress and compete on the leaderboard.</div>
      <div id="vaModalContent"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ---- ACCOUNT BUTTON ----
  // Placed fixed top-right on every page
  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'position:fixed;top:16px;right:16px;z-index:30;';
  const btn = document.createElement('button');
  btn.className = 'va-auth-btn';
  btn.id = 'vaAuthBtn';
  btnWrap.appendChild(btn);
  document.body.appendChild(btnWrap);

  // ---- STATE ----
  let usernameCheckTimer = null;
  let usernameAvailable = false;

  function updateButton() {
    if (VaultAuth.isLoggedIn()) {
      const user = VaultAuth.getUser();
      btn.className = 'va-auth-btn logged-in';
      btn.innerHTML = `<span>👤</span> ${user.username}`;
    } else {
      btn.className = 'va-auth-btn';
      btn.innerHTML = 'Sign In';
    }
  }

  function openModal(tab) {
    overlay.classList.add('open');
    if (VaultAuth.isLoggedIn()) {
      renderLoggedIn();
    } else {
      renderAuth(tab || 'signup');
    }
  }

  function closeModal() {
    overlay.classList.remove('open');
  }

  function renderLoggedIn() {
    const user = VaultAuth.getUser();
    document.getElementById('vaModalSub').textContent = 'Your Vaultiac account.';
    document.getElementById('vaModalContent').innerHTML = `
      <div class="va-logged-in-panel">
        <div class="va-user-avatar">${user.username.charAt(0).toUpperCase()}</div>
        <div class="va-user-name">@${user.username}</div>
        <div class="va-user-email">${user.email}</div>
        <button class="va-logout-btn" id="vaLogoutBtn">Sign Out</button>
      </div>
    `;
    document.getElementById('vaLogoutBtn').addEventListener('click', () => {
      VaultAuth.logout();
    });
  }

  function renderAuth(activeTab) {
    document.getElementById('vaModalSub').textContent = 'Join to save your progress and compete on the leaderboard.';
    document.getElementById('vaModalContent').innerHTML = `
      <div class="va-tabs">
        <button class="va-tab ${activeTab === 'signup' ? 'active' : ''}" id="vaTabSignup">Sign Up</button>
        <button class="va-tab ${activeTab === 'login' ? 'active' : ''}" id="vaTabLogin">Log In</button>
      </div>
      <div id="vaFormWrap"></div>
    `;
    document.getElementById('vaTabSignup').addEventListener('click', () => renderAuth('signup'));
    document.getElementById('vaTabLogin').addEventListener('click', () => renderAuth('login'));
    if (activeTab === 'signup') renderSignupForm();
    else renderLoginForm();
  }

  function renderSignupForm() {
    document.getElementById('vaFormWrap').innerHTML = `
      <div class="va-form" id="vaSignupForm">
        <input class="va-input" id="vaSignupEmail" type="email" placeholder="Email address" autocomplete="email"/>
        <div class="va-username-row">
          <input class="va-input" id="vaSignupUsername" type="text" placeholder="Choose a username" autocomplete="off" autocorrect="off" spellcheck="false"/>
          <span class="va-username-status" id="vaUsernameStatus"></span>
        </div>
        <input class="va-input" id="vaSignupPassword" type="password" placeholder="Password (min 6 characters)" autocomplete="new-password"/>
        <label class="va-checkbox-row">
          <input type="checkbox" id="vaAgreeTerms"/>
          <span class="va-checkbox-label">I agree to the <a href="/vaultiac-terms.html" target="_blank">Terms of Service</a> and <a href="/vaultiac-privacy.html" target="_blank">Privacy Policy</a>. <span style="color:#f09090;">*</span></span>
        </label>
        <label class="va-checkbox-row">
          <input type="checkbox" id="vaNotifyUpdates"/>
          <span class="va-checkbox-label">Notify me when new features drop — occasional updates only, no spam.</span>
        </label>
        <div class="va-error" id="vaSignupError"></div>
        <button class="va-submit" id="vaSignupSubmit">Create Account</button>
        <div class="va-switch">Already have an account? <button id="vaSwitchLogin">Log in</button></div>
      </div>
    `;
    document.getElementById('vaSwitchLogin').addEventListener('click', () => renderAuth('login'));
    document.getElementById('vaSignupUsername').addEventListener('input', function() {
      clearTimeout(usernameCheckTimer);
      const val = this.value.trim();
      const status = document.getElementById('vaUsernameStatus');
      usernameAvailable = false;
      if (!val) { status.textContent = ''; status.className = 'va-username-status'; return; }
      status.textContent = '...'; status.className = 'va-username-status checking';
      usernameCheckTimer = setTimeout(async () => {
        try {
          const result = await VaultAuth.checkUsername(val);
          if (result.available) {
            status.textContent = '✓'; status.className = 'va-username-status ok';
            document.getElementById('vaSignupUsername').classList.remove('error');
            document.getElementById('vaSignupUsername').classList.add('success');
            usernameAvailable = true;
          } else {
            status.textContent = result.reason || 'Taken'; status.className = 'va-username-status taken';
            document.getElementById('vaSignupUsername').classList.add('error');
            document.getElementById('vaSignupUsername').classList.remove('success');
            usernameAvailable = false;
          }
        } catch(e) { status.textContent = ''; }
      }, 500);
    });
    document.getElementById('vaSignupSubmit').addEventListener('click', async () => {
      const email = document.getElementById('vaSignupEmail').value.trim();
      const username = document.getElementById('vaSignupUsername').value.trim();
      const password = document.getElementById('vaSignupPassword').value;
      const agreedToTerms = document.getElementById('vaAgreeTerms').checked;
      const notifyUpdates = document.getElementById('vaNotifyUpdates').checked;
      const errorEl = document.getElementById('vaSignupError');
      const submitBtn = document.getElementById('vaSignupSubmit');
      errorEl.textContent = '';
      if (!email || !password || !username) { errorEl.textContent = 'All fields are required.'; return; }
      if (!usernameAvailable) { errorEl.textContent = 'Please choose an available username.'; return; }
      if (!agreedToTerms) { errorEl.textContent = 'You must agree to the Terms of Service to continue.'; return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Creating account…';
      try {
        await VaultAuth.signup(email, password, username, notifyUpdates, agreedToTerms);
        closeModal();
        updateButton();
        await processPendingInvite();
      } catch(e) {
        errorEl.textContent = e.message;
        submitBtn.disabled = false; submitBtn.textContent = 'Create Account';
      }
    });
  }

  function renderLoginForm() {
    document.getElementById('vaFormWrap').innerHTML = `
      <div class="va-form" id="vaLoginForm">
        <input class="va-input" id="vaLoginEmail" type="email" placeholder="Email address" autocomplete="email"/>
        <input class="va-input" id="vaLoginPassword" type="password" placeholder="Password" autocomplete="current-password"/>
        <div class="va-error" id="vaLoginError"></div>
        <button class="va-submit" id="vaLoginSubmit">Log In</button>
        <div style="text-align:center;margin-top:12px;"><button id="vaForgotBtn" style="background:none;border:none;color:#9a93a6;font-size:12px;font-family:inherit;cursor:pointer;text-decoration:underline;">Forgot password?</button></div>
        <div class="va-switch">Don't have an account? <button id="vaSwitchSignup">Sign up free</button></div>
      </div>
    `;
    document.getElementById('vaSwitchSignup').addEventListener('click', () => renderAuth('signup'));
    document.getElementById('vaForgotBtn').addEventListener('click', () => renderForgotForm());
    document.getElementById('vaLoginSubmit').addEventListener('click', async () => {
      const email = document.getElementById('vaLoginEmail').value.trim();
      const password = document.getElementById('vaLoginPassword').value;
      const errorEl = document.getElementById('vaLoginError');
      const submitBtn = document.getElementById('vaLoginSubmit');
      errorEl.textContent = '';
      if (!email || !password) { errorEl.textContent = 'Email and password are required.'; return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Logging in…';
      try {
        await VaultAuth.login(email, password);
        closeModal();
        updateButton();
        await processPendingInvite();
      } catch(e) {
        errorEl.textContent = e.message;
        submitBtn.disabled = false; submitBtn.textContent = 'Log In';
      }
    });
    // Allow Enter key on password field
    document.getElementById('vaLoginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('vaLoginSubmit').click();
    });
  }

  function renderForgotForm() {
    document.getElementById('vaFormWrap').innerHTML = `
      <div class="va-form" id="vaForgotForm">
        <p class="va-switch" style="margin-bottom:8px;">Enter your email and we'll send a reset link.</p>
        <input class="va-input" id="vaForgotEmail" type="email" placeholder="you@example.com" autocomplete="email"/>
        <button class="va-submit" id="vaForgotSubmitBtn">Send Reset Link</button>
        <div class="va-error" id="vaForgotMsg" style="color:#9a93a6;"></div>
        <div style="text-align:center;margin-top:14px;"><button id="vaBackToLoginBtn" style="background:none;border:none;color:#9a93a6;font-size:12px;font-family:inherit;cursor:pointer;text-decoration:underline;">Back to log in</button></div>
      </div>
    `;
    document.getElementById('vaBackToLoginBtn').addEventListener('click', () => renderAuth('login'));
    document.getElementById('vaForgotSubmitBtn').addEventListener('click', async function() {
      const email = document.getElementById('vaForgotEmail').value.trim();
      const msgEl = document.getElementById('vaForgotMsg');
      const btn = document.getElementById('vaForgotSubmitBtn');
      msgEl.style.color = '#9a93a6';
      msgEl.textContent = '';
      if (!email) { msgEl.style.color = '#f09090'; msgEl.textContent = 'Please enter your email.'; return; }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        msgEl.style.color = '#7ce8d6';
        msgEl.textContent = 'If that email exists, a reset link is on its way.';
      } catch(e) {
        msgEl.style.color = '#f09090';
        msgEl.textContent = 'Network error — try again.';
      }
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    });
    document.getElementById('vaForgotEmail').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('vaForgotSubmitBtn').click();
    });
  }

  // ---- PENDING INVITE ----
  async function processPendingInvite() {
    const inviteToken = sessionStorage.getItem('pending_invite');
    if (!inviteToken) return;
    sessionStorage.removeItem('pending_invite');
    const token = VaultAuth.getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/friends/request/' + encodeURIComponent(inviteToken), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (res.ok && json.status === 'pending') {
        // Store so leaderboard page can show confirmation banner
        sessionStorage.setItem('pending_friend_request', JSON.stringify({
          from_username: json.from_username
        }));
        // Redirect to leaderboard — friends tab will pick up the banner
        window.location.href = '/vaultiac-leaderboard.html?tab=friends';
      } else if (json.status === 'already_friends') {
        window.location.href = '/vaultiac-leaderboard.html?tab=friends';
      } else {
        showGlobalToast(json.error || 'Could not process invite.');
      }
    } catch (e) {
      showGlobalToast('Could not process invite link.');
    }
  }

  function showGlobalToast(msg) {
    let t = document.getElementById('vaultToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vaultToast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1a2e;border:1px solid rgba(124,232,214,.3);color:#7ce8d6;font-size:13px;font-weight:600;padding:12px 20px;border-radius:12px;z-index:999;transition:opacity .3s;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._hide);
    t._hide = setTimeout(() => { t.style.opacity = '0'; }, 3500);
  }

  // ---- EVENT LISTENERS ----
  btn.addEventListener('click', () => openModal('signup'));
  document.getElementById('vaModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // ---- INIT ----
  updateButton();

  // Expose openModal globally so "Sign Up Free" buttons can call it
  window.vaultiacOpenAuth = (tab) => openModal(tab || 'signup');

})();

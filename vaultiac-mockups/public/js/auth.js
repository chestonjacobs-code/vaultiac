const VaultAuth = (() => {
  const TOKEN_KEY = 'vaultiac_token';
  let _userCache = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function getUser() {
    if (_userCache) return _userCache;
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;
      _userCache = await res.json();
      return _userCache;
    } catch (e) {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    _userCache = null;
    location.reload();
  }

  return { getToken, getUser, isLoggedIn, logout };
})();

// ---- AUTH BUTTON INJECTION ----
// Injects into .topnav or .sf-top (never fixed-position over the page)
(function injectAuthButton() {
  const hasToken = VaultAuth.isLoggedIn();

  const btn = document.createElement('button');
  btn.id = 'vaultAuthBtn';
  btn.style.cssText = [
    'font-family:inherit',
    'font-size:11px',
    'font-weight:700',
    'letter-spacing:.04em',
    'color:#9a93a6',
    'background:#1a1728',
    'border:1px solid rgba(255,255,255,.09)',
    'border-radius:10px',
    'padding:7px 12px',
    'cursor:pointer',
    'white-space:nowrap',
    'flex-shrink:0',
    'transition:color .2s,border-color .2s',
  ].join(';');

  btn.textContent = hasToken ? 'Account' : 'Sign In';

  btn.addEventListener('mouseenter', () => { btn.style.color = '#f3eee6'; });
  btn.addEventListener('mouseleave', () => { btn.style.color = '#9a93a6'; });

  if (hasToken) {
    btn.addEventListener('click', () => {
      if (window.confirm('Sign out of Vaultiac?')) VaultAuth.logout();
    });
  } else {
    btn.addEventListener('click', () => {
      window.location.href = 'vaultiac-home.html';
    });
  }

  // Prefer injecting into a nav/header element — never fixed-position over the page
  const topnav = document.querySelector('.topnav');
  const sfTop  = document.querySelector('.sf-top');

  if (topnav) {
    topnav.appendChild(btn);
  } else if (sfTop) {
    // Inside the story frame: use smaller padding so it fits the tight header
    btn.style.padding = '5px 10px';
    btn.style.fontSize = '10px';
    sfTop.appendChild(btn);
  }
  // No fixed-position fallback — avoids overlap with existing top-right controls
})();

// ---- DYNAMIC USERNAME (spotlight + share pages) ----
(async function updateUsername() {
  const user = await VaultAuth.getUser();

  // Update auth button label to real username once resolved
  const authBtn = document.getElementById('vaultAuthBtn');
  if (authBtn && user && user.username) {
    authBtn.textContent = '@' + user.username;
  }

  // --- spotlight page: .sf-foot .who ---
  const sfWho = document.querySelector('.sf-foot .who');
  if (sfWho) {
    const caption = sfWho.querySelector('span');
    const username = (user && user.username) ? user.username : 'guest';
    sfWho.textContent = '@' + username + ' ';
    if (caption) sfWho.appendChild(caption);
    // Persist for share page
    sessionStorage.setItem('vaultiac_username', username);
  }

  // --- share page: .ms-foot .who ---
  const msWho = document.querySelector('.ms-foot .who');
  if (msWho) {
    // Prefer sessionStorage (written by spotlight page), fall back to live auth
    const stored   = sessionStorage.getItem('vaultiac_username');
    const username = stored || ((user && user.username) ? user.username : 'guest');
    msWho.textContent = '@' + username + ' · pulled this';
  }
})();

// ---- WRITE USERNAME TO SESSIONSTORAGE BEFORE SHARE NAVIGATION ----
// Ensures the username is fresh if the user logs in during the spotlight session
document.addEventListener('DOMContentLoaded', () => {
  const shareBtn = document.getElementById('shareCtaBtn');
  if (!shareBtn) return;
  shareBtn.addEventListener('click', async () => {
    const user     = await VaultAuth.getUser();
    const username = (user && user.username) ? user.username : 'guest';
    sessionStorage.setItem('vaultiac_username', username);
    // Navigation continues via the existing inline handler
  }, true); // capture: runs before the inline handler's navigate call
});

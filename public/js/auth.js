/**
 * auth.js — v3 login / register logic.
 * Pages use .pin-row / .pin-input boxes instead of the old pin1..pin4 ids.
 * Depends on i18n.js, i18n-v3.js, common.js (App).
 */

// ------------------------------------------------------------------ PIN boxes
function setupPinRow(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const boxes = Array.from(row.querySelectorAll('.pin-input'));

  boxes.forEach((box, i) => {
    box.setAttribute('maxlength', String(boxes.length));

    box.addEventListener('input', () => {
      const digits = box.value.replace(/\D/g, '');
      if (digits.length > 1) {
        // Paste / autofill of a full PIN: spread across the remaining boxes.
        const chars = digits.slice(0, boxes.length - i).split('');
        chars.forEach((ch, k) => { boxes[i + k].value = ch; });
        boxes[Math.min(i + chars.length, boxes.length - 1)].focus();
      } else {
        box.value = digits;
        if (digits && i < boxes.length - 1) boxes[i + 1].focus();
      }
      if (getPin(rowId).length === boxes.length && rowId === 'pin-row') {
        // Subtle affordance: all digits filled.
        boxes.forEach(b => b.classList.add('filled'));
      } else {
        boxes.forEach(b => b.classList.toggle('filled', !!b.value));
      }
    });

    box.addEventListener('keydown', ev => {
      if (ev.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].value = '';
        boxes[i - 1].focus();
        ev.preventDefault();
      } else if (ev.key === 'ArrowLeft' && i > 0) {
        boxes[i - 1].focus();
        ev.preventDefault();
      } else if (ev.key === 'ArrowRight' && i < boxes.length - 1) {
        boxes[i + 1].focus();
        ev.preventDefault();
      } else if (ev.key === 'Enter') {
        const form = box.closest('form');
        if (form) { ev.preventDefault(); form.requestSubmit(); }
      }
    });

    box.addEventListener('focus', () => box.select());
  });
}

function getPin(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return '';
  return Array.from(row.querySelectorAll('.pin-input')).map(b => b.value).join('');
}

function clearPin(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const boxes = Array.from(row.querySelectorAll('.pin-input'));
  boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
  if (boxes[0]) boxes[0].focus();
}

// ------------------------------------------------------------------ Google OAuth
function handleGoogleAuth() {
  window.location.href = '/api/auth/google';
}

function checkGoogleCallback() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('google_auth');
  if (state === 'success') {
    const name = decodeURIComponent(params.get('name') || '');
    const role = params.get('role') || 'student';
    App.toast(I18N.t('loginWelcome', { name }), 'success');
    // Clean the query string so a refresh doesn't re-show the toast.
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => { window.location.href = role === 'teacher' ? '/admin.html' : '/'; }, 900);
  } else if (state === 'error') {
    App.toast(decodeURIComponent(params.get('message') || 'Google authentication failed'), 'error');
    history.replaceState(null, '', window.location.pathname);
  }
}

async function checkOAuthAvailability() {
  try {
    const { data } = await App.get('/api/auth/config');
    const section = document.getElementById('google-auth-section');
    if (section && data && data.googleOAuthEnabled) section.classList.remove('hidden');
  } catch (_) { /* keep hidden when OAuth is not configured */ }
}

// ------------------------------------------------------------------ Forms
function setBusy(btnId, busy, fallbackKey) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? (I18N.t('v3_pleaseWait') || 'Please wait…') : I18N.t(fallbackKey);
}

async function handleLogin(ev) {
  ev.preventDefault();
  const username = (document.getElementById('username') || {}).value?.trim() || '';
  const password = getPin('pin-row');

  if (!username) { App.toast(I18N.t('loginFillAll'), 'error'); return; }
  if (!/^\d{4}$/.test(password)) { App.toast(I18N.t('loginPINRequired'), 'error'); return; }

  setBusy('login-btn', true, 'loginButton');
  try {
    const { res, data } = await App.post('/api/auth/login', { username, password });
    if (res.ok && data && data.success) {
      App.user = data.user;
      App.toast(I18N.t('loginWelcome', { name: data.user.displayName }), 'success');
      setTimeout(() => { window.location.href = data.user.role === 'teacher' ? '/admin.html' : '/'; }, 800);
    } else {
      App.toast((data && data.error) || I18N.t('loginFailed'), 'error');
      setBusy('login-btn', false, 'loginButton');
      clearPin('pin-row');
    }
  } catch (_) {
    App.toast(I18N.t('errorNetwork'), 'error');
    setBusy('login-btn', false, 'loginButton');
  }
}

async function handleRegister(ev) {
  ev.preventDefault();
  const val = id => (document.getElementById(id) || {}).value?.trim() || '';
  const username = val('username');
  const displayName = val('displayName');
  const phone = val('phone');
  const teacherCode = val('teacherCode');
  const password = getPin('pin-row');
  const confirmPassword = getPin('cpin-row');

  if (!username || !displayName) { App.toast(I18N.t('registerFillRequired'), 'error'); return; }
  if (!/^\d{4}$/.test(password)) { App.toast(I18N.t('registerPINRequired'), 'error'); return; }
  if (password !== confirmPassword) {
    App.toast(I18N.t('registerPasswordMismatch'), 'error');
    clearPin('cpin-row');
    return;
  }

  setBusy('register-btn', true, 'registerButton');
  try {
    const { res, data } = await App.post('/api/auth/register', {
      username, password, displayName, phone, teacherCode
    });
    if (res.ok && data && data.success) {
      App.user = data.user;
      App.toast(I18N.t('registerSuccess'), 'success');
      setTimeout(() => {
        window.location.href = data.user.role === 'teacher' ? '/admin.html' : '/';
      }, 1000);
    } else {
      App.toast((data && data.error) || I18N.t('registerFailed'), 'error');
      setBusy('register-btn', false, 'registerButton');
    }
  } catch (_) {
    App.toast(I18N.t('errorNetwork'), 'error');
    setBusy('register-btn', false, 'registerButton');
  }
}

// ------------------------------------------------------------------ Boot
document.addEventListener('DOMContentLoaded', () => {
  App.boot({
    onReady: () => {
      setupPinRow('pin-row');
      setupPinRow('cpin-row');
      checkGoogleCallback();
      checkOAuthAvailability();
      // Already logged in? Still allow the page to act as a switch-account entry,
      // but prefill the username for convenience.
      const u = document.getElementById('username');
      if (u && App.user && !u.value) {
        // no prefill of PIN for security; just focus the first field
        u.focus();
      }
    }
  });
});

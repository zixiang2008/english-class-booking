// ============================
// Auth.js - Login & Register Logic (i18n-enabled)
// Supports: 4-digit PIN & Google OAuth
// ============================

// Toast helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================
// PIN Input Helpers
// ==========================
function handlePinInput(current, nextId) {
    // Only allow digits
    current.value = current.value.replace(/[^0-9]/g, '');
    if (current.value.length === 1 && nextId) {
        document.getElementById(nextId).focus();
    }
}

function handlePinKeydown(event, current, prevId) {
    if (event.key === 'Backspace' && current.value === '' && prevId) {
        document.getElementById(prevId).focus();
    }
}

function getPinValue(prefix) {
    // prefix is 'pin' or 'cpin'
    const p1 = document.getElementById(prefix + '1');
    const p2 = document.getElementById(prefix + '2');
    const p3 = document.getElementById(prefix + '3');
    const p4 = document.getElementById(prefix + '4');
    if (!p1 || !p2 || !p3 || !p4) return '';
    return p1.value + p2.value + p3.value + p4.value;
}

function clearPinInputs(prefix) {
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(prefix + i);
        if (el) el.value = '';
    }
}

// ==========================
// Google OAuth
// ==========================
function handleGoogleAuth() {
    // Redirect to server-side Google OAuth endpoint
    window.location.href = '/api/auth/google';
}

// Check for Google auth callback on page load
function checkGoogleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const googleAuth = urlParams.get('google_auth');

    if (googleAuth === 'success') {
        const name = urlParams.get('name') || '';
        const role = urlParams.get('role') || 'student';
        showToast(I18N.t('loginWelcome', { name: decodeURIComponent(name) }), 'success');
        setTimeout(() => {
            if (role === 'teacher') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/';
            }
        }, 1000);
    } else if (googleAuth === 'error') {
        const msg = urlParams.get('message') || 'Google authentication failed';
        showToast(decodeURIComponent(msg), 'error');
    }
}

// ==========================
// i18n initialization for auth pages
// ==========================
function applyI18nToPage() {
    const isLoginPage = !!document.getElementById('login-form');
    const isRegisterPage = !!document.getElementById('register-form');

    if (isLoginPage) {
        document.title = I18N.t('pageTitleLogin');
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', I18N.t('metaDescLogin'));
    } else if (isRegisterPage) {
        document.title = I18N.t('pageTitleRegister');
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', I18N.t('metaDescRegister'));
    }

    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = I18N.t(el.getAttribute('data-i18n'));
    });

    // Update all data-i18n-placeholder elements
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = I18N.t(el.getAttribute('data-i18n-placeholder'));
    });

    // Insert language switcher
    const navLang = document.getElementById('nav-lang');
    if (navLang && !navLang.querySelector('.lang-switcher')) {
        navLang.appendChild(I18N.createLanguageSwitcher());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyI18nToPage();
    checkGoogleCallback();
    checkGoogleOAuthAvailability();
});

// Check if Google OAuth is available and hide buttons if not
async function checkGoogleOAuthAvailability() {
    try {
        const res = await fetch('/api/auth/config');
        const config = await res.json();
        if (!config.googleOAuthEnabled) {
            hideGoogleAuthUI();
        }
    } catch (e) {
        hideGoogleAuthUI();
    }
}

function hideGoogleAuthUI() {
    // Hide the entire Google auth section (button + divider)
    document.querySelectorAll('.google-auth-section').forEach(el => {
        el.style.display = 'none';
    });
    // Also hide standalone Google buttons and dividers if any
    document.querySelectorAll('.btn-google, .google-btn, .google-login-btn').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.divider, .auth-divider').forEach(el => {
        el.style.display = 'none';
    });
}

I18N.onChange(() => {
    applyI18nToPage();
    // Update switcher button text
    const btn = document.getElementById('lang-switcher-btn');
    if (btn) {
        const lang = I18N.languages[I18N.getLang()];
        btn.innerHTML = `<span class="lang-flag">${lang.flag}</span><span class="lang-name">${lang.nativeName}</span><span class="lang-arrow">▾</span>`;
    }
});

// Handle Login
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = getPinValue('pin');
    const btn = document.getElementById('login-btn');

    if (!username) {
        showToast(I18N.t('loginFillAll'), 'error');
        return;
    }

    if (password.length !== 4) {
        showToast(I18N.t('loginPINRequired'), 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = I18N.t('loginLoading');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            showToast(I18N.t('loginWelcome', { name: data.user.displayName }), 'success');
            setTimeout(() => {
                if (data.user.role === 'teacher') {
                    window.location.href = '/admin.html';
                } else {
                    window.location.href = '/';
                }
            }, 1000);
        } else {
            showToast(data.error || I18N.t('loginFailed'), 'error');
            btn.disabled = false;
            btn.textContent = I18N.t('loginButton');
            clearPinInputs('pin');
        }
    } catch (err) {
        showToast(I18N.t('errorNetwork'), 'error');
        btn.disabled = false;
        btn.textContent = I18N.t('loginButton');
        clearPinInputs('pin');
    }
}

// Handle Register
async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const displayName = document.getElementById('displayName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = getPinValue('pin');
    const confirmPassword = getPinValue('cpin');
    const btn = document.getElementById('register-btn');

    if (!username || !displayName) {
        showToast(I18N.t('registerFillRequired'), 'error');
        return;
    }

    if (password.length !== 4) {
        showToast(I18N.t('registerPINRequired'), 'error');
        return;
    }

    if (!/^\d{4}$/.test(password)) {
        showToast(I18N.t('registerPINDigitsOnly'), 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast(I18N.t('registerPasswordMismatch'), 'error');
        clearPinInputs('cpin');
        return;
    }

    btn.disabled = true;
    btn.textContent = I18N.t('registerLoading');

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName, phone })
        });

        const data = await res.json();

        if (data.success) {
            showToast(I18N.t('registerSuccess'), 'success');
            setTimeout(() => window.location.href = '/', 1200);
        } else {
            showToast(data.error || I18N.t('registerFailed'), 'error');
            btn.disabled = false;
            btn.textContent = I18N.t('registerButton');
        }
    } catch (err) {
        showToast(I18N.t('errorNetwork'), 'error');
        btn.disabled = false;
        btn.textContent = I18N.t('registerButton');
    }
}

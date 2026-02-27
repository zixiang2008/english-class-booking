// ============================
// Auth.js - Login & Register Logic (i18n-enabled)
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

// i18n initialization for auth pages
function applyI18nToPage() {
    // Determine which page we are on
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
});

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
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
        showToast(I18N.t('loginFillAll'), 'error');
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
        }
    } catch (err) {
        showToast(I18N.t('errorNetwork'), 'error');
        btn.disabled = false;
        btn.textContent = I18N.t('loginButton');
    }
}

// Handle Register
async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const displayName = document.getElementById('displayName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('register-btn');

    if (!username || !displayName || !password) {
        showToast(I18N.t('registerFillRequired'), 'error');
        return;
    }

    if (password.length < 4) {
        showToast(I18N.t('registerPasswordMinLength'), 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast(I18N.t('registerPasswordMismatch'), 'error');
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

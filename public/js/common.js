/**
 * common.js — shared UI primitives for v3.
 * Loaded after i18n.js + i18n-v3.js on every page.
 */
const App = {
  user: null,
  _langCallback: null,
  _modal: null,

  t: (key, params) => I18N.t(key, params),

  /** Avatar initial: last word of the name (Teacher Yosowa → Y). */
  initial(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const word = parts.length ? parts[parts.length - 1] : 'T';
    return word.charAt(0).toUpperCase();
  },

  esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  async request(path, options = {}) {
    const headers = { 'X-Language': I18N.getLang(), ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin'
    });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
    return { res, data };
  },
  get: p => App.request(p),
  post: (p, body) => App.request(p, { method: 'POST', body: body || {} }),
  put: (p, body) => App.request(p, { method: 'PUT', body: body || {} }),
  del: p => App.request(p, { method: 'DELETE', body: {} }),

  toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
    }, 3200);
  },

  // ---------------------------------------------------------------- modal
  _ensureModal() {
    if (this._modal) return this._modal;
    const root = document.createElement('div');
    root.id = 'app-modal-root';
    root.className = 'modal-root hidden';
    root.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="modal-head">
          <h3 id="app-modal-title"></h3>
          <button class="icon-btn" type="button" data-close="1" aria-label="Close">✕</button>
        </div>
        <div class="modal-body" id="app-modal-body"></div>
        <div class="modal-foot" id="app-modal-foot"></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) App.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !root.classList.contains('hidden')) App.closeModal();
    });
    this._modal = root;
    return root;
  },

  /**
   * showModal({ title, html, wide, buttons: [{label, style, onClick, close}] })
   */
  showModal({ title = '', html = '', wide = false, buttons = [] }) {
    const root = this._ensureModal();
    root.querySelector('#app-modal-title').textContent = title;
    root.querySelector('#app-modal-body').innerHTML = html;
    root.querySelector('.modal-card').classList.toggle('wide', !!wide);
    const foot = root.querySelector('#app-modal-foot');
    foot.innerHTML = '';
    (buttons.length ? buttons : [{ label: I18N.t('v3_detailClose') || 'Close', style: 'ghost', close: true }])
      .forEach(btn => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn btn-${btn.style || 'ghost'}`;
        b.textContent = btn.label;
        b.onclick = () => {
          if (btn.close !== false) App.closeModal();
          if (btn.onClick) btn.onClick(root);
        };
        foot.appendChild(b);
      });
    root.classList.remove('hidden');
    document.body.classList.add('modal-open');
    return root;
  },

  closeModal() {
    const root = document.getElementById('app-modal-root');
    if (!root) return;
    root.classList.add('hidden');
    document.body.classList.remove('modal-open');
  },

  confirm({ title, html, confirmText, danger = false }) {
    return new Promise(resolve => {
      App.showModal({
        title,
        html: `<p class="modal-text">${html}</p>`,
        buttons: [
          { label: I18N.t('v3_cancel') || 'Cancel', style: 'ghost', close: true, onClick: () => resolve(false) },
          {
            label: confirmText || I18N.t('v3_confirm') || 'Confirm',
            style: danger ? 'danger' : 'primary',
            close: true,
            onClick: () => resolve(true)
          }
        ]
      });
      App._modal.addEventListener('click', function onBackdrop(e) {
        if (e.target.classList.contains('modal-backdrop')) resolve(false);
      }, { once: true });
    });
  },

  // ---------------------------------------------------------------- nav / i18n
  renderNav() {
    const right = document.getElementById('nav-right');
    if (!right) return;
    if (App.user) {
      right.innerHTML = `
        <span class="user-chip" title="${App.esc(App.user.displayName)}">${App.esc(I18N.t('navGreeting', { name: App.user.displayName }))}</span>
        <button class="btn btn-ghost btn-sm" type="button" onclick="App.logout()">${App.esc(I18N.t('navLogout'))}</button>`;
    } else {
      // Don't advertise the page the visitor is already on.
      const here = window.location.pathname;
      const onLogin = here.endsWith('/login.html');
      const onRegister = here.endsWith('/register.html');
      right.innerHTML = `
        ${onLogin ? '' : `<a class="btn btn-ghost btn-sm" href="/login.html">${App.esc(I18N.t('navLogin'))}</a>`}
        ${onRegister ? '' : `<a class="btn btn-primary btn-sm" href="/register.html">${App.esc(I18N.t('navRegister'))}</a>`}`;
    }
    const adminLink = document.getElementById('nav-admin-link');
    if (adminLink) adminLink.classList.toggle('hidden', !(App.user && App.user.role === 'teacher'));
  },

  async refreshAuth() {
    try {
      const { data } = await App.get('/api/auth/me');
      App.user = data && data.loggedIn ? data.user : null;
    } catch (_) { App.user = null; }
    App.renderNav();
    return App.user;
  },

  applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = I18N.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = I18N.t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = I18N.t(el.getAttribute('data-i18n-title'));
    });
    document.documentElement.lang = I18N.getLocale();
  },

  mountLanguageSwitcher() {
    const holder = document.getElementById('nav-lang');
    if (!holder) return;
    if (!holder.querySelector('.lang-switcher')) holder.appendChild(I18N.createLanguageSwitcher());
    App.updateLangButton();
  },

  updateLangButton() {
    const btn = document.getElementById('lang-switcher-btn');
    if (btn) {
      const l = I18N.languages[I18N.getLang()];
      btn.innerHTML = `<span class="lang-flag">${l.flag}</span><span class="lang-name">${l.nativeName}</span><span class="lang-arrow">▾</span>`;
    }
    document.querySelectorAll('#lang-dropdown .lang-option').forEach((el, i) => {
      el.classList.toggle('active', Object.keys(I18N.languages)[i] === I18N.getLang());
    });
  },

  setActiveNav(key) {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === key);
    });
  },

  async boot({ onReady, onLangChange, requireTeacher = false } = {}) {
    App._langCallback = onLangChange || null;
    App.applyStaticI18n();
    App.mountLanguageSwitcher();
    await App.refreshAuth();
    if (requireTeacher && !(App.user && App.user.role === 'teacher')) {
      App.toast(I18N.t('adminLoginRedirect') || 'Teacher login required', 'error');
      setTimeout(() => { window.location.href = '/login.html'; }, 1200);
      return;
    }
    I18N.onChange(() => {
      App.applyStaticI18n();
      App.updateLangButton();
      App.renderNav();
      if (App._langCallback) App._langCallback();
    });
    if (onReady) await onReady();
  },

  async logout() {
    try { await App.post('/api/auth/logout'); } catch (_) { /* ignore */ }
    App.user = null;
    App.renderNav();
    App.toast(I18N.t('logoutSuccess') || 'Logged out', 'success');
    setTimeout(() => { window.location.href = '/'; }, 700);
  },

  // ---------------------------------------------------------------- formatting
  fmtInZone(iso, tz) {
    try {
      return new Intl.DateTimeFormat(I18N.getLocale(), {
        timeZone: tz, dateStyle: 'medium', timeStyle: 'short'
      }).format(new Date(iso));
    } catch (_) { return String(iso); }
  },
  fmtTimeInZone(iso, tz) {
    try {
      return new Intl.DateTimeFormat(I18N.getLocale(), {
        timeZone: tz, hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso));
    } catch (_) { return ''; }
  },
  fmtLocal(iso) {
    try {
      return new Intl.DateTimeFormat(I18N.getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch (_) { return String(iso); }
  },
  fmtFullLocal(iso) {
    try {
      return new Intl.DateTimeFormat(I18N.getLocale(), { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));
    } catch (_) { return String(iso); }
  },
  tzAbbr(iso, tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date(iso));
      return (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
    } catch (_) { return ''; }
  },
  relative(iso) {
    if (!iso) return '';
    const ts = new Date(iso).getTime();
    if (isNaN(ts)) return String(iso);
    const diff = (ts - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(I18N.getLocale(), { numeric: 'auto' });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  },
  statusText(status) {
    const map = {
      pending: 'v3_statusPending', confirmed: 'v3_statusConfirmed',
      cancelled: 'v3_statusCancelled', completed: 'v3_statusCompleted'
    };
    return I18N.t(map[status] || 'v3_statusPending');
  },
  statusIcon(status) {
    return { pending: '🟡', confirmed: '🟢', cancelled: '🔴', completed: '⚪' }[status] || '🟡';
  },
  empty(html) {
    return `<div class="empty-state"><div class="empty-illustration">🗓️</div><p>${html}</p></div>`;
  }
};

window.App = App;

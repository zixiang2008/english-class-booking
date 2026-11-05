/**
 * scripts/ui-smoke.js — real-browser UI smoke test over the Chrome DevTools
 * Protocol (no npm dependencies; requires Node 22+ and a local Chrome).
 *
 * Prerequisite: the app must already be running, e.g.
 *   PORT=3210 DB_PATH=/tmp/ecb-browser.db node server.js
 * Then: BASE=http://127.0.0.1:3210 node scripts/ui-smoke.js
 *
 * Verifies page rendering, live API data, notice board + Google address bar,
 * login / teacher studio, language switching, mobile layout (no horizontal
 * overflow, touch-sized controls) and zero uncaught JS exceptions. Screenshots
 * are written to the OS temp directory for visual review.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = path.join(os.tmpdir(), `ecb-cdp-${process.pid}`);
const shots = path.join(os.tmpdir(), 'ecb-ui-shots');
fs.mkdirSync(shots, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let jsErrors = [];
const httpErrors = [];
let probingLogins = false;
let ws = null;
let msgId = 0;
const pending = new Map();
const listeners = [];

function check(name, condition, detail = '') {
  const ok = !!condition;
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitEvent(method, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
      reject(new Error(`timeout waiting for ${method}`));
    }, timeout);
    const fn = msg => {
      if (msg.method !== method) return;
      clearTimeout(timer);
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
      resolve(msg.params);
    };
    listeners.push(fn);
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function waitFor(expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expression)) return true; } catch (_) { /* context may be swapping */ }
    await sleep(150);
  }
  throw new Error(`condition not met: ${expression}`);
}

async function goto(url) {
  const loaded = waitEvent('Page.loadEventFired');
  await send('Page.navigate', { url: BASE + url });
  await loaded;
  await sleep(900); // let the boot() fetches settle
}

async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(shots, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}

async function setViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile
  });
  await sleep(350);
}

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME=/path/to/chrome.`);

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });

  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 60 && !fs.existsSync(portFile); i++) await sleep(200);
  if (!fs.existsSync(portFile)) throw new Error('Chrome DevTools port did not come up');
  const cdpPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const origin = `http://127.0.0.1:${cdpPort}`;

  const target = await (await fetch(`${origin}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.exceptionThrown') {
        jsErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' &&
          !/favicon|net::ERR|Failed to load resource/i.test(msg.params.entry.text || '')) {
        jsErrors.push(msg.params.entry.text);
      }
      if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
        const { status, url } = msg.params.response;
        // Probing several demo accounts means the wrong guesses answer 401 by
        // design — those are not page failures.
        const authProbe = probingLogins && status === 401 && /\/api\/auth\/login$/.test(url);
        if (!authProbe && !/favicon\.ico$/.test(url)) httpErrors.push(`${status} ${url}`);
      }
      listeners.slice().forEach(fn => fn(msg));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  console.log(`\n🎨 UI smoke test — ${BASE}\n`);

  // ---------------------------------------------------------------- desktop
  await setViewport(1440, 900, false);
  await goto('/');
  await waitFor("document.querySelectorAll('.course-card').length > 0");
  const board = await evaluate(`(() => ({
    cards: document.querySelectorAll('.course-card').length,
    notices: document.querySelectorAll('.notice-box').length,
    googleBars: document.querySelectorAll('.google-bar').length,
    mapLinks: [...document.querySelectorAll('.google-bar a')].filter(a => a.href.includes('google')).length,
    tzPills: document.querySelectorAll('.tz-pill').length,
    bookButtons: document.querySelectorAll('[onclick*="bookCourse"], [onclick*="openCourseDetail"]').length,
    teachers: [...new Set([...document.querySelectorAll('.teacher-chip')].map(e => e.textContent.trim()))].length,
    title: document.title,
    lang: document.documentElement.lang,
    footer: {
      text: ((document.getElementById('footer-contact') || {}).textContent || '').replace(/\\s+/g, ' ').trim(),
      email: ((document.getElementById('footer-email-link') || {}).textContent || '').trim(),
      hasPhone: !!document.getElementById('footer-phone-link'),
      hasLine: !!document.getElementById('footer-line-link')
    }
  }))()`);
  check('student board renders published classes', board.cards >= 4, JSON.stringify(board));
  check('every class shows a notice board', board.notices >= board.cards);
  check('every class shows the Google address bar', board.googleBars >= board.cards);
  check('Google Maps / Calendar links are present', board.mapLinks >= board.cards);
  check('timezone pills show real GMT offsets', board.tzPills >= board.cards);
  check('multiple teachers appear on the same page', board.teachers >= 2);
  check('page title and html lang are set', !!board.title && !!board.lang);
  check('footer shows the configured email and LINE link',
    !!board.footer.email.includes('@') && board.footer.hasLine, JSON.stringify(board.footer));
  check('footer hides an empty phone and never shows the legacy number',
    !board.footer.hasPhone && !board.footer.text.includes('0637592741'), JSON.stringify(board.footer));
  const desktopShot = await screenshot('01-board-desktop');

  // v3.2.2 — the weekly grid mirrors published classes instead of a fixed rota
  const week = await evaluate(`(() => {
    if (!document.querySelector('#week-table-wrap .wk-course')) {
      try { jumpToLatestWeek(); } catch (_) { /* no classes at all */ }
    }
    const cells = [...document.querySelectorAll('#week-table-wrap .wk-td')];
    const empty = cells.filter(td => td.classList.contains('wk-td-empty'));
    const chips = [...document.querySelectorAll('#week-table-wrap .wk-course')];
    return {
      cells: cells.length,
      empty: empty.length,
      chips: chips.length,
      days: document.querySelectorAll('#week-table-wrap thead th').length,
      emptyLabel: empty.length ? empty[0].textContent.trim() : '',
      emptyHasCourse: empty.filter(td => td.querySelector('.wk-course')).length,
      onlineChips: chips.filter(c => c.querySelector('.wk-mode-ico')).length,
      listCards: document.querySelectorAll('#week-list .wk-day').length
    };
  })()`);
  check('weekly grid renders published classes as chips', week.chips >= 1, JSON.stringify(week));
  check('weekly grid has 7 day columns', week.days >= 7, `th=${week.days}`);
  check('empty weekly cells are labelled as not bookable',
    week.empty === 0 || (week.emptyLabel.length > 0 && week.emptyHasCourse === 0),
    `empty=${week.empty} label="${week.emptyLabel}" leaked=${week.emptyHasCourse}`);
  check('mobile weekly list mirrors the grid', week.listCards === 7, `day cards=${week.listCards}`);

  // language switching
  await evaluate("I18N.setLang('ja')");
  await sleep(400);
  const jaText = await evaluate("document.querySelector('.google-bar-head span').textContent");
  check('language switch updates course UI (ja)', /Google|住所/.test(jaText), jaText);
  await evaluate("I18N.setLang('en')");
  await sleep(300);

  // ---------------------------------------------------------------- login
  await goto('/login.html');
  const login = await evaluate(`(() => ({
    pins: document.querySelectorAll('#pin-row .pin-input').length,
    legal: {
      present: !!document.querySelector('#legal-notice'),
      title: ((document.querySelector('.legal-title')||{}).textContent || '').trim(),
      items: document.querySelectorAll('.legal-list li').length,
      hasFoot: !!document.querySelector('.legal-foot'),
      demoGone: !document.querySelector('.demo-hint')
    },
    googleHidden: document.getElementById('google-auth-section').classList.contains('hidden'),
    langSwitcher: !!document.querySelector('#nav-lang .lang-switcher'),
    registerCta: !!document.querySelector('#nav-right a[href="/register.html"]')
  }))()`);
  check('login page has 4 PIN boxes', login.pins === 4, JSON.stringify(login));
  // Demo credentials were removed on purpose; the space now carries the disclaimer.
  check('login page shows the platform disclaimer instead of demo accounts',
    login.legal.present && login.legal.items === 4 && login.legal.hasFoot && login.legal.demoGone && login.legal.title.length > 0,
    JSON.stringify(login.legal));
  check('Google OAuth UI hidden when unconfigured', login.googleHidden);
  check('nav renders language switcher + register CTA', login.langSwitcher && login.registerCta);

  // log in through the page context so the session cookie sticks
  // The demo dataset changes between environments (minimal seed vs. history
  // seed vs. production), so try the known teacher accounts until one signs in
  // as a teacher instead of hard-coding a single PIN.
  probingLogins = true;
  const loggedIn = await evaluate(`(async () => {
    const candidates = [['teacher','1111'], ['test_teacher1','1314'], ['hamish','1234'], ['kevin','1234']];
    let fallback = '';
    for (const [username, password] of candidates) {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username, password }) });
      const d = await r.json().catch(() => ({}));
      if (d.success !== true || !d.user || d.user.role !== 'teacher') continue;
      // Prefer a teacher who actually published something, otherwise the
      // "sees own published classes" assertion below is meaningless.
      const own = await fetch('/api/courses?teacher=me').then(x => x.json()).catch(() => ({ courses: [] }));
      const n = (own.courses || []).length;
      if (n > 0) return username;
      if (!fallback) fallback = username;
    }
    return fallback;
  })()`);
  probingLogins = false;
  check('teacher login succeeds with a demo account', !!loggedIn, loggedIn ? `as ${loggedIn}` : 'no candidate teacher account could sign in');

  // ---------------------------------------------------------------- teacher studio
  await goto('/admin.html');
  await waitFor("document.querySelectorAll('.admin-tab').length >= 6 && document.querySelector('#overview-stats') && document.querySelector('#overview-stats').children.length > 0");
  const admin = await evaluate(`(() => ({
    tabs: document.querySelectorAll('.admin-tab').length,
    stats: document.querySelector('#overview-stats').children.length,
    myCourses: document.querySelectorAll('#my-course-list .list-row').length,
    redirected: location.pathname.includes('login')
  }))()`);
  check('teacher studio shows 6 tabs (incl. site settings)', admin.tabs === 6, JSON.stringify(admin));
  check('overview stat cards are populated', admin.stats >= 4);
  check('teacher sees own published classes', admin.myCourses >= 1);
  check('teacher session is not redirected to login', !admin.redirected);
  const adminShot = await screenshot('02-admin-desktop');

  // open the publish form and check mandatory fields + 100-char counter
  await evaluate("switchTab('publish')");
  await sleep(250);
  await evaluate("openCourseEditor()");
  await sleep(350);
  const form = await evaluate(`(() => ({
    modalOpen: !document.getElementById('app-modal-root').classList.contains('hidden'),
    required: document.querySelectorAll('#app-modal-body .req').length,
    notice: !!document.getElementById('cf-notice'),
    timezone: !!document.getElementById('cf-timezone'),
    date: !!document.getElementById('cf-lesson_date'),
    start: !!document.getElementById('cf-start_time'),
    end: !!document.getElementById('cf-end_time'),
    place: !!document.getElementById('cf-place_name'),
    google: !!document.getElementById('cf-google_maps_url'),
    counter: (document.querySelector('.counter')||{}).textContent || ''
  }))()`);
  check('publish modal opens', form.modalOpen, JSON.stringify(form));
  check('notice board field with counter exists', form.notice && /\/\s*100/.test(form.counter), form.counter);
  check('Google address bar fields are all present', form.timezone && form.date && form.start && form.end && form.place && form.google);
  check('Google address bar fields are marked required', form.required >= 6, `required badges: ${form.required}`);

  // v3.3 — offline / online class format switch inside the location section
  const modeForm = await evaluate(`(() => {
    const sw = document.getElementById('cf-mode-switch');
    const isHidden = id => { const el = document.getElementById(id); return !el || el.classList.contains('hidden'); };
    const read = () => ({
      mode: (document.getElementById('cf-mode') || {}).value || '',
      offlinePlace: !isHidden('field-offline-place'),
      offlineMap: !isHidden('field-offline-map'),
      onlinePlatform: !isHidden('field-online-platform'),
      onlineUrl: !isHidden('field-online-url'),
      onlineNote: !isHidden('field-online-note')
    });
    const buttons = sw ? [...sw.querySelectorAll('.mode-btn')] : [];
    const before = read();
    const clickMode = m => { const b = buttons.find(x => x.dataset.mode === m); if (b) b.click(); return read(); };
    const afterOnline = clickMode('online');
    const afterOffline = clickMode('offline');
    return {
      hasSwitch: !!sw,
      buttons: buttons.length,
      labels: buttons.map(b => b.textContent.trim()),
      platforms: document.querySelectorAll('#cf-online_platform option').length,
      before, afterOnline, afterOffline
    };
  })()`);
  check('location section offers an offline/online format switch',
    modeForm.hasSwitch && modeForm.buttons === 2, JSON.stringify(modeForm.labels));
  check('a new class defaults to offline with the map fields visible',
    modeForm.before.mode === 'offline' && modeForm.before.offlinePlace && modeForm.before.offlineMap &&
    !modeForm.before.onlinePlatform && !modeForm.before.onlineUrl && !modeForm.before.onlineNote,
    JSON.stringify(modeForm.before));
  check('choosing online swaps the map fields for the meeting fields',
    modeForm.afterOnline.mode === 'online' && !modeForm.afterOnline.offlinePlace && !modeForm.afterOnline.offlineMap &&
    modeForm.afterOnline.onlinePlatform && modeForm.afterOnline.onlineUrl && modeForm.afterOnline.onlineNote,
    JSON.stringify(modeForm.afterOnline));
  check('switching back to offline restores the map fields',
    modeForm.afterOffline.mode === 'offline' && modeForm.afterOffline.offlinePlace && modeForm.afterOffline.offlineMap &&
    !modeForm.afterOffline.onlinePlatform, JSON.stringify(modeForm.afterOffline));
  check('all 8 online platforms are selectable', modeForm.platforms === 8, `options=${modeForm.platforms}`);
  await evaluate("App.closeModal()");

  // the platform list must come from the server, not a hard-coded copy
  const cfg = await evaluate(`fetch('/api/courses/config').then(r => r.json())`);
  check('config endpoint publishes the online platform catalogue',
    Array.isArray(cfg.onlinePlatforms) && cfg.onlinePlatforms.length === 8 &&
    cfg.onlinePlatforms.every(p => p.key && p.label),
    JSON.stringify((cfg.onlinePlatforms || []).map(p => p.key)));

  // site settings (merged from v2.1)
  await evaluate("switchTab('settings')");
  await sleep(450);
  const siteSettings = await evaluate(`(() => ({
    visible: !document.getElementById('panel-settings').classList.contains('hidden'),
    title: (document.getElementById('setting-title') || {}).value || '',
    phone: (document.getElementById('setting-phone') || {}).value || '',
    email: (document.getElementById('setting-email') || {}).value || '',
    line: (document.getElementById('setting-line') || {}).value || ''
  }))()`);
  check('site settings tab loads saved contact details',
    siteSettings.visible && !!siteSettings.title && !!siteSettings.email &&
    typeof siteSettings.phone === 'string',
    JSON.stringify(siteSettings));

  // ---------------------------------------------------------------- calendar page
  await goto('/calendar.html');
  await waitFor("document.getElementById('upcoming') && !document.querySelector('#upcoming .spinner')");
  const cal = await evaluate(`(() => ({
    ics: document.getElementById('ics-url').value,
    json: document.getElementById('web-url').value,
    rows: document.querySelectorAll('#upcoming .list-row').length,
    tz: document.querySelectorAll('#upcoming .tz-pill').length,
    emptyShown: !!document.querySelector('#upcoming .empty-state')
  }))()`);
  check('calendar page builds ICS + JSON URLs', cal.ics.endsWith('/api/calendar/schedule.ics') && cal.json.endsWith('/api/calendar/schedule'));
  // A history-only dataset legitimately has nothing upcoming — then the page
  // must say so instead of rendering rows.
  check('upcoming classes show real timezones',
    (cal.rows >= 1 && cal.tz >= 1) || (cal.rows === 0 && cal.emptyShown), JSON.stringify(cal));

  // ---------------------------------------------------------------- mobile
  await setViewport(390, 844, true);
  for (const [url, label] of [['/', 'board'], ['/admin.html', 'admin'], ['/login.html', 'login'], ['/calendar.html', 'calendar']]) {
    await goto(url);
    if (label === 'board') await waitFor("document.querySelectorAll('.course-card').length > 0");
    if (label === 'admin') {
      await waitFor("document.querySelector('#overview-stats') && document.querySelector('#overview-stats').children.length > 0");
    }
    await sleep(250);
    const m = await evaluate(`(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      smallButtons: [...document.querySelectorAll('button, .btn')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 32;
      }).length,
      cards: document.querySelectorAll('.course-card').length
    }))()`);
    check(`mobile ${label}: no horizontal overflow`, m.scrollWidth <= m.width + 1 && m.bodyScroll <= m.width + 1,
      `viewport=${m.width} scroll=${m.scrollWidth}/${m.bodyScroll}`);
    check(`mobile ${label}: controls are touch-sized`, m.smallButtons === 0, `${m.smallButtons} tiny controls`);
    if (label === 'board') {
      const cols = await evaluate("getComputedStyle(document.querySelector('.course-grid')).gridTemplateColumns.split(' ').length");
      check('mobile board uses a single-column card list', cols === 1, `columns=${cols}`);
    }
    await screenshot(`03-mobile-${label}`);
    if (label === 'board') {
      // Zoom into a card so the notice board and Google address bar are visible.
      await evaluate("document.querySelector('.course-card .notice-box').scrollIntoView({ block: 'center' })");
      await sleep(350);
      await screenshot('04-mobile-card-detail');
    }
  }

  check('no uncaught JavaScript exceptions', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  check('no failed HTTP responses', httpErrors.length === 0, [...new Set(httpErrors)].slice(0, 5).join(' | '));

  const failed = results.filter(r => !r.ok);
  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`  ${results.length - failed.length} passed · ${failed.length} failed`);
  console.log(`  screenshots: ${shots}`);
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`DESKTOP_SHOT=${desktopShot}`);
  console.log(`ADMIN_SHOT=${adminShot}`);

  try { ws.close(); } catch (_) { /* ignore */ }
  chrome.kill('SIGKILL');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 UI smoke crashed:', err);
  process.exit(1);
});

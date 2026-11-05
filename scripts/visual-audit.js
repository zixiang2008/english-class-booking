/**
 * scripts/visual-audit.js — 多老师 / 极端内容 / 多视口的视觉审计
 *
 * 前置：应用已在 BASE 上运行（建议用隔离数据库）。
 *   PORT=3212 DB_PATH=/tmp/ecb-visual.db node server.js
 *   BASE=http://127.0.0.1:3212 node scripts/visual-audit.js
 *
 * 它会：
 *  1. 通过 API 构造极端数据（超长标题 / 100 字通知 / 超长地名 / 5 位老师 / 同时段 / 取消 / 待定 / 已结束）
 *  2. 在 1440 / 1024 / 820 / 390 / 360 五个视口下检查横向溢出、网格列数、触控尺寸
 *  3. 截图保存到系统临时目录的 ecb-visual/ 供人工复核
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:3212';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = path.join(os.tmpdir(), `ecb-visual-${process.pid}`);
const shots = path.join(os.tmpdir(), 'ecb-visual');
fs.mkdirSync(shots, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let ws = null;
let msgId = 0;
const pending = new Map();
const listeners = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitEvent(method, timeout = 20000) {
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expression)) return true; } catch (_) { /* swapping */ }
    await sleep(150);
  }
  throw new Error(`condition not met: ${expression}`);
}

async function goto(url) {
  const loaded = waitEvent('Page.loadEventFired');
  await send('Page.navigate', { url: BASE + url });
  await loaded;
  await sleep(1000);
}

async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(r.data, 'base64'));
}

async function setViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  await sleep(400);
}

// ---------------------------------------------------------------- API seeding
async function api(method, url, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* raw */ }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

async function login(username, password) {
  const r = await api('POST', '/api/auth/login', { username, password });
  const m = (r.setCookie || '').match(/connect\.sid=[^;]+/);
  if (!m) throw new Error(`login failed for ${username}: ${JSON.stringify(r.data)}`);
  return m[0];
}

const MAP = 'https://maps.app.goo.gl/VisualAudit123';
const longTitle = 'Intensive Business English Workshop: Negotiation, Presentations & Cross-cultural Communication';
const longNotice = '本周课程改到三楼大教室，请提前十分钟到场并带上上周的写作作业；如果迟到超过十五分钟，请提前在群里告知老师。';
const longPlace = 'Sukhumvit Road, Soi 24, K Village Community Mall, 3rd Floor, Room 305, Bangkok 10110';

async function seed() {
  console.log('\n── 构造极端数据 ────────────────────────────────────────────');
  const c1 = await login('teacher', '1111');
  const c2 = await login('teacher2', '2345');

  // 第三位老师：超长姓名
  const reg = await api('POST', '/api/auth/register', {
    username: 't_longname', password: '7788',
    displayName: 'Mr. Christopher Alexander Thompson', teacherCode: 'TEACHER2026'
  });
  const c3 = reg.status === 200 ? await login('t_longname', '7788') : await login('t_longname', '7788');

  const base = {
    timezone: 'Asia/Bangkok', lesson_date: '2027-08-20', start_time: '19:00', end_time: '20:30',
    place_name: longPlace, google_maps_url: MAP, capacity: 12, run_status: 'confirmed'
  };

  const created = [];
  const push = async (cookie, body) => {
    const r = await api('POST', '/api/courses', body, cookie);
    created.push({ status: r.status, id: r.data && r.data.id, error: r.data && r.data.error });
    return r;
  };

  // 1) 超长标题 + 100 字通知（同一时段，与另一位老师冲突展示）
  await push(c1, { ...base, title: longTitle.slice(0, 80), notice: longNotice, capacity: 50 });
  // 2) 同一位老师，另一时段：emoji / 泰文 / 日文混合
  await push(c1, {
    ...base, start_time: '21:00', end_time: '22:00', lesson_date: '2027-08-21',
    title: '托福口语 TOEFL Speaking 🎤 スピーキング練習', notice: '😀'.repeat(40), capacity: 4
  });
  // 3) 另一位老师，同一时段（多老师冲突）
  await push(c2, { ...base, title: 'IELTS Writing Task 2', notice: 'Bring two essays.', capacity: 8 });
  // 4) 长姓名老师
  await push(c3, { ...base, title: 'Kids Story Time', notice: 'Parents welcome.', capacity: 6, place_name: 'Little Steps Studio' });
  // 5) 已取消
  await push(c1, {
    ...base, lesson_date: '2027-08-22', start_time: '10:00', end_time: '11:00',
    title: 'Cancelled Demo Class', run_status: 'cancelled', status_note: '老师临时有事，课程取消'
  });
  // 6) 待确认 + 满员（名额 1，学生预约后满）
  const full = await push(c2, {
    ...base, lesson_date: '2027-08-23', start_time: '09:00', end_time: '10:00',
    title: 'One Seat Only', capacity: 1, run_status: 'pending'
  });
  // 7) 已结束（2020 年）
  await push(c1, {
    ...base, lesson_date: '2020-01-05', start_time: '10:00', end_time: '11:00',
    title: 'Past Class (2020)', notice: 'This class already happened.'
  });

  // 让某门课满员
  const sreg = await api('POST', '/api/auth/register', { username: 'v_student', password: '9090', displayName: 'Visual Student' });
  if (sreg.status === 200) {
    const cs = await login('v_student', '9090');
    if (full.data && full.data.id) await api('POST', `/api/courses/${full.data.id}/book`, {}, cs);
  }

  const okCount = created.filter(c => c.status === 200).length;
  console.log(`  已创建 ${okCount}/${created.length} 门课程`);
  created.filter(c => c.status !== 200).forEach(c => console.log(`   ⚠️  ${c.error}`));
  return created.filter(c => c.status === 200).map(c => c.id);
}

// ---------------------------------------------------------------- layout probes
const overflowProbe = `(() => {
  const vw = window.innerWidth;
  const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 2 || r.left < -2) {
      // 允许明确的横向滚动容器
      let p = el, scrollable = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) { scrollable = true; break; }
        p = p.parentElement;
      }
      if (!scrollable) bad.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
    }
  });
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    cards: document.querySelectorAll('.course-card').length,
    cols: getComputedStyle(document.getElementById('course-grid') || document.body).gridTemplateColumns.split(' ').length,
    overflow: bad.slice(0, 6)
  };
})()`;

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  const health = await fetch(BASE + '/healthz').then(r => r.json()).catch(() => null);
  if (!health) throw new Error(`Server not reachable at ${BASE}`);

  const seeded = await seed();

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });

  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 60 && !fs.existsSync(portFile); i++) await sleep(200);
  const cdpPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method) listeners.slice().forEach(fn => fn(msg));
  });
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('\n── 多视口布局检查 ──────────────────────────────────────────');
  const viewports = [
    { w: 1440, h: 900, name: 'desktop-1440', mobile: false },
    { w: 1024, h: 768, name: 'laptop-1024', mobile: false },
    { w: 820, h: 1180, name: 'tablet-820', mobile: true },
    { w: 390, h: 844, name: 'phone-390', mobile: true },
    { w: 360, h: 740, name: 'phone-360', mobile: true }
  ];

  for (const vp of viewports) {
    await setViewport(vp.w, vp.h, vp.mobile);
    await goto('/');
    await waitFor("document.querySelectorAll('.course-card').length >= 8");
    const probe = await evaluate(overflowProbe);
    check(`${vp.name}: 无横向溢出`, probe.scrollWidth <= probe.innerWidth + 1 && probe.overflow.length === 0,
      JSON.stringify(probe.overflow));
    if (vp.w <= 520) check(`${vp.name}: 课程卡片单列`, probe.cols === 1, `cols=${probe.cols}`);
    else check(`${vp.name}: 课程卡片多列`, probe.cols >= 2, `cols=${probe.cols}`);
    await screenshot(`board-${vp.name}`);

    // 长内容不破坏卡片：标题/通知/地名都不应溢出卡片
    const cardClash = await evaluate(`(() => {
      const bad = [];
      document.querySelectorAll('.course-card').forEach(card => {
        const cr = card.getBoundingClientRect();
        card.querySelectorAll('.card-title, .notice-text, .info-value, .teacher-chip').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > cr.right + 1 || r.left < cr.left - 1) bad.push(el.className);
        });
      });
      return bad.slice(0, 5);
    })()`);
    check(`${vp.name}: 长标题/通知/地名不撑破卡片`, cardClash.length === 0, JSON.stringify(cardClash));

    // 触控目标
    const smallTaps = await evaluate(`(() => {
      const bad = [];
      document.querySelectorAll('.btn, .nav-link, .admin-tab').forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 34) bad.push((b.className || '') + ':' + Math.round(r.height));
      });
      return bad.slice(0, 5);
    })()`);
    check(`${vp.name}: 按钮高度可点击`, smallTaps.length === 0, JSON.stringify(smallTaps));
  }

  // ---------------------------------------------------------------- detail modal
  console.log('\n── 详情弹窗（手机） ────────────────────────────────────────');
  await setViewport(390, 844, true);
  await goto('/');
  await waitFor("document.querySelectorAll('.course-card').length >= 8");
  await evaluate("document.querySelector('[data-action=\"detail\"]').click()");
  await sleep(700);
  const modal = await evaluate(`(() => {
    const m = document.querySelector('.modal-card');
    if (!m) return { open: false };
    const r = m.getBoundingClientRect();
    return { open: true, top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width),
             innerWidth: window.innerWidth, innerHeight: window.innerHeight,
             overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  })()`);
  check('手机端详情弹窗可见且不超出屏幕', modal.open && modal.width <= modal.innerWidth && !modal.overflow, JSON.stringify(modal));
  await screenshot('detail-phone-390');
  await evaluate('App.closeModal()');

  // ---------------------------------------------------------------- admin
  console.log('\n── 老师工作台（手机） ──────────────────────────────────────');
  await goto('/login.html');
  await evaluate(`(async () => {
    const boxes = [...document.querySelectorAll('#pin-row .pin-input')];
    '1111'.split('').forEach((d, i) => { boxes[i].value = d; });
    document.getElementById('username').value = 'teacher';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  })()`);
  await sleep(2500);
  await goto('/admin.html');
  await sleep(1500);
  for (const tab of ['overview', 'publish', 'bookings', 'slots']) {
    await evaluate(`switchTab('${tab}')`);
    await sleep(700);
    const probe = await evaluate(overflowProbe);
    check(`手机端教师工作台「${tab}」无横向溢出`, probe.scrollWidth <= probe.innerWidth + 1 && probe.overflow.length === 0,
      JSON.stringify(probe.overflow));
    await screenshot(`admin-phone-${tab}`);
  }

  // ---------------------------------------------------------------- summary
  const failed = results.filter(r => !r.ok);
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  视觉审计：${results.length - failed.length} 通过 · ${failed.length} 失败`);
  if (failed.length) failed.forEach(f => console.log(`   • ${f.name} — ${f.detail}`));
  console.log(`  截图目录：${shots}`);
  console.log('════════════════════════════════════════════════════════════\n');

  ws.close();
  chrome.kill();
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 visual audit crashed:', err);
  process.exit(1);
});

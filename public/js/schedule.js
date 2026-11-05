/**
 * schedule.js — student course board + legacy weekly grid (v3)
 */
let coursesData = [];
let teachersData = [];
let weekCourses = [];   // every published class, unfiltered — the timetable source
let weekRows = [];      // distinct start times across all classes, ascending
let weekOffset = 0;
let activeView = 'board';
let refreshTimer = null;

const THAI_HOLIDAYS = [
  [1, 1, '🎉', "New Year's Day"], [1, 2, '🎊', 'New Year Holiday'], [2, 17, '🧧', 'Chinese New Year'],
  [3, 3, '🕯️', 'Makha Bucha'], [4, 6, '👑', 'Chakri Day'], [4, 13, '💦', 'Songkran'],
  [4, 14, '💦', 'Songkran'], [4, 15, '💦', 'Songkran'], [5, 1, '⚒️', 'Labour Day'],
  [5, 4, '👑', 'Coronation Day'], [5, 11, '🌾', 'Royal Ploughing'], [5, 31, '🪷', 'Visakha Bucha'],
  [6, 1, '🪷', 'Visakha Substitution'], [6, 3, '👸', "Queen's Birthday"], [7, 28, '🤴', "King's Birthday"],
  [7, 29, '🕯️', 'Asanha Bucha'], [7, 30, '🙏', 'Buddhist Lent'], [8, 12, '💐', "Mother's Day"],
  [10, 13, '🖤', 'Memorial Day'], [10, 23, '👑', 'Chulalongkorn Day'], [12, 5, '💛', "Father's Day"],
  [12, 7, '💛', 'Substitution'], [12, 10, '📜', 'Constitution Day'], [12, 25, '🎄', 'Christmas'],
  [12, 31, '🎆', 'New Year Eve']
];
const holidayMap = new Map(THAI_HOLIDAYS.map(h => [`${h[0]}-${h[1]}`, h]));
const getHoliday = d => holidayMap.get(`${d.getMonth() + 1}-${d.getDate()}`);

function getWeekDates(offset) {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ---------------------------------------------------------------- view switching
function switchView(view) {
  activeView = view;
  document.getElementById('view-board').classList.toggle('hidden', view !== 'board');
  document.getElementById('view-weekly').classList.toggle('hidden', view !== 'weekly');
  document.getElementById('tab-board').classList.toggle('active', view === 'board');
  document.getElementById('tab-weekly').classList.toggle('active', view === 'weekly');
  App.setActiveNav(view);
  if (view === 'weekly') renderWeekly();
}

function resetFilters() {
  document.getElementById('f-search').value = '';
  document.getElementById('f-teacher').value = '';
  document.getElementById('f-status').value = '';
  document.getElementById('f-mine').checked = false;
  renderCourses();
}

// ---------------------------------------------------------------- data loading
async function loadTeachers() {
  const { data } = await App.get('/api/courses/teachers');
  teachersData = (data && data.teachers) || [];
  const select = document.getElementById('f-teacher');
  const current = select.value;
  select.innerHTML = `<option value="">${App.esc(I18N.t('v3_filterTeacher'))}</option>` +
    teachersData.map(t => `<option value="${t.id}">${App.esc(t.display_name)} (${t.course_count})</option>`).join('');
  select.value = current;
  document.getElementById('stat-teachers').textContent = teachersData.length;
}

async function loadCourses(silent = false) {
  const q = new URLSearchParams();
  const search = document.getElementById('f-search').value.trim();
  const teacher = document.getElementById('f-teacher').value;
  const status = document.getElementById('f-status').value;
  const mine = document.getElementById('f-mine').checked;
  if (search) q.set('q', search);
  if (teacher) q.set('teacher', teacher);
  if (status) q.set('status', status);
  if (mine) q.set('mine', '1');
  const { res, data } = await App.get('/api/courses?' + q.toString());
  if (!res.ok || !data || !data.courses) {
    if (!silent) {
      document.getElementById('course-board').classList.add('hidden');
      const box = document.getElementById('course-empty');
      box.classList.remove('hidden');
      box.innerHTML =
        App.empty(`${App.esc(I18N.t('v3_loadFailed'))} <button class="btn btn-ghost btn-sm" onclick="loadCourses()">${App.esc(I18N.t('v3_retry'))}</button>`);
    }
    return;
  }
  coursesData = data.courses;
  // Hero stats describe the whole board, so they must not shrink when the
  // visitor narrows the list with a filter — and they must always agree with
  // the "N classes" counter above the grid.
  if (!search && !teacher && !status && !mine) {
    document.getElementById('stat-courses').textContent = coursesData.length;
    document.getElementById('stat-bookings').textContent = coursesData.reduce((s, c) => s + c.booked_count, 0);
  }
  renderCourses();
}

async function loadWeekCourses() {
  const { res, data } = await App.get('/api/courses');
  if (!res.ok || !data || !data.courses) return;
  weekCourses = data.courses;
  weekRows = buildWeekRows(weekCourses);
  renderWeekly();
}

// ---------------------------------------------------------------- course cards

/**
 * One source of truth for "what can this visitor do with this class?".
 * Used by the board card, the timetable chip popover and the detail modal so
 * the three surfaces can never disagree.
 */
function courseCta(c) {
  if (!App.user) return { kind: 'login', label: I18N.t('v3_loginToBook'), style: 'primary' };
  if (App.user.role === 'teacher') return { kind: 'none', label: I18N.t('v3_teacherNoBook'), style: 'ghost', disabled: true };
  if (c.is_my_booking) return { kind: 'cancel', label: I18N.t('v3_btnCancel'), style: 'outline-danger' };
  const past = new Date(c.end_utc).getTime() < Date.now();
  const closed = ['cancelled', 'completed'].includes(c.run_status);
  if (closed || past) return { kind: 'none', label: I18N.t('v3_classClosed'), style: 'ghost', disabled: true };
  if (c.seats_left === 0) return { kind: 'none', label: I18N.t('v3_seatsFull'), style: 'ghost', disabled: true };
  return { kind: 'book', label: I18N.t('v3_btnBook'), style: 'primary' };
}

/** Localised platform name; falls back to the raw key if a language is missing. */
function platformText(key) {
  if (!key) return '';
  const k = `v3_platform_${key}`;
  const hit = I18N.t(k);
  return hit === k ? key : hit;
}

/** "Where is this class?" — a map pin for in-person, a meeting link for online. */
function placeText(c) {
  if (c.mode === 'online') {
    const platform = platformText(c.online_platform);
    return c.online_note ? `${platform} · ${c.online_note}` : platform;
  }
  return c.place_name;
}

function locationRowHtml(c) {
  const e = App.esc;
  if (c.mode === 'online') {
    return `<div class="info-row"><span class="info-ico">🎥</span><div>
        <div class="info-label">${e(I18N.t('v3_onlinePlatform'))}</div>
        <div class="info-value">${e(placeText(c))}</div>
      </div></div>`;
  }
  return `<div class="info-row"><span class="info-ico">📍</span><div>
      <div class="info-label">${e(I18N.t('v3_placeLabel'))}</div>
      <div class="info-value">${e(c.place_name)}</div>
    </div></div>`;
}

function locationLinksHtml(c) {
  const e = App.esc;
  const calendar = `<a class="link-btn" href="${e(c.google_calendar_url)}" target="_blank" rel="noopener noreferrer">📅 ${e(I18N.t('v3_calendarAdd'))}</a>`;
  if (c.mode === 'online') {
    return `<a class="link-btn" href="${e(c.online_url)}" target="_blank" rel="noopener noreferrer">🎥 ${e(I18N.t('v3_joinOnline'))}</a>${calendar}`;
  }
  return `<a class="link-btn" href="${e(c.google_maps_url)}" target="_blank" rel="noopener noreferrer">🗺️ ${e(I18N.t('v3_mapOpen'))}</a>${calendar}`;
}

function courseCardHtml(c) {
  const e = App.esc;
  const past = new Date(c.end_utc).getTime() < Date.now();
  const cls = ['course-card', past ? 'is-past' : '', c.run_status === 'cancelled' ? 'is-cancelled' : ''].join(' ');
  const pct = Math.min(100, Math.round((c.booked_count / Math.max(1, c.capacity)) * 100));
  const tzPill = `${e(c.timezone)} · ${e(c.gmt_offset)}`;
  // Only surface a change banner when the class was actually revised, otherwise
  // every card would repeat "published" noise.
  const lastUpdate = c.has_update && c.last_update_at
    ? `<div class="update-line"><span class="update-dot"></span><span>${e(c.last_update_summary || I18N.t('v3_updateBadge'))} · ${e(App.fmtLocal(c.last_update_at))}</span></div>`
    : '';

  let actions = '';
  const cta = courseCta(c);
  if (cta.kind === 'login') {
    actions = `<button class="btn btn-primary" data-action="login">${e(cta.label)}</button>`;
  } else if (cta.disabled) {
    actions = `<button class="btn btn-ghost" disabled>${e(cta.label)}</button>`;
  } else {
    actions = `<button class="btn btn-${cta.style}" data-action="${cta.kind}" data-id="${c.id}">${e(cta.label)}</button>`;
  }

  return `
  <article class="${cls}" data-id="${c.id}">
    <div class="card-top">
      <div class="card-meta">
        <span class="teacher-chip"><span class="avatar">${e(App.initial(c.teacher_name))}</span>${e(c.teacher_name)}</span>
        <span class="badge badge-${e(c.run_status)}">${App.statusIcon(c.run_status)} ${e(App.statusText(c.run_status))}</span>
        ${c.has_update ? `<span class="badge badge-update">● ${e(I18N.t('v3_updateBadge'))}</span>` : ''}
        ${c.mode === 'online' ? `<span class="badge badge-online">🎥 ${e(I18N.t('v3_modeOnline'))}</span>` : ''}
        ${past ? `<span class="badge badge-completed">${e(I18N.t('v3_pastClass'))}</span>` : ''}
      </div>
      <h3 class="card-title">${e(c.title)}</h3>
      ${c.status_note ? `<p class="status-note">${e(c.status_note)}</p>` : ''}
      ${lastUpdate}
    </div>

    <div class="notice-box">
      <div class="notice-label">${e(I18N.t('v3_noticeTitle'))}</div>
      <div class="notice-text ${c.notice ? '' : 'empty'}">${c.notice ? e(c.notice) : e(I18N.t('v3_noticeEmpty'))}</div>
    </div>

    <div class="google-bar">
      <div class="google-bar-head">
        <span>${c.mode === 'online' ? `🎥 ${e(I18N.t('v3_onlineClass'))}` : e(I18N.t('v3_googleTitle'))}</span>
        <span class="tz-pill">${tzPill}</span>
      </div>
      <div class="info-row"><span class="info-ico">🕐</span><div>
        <div class="info-label">${e(I18N.t('v3_timeTeacher'))} · ${e(App.tzAbbr(c.start_utc, c.timezone))}</div>
        <div class="info-value">${e(App.fmtInZone(c.start_utc, c.timezone))} → ${e(App.fmtTimeInZone(c.end_utc, c.timezone))}</div>
      </div></div>
      <div class="info-row"><span class="info-ico">🌐</span><div>
        <div class="info-label">${e(I18N.t('v3_timeLocal'))} (${e(Intl.DateTimeFormat().resolvedOptions().timeZone)})</div>
        <div class="info-value">${e(App.fmtFullLocal(c.start_utc))}</div>
      </div></div>
      ${locationRowHtml(c)}
      <div class="link-row">${locationLinksHtml(c)}</div>
    </div>

    <div class="card-foot">
      <div class="seats-line">
        <span>${c.seats_left > 0 ? e(I18N.t('v3_seats', { n: c.seats_left })) : e(I18N.t('v3_seatsFull'))}</span>
        <span>${c.booked_count} / ${c.capacity}</span>
      </div>
      <div class="seats-track"><div class="seats-fill" style="width:${pct}%"></div></div>
      <div class="card-actions">
        ${actions}
        <button class="btn btn-ghost" data-action="detail" data-id="${c.id}">${e(I18N.t('v3_btnDetails'))}</button>
      </div>
    </div>
  </article>`;
}

/**
 * The board is split into three groups so the page opens on what matters:
 *   1. next 7 days  — prominent, the classes students actually plan around
 *   2. later        — everything still ahead but further out
 *   3. past         — finished classes, collapsed by default at the bottom
 */
let pastExpanded = false;
let pastTouched = false; // the visitor has made an explicit show/hide choice

function togglePastSection() {
  pastExpanded = !pastExpanded;
  pastTouched = true;
  renderCourses();
}

function renderCourses() {
  const nextGrid = document.getElementById('course-grid');
  const futureGrid = document.getElementById('course-grid-future');
  const pastGrid = document.getElementById('course-grid-past');
  const emptyBox = document.getElementById('course-empty');
  const secFuture = document.getElementById('sec-future');
  const secPast = document.getElementById('sec-past');
  const nextEmpty = document.getElementById('next-empty');

  document.getElementById('result-count').textContent = I18N.t('v3_resultCount', { n: coursesData.length });

  if (!coursesData.length) {
    // Distinguish "nothing published yet" from "your filters matched nothing".
    const filtering = !!(
      document.getElementById('f-search').value.trim() ||
      document.getElementById('f-teacher').value ||
      document.getElementById('f-status').value ||
      document.getElementById('f-mine').checked
    );
    const title = filtering ? I18N.t('v3_noCourses') : I18N.t('v3_noCoursesYet');
    const hint = filtering ? I18N.t('v3_noCoursesHint') : I18N.t('v3_noCoursesYetHint');
    document.getElementById('course-board').classList.add('hidden');
    emptyBox.classList.remove('hidden');
    emptyBox.innerHTML = App.empty(`${App.esc(title)}<br><small>${App.esc(hint)}</small>`);
    return;
  }

  document.getElementById('course-board').classList.remove('hidden');
  emptyBox.classList.add('hidden');

  const now = Date.now();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  const next = [];
  const later = [];
  const past = [];
  for (const c of coursesData) {
    const start = new Date(c.start_utc).getTime();
    const end = new Date(c.end_utc).getTime();
    if (end <= now) past.push(c);
    else if (start <= weekEnd) next.push(c);   // ongoing classes count as "this week"
    else later.push(c);
  }
  next.sort((a, b) => String(a.start_utc).localeCompare(String(b.start_utc)));
  later.sort((a, b) => String(a.start_utc).localeCompare(String(b.start_utc)));
  past.sort((a, b) => String(b.start_utc).localeCompare(String(a.start_utc)));

  const countText = n => I18N.t('v3_resultCount', { n });
  const paint = (grid, list) => { grid.innerHTML = list.map(courseCardHtml).join(''); };

  paint(nextGrid, next);
  document.getElementById('count-next').textContent = countText(next.length);
  nextEmpty.classList.toggle('hidden', next.length > 0);

  secFuture.classList.toggle('hidden', later.length === 0);
  if (later.length) {
    paint(futureGrid, later);
    document.getElementById('count-future').textContent = countText(later.length);
  }

  secPast.classList.toggle('hidden', past.length === 0);
  if (past.length) {
    // Never open on an empty board: when nothing is scheduled ahead, show the
    // finished classes straight away (unless the visitor chose otherwise).
    if (!pastTouched) pastExpanded = next.length === 0 && later.length === 0;
    paint(pastGrid, past);
    document.getElementById('count-past').textContent = countText(past.length);
    pastGrid.classList.toggle('is-collapsed', !pastExpanded);
    const toggle = document.getElementById('past-toggle');
    toggle.textContent = pastExpanded ? I18N.t('v3_hidePast') : I18N.t('v3_showPast');
    toggle.setAttribute('aria-expanded', pastExpanded ? 'true' : 'false');
  }
}

// ---------------------------------------------------------------- card actions
function findCourse(id) {
  return coursesData.find(c => c.id === id) || weekCourses.find(c => c.id === id) || null;
}

async function bookCourse(id) {
  const course = findCourse(id);
  if (!course) return;
  const yes = await App.confirm({
    title: I18N.t('v3_bookConfirmTitle'),
    html: App.esc(I18N.t('v3_bookConfirmMsg', { title: course.title })),
    confirmText: I18N.t('v3_btnBook')
  });
  if (!yes) return;
  const { res, data } = await App.post(`/api/courses/${id}/book`);
  App.toast(data && (data.message || data.error) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
  if (res.ok) refreshBoth();
}

async function cancelCourse(id) {
  const course = findCourse(id);
  if (!course) return;
  const yes = await App.confirm({
    title: I18N.t('v3_cancelConfirmTitle'),
    html: App.esc(I18N.t('v3_cancelConfirmMsg', { title: course.title })),
    confirmText: I18N.t('v3_btnCancel'),
    danger: true
  });
  if (!yes) return;
  const { res, data } = await App.post(`/api/courses/${id}/cancel`);
  App.toast(data && (data.message || data.error) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
  if (res.ok) refreshBoth();
}

/** A booking changes both surfaces, so refresh them together. */
function refreshBoth() {
  loadCourses(true);
  loadWeekCourses();
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);
  if (action === 'login') { window.location.href = '/login.html'; return; }
  if (action === 'detail') { openCourseDetail(id); return; }
  if (action === 'book') { bookCourse(id); return; }
  if (action === 'cancel') { cancelCourse(id); }
});

async function openCourseDetail(id) {
  App.showModal({ title: I18N.t('v3_detailTitle'), html: `<div class="loading"><div class="spinner"></div></div>`, wide: true, buttons: [{ label: I18N.t('v3_detailClose'), style: 'ghost', close: true }] });
  const { res, data } = await App.get(`/api/courses/${id}`);
  if (!res.ok) { App.closeModal(); App.toast(I18N.t('v3_loadFailed'), 'error'); return; }
  const c = data.course;
  const e = App.esc;
  const updates = (data.updates || []).map(u => `
    <li><div class="tl-time">${e(App.fmtLocal(u.created_at))} · ${e(u.teacher_name)}</div>
        <div class="tl-text">${e(u.summary)}</div></li>`).join('');
  const bookings = (data.bookings || []).map(b => `<li><div class="tl-text">${e(b.display_name)}</div><div class="tl-time">${e(App.fmtLocal(b.created_at))}</div></li>`).join('');
  const html = `
    <div class="detail-block">
      <div class="card-meta">
        <span class="badge badge-${e(c.run_status)}">${App.statusIcon(c.run_status)} ${e(App.statusText(c.run_status))}</span>
        ${c.has_update ? `<span class="badge badge-update">● ${e(I18N.t('v3_updateBadge'))} · ${e(I18N.t('v3_revision', { n: c.revision }))}</span>` : ''}
      </div>
      <h3 style="margin-top:10px;font-size:18px">${e(c.title)}</h3>
      <p class="status-note">${e(I18N.t('v3_byTeacher', { name: c.teacher_name }))}${c.status_note ? ' · ' + e(c.status_note) : ''}</p>
    </div>
    <div class="detail-block">
      <h4>${e(I18N.t('v3_noticeTitle'))}</h4>
      <div class="notice-box" style="margin:0"><div class="notice-text ${c.notice ? '' : 'empty'}">${c.notice ? e(c.notice) : e(I18N.t('v3_noticeEmpty'))}</div>
      ${c.notice_updated_at ? `<div class="notice-time">${e(App.fmtLocal(c.notice_updated_at))}</div>` : ''}</div>
    </div>
    <div class="detail-block">
      <h4>${c.mode === 'online' ? `🎥 ${e(I18N.t('v3_onlineClass'))}` : e(I18N.t('v3_googleTitle'))} · ${e(c.timezone)} ${e(c.gmt_offset)}</h4>
      <div class="google-bar" style="margin:0">
        <div class="info-row"><span class="info-ico">🕐</span><div><div class="info-label">${e(I18N.t('v3_timeTeacher'))}</div><div class="info-value">${e(App.fmtInZone(c.start_utc, c.timezone))} → ${e(App.fmtInZone(c.end_utc, c.timezone))}</div></div></div>
        <div class="info-row"><span class="info-ico">🌐</span><div><div class="info-label">${e(I18N.t('v3_timeLocal'))}</div><div class="info-value">${e(App.fmtFullLocal(c.start_utc))}</div></div></div>
        ${locationRowHtml(c)}
        <div class="link-row">${locationLinksHtml(c)}</div>
      </div>
    </div>
    <div class="detail-block">
      <h4>${e(I18N.t('v3_detailUpdates'))}</h4>
      ${updates ? `<ul class="timeline">${updates}</ul>` : `<p class="panel-note">${e(I18N.t('v3_detailNoUpdates'))}</p>`}
    </div>
    ${bookings ? `<div class="detail-block"><h4>${e(I18N.t('v3_detailBookings'))} (${data.bookings.length})</h4><ul class="timeline">${bookings}</ul></div>` : ''}`;
  // The detail view is also the "more actions" surface: whatever the visitor
  // could do on the card or in the timetable popover is available here too.
  const cta = courseCta(c);
  const buttons = [];
  if (cta.kind === 'book') {
    buttons.push({ label: cta.label, style: 'primary', close: true, onClick: () => bookCourse(c.id) });
  } else if (cta.kind === 'cancel') {
    buttons.push({ label: cta.label, style: 'danger', close: true, onClick: () => cancelCourse(c.id) });
  } else if (cta.kind === 'login') {
    buttons.push({ label: cta.label, style: 'primary', close: true, onClick: () => { window.location.href = '/login.html'; } });
  } else if (cta.label) {
    buttons.push({ label: cta.label, style: 'ghost', close: false });
  }
  buttons.push({ label: I18N.t('v3_detailClose'), style: 'ghost', close: true });
  App.showModal({ title: I18N.t('v3_detailTitle'), html, wide: true, buttons });
}

// ---------------------------------------------------------------- weekly timetable
/**
 * The weekly timetable is built from *published classes*, not from a recurring
 * availability table: a cell is bookable only when a teacher has actually
 * published a class in it. Every other cell stays "not bookable", which is the
 * whole point of a week view — it mirrors what is really on offer.
 */
const pad2 = n => String(n).padStart(2, '0');
const dayKeyOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const minuteLabel = m => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const startMinuteOf = c => { const d = new Date(c.start_utc); return d.getHours() * 60 + d.getMinutes(); };
const durationOf = c => Math.max(15, Math.round((new Date(c.end_utc).getTime() - new Date(c.start_utc).getTime()) / 60000));
const endMinuteOf = c => (startMinuteOf(c) + durationOf(c)) % 1440;
const byStart = (a, b) => String(a.start_utc).localeCompare(String(b.start_utc));

/** Rows = every distinct start time ever published, ascending. */
function buildWeekRows(courses) {
  const map = new Map();
  for (const c of courses) {
    const s = startMinuteOf(c);
    map.set(s, Math.max(map.get(s) || 0, s + durationOf(c)));
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([min, endMin]) => ({ min, endMin }));
}

/** dayKey -> startMinute -> [classes] */
function buildWeekIndex(courses) {
  const index = new Map();
  for (const c of courses) {
    const key = dayKeyOf(new Date(c.start_utc));
    if (!index.has(key)) index.set(key, new Map());
    const byMinute = index.get(key);
    const s = startMinuteOf(c);
    if (!byMinute.has(s)) byMinute.set(s, []);
    byMinute.get(s).push(c);
  }
  return index;
}

function weekStateOf(c) {
  if (c.is_my_booking) return 'mine';
  if (new Date(c.end_utc).getTime() < Date.now()) return 'past';
  if (['cancelled', 'completed'].includes(c.run_status)) return 'past';
  if (c.seats_left === 0) return 'full';
  return 'open';
}

function weekChipHtml(c, grow = 1, row = false) {
  const e = App.esc;
  const state = weekStateOf(c);
  return `<button type="button" class="wk-course is-${state}${row ? ' wk-course-row' : ''}"
      data-wk-id="${c.id}" style="--grow:${grow}">
    <span class="wk-c-time">${e(minuteLabel(startMinuteOf(c)))}–${e(minuteLabel(endMinuteOf(c)))}</span>
    <span class="wk-c-title">${c.mode === 'online' ? '<i class="wk-mode-ico">🎥</i>' : ''}${e(c.title)}</span>
    <span class="wk-c-teacher"><i class="avatar">${e(App.initial(c.teacher_name))}</i>${e(c.teacher_name)}</span>
    <span class="wk-c-meta">${c.has_update ? '<i class="wk-update-dot" aria-hidden="true"></i>' : ''}${c.booked_count}/${c.capacity}</span>
  </button>`;
}

/**
 * One cell, one time, one day. Several teachers at the same hour share the cell
 * and split its height in proportion to how long their classes run.
 */
function weekCellHtml(day, list) {
  const base = getHoliday(day) ? 'holiday-col' : '';
  if (!list || !list.length) {
    return `<td class="wk-td wk-td-empty ${base}"><span class="wk-none">${App.esc(I18N.t('v3_wkNotBookable'))}</span></td>`;
  }
  const sorted = [...list].sort(byStart);
  const total = sorted.reduce((sum, c) => sum + durationOf(c), 0) || 1;
  const chips = sorted
    .map(c => weekChipHtml(c, Math.max(1, Math.round((durationOf(c) / total) * 100))))
    .join('');
  return `<td class="wk-td ${base}"><div class="wk-stack">${chips}</div></td>`;
}

function renderWeekTable(dates, index, shortDays) {
  const e = App.esc;
  const today = dayKeyOf(new Date());
  document.getElementById('weekly-header').innerHTML =
    `<th>${e(I18N.t('scheduleTimeHeader'))}</th>` +
    dates.map((d, i) => {
      const h = getHoliday(d);
      const cls = [h ? 'holiday-col' : '', dayKeyOf(d) === today ? 'wk-today' : ''].filter(Boolean).join(' ');
      return `<th class="${cls}">
        <div class="th-day">${e(shortDays[i])}</div>
        <div class="th-date">${e(I18N.formatDateShort(d))}</div>
        ${h ? `<div class="th-holiday" title="${e(h[3])}">${h[2]}</div>` : ''}
      </th>`;
    }).join('');

  const body = document.getElementById('weekly-body');
  if (!weekRows.length) {
    body.innerHTML = `<tr><td colspan="8" class="wk-table-empty">${e(I18N.t('v3_noCoursesYet'))}<br><small>${e(I18N.t('v3_noCoursesYetHint'))}</small></td></tr>`;
    return;
  }
  body.innerHTML = weekRows.map(row => {
    const cells = dates.map(d => {
      const byMinute = index.get(dayKeyOf(d));
      return weekCellHtml(d, byMinute ? byMinute.get(row.min) : null);
    }).join('');
    return `<tr>
      <td class="wk-time"><strong>${e(minuteLabel(row.min))}</strong><span>${e(minuteLabel(row.endMin))}</span></td>
      ${cells}
    </tr>`;
  }).join('');
}

/** Phone layout: the same week as a stack of day cards, no sideways scrolling. */
function renderWeekList(dates, index, shortDays) {
  const e = App.esc;
  const today = dayKeyOf(new Date());
  document.getElementById('week-list').innerHTML = dates.map((d, i) => {
    const h = getHoliday(d);
    const byMinute = index.get(dayKeyOf(d));
    const list = byMinute ? [...byMinute.values()].flat().sort(byStart) : [];
    return `<section class="wk-day${dayKeyOf(d) === today ? ' is-today' : ''}">
      <header class="wk-day-head">
        <span class="wk-day-name">${e(shortDays[i])}</span>
        <span class="wk-day-date">${e(I18N.formatDateShort(d))}</span>
        ${h ? `<span class="wk-day-holiday">${h[2]} ${e(h[3])}</span>` : ''}
        <span class="wk-day-count">${list.length ? e(I18N.t('v3_resultCount', { n: list.length })) : ''}</span>
      </header>
      <div class="wk-day-body">
        ${list.length
          ? list.map(c => weekChipHtml(c, 1, true)).join('')
          : `<div class="wk-day-empty">${e(I18N.t('v3_wkNotBookable'))}</div>`}
      </div>
    </section>`;
  }).join('');
}

function renderWeekBanner(dates, count) {
  const el = document.getElementById('wk-banner');
  if (!el) return;
  const weekEnd = dates[6].getTime() + 86400000 - 1;
  if (count > 0) {
    if (weekEnd >= Date.now()) { el.className = 'wk-banner hidden'; el.innerHTML = ''; return; }
    el.className = 'wk-banner is-past';
    el.innerHTML = `<span class="wk-banner-ico">🗂️</span><span>${App.esc(I18N.t('v3_wkPastWeek'))}</span>`;
    return;
  }
  el.className = 'wk-banner';
  const text = weekCourses.length ? I18N.t('v3_wkEmptyWeek') : I18N.t('v3_noCoursesYet');
  el.innerHTML = `<span class="wk-banner-ico">🗓️</span><span>${App.esc(text)}</span>` +
    (weekCourses.length
      ? `<button class="btn btn-soft btn-sm" type="button" onclick="jumpToLatestWeek()">${App.esc(I18N.t('v3_wkJumpLatest'))}</button>`
      : '');
}

function renderWeekly() {
  const dates = getWeekDates(weekOffset);
  const shortDays = I18N.getDayShortNames();
  document.getElementById('week-range-text').textContent = I18N.formatWeekRange(dates[0], dates[6]);
  const tzEl = document.getElementById('wk-tz');
  if (tzEl) tzEl.textContent = I18N.t('v3_wkTimezone', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone });

  const index = buildWeekIndex(weekCourses);
  let count = 0;
  for (const d of dates) {
    const byMinute = index.get(dayKeyOf(d));
    if (!byMinute) continue;
    for (const list of byMinute.values()) count += list.length;
  }
  const countEl = document.getElementById('wk-count');
  if (countEl) countEl.textContent = I18N.t('v3_wkWeekCount', { n: count });

  renderWeekTable(dates, index, shortDays);
  renderWeekList(dates, index, shortDays);
  renderWeekBanner(dates, count);
  hideWeekPop();
}

function prevWeek() { weekOffset--; renderWeekly(); }
function nextWeek() { weekOffset++; renderWeekly(); }
function goToday() { weekOffset = 0; renderWeekly(); }

/** Jump to the most recent week that actually has classes (demo history). */
function jumpToLatestWeek() {
  if (!weekCourses.length) return;
  const latest = weekCourses.reduce((a, b) => (new Date(a.start_utc) > new Date(b.start_utc) ? a : b));
  const target = new Date(latest.start_utc);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7)); // back to Monday
  const base = getWeekDates(0)[0];
  weekOffset = Math.round((target.getTime() - base.getTime()) / (7 * 86400000));
  renderWeekly();
}

// ---------------------------------------------------------------- hover preview
let weekPop = null;
let weekPopTimer = null;
let weekPopCourse = null;

function ensureWeekPop() {
  if (weekPop) return weekPop;
  weekPop = document.createElement('div');
  weekPop.className = 'wk-pop hidden';
  weekPop.id = 'week-pop';
  weekPop.setAttribute('role', 'dialog');
  document.body.appendChild(weekPop);
  weekPop.addEventListener('mouseenter', () => clearTimeout(weekPopTimer));
  weekPop.addEventListener('mouseleave', scheduleWeekPopHide);
  weekPop.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-wk-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const act = btn.dataset.wkAct;
    hideWeekPop();
    if (act === 'book') bookCourse(id);
    else if (act === 'cancel') cancelCourse(id);
    else openCourseDetail(id);
  });
  return weekPop;
}

function hideWeekPop() {
  clearTimeout(weekPopTimer);
  weekPopCourse = null;
  if (weekPop) {
    weekPop.classList.add('hidden');
    weekPop.innerHTML = '';
  }
}

function scheduleWeekPopHide() {
  clearTimeout(weekPopTimer);
  weekPopTimer = setTimeout(hideWeekPop, 160);
}

function weekPopHtml(c) {
  const e = App.esc;
  const cta = courseCta(c);
  const state = weekStateOf(c);
  let actions = '';
  if (cta.kind === 'book' || cta.kind === 'cancel') {
    actions += `<button class="btn btn-${cta.style} btn-sm" type="button" data-wk-act="${cta.kind}" data-id="${c.id}">${e(cta.label)}</button>`;
  } else if (cta.kind === 'login') {
    actions += `<a class="btn btn-primary btn-sm" href="/login.html">${e(cta.label)}</a>`;
  } else {
    actions += `<button class="btn btn-ghost btn-sm" type="button" disabled>${e(cta.label)}</button>`;
  }
  if (c.mode === 'online' && c.online_url) {
    actions += `<a class="btn btn-soft btn-sm" href="${e(c.online_url)}" target="_blank" rel="noopener noreferrer">🎥 ${e(I18N.t('v3_joinOnline'))}</a>`;
  }
  actions += `<button class="btn btn-ghost btn-sm" type="button" data-wk-act="detail" data-id="${c.id}">${e(I18N.t('v3_btnDetails'))}</button>`;

  return `
    <div class="wk-pop-head">
      <span class="badge badge-${e(c.run_status)}">${App.statusIcon(c.run_status)} ${e(App.statusText(c.run_status))}</span>
      ${c.has_update ? `<span class="badge badge-update">● ${e(I18N.t('v3_updateBadge'))}</span>` : ''}
      ${state === 'mine' ? `<span class="badge badge-update">✓ ${e(I18N.t('v3_wkMine'))}</span>` : ''}
    </div>
    <h4 class="wk-pop-title">${e(c.title)}</h4>
    <div class="wk-pop-row"><span class="wk-pop-ico">🕐</span><span><strong>${e(minuteLabel(startMinuteOf(c)))}–${e(minuteLabel(endMinuteOf(c)))}</strong> · ${e(App.tzAbbr(c.start_utc, c.timezone))}</span></div>
    <div class="wk-pop-row"><span class="wk-pop-ico">👤</span><span>${e(c.teacher_name)}</span></div>
    <div class="wk-pop-row"><span class="wk-pop-ico">${c.mode === 'online' ? '🎥' : '📍'}</span><span>${e(placeText(c))}</span></div>
    <div class="wk-pop-row"><span class="wk-pop-ico">🌐</span><span>${e(I18N.t('v3_timeLocal'))} · ${e(App.fmtFullLocal(c.start_utc))}</span></div>
    <div class="wk-pop-seats">${e(c.seats_left > 0 ? I18N.t('v3_seats', { n: c.seats_left }) : I18N.t('v3_seatsFull'))} · ${c.booked_count}/${c.capacity}</div>
    <div class="wk-pop-notice${c.notice ? '' : ' is-empty'}">${c.notice ? e(c.notice) : e(I18N.t('v3_noticeEmpty'))}</div>
    <div class="wk-pop-actions">${actions}</div>`;
}

function showWeekPop(c, anchor) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const pop = ensureWeekPop();
  if (weekPopCourse && weekPopCourse.id === c.id && !pop.classList.contains('hidden')) return;
  weekPopCourse = c;
  pop.innerHTML = weekPopHtml(c);
  pop.classList.remove('hidden');
  pop.style.visibility = 'hidden';

  const rect = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 8;
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = rect.bottom + gap;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - gap);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.visibility = '';
}

document.addEventListener('mouseover', ev => {
  const chip = ev.target.closest('.wk-course');
  if (!chip || chip.contains(ev.relatedTarget)) return;
  clearTimeout(weekPopTimer);
  const c = weekCourses.find(x => x.id === Number(chip.dataset.wkId));
  if (c) showWeekPop(c, chip);
});

document.addEventListener('mouseout', ev => {
  const chip = ev.target.closest('.wk-course');
  if (!chip || chip.contains(ev.relatedTarget)) return;
  if (weekPop && weekPop.contains(ev.relatedTarget)) return;
  scheduleWeekPopHide();
});

document.addEventListener('click', ev => {
  const chip = ev.target.closest('.wk-course');
  if (!chip) return;
  hideWeekPop();
  openCourseDetail(Number(chip.dataset.wkId));
});

window.addEventListener('scroll', hideWeekPop, { passive: true, capture: true });
window.addEventListener('resize', hideWeekPop);

// ---------------------------------------------------------------- boot
['f-search', 'f-teacher', 'f-status', 'f-mine'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(id === 'f-search' ? 'input' : 'change', () => loadCourses(true));
});

/** Site settings (v2.1): title + footer contact, editable in the teacher studio. */
function renderFooterContact(data) {
  const box = document.getElementById('footer-contact');
  if (!box) return;
  const esc = App.esc;
  const phone = String(data.site_phone || '').trim();
  const email = String(data.site_email || '').trim();
  const line = String(data.site_line_url || '').trim();
  const parts = [];
  if (phone) {
    parts.push(`<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" id="footer-phone-link">${esc(phone)}</a>`);
  }
  if (email) {
    parts.push(`<a href="mailto:${esc(email)}" id="footer-email-link">${esc(email)}</a>`);
  }
  if (line) {
    parts.push(`<a href="${esc(line)}" id="footer-line-link" target="_blank" rel="noopener noreferrer">LINE</a>`);
  }
  box.innerHTML = parts.join(' <span class="sep">·</span> ');
}

async function loadSiteSettings() {
  try {
    const { res, data } = await App.get('/api/settings');
    if (!res.ok || !data) return;
    if (data.site_title) document.title = data.site_title;
    renderFooterContact(data);
  } catch (_) { /* settings are optional */ }
}

App.boot({
  onReady: async () => {
    App.setActiveNav('board');
    await Promise.all([loadTeachers(), loadCourses(), loadWeekCourses(), loadSiteSettings()]);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.body.classList.contains('modal-open')) {
        loadCourses(true);
        if (activeView === 'weekly') loadWeekCourses();
      }
    }, 20000);
  },
  onLangChange: () => {
    // Rebuild translated option labels, filters, cards and weekly header.
    loadTeachers();
    document.getElementById('f-status').innerHTML = `
      <option value="">${App.esc(I18N.t('v3_filterStatus'))}</option>
      <option value="confirmed">${App.esc(I18N.t('v3_statusConfirmed'))}</option>
      <option value="pending">${App.esc(I18N.t('v3_statusPending'))}</option>
      <option value="cancelled">${App.esc(I18N.t('v3_statusCancelled'))}</option>
      <option value="completed">${App.esc(I18N.t('v3_statusCompleted'))}</option>`;
    loadCourses(true);
    renderWeekly();
  }
});

/**
 * schedule.js — student course board + legacy weekly grid (v3)
 */
let coursesData = [];
let teachersData = [];
let weeklyData = null;
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
  if (view === 'weekly' && weeklyData) renderWeekly();
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
      document.getElementById('course-grid').innerHTML =
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

async function loadWeekly() {
  const { data } = await App.get('/api/schedule');
  if (data && data.schedule) {
    weeklyData = data;
    renderWeekly();
  }
}

// ---------------------------------------------------------------- course cards
function courseCardHtml(c) {
  const e = App.esc;
  const past = new Date(c.end_utc).getTime() < Date.now();
  const closed = ['cancelled', 'completed'].includes(c.run_status);
  const cls = ['course-card', past ? 'is-past' : '', c.run_status === 'cancelled' ? 'is-cancelled' : ''].join(' ');
  const pct = Math.min(100, Math.round((c.booked_count / Math.max(1, c.capacity)) * 100));
  const tzPill = `${e(c.timezone)} · ${e(c.gmt_offset)}`;
  // Only surface a change banner when the class was actually revised, otherwise
  // every card would repeat "published" noise.
  const lastUpdate = c.has_update && c.last_update_at
    ? `<div class="update-line"><span class="update-dot"></span><span>${e(c.last_update_summary || I18N.t('v3_updateBadge'))} · ${e(App.fmtLocal(c.last_update_at))}</span></div>`
    : '';

  let actions = '';
  if (!App.user) {
    actions = `<button class="btn btn-primary" data-action="login">${e(I18N.t('v3_loginToBook'))}</button>`;
  } else if (App.user.role === 'teacher') {
    actions = `<button class="btn btn-ghost" disabled>${e(I18N.t('v3_teacherNoBook'))}</button>`;
  } else if (c.is_my_booking) {
    actions = `<button class="btn btn-outline-danger" data-action="cancel" data-id="${c.id}">${e(I18N.t('v3_btnCancel'))}</button>`;
  } else if (closed || past) {
    actions = `<button class="btn btn-ghost" disabled>${e(I18N.t('v3_classClosed'))}</button>`;
  } else if (c.seats_left === 0) {
    actions = `<button class="btn btn-ghost" disabled>${e(I18N.t('v3_seatsFull'))}</button>`;
  } else {
    actions = `<button class="btn btn-primary" data-action="book" data-id="${c.id}">${e(I18N.t('v3_btnBook'))}</button>`;
  }

  return `
  <article class="${cls}" data-id="${c.id}">
    <div class="card-top">
      <div class="card-meta">
        <span class="teacher-chip"><span class="avatar">${e(App.initial(c.teacher_name))}</span>${e(c.teacher_name)}</span>
        <span class="badge badge-${e(c.run_status)}">${App.statusIcon(c.run_status)} ${e(App.statusText(c.run_status))}</span>
        ${c.has_update ? `<span class="badge badge-update">● ${e(I18N.t('v3_updateBadge'))}</span>` : ''}
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
        <span>${e(I18N.t('v3_googleTitle'))}</span>
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
      <div class="info-row"><span class="info-ico">📍</span><div>
        <div class="info-label">${e(I18N.t('v3_placeLabel'))}</div>
        <div class="info-value">${e(c.place_name)}</div>
      </div></div>
      <div class="link-row">
        <a class="link-btn" href="${e(c.google_maps_url)}" target="_blank" rel="noopener noreferrer">🗺️ ${e(I18N.t('v3_mapOpen'))}</a>
        <a class="link-btn" href="${e(c.google_calendar_url)}" target="_blank" rel="noopener noreferrer">📅 ${e(I18N.t('v3_calendarAdd'))}</a>
      </div>
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

function renderCourses() {
  const grid = document.getElementById('course-grid');
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
    grid.innerHTML = App.empty(`${App.esc(title)}<br><small>${App.esc(hint)}</small>`);
    return;
  }
  grid.innerHTML = coursesData.map(courseCardHtml).join('');
}

// ---------------------------------------------------------------- card actions
document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);
  const course = coursesData.find(c => c.id === id);
  if (action === 'login') { window.location.href = '/login.html'; return; }
  if (action === 'detail') { openCourseDetail(id); return; }
  if (action === 'book' && course) {
    const yes = await App.confirm({
      title: I18N.t('v3_bookConfirmTitle'),
      html: App.esc(I18N.t('v3_bookConfirmMsg', { title: course.title })),
      confirmText: I18N.t('v3_btnBook')
    });
    if (!yes) return;
    const { res, data } = await App.post(`/api/courses/${id}/book`);
    App.toast(data && (data.message || data.error) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
    if (res.ok) loadCourses(true);
    return;
  }
  if (action === 'cancel' && course) {
    const yes = await App.confirm({
      title: I18N.t('v3_cancelConfirmTitle'),
      html: App.esc(I18N.t('v3_cancelConfirmMsg', { title: course.title })),
      confirmText: I18N.t('v3_btnCancel'),
      danger: true
    });
    if (!yes) return;
    const { res, data } = await App.post(`/api/courses/${id}/cancel`);
    App.toast(data && (data.message || data.error) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
    if (res.ok) loadCourses(true);
  }
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
      <h4>${e(I18N.t('v3_googleTitle'))} · ${e(c.timezone)} ${e(c.gmt_offset)}</h4>
      <div class="google-bar" style="margin:0">
        <div class="info-row"><span class="info-ico">🕐</span><div><div class="info-label">${e(I18N.t('v3_timeTeacher'))}</div><div class="info-value">${e(App.fmtInZone(c.start_utc, c.timezone))} → ${e(App.fmtInZone(c.end_utc, c.timezone))}</div></div></div>
        <div class="info-row"><span class="info-ico">🌐</span><div><div class="info-label">${e(I18N.t('v3_timeLocal'))}</div><div class="info-value">${e(App.fmtFullLocal(c.start_utc))}</div></div></div>
        <div class="info-row"><span class="info-ico">📍</span><div><div class="info-label">${e(I18N.t('v3_placeLabel'))}</div><div class="info-value">${e(c.place_name)}</div></div></div>
        <div class="link-row">
          <a class="link-btn" href="${e(c.google_maps_url)}" target="_blank" rel="noopener noreferrer">🗺️ ${e(I18N.t('v3_mapOpen'))}</a>
          <a class="link-btn" href="${e(c.google_calendar_url)}" target="_blank" rel="noopener noreferrer">📅 ${e(I18N.t('v3_calendarAdd'))}</a>
        </div>
      </div>
    </div>
    <div class="detail-block">
      <h4>${e(I18N.t('v3_detailUpdates'))}</h4>
      ${updates ? `<ul class="timeline">${updates}</ul>` : `<p class="panel-note">${e(I18N.t('v3_detailNoUpdates'))}</p>`}
    </div>
    ${bookings ? `<div class="detail-block"><h4>${e(I18N.t('v3_detailBookings'))} (${data.bookings.length})</h4><ul class="timeline">${bookings}</ul></div>` : ''}`;
  App.showModal({ title: I18N.t('v3_detailTitle'), html, wide: true, buttons: [{ label: I18N.t('v3_detailClose'), style: 'ghost', close: true }] });
}

// ---------------------------------------------------------------- weekly grid
function renderWeekly() {
  if (!weeklyData) return;
  const { timeSlots, schedule } = weeklyData;
  const dates = getWeekDates(weekOffset);
  const shortDays = I18N.getDayShortNames();
  document.getElementById('week-range-text').textContent = I18N.formatWeekRange(dates[0], dates[6]);
  const head = document.getElementById('weekly-header');
  head.innerHTML = `<th>${App.esc(I18N.t('scheduleTimeHeader'))}</th>` + dates.map((d, i) => {
    const h = getHoliday(d);
    return `<th class="${h ? 'holiday-col' : ''}"><div class="th-day">${App.esc(shortDays[i])}</div><div class="th-date">${App.esc(I18N.formatDateShort(d))}</div>${h ? `<div class="th-holiday" title="${App.esc(h[3])}">${h[2]}</div>` : ''}</th>`;
  }).join('');
  const body = document.getElementById('weekly-body');
  body.innerHTML = timeSlots.map(slot => {
    const [start, end] = slot.split('-');
    const cells = dates.map((d, di) => {
      const cell = schedule[slot] && schedule[slot][di];
      const holiday = getHoliday(d);
      if (!cell) return `<td class="${holiday ? 'holiday-col' : ''}">—</td>`;
      let cls = 'slot-not', text = I18N.t('slotNotAvailable'), click = '';
      if (cell.status === 'available') {
        cls = 'slot-available clickable'; text = I18N.t('slotAvailable');
        click = `onclick="bookSlot(${cell.id})"`;
      } else if (cell.status === 'booked') {
        if (App.user && cell.bookedBy === App.user.id) {
          cls = 'slot-mine clickable'; text = `${cell.bookedName || ''} · ${I18N.t('cancelClickToCancel')}`;
          click = `onclick="cancelSlot(${cell.id})"`;
        } else {
          cls = 'slot-booked'; text = `${cell.bookedName || ''} · ${I18N.t('slotBooked')}`;
        }
      }
      return `<td class="${holiday ? 'holiday-col' : ''}"><span class="slot-badge ${cls}" ${click}>${App.esc(text)}</span></td>`;
    }).join('');
    return `<tr><td>${App.esc(I18N.formatTime(start))}<br>${App.esc(I18N.formatTime(end))}</td>${cells}</tr>`;
  }).join('');
  const legendMy = document.getElementById('legend-my');
  if (legendMy) legendMy.classList.toggle('hidden', !App.user);
}

function prevWeek() { weekOffset--; renderWeekly(); }
function nextWeek() { weekOffset++; renderWeekly(); }
function goToday() { weekOffset = 0; renderWeekly(); }

async function bookSlot(id) {
  if (!App.user) { App.toast(I18N.t('bookLoginFirst'), 'info'); setTimeout(() => location.href = '/login.html', 1200); return; }
  const { res, data } = await App.post('/api/schedule/book', { slotId: id });
  App.toast((data && (data.message || data.error)) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
  if (res.ok) loadWeekly();
}
async function cancelSlot(id) {
  const { res, data } = await App.post('/api/schedule/cancel', { slotId: id });
  App.toast((data && (data.message || data.error)) || I18N.t('errorNetwork'), res.ok ? 'success' : 'error');
  if (res.ok) loadWeekly();
}

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
    await Promise.all([loadTeachers(), loadCourses(), loadWeekly(), loadSiteSettings()]);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.body.classList.contains('modal-open')) {
        loadCourses(true);
        if (activeView === 'weekly') loadWeekly();
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
    if (weeklyData) renderWeekly();
  }
});

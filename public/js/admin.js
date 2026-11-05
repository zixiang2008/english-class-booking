/**
 * admin.js — teacher studio (v3)
 * Publish classes with notice board + required Google address bar,
 * watch bookings in real time, manage weekly slots and students.
 */
let coursesConfig = { timezones: [], runStatuses: [], maxNoticeLength: 100, serverTimezone: 'UTC' };
let myCourses = [];
let slotsData = null;
let adminWeekOffset = 0;
let lastMaxBookingId = 0;
let activeTab = 'overview';
let refreshTimer = null;

const e = App.esc;

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${tab}`));
  const loaders = {
    overview: () => { loadOverview(); loadBookings(true); },
    publish: () => loadMyCourses(),
    bookings: () => loadBookings(false),
    slots: () => loadSlots(),
    students: () => loadStudents(),
    settings: () => loadSettings()
  };
  if (loaders[tab]) loaders[tab]();
}

// ---------------------------------------------------------------- config / data
async function loadConfig() {
  const { data } = await App.get('/api/courses/config');
  if (data && data.timezones) coursesConfig = data;
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected && !coursesConfig.timezones.includes(detected)) coursesConfig.timezones.unshift(detected);
}

async function loadOverview() {
  const { res, data } = await App.get('/api/admin/overview');
  if (!res.ok || !data) return;
  const map = { courses: 'ov-courses', confirmed: 'ov-confirmed', pending: 'ov-pending', bookings: 'ov-bookings', students: 'ov-students', teachers: 'ov-teachers' };
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = data[k] ?? '–';
  }
}

async function loadMyCourses() {
  const { res, data } = await App.get('/api/courses?teacher=me');
  const box = document.getElementById('my-course-list');
  if (!res.ok || !data) { box.innerHTML = App.empty(e(I18N.t('v3_loadFailed'))); return; }
  myCourses = data.courses;
  if (!myCourses.length) {
    box.innerHTML = App.empty(`${e(I18N.t('v3_noCourses'))}<br><button class="btn btn-primary" style="margin-top:12px" onclick="openCourseEditor()">${e(I18N.t('v3_newCourse'))}</button>`);
    return;
  }
  box.innerHTML = myCourses.map(c => {
    const opts = coursesConfig.runStatuses.map(s =>
      `<option value="${s}" ${s === c.run_status ? 'selected' : ''}>${e(App.statusText(s))}</option>`).join('');
    return `
    <div class="list-row" data-id="${c.id}">
      <div class="list-main">
        <div class="list-title">${e(c.title)} <span class="badge badge-${e(c.run_status)}">${App.statusIcon(c.run_status)} ${e(App.statusText(c.run_status))}</span>
          ${c.has_update ? `<span class="badge badge-update">✨ ${e(I18N.t('v3_updateBadge'))}</span>` : ''}</div>
        <div class="list-sub">🕐 ${e(App.fmtInZone(c.start_utc, c.timezone))} (${e(c.timezone)} ${e(c.gmt_offset)}) · 📍 ${e(c.place_name)} · 👥 ${c.booked_count}/${c.capacity}</div>
        <div class="list-sub">📢 ${c.notice ? e(c.notice.slice(0, 70)) : e(I18N.t('v3_noticeEmpty'))}</div>
      </div>
      <div class="list-actions">
        <select class="status-select" data-status="${c.id}" style="width:auto;min-height:34px;padding:5px 8px;font-size:12px" aria-label="Status">${opts}</select>
        <a class="btn btn-ghost btn-sm" href="${e(c.google_maps_url)}" target="_blank" rel="noopener noreferrer">🗺️</a>
        <button class="btn btn-ghost btn-sm" type="button" data-edit="${c.id}">✏️ ${e(I18N.t('v3_edit'))}</button>
        <button class="btn btn-outline-danger btn-sm" type="button" data-delete="${c.id}">🗑 ${e(I18N.t('v3_delete'))}</button>
      </div>
    </div>`;
  }).join('');
}

async function loadBookings(silent = false) {
  const { res, data } = await App.get('/api/admin/bookings');
  if (!res.ok || !data) return;
  const list = data.bookings || [];
  const maxId = list.reduce((m, b) => Math.max(m, b.booking_id), 0);
  const prevMax = lastMaxBookingId || maxId;
  lastMaxBookingId = maxId;

  const rows = list.map(b => `
    <tr class="${b.booking_id > prevMax ? 'is-new' : ''}">
      <td><strong>${e(b.student_name)}</strong>${b.booking_id > prevMax ? ` <span class="badge badge-new">${e(I18N.t('v3_newBadge'))}</span>` : ''}<div class="list-sub">@${e(b.student_username)}</div></td>
      <td>${e(b.course_title)}</td>
      <td>${e(App.fmtInZone(b.start_utc, b.timezone))}<div class="list-sub">${e(b.timezone)} · ${e(b.place_name)}</div></td>
      <td>${e(b.student_phone || '—')}</td>
      <td>${e(App.fmtLocal(b.booked_at))}</td>
    </tr>`).join('');
  const table = list.length ? `
    <div class="table-scroll"><table class="data">
      <thead><tr><th>${e(I18N.t('v3_colStudent'))}</th><th>${e(I18N.t('v3_colCourse'))}</th><th>${e(I18N.t('v3_colTime'))}</th><th>${e(I18N.t('v3_colPhone'))}</th><th>${e(I18N.t('v3_colBookedAt'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : App.empty(e(I18N.t('v3_bookingsEmpty')));
  document.getElementById('booking-list').innerHTML = table;
  document.getElementById('overview-recent').innerHTML = list.length
    ? list.slice(0, 5).map(b => `<div class="list-row"><div class="list-main"><div class="list-title">${e(b.student_name)} → ${e(b.course_title)}</div>
        <div class="list-sub">${e(App.fmtInZone(b.start_utc, b.timezone))} · ${e(App.fmtLocal(b.booked_at))}</div></div></div>`).join('')
    : App.empty(e(I18N.t('v3_bookingsEmpty')));
  if (!silent && list.some(b => b.booking_id > prevMax)) App.toast(I18N.t('v3_newBadge') + ' ✨', 'success');
}

async function loadSlots() {
  const { res, data } = await App.get('/api/admin/schedule');
  if (!res.ok || !data) return;
  slotsData = data;
  renderSlots();
}

async function loadStudents() {
  const { res, data } = await App.get('/api/admin/students');
  const box = document.getElementById('student-list');
  if (!res.ok || !Array.isArray(data)) { box.innerHTML = App.empty(e(I18N.t('v3_loadFailed'))); return; }
  box.innerHTML = data.length ? `<div class="table-scroll"><table class="data">
    <thead><tr><th>${e(I18N.t('registerDisplayName'))}</th><th>${e(I18N.t('registerUsername'))}</th><th>${e(I18N.t('registerPhone'))}</th><th>${e(I18N.t('v3_ovBookings'))}</th></tr></thead>
    <tbody>${data.map(s => `<tr><td><strong>${e(s.display_name)}</strong></td><td>${e(s.username)}</td><td>${e(s.phone || '—')}</td><td>${s.bookingCount}</td></tr>`).join('')}</tbody></table></div>`
    : App.empty(e(I18N.t('v3_studentsEmpty')));
}

// ---------------------------------------------------------------- course editor
function localDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isGoogleMapsUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    const ok = h === 'google.com' || h.endsWith('.google.com') ||
      /^google\.(co|com)\.[a-z]{2}$/.test(h) || h === 'goo.gl' || h.endsWith('.goo.gl');
    if (!ok) return false;
    return h.includes('goo.gl') ? true : u.pathname.startsWith('/maps');
  } catch (_) { return false; }
}

function fieldHtml(key, label, control, { full = false, req = false, hint = '' } = {}) {
  return `<div class="field ${full ? 'full' : ''}" data-key="${key}">
    <label for="cf-${key}">${e(label)}${req ? `<span class="req">${e(I18N.t('v3_required'))}</span>` : `<span class="opt">${e(I18N.t('v3_formOptional'))}</span>`}</label>
    ${control}
    ${hint ? `<div class="field-hint">${e(hint)}</div>` : ''}
    <div class="field-error"></div>
  </div>`;
}

async function openCourseEditor(courseId = null) {
  const c = courseId ? myCourses.find(x => x.id === courseId) : null;
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tz = c ? c.timezone : (coursesConfig.timezones.includes(detected) ? detected : 'Asia/Bangkok');
  const tzOptions = coursesConfig.timezones.map(t =>
    `<option value="${e(t)}" ${t === tz ? 'selected' : ''}>${e(t)}</option>`).join('');
  const statusOptions = coursesConfig.runStatuses.map(s =>
    `<option value="${s}" ${(c ? c.run_status : 'confirmed') === s ? 'selected' : ''}>${e(App.statusText(s))}</option>`).join('');

  const html = `
  <div class="form-grid">
    ${fieldHtml('title', I18N.t('v3_formTitle'),
      `<input id="cf-title" maxlength="80" value="${e(c ? c.title : '')}" placeholder="e.g. Conversational English">`, { full: true, req: true })}
    ${fieldHtml('notice', I18N.t('v3_formNotice'),
      `<textarea id="cf-notice" maxlength="200" placeholder="Max 100 characters">${e(c ? c.notice : '')}</textarea>
       <div class="counter" id="cf-counter">0 / ${coursesConfig.maxNoticeLength}</div>`,
      { full: true, hint: I18N.t('v3_formNoticeHint') })}

    <div class="form-section-title">📍 ${e(I18N.t('v3_formGoogleSection'))}</div>
    ${fieldHtml('timezone', I18N.t('v3_formTimezone'), `<select id="cf-timezone">${tzOptions}</select>`, { req: true })}
    ${fieldHtml('lesson_date', I18N.t('v3_formDate'), `<input type="date" id="cf-lesson_date" value="${e(c ? c.lesson_date : localDateOffset(1))}">`, { req: true })}
    ${fieldHtml('start_time', I18N.t('v3_formStart'), `<input type="time" id="cf-start_time" value="${e(c ? c.start_time : '10:00')}">`, { req: true })}
    ${fieldHtml('end_time', I18N.t('v3_formEnd'), `<input type="time" id="cf-end_time" value="${e(c ? c.end_time : '11:00')}">`, { req: true })}
    ${fieldHtml('place_name', I18N.t('v3_formPlace'), `<input id="cf-place_name" maxlength="120" value="${e(c ? c.place_name : '')}" placeholder="e.g. Sukhumvit Coffee Lab, Bangkok">`, { full: true, req: true })}
    ${fieldHtml('google_maps_url', I18N.t('v3_formGoogle'),
      `<input type="url" id="cf-google_maps_url" value="${e(c ? c.google_maps_url : '')}" placeholder="https://maps.app.goo.gl/… or https://www.google.com/maps/…">
       <div class="field-hint">${e(I18N.t('v3_formGoogleHint'))}</div>
       <button class="btn btn-ghost btn-sm" type="button" style="align-self:flex-start;margin-top:8px" onclick="checkMapLink()">🔗 ${e(I18N.t('v3_formGooglePreview'))}</button>`, { full: true, req: true })}

    <div class="form-section-title">⚙️ ${e(I18N.t('v3_formRunStatus'))}</div>
    ${fieldHtml('capacity', I18N.t('v3_formCapacity'), `<input type="number" id="cf-capacity" min="1" max="50" value="${c ? c.capacity : 4}">`, { req: true })}
    ${fieldHtml('run_status', I18N.t('v3_formRunStatus'), `<select id="cf-run_status">${statusOptions}</select>`, { req: true })}
    ${fieldHtml('status_note', I18N.t('v3_formStatusNote'), `<input id="cf-status_note" maxlength="200" value="${e(c ? c.status_note : '')}">`, { full: true })}
  </div>`;

  App.showModal({
    title: c ? I18N.t('v3_editCourse') : I18N.t('v3_newCourse'),
    html, wide: true,
    buttons: [
      { label: I18N.t('v3_cancel'), style: 'ghost', close: true },
      { label: I18N.t('v3_save'), style: 'primary', close: false, onClick: root => submitCourse(courseId, root) }
    ]
  });
  const noticeEl = document.getElementById('cf-notice');
  const counter = document.getElementById('cf-counter');
  const updateCounter = () => {
    const n = Array.from(noticeEl.value).length;
    counter.textContent = `${n} / ${coursesConfig.maxNoticeLength}`;
    counter.classList.toggle('over', n > coursesConfig.maxNoticeLength);
  };
  noticeEl.addEventListener('input', updateCounter);
  updateCounter();
}

function checkMapLink() {
  const url = document.getElementById('cf-google_maps_url').value.trim();
  if (!isGoogleMapsUrl(url)) { App.toast(I18N.t('v3_err_googleInvalid'), 'error'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function readForm(root) {
  const v = id => (root.querySelector(`#cf-${id}`) || {}).value?.trim() || '';
  return {
    title: v('title'), notice: v('notice'), timezone: v('timezone'),
    lesson_date: v('lesson_date'), start_time: v('start_time'), end_time: v('end_time'),
    place_name: v('place_name'), google_maps_url: v('google_maps_url'),
    capacity: Number(v('capacity')), run_status: v('run_status'), status_note: v('status_note')
  };
}

function validateForm(body) {
  const f = {};
  const len = s => Array.from(String(s || '')).length;
  if (len(body.title) < 2 || len(body.title) > 80) f.title = 'title';
  if (len(body.notice) > coursesConfig.maxNoticeLength) f.notice = 'noticeTooLong';
  if (!body.timezone) f.timezone = 'timezoneRequired';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.lesson_date)) f.lesson_date = 'dateInvalid';
  const clock = s => /^\d{2}:\d{2}$/.test(s);
  if (!clock(body.start_time) || !clock(body.end_time)) {
    f.start_time = 'timeInvalid'; f.end_time = 'timeInvalid';
  } else if (body.end_time <= body.start_time) {
    f.start_time = 'timeOrder'; f.end_time = 'timeOrder';
  }
  if (len(body.place_name) < 2 || len(body.place_name) > 120) f.place_name = 'placeRequired';
  if (!body.google_maps_url) f.google_maps_url = 'googleRequired';
  else if (!isGoogleMapsUrl(body.google_maps_url)) f.google_maps_url = 'googleInvalid';
  if (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 50) f.capacity = 'capacityInvalid';
  return f;
}

function showFormErrors(root, fields) {
  root.querySelectorAll('.field').forEach(el => {
    el.classList.remove('invalid');
    el.querySelector('.field-error').textContent = '';
  });
  for (const [key, code] of Object.entries(fields)) {
    const el = root.querySelector(`.field[data-key="${key}"]`);
    if (el) {
      el.classList.add('invalid');
      const msg = I18N.t(`v3_err_${code}`);
      el.querySelector('.field-error').textContent = msg === `v3_err_${code}` ? code : msg;
    }
  }
  const first = root.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
  if (first) first.focus();
}

async function submitCourse(courseId, root) {
  const body = readForm(root);
  const fields = validateForm(body);
  if (Object.keys(fields).length) { showFormErrors(root, fields); return; }
  const saveBtn = [...root.querySelectorAll('.modal-foot .btn')].pop();
  if (saveBtn) saveBtn.disabled = true;
  const { res, data } = courseId
    ? await App.put(`/api/courses/${courseId}`, body)
    : await App.post('/api/courses', body);
  if (saveBtn) saveBtn.disabled = false;
  if (!res.ok) {
    if (data && data.fields) showFormErrors(root, data.fields);
    App.toast((data && data.error) || I18N.t('v3_loadFailed'), 'error');
    return;
  }
  App.closeModal();
  App.toast(data.message || I18N.t('v3_saved'), 'success');
  await Promise.all([loadMyCourses(), loadOverview()]);
}

// ---------------------------------------------------------------- list actions
document.addEventListener('click', async ev => {
  const edit = ev.target.closest('[data-edit]');
  if (edit) { openCourseEditor(Number(edit.dataset.edit)); return; }
  const del = ev.target.closest('[data-delete]');
  if (del) {
    const id = Number(del.dataset.delete);
    const yes = await App.confirm({ title: I18N.t('v3_delete'), html: App.esc(I18N.t('v3_deleteConfirm')), danger: true, confirmText: I18N.t('v3_delete') });
    if (!yes) return;
    const { res, data } = await App.del(`/api/courses/${id}`);
    App.toast((data && (data.message || data.error)) || I18N.t('v3_loadFailed'), res.ok ? 'success' : 'error');
    if (res.ok) { loadMyCourses(); loadOverview(); }
  }
});

document.addEventListener('change', async ev => {
  const sel = ev.target.closest('[data-status]');
  if (!sel) return;
  const { res, data } = await App.post(`/api/courses/${sel.dataset.status}/status`, { status: sel.value });
  App.toast((data && (data.message || data.error)) || I18N.t('v3_loadFailed'), res.ok ? 'success' : 'error');
  loadMyCourses();
  loadOverview();
});

// ---------------------------------------------------------------- weekly slots
function renderSlots() {
  if (!slotsData) return;
  const { timeSlots, slots } = slotsData;
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + adminWeekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
  const short = I18N.getDayShortNames();
  document.getElementById('admin-week-range').textContent = I18N.formatWeekRange(dates[0], dates[6]);
  document.getElementById('admin-grid-header').innerHTML = `<th>${e(I18N.t('scheduleTimeHeader'))}</th>` +
    dates.map((d, i) => `<th><div class="th-day">${e(short[i])}</div><div class="th-date">${e(I18N.formatDateShort(d))}</div></th>`).join('');
  const map = {};
  for (const s of slots) map[`${s.day_of_week}-${s.time_slot}`] = s;
  document.getElementById('admin-grid-body').innerHTML = timeSlots.map(ts => {
    const cells = dates.map((_, di) => {
      const s = map[`${di}-${ts}`];
      if (!s) return '<td>—</td>';
      const badge = s.status === 'available'
        ? `<span class="slot-badge slot-available">${e(I18N.t('slotAvailable'))}</span>`
        : s.status === 'booked'
          ? `<span class="slot-badge slot-booked">${e(s.booked_name || I18N.t('slotBooked'))}</span>`
          : `<span class="slot-badge slot-not">N/A</span>`;
      const action = s.status === 'available'
        ? `<button class="btn btn-ghost btn-sm" style="margin-top:5px;padding:3px 6px;min-height:26px;font-size:10.5px" onclick="updateSlot(${s.id},'not_available')">${e(I18N.t('adminSetUnavailable'))}</button>`
        : s.status === 'not_available'
          ? `<button class="btn btn-ghost btn-sm" style="margin-top:5px;padding:3px 6px;min-height:26px;font-size:10.5px" onclick="updateSlot(${s.id},'available')">${e(I18N.t('adminSetAvailable'))}</button>`
          : `<button class="btn btn-outline-danger btn-sm" style="margin-top:5px;padding:3px 6px;min-height:26px;font-size:10.5px" onclick="removeBooking(${s.id})">${e(I18N.t('adminRemoveBooking'))}</button>`;
      return `<td>${badge}<br>${action}</td>`;
    }).join('');
    const [a, b] = ts.split('-');
    return `<tr><td>${e(I18N.formatTime(a))}<br>${e(I18N.formatTime(b))}</td>${cells}</tr>`;
  }).join('');
}
function adminPrevWeek() { adminWeekOffset--; renderSlots(); }
function adminNextWeek() { adminWeekOffset++; renderSlots(); }
function adminGoToday() { adminWeekOffset = 0; renderSlots(); }

async function updateSlot(id, status) {
  const { res, data } = await App.post('/api/admin/update-slot', { slotId: id, status });
  App.toast((data && (data.message || data.error)) || (res.ok ? I18N.t('adminUpdated') : I18N.t('v3_loadFailed')), res.ok ? 'success' : 'error');
  if (res.ok) loadSlots();
}
async function removeBooking(id) {
  const yes = await App.confirm({ title: I18N.t('adminRemoveBooking'), html: App.esc(I18N.t('adminRemoveConfirm')), danger: true, confirmText: I18N.t('v3_confirm') });
  if (!yes) return;
  const { res, data } = await App.post('/api/admin/remove-booking', { slotId: id });
  App.toast((data && (data.message || data.error)) || I18N.t('v3_loadFailed'), res.ok ? 'success' : 'error');
  if (res.ok) loadSlots();
}

// ---------------------------------------------------------------- site settings
async function loadSettings() {
  const { res, data } = await App.get('/api/settings');
  if (!res.ok || !data) { App.toast(I18N.t('v3_loadFailed'), 'error'); return; }
  const fill = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
  fill('setting-title', data.site_title);
  fill('setting-phone', data.site_phone);
  fill('setting-email', data.site_email);
  fill('setting-line', data.site_line_url);
}

async function handleSaveSettings(ev) {
  ev.preventDefault();
  const btn = document.getElementById('settings-save-btn');
  const body = {
    site_title: document.getElementById('setting-title').value.trim(),
    site_phone: document.getElementById('setting-phone').value.trim(),
    site_email: document.getElementById('setting-email').value.trim(),
    site_line_url: document.getElementById('setting-line').value.trim()
  };
  btn.disabled = true;
  const { res, data } = await App.put('/api/settings', body);
  btn.disabled = false;
  App.toast(
    (data && (data.message || data.error)) || (res.ok ? I18N.t('v3_saved') : I18N.t('v3_loadFailed')),
    res.ok ? 'success' : 'error'
  );
}

// ---------------------------------------------------------------- boot
App.boot({
  requireTeacher: true,
  onReady: async () => {
    App.setActiveNav('admin');
    await loadConfig();
    await Promise.all([loadOverview(), loadMyCourses(), loadBookings(true), loadSlots(), loadStudents()]);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadBookings(false);
      loadOverview();
      if (activeTab === 'publish') loadMyCourses();
    }, 15000);
  },
  onLangChange: () => {
    loadMyCourses();
    loadBookings(true);
    renderSlots();
  }
});

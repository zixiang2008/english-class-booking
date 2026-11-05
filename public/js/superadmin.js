/**
 * superadmin.js — v3.1 super-admin console.
 * Highest privilege in the system: account management, restrictions,
 * class moderation and the audit trail.
 */
let saUsers = [];
let saCourses = [];
let saTab = 'overview';

const saT = (key, params) => I18N.t(key, params);
const saEsc = v => App.esc(v);

// ---------------------------------------------------------------- modal input
function saAskText({ title, label, placeholder = '', value = '', confirmText, danger = false, hint = '' }) {
  return new Promise(resolve => {
    App.showModal({
      title,
      html: `
        <div class="field">
          <label for="sa-prompt-input">${saEsc(label)}</label>
          <input id="sa-prompt-input" value="${saEsc(value)}" placeholder="${saEsc(placeholder)}" maxlength="200">
          ${hint ? `<p class="list-sub" style="margin-top:6px">${saEsc(hint)}</p>` : ''}
        </div>`,
      buttons: [
        { label: saT('v3_cancel'), style: 'ghost', close: true, onClick: () => resolve(null) },
        {
          label: confirmText || saT('v3_saConfirm'),
          style: danger ? 'danger' : 'primary',
          close: true,
          onClick: root => resolve(String((root.querySelector('#sa-prompt-input') || {}).value || '').trim())
        }
      ]
    });
    const input = document.getElementById('sa-prompt-input');
    if (input) setTimeout(() => input.focus(), 60);
  });
}

function saAskMute() {
  return new Promise(resolve => {
    const opts = [
      { v: '1', k: 'v3_saMute1h' }, { v: '24', k: 'v3_saMute24h' },
      { v: '168', k: 'v3_saMute7d' }, { v: '720', k: 'v3_saMute30d' },
      { v: '-1', k: 'v3_saMuteForever' }
    ].map(o => `<option value="${o.v}">${saEsc(saT(o.k))}</option>`).join('');
    App.showModal({
      title: saT('v3_saMute'),
      html: `
        <div class="field">
          <label for="sa-mute-hours">${saEsc(saT('v3_saMuteDuration'))}</label>
          <select id="sa-mute-hours">${opts}</select>
        </div>
        <div class="field" style="margin-top:12px">
          <label for="sa-mute-reason">${saEsc(saT('v3_saReasonLabel'))}</label>
          <input id="sa-mute-reason" maxlength="200" placeholder="${saEsc(saT('v3_saReasonPlaceholder'))}">
        </div>`,
      buttons: [
        { label: saT('v3_cancel'), style: 'ghost', close: true, onClick: () => resolve(null) },
        {
          label: saT('v3_saMute'), style: 'danger', close: true,
          onClick: root => resolve({
            hours: Number((root.querySelector('#sa-mute-hours') || {}).value || '24'),
            reason: String((root.querySelector('#sa-mute-reason') || {}).value || '').trim()
          })
        }
      ]
    });
  });
}

// ---------------------------------------------------------------- tabs
function saSwitchTab(tab) {
  saTab = tab;
  document.querySelectorAll('#admin-tabs .admin-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  ['overview', 'users', 'courses', 'log'].forEach(t =>
    document.getElementById(`sa-panel-${t}`).classList.toggle('hidden', t !== tab));
  if (tab === 'overview') saLoadOverview();
  if (tab === 'users') saLoadUsers();
  if (tab === 'courses') saLoadCourses();
  if (tab === 'log') saLoadLog();
}

// ---------------------------------------------------------------- overview
async function saLoadOverview() {
  const { res, data } = await App.get('/api/superadmin/overview');
  if (!res.ok || !data) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('sa-stat-users', data.users.total);
  set('sa-stat-teachers', data.users.teachers);
  set('sa-stat-students', data.users.students);
  set('sa-stat-admins', data.users.admins);
  set('sa-stat-banned', data.users.banned);
  set('sa-stat-muted', data.users.muted);
  set('sa-stat-courses', data.courses.total);
  set('sa-stat-bookings', data.bookings);

  const box = document.getElementById('sa-overview-actions');
  box.classList.remove('loading');
  box.innerHTML = data.recentActions.length
    ? data.recentActions.map(saActionRow).join('')
    : App.empty(saEsc(saT('v3_saEmptyLog')));
}

function saActionRow(a) {
  const when = App.fmtLocal(a.created_at);
  const target = a.target_name
    ? ` → <strong>${saEsc(a.target_name)}</strong>`
    : (a.target_course_id ? ` → #${a.target_course_id}` : '');
  return `<div class="list-row">
    <div class="list-main">
      <div class="list-title">${saEsc(saActionLabel(a.action))}${target}</div>
      <div class="list-sub">${saEsc(a.admin_name || 'admin')} · ${saEsc(when)}${a.detail ? ` · ${saEsc(a.detail)}` : ''}</div>
    </div>
  </div>`;
}

function saActionLabel(action) {
  const map = {
    ban: 'v3_saBan', unban: 'v3_saUnban', mute: 'v3_saMute', unmute: 'v3_saUnmute',
    publish_block: 'v3_saBlockPublish', publish_allow: 'v3_saAllowPublish',
    promote: 'v3_saPromote', demote: 'v3_saDemote',
    reset_pin: 'v3_saResetPin', delete_user: 'v3_saDelete',
    course_takedown: 'v3_saTakedown', course_restore: 'v3_saRestore'
  };
  return saT(map[action] || 'v3_saTabLog');
}

// ---------------------------------------------------------------- users
async function saLoadUsers() {
  const q = (document.getElementById('sa-user-search') || {}).value || '';
  const role = (document.getElementById('sa-user-role') || {}).value || '';
  const filter = (document.getElementById('sa-user-filter') || {}).value || '';
  const url = `/api/superadmin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&filter=${encodeURIComponent(filter)}`;
  const { res, data } = await App.get(url);
  const box = document.getElementById('sa-user-list');
  box.classList.remove('loading');
  if (!res.ok || !data) { box.innerHTML = App.empty(saEsc(saT('v3_loadFailed'))); return; }
  saUsers = data.users;
  box.innerHTML = saUsers.length
    ? saUsers.map(saUserCard).join('')
    : App.empty(saEsc(saT('v3_saEmptyUsers')));
}

function saUserCard(u) {
  const badges = [];
  if (u.isAdmin) badges.push(`<span class="badge badge-admin">🛡️ ${saEsc(saT('v3_saBadgeAdmin'))}</span>`);
  badges.push(`<span class="badge">${saEsc(u.role === 'teacher' ? saT('v3_saBadgeTeacher') : saT('v3_saBadgeStudent'))}</span>`);
  if (u.banned) badges.push(`<span class="badge badge-cancelled">⛔ ${saEsc(saT('v3_saBadgeBanned'))}</span>`);
  if (u.muted) badges.push(`<span class="badge badge-pending">🔇 ${saEsc(saT('v3_saBadgeMuted'))}</span>`);
  if (u.publishBlocked) badges.push(`<span class="badge badge-pending">🚫 ${saEsc(saT('v3_saBadgeBlocked'))}</span>`);

  const notes = [];
  if (u.banned && u.banReason) notes.push(`⛔ ${saEsc(u.banReason)}`);
  if (u.muted && u.mutedUntil) {
    notes.push(`🔇 ${saEsc(saT('v3_saUntil', { date: App.fmtLocal(u.mutedUntil) }))}${u.muteReason ? ` · ${saEsc(u.muteReason)}` : ''}`);
  }
  if (u.publishBlocked && u.publishBlockReason) notes.push(`🚫 ${saEsc(u.publishBlockReason)}`);

  const actions = [];
  const isSelf = App.user && App.user.id === u.id;

  if (!isSelf) {
    if (u.banned) {
      actions.push(`<button class="btn btn-soft btn-sm" type="button" data-sa="unban" data-id="${u.id}">${saEsc(saT('v3_saUnban'))}</button>`);
    } else {
      actions.push(`<button class="btn btn-outline-danger btn-sm" type="button" data-sa="ban" data-id="${u.id}">${saEsc(saT('v3_saBan'))}</button>`);
    }
    if (u.muted) {
      actions.push(`<button class="btn btn-ghost btn-sm" type="button" data-sa="unmute" data-id="${u.id}">${saEsc(saT('v3_saUnmute'))}</button>`);
    } else {
      actions.push(`<button class="btn btn-ghost btn-sm" type="button" data-sa="mute" data-id="${u.id}">${saEsc(saT('v3_saMute'))}</button>`);
    }
    if (u.role === 'teacher') {
      actions.push(u.publishBlocked
        ? `<button class="btn btn-ghost btn-sm" type="button" data-sa="allow-publish" data-id="${u.id}">${saEsc(saT('v3_saAllowPublish'))}</button>`
        : `<button class="btn btn-ghost btn-sm" type="button" data-sa="block-publish" data-id="${u.id}">${saEsc(saT('v3_saBlockPublish'))}</button>`);
    }
    if (!u.isAdmin) {
      actions.push(`<button class="btn btn-ghost btn-sm" type="button" data-sa="promote" data-id="${u.id}">${saEsc(saT('v3_saPromote'))}</button>`);
    } else {
      actions.push(`<button class="btn btn-ghost btn-sm" type="button" data-sa="demote" data-id="${u.id}">${saEsc(saT('v3_saDemote'))}</button>`);
    }
    actions.push(`<button class="btn btn-ghost btn-sm" type="button" data-sa="pin" data-id="${u.id}">${saEsc(saT('v3_saResetPin'))}</button>`);
    actions.push(`<button class="btn btn-outline-danger btn-sm" type="button" data-sa="delete" data-id="${u.id}">🗑 ${saEsc(saT('v3_saDelete'))}</button>`);
  } else {
    actions.push(`<span class="badge">${saEsc(saT('v3_saYou'))}</span>`);
  }

  return `<div class="list-row sa-user" data-id="${u.id}">
    <div class="list-main">
      <div class="list-title">${saEsc(u.displayName)} ${badges.join(' ')}</div>
      <div class="list-sub">@${saEsc(u.username)}${u.phone ? ` · ${saEsc(u.phone)}` : ''} · ${saEsc(saT('v3_saCounts', { courses: u.courseCount, bookings: u.bookingCount }))}</div>
      ${notes.length ? `<div class="list-sub sa-note">${notes.join(' · ')}</div>` : ''}
    </div>
    <div class="list-actions">${actions.join('')}</div>
  </div>`;
}

async function saUserAction(action, id) {
  const user = saUsers.find(u => u.id === Number(id));
  if (!user) return;
  const name = user.displayName;

  if (action === 'ban') {
    const reason = await saAskText({
      title: `${saT('v3_saBan')} · ${name}`,
      label: saT('v3_saReasonLabel'), placeholder: saT('v3_saReasonPlaceholder'),
      confirmText: saT('v3_saBan'), danger: true,
      hint: saT('v3_saBanHint')
    });
    if (reason === null) return;
    if (!reason) return App.toast(saT('v3_saReasonRequired'), 'error');
    return saPost(`/api/superadmin/users/${id}/ban`, { reason });
  }

  if (action === 'unban') return saPost(`/api/superadmin/users/${id}/unban`, {});

  if (action === 'mute') {
    const answer = await saAskMute();
    if (!answer) return;
    return saPost(`/api/superadmin/users/${id}/mute`, answer);
  }
  if (action === 'unmute') return saPost(`/api/superadmin/users/${id}/mute`, { hours: 0 });

  if (action === 'block-publish') {
    const reason = await saAskText({
      title: `${saT('v3_saBlockPublish')} · ${name}`,
      label: saT('v3_saReasonLabel'), placeholder: saT('v3_saReasonPlaceholder'),
      confirmText: saT('v3_saBlockPublish'), danger: true
    });
    if (reason === null) return;
    return saPost(`/api/superadmin/users/${id}/publish-block`, { blocked: true, reason });
  }
  if (action === 'allow-publish') return saPost(`/api/superadmin/users/${id}/publish-block`, { blocked: false });

  if (action === 'promote') {
    const ok = await App.confirm({
      title: saT('v3_saPromote'),
      html: saEsc(saT('v3_saPromoteConfirm', { name })),
      confirmText: saT('v3_saPromote')
    });
    if (!ok) return;
    return saPost(`/api/superadmin/users/${id}/admin`, { isAdmin: true });
  }
  if (action === 'demote') {
    const ok = await App.confirm({
      title: saT('v3_saDemote'),
      html: saEsc(saT('v3_saDemoteConfirm', { name })),
      confirmText: saT('v3_saDemote'), danger: true
    });
    if (!ok) return;
    return saPost(`/api/superadmin/users/${id}/admin`, { isAdmin: false });
  }

  if (action === 'pin') {
    const pin = await saAskText({
      title: `${saT('v3_saResetPin')} · ${name}`,
      label: saT('v3_saPinLabel'), placeholder: '1234',
      confirmText: saT('v3_saResetPin'), hint: saT('v3_saPinHint')
    });
    if (pin === null) return;
    if (!/^\d{4}$/.test(pin)) return App.toast(saT('v3_saPinHint'), 'error');
    return saPost(`/api/superadmin/users/${id}/pin`, { pin });
  }

  if (action === 'delete') {
    const ok = await App.confirm({
      title: saT('v3_saDelete'),
      html: saEsc(saT('v3_saDeleteConfirm', { name })),
      confirmText: saT('v3_saDelete'), danger: true
    });
    if (!ok) return;
    return saDelete(`/api/superadmin/users/${id}`);
  }
}

async function saPost(url, body) {
  const { res, data } = await App.post(url, body);
  if (!res.ok) return App.toast((data && data.error) || saT('v3_loadFailed'), 'error');
  App.toast((data && data.message) || 'OK', 'success');
  await saLoadUsers();
  await saLoadOverview();
}

async function saDelete(url) {
  const { res, data } = await App.del(url);
  if (!res.ok) return App.toast((data && data.error) || saT('v3_loadFailed'), 'error');
  App.toast((data && data.message) || 'OK', 'success');
  await saLoadUsers();
  await saLoadOverview();
}

// ---------------------------------------------------------------- courses
async function saLoadCourses() {
  const q = (document.getElementById('sa-course-search') || {}).value || '';
  const status = (document.getElementById('sa-course-status') || {}).value || '';
  const { res, data } = await App.get(`/api/superadmin/courses?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
  const box = document.getElementById('sa-course-list');
  box.classList.remove('loading');
  if (!res.ok || !data) { box.innerHTML = App.empty(saEsc(saT('v3_loadFailed'))); return; }
  saCourses = data.courses;
  box.innerHTML = saCourses.length
    ? saCourses.map(saCourseCard).join('')
    : App.empty(saEsc(saT('v3_saEmptyCourses')));
}

function saCourseCard(c) {
  const takedown = c.runStatus === 'cancelled';
  return `<div class="list-row">
    <div class="list-main">
      <div class="list-title">${saEsc(c.title)}
        <span class="badge badge-${saEsc(c.runStatus)}">${App.statusIcon(c.runStatus)} ${saEsc(App.statusText(c.runStatus))}</span>
        ${c.isPast ? `<span class="badge">${saEsc(saT('v3_pastClass'))}</span>` : ''}</div>
      <div class="list-sub">👩‍🏫 ${saEsc(c.teacherName)} (@${saEsc(c.teacherUsername)}) · 🕐 ${saEsc(App.fmtInZone(c.startUtc, c.timezone))}</div>
      <div class="list-sub">📍 ${saEsc(c.placeName)} · 👥 ${c.bookedCount} · ${saEsc(c.timezone)}</div>
      ${c.statusNote ? `<div class="list-sub">📝 ${saEsc(c.statusNote)}</div>` : ''}
    </div>
    <div class="list-actions">
      <a class="btn btn-ghost btn-sm" href="${saEsc(c.googleMapsUrl)}" target="_blank" rel="noopener noreferrer">🗺️</a>
      ${takedown
        ? `<button class="btn btn-soft btn-sm" type="button" data-sa-course="restore" data-id="${c.id}">${saEsc(saT('v3_saRestore'))}</button>`
        : `<button class="btn btn-outline-danger btn-sm" type="button" data-sa-course="takedown" data-id="${c.id}">${saEsc(saT('v3_saTakedown'))}</button>`}
    </div>
  </div>`;
}

async function saCourseAction(action, id) {
  const course = saCourses.find(c => c.id === Number(id));
  if (!course) return;
  if (action === 'takedown') {
    const reason = await saAskText({
      title: `${saT('v3_saTakedown')} · ${course.title}`,
      label: saT('v3_saReasonLabel'), placeholder: saT('v3_saReasonPlaceholder'),
      confirmText: saT('v3_saTakedown'), danger: true,
      hint: saT('v3_saTakedownHint')
    });
    if (reason === null) return;
    if (!reason) return App.toast(saT('v3_saReasonRequired'), 'error');
    return saPost(`/api/superadmin/courses/${id}/takedown`, { reason });
  }
  const ok = await App.confirm({
    title: saT('v3_saRestore'),
    html: saEsc(saT('v3_saRestoreConfirm', { title: course.title })),
    confirmText: saT('v3_saRestore')
  });
  if (!ok) return;
  const { res, data } = await App.post(`/api/superadmin/courses/${id}/restore`, {});
  if (!res.ok) return App.toast((data && data.error) || saT('v3_loadFailed'), 'error');
  App.toast(data.message || 'OK', 'success');
  await saLoadCourses();
}

// ---------------------------------------------------------------- log
async function saLoadLog() {
  const { res, data } = await App.get('/api/superadmin/actions?limit=100');
  const box = document.getElementById('sa-log-list');
  box.classList.remove('loading');
  if (!res.ok || !data) { box.innerHTML = App.empty(saEsc(saT('v3_loadFailed'))); return; }
  box.innerHTML = data.actions.length
    ? data.actions.map(saActionRow).join('')
    : App.empty(saEsc(saT('v3_saEmptyLog')));
}

// ---------------------------------------------------------------- wiring
document.addEventListener('click', e => {
  const userBtn = e.target.closest('[data-sa]');
  if (userBtn) {
    e.preventDefault();
    saUserAction(userBtn.dataset.sa, userBtn.dataset.id);
    return;
  }
  const courseBtn = e.target.closest('[data-sa-course]');
  if (courseBtn) {
    e.preventDefault();
    saCourseAction(courseBtn.dataset.saCourse, courseBtn.dataset.id);
  }
});

App.boot({
  requireAdmin: true,
  onReady: () => {
    App.setActiveNav('superadmin');
    saLoadOverview();
  },
  onLangChange: () => {
    if (saTab === 'users') saLoadUsers();
    else if (saTab === 'courses') saLoadCourses();
    else if (saTab === 'log') saLoadLog();
    else saLoadOverview();
  }
});

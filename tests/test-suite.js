/**
 * v3 integration test suite — self-contained.
 *
 * Boots the real Express app against an isolated temporary SQLite database on a
 * free port, then exercises auth, multi-teacher publishing, notice board rules,
 * the required Google Maps address, real UTC/timezone conversion, booking,
 * live teacher dashboards, status changes, update history, calendar feeds,
 * i18n errors and static pages.
 *
 * Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `ecb-test-${process.pid}-${Date.now()}.db`);
const port = 3400 + (process.pid % 400);
process.env.DB_PATH = dbPath;
process.env.PORT = String(port);
process.env.SESSION_SECRET = 'integration-test-secret';
process.env.TEACHER_INVITE_CODE = 'TEACHER2026';
delete process.env.NODE_ENV; // keep session cookies non-secure over http

const { startServer } = require('../server');
const { zonedTimeToUtc, toICSUTC, gmtOffsetLabel } = require('../lib/time');
const { validateCourse, isGoogleMapsUrl, MAX_NOTICE_LENGTH } = require('../lib/course-validation');

let BASE = '';
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log(`  ❌ ${name}\n     ${err.message}`);
  }
}

function client(lang) {
  let cookie = '';
  const headersFor = (body, extra) => {
    const h = { ...(extra || {}) };
    if (lang) h['X-Language'] = lang;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    return h;
  };
  const call = async (method, url, body, extra) => {
    const res = await fetch(BASE + url, {
      method,
      headers: headersFor(body, extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/connect\.sid=[^;]+/);
      if (m) cookie = m[0];
    }
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* keep raw text */ }
    return { status: res.status, data, text, headers: res.headers };
  };
  return {
    cookie: () => cookie,
    clearCookie: () => { cookie = ''; },
    get: (u, h) => call('GET', u, undefined, h),
    post: (u, b, h) => call('POST', u, b === undefined ? {} : b, h),
    put: (u, b, h) => call('PUT', u, b === undefined ? {} : b, h),
    del: (u, h) => call('DELETE', u, undefined, h)
  };
}

const validCourse = (overrides = {}) => ({
  title: 'Integration Test Class',
  notice: 'Bring your notebook. 请带课本。',
  timezone: 'Asia/Bangkok',
  lesson_date: '2026-12-01',
  start_time: '09:00',
  end_time: '10:00',
  place_name: 'Test Studio, Bangkok',
  google_maps_url: 'https://maps.app.goo.gl/AbCdEf12345',
  capacity: 3,
  run_status: 'confirmed',
  status_note: '',
  ...overrides
});

async function main() {
  const server = await startServer();
  BASE = `http://127.0.0.1:${server.address().port}`;

  const anon = client();
  const teacher = client();
  const teacher2 = client();
  const student = client();
  const student2 = client();
  const zh = client('zh');

  let courseId = null;

  console.log('\n── Unit: time & validation ──────────────────────────────');
  await test('zonedTimeToUtc: Bangkok 10:00 → 03:00Z', () => {
    assert.strictEqual(zonedTimeToUtc('2026-11-06', '10:00', 'Asia/Bangkok').toISOString(), '2026-11-06T03:00:00.000Z');
  });
  await test('zonedTimeToUtc: New York summer (EDT) 09:00 → 13:00Z', () => {
    assert.strictEqual(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  });
  await test('zonedTimeToUtc: New York winter (EST) 09:00 → 14:00Z', () => {
    assert.strictEqual(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York').toISOString(), '2026-01-15T14:00:00.000Z');
  });
  await test('toICSUTC / gmtOffsetLabel formatting', () => {
    assert.strictEqual(toICSUTC('2026-11-06T03:00:00.000Z'), '20261106T030000Z');
    assert.strictEqual(gmtOffsetLabel('Asia/Bangkok', new Date('2026-11-06T03:00:00Z')), 'GMT+7');
  });
  await test('isGoogleMapsUrl accepts only real Google Maps HTTPS links', () => {
    assert.ok(isGoogleMapsUrl('https://maps.app.goo.gl/abc123'));
    assert.ok(isGoogleMapsUrl('https://www.google.com/maps/place/Bangkok'));
    assert.ok(isGoogleMapsUrl('https://google.co.th/maps/search/cafe'));
    assert.ok(!isGoogleMapsUrl('http://maps.google.com/maps/place/x'));
    assert.ok(!isGoogleMapsUrl('https://example.com/maps'));
    assert.ok(!isGoogleMapsUrl('https://evilgoogle.com/maps'));
    assert.ok(!isGoogleMapsUrl(''));
  });
  await test('notice board is capped at 100 characters', () => {
    assert.strictEqual(MAX_NOTICE_LENGTH, 100);
    assert.ok(validateCourse(validCourse({ notice: '字'.repeat(100) })).ok);
    const bad = validateCourse(validCourse({ notice: '字'.repeat(101) }));
    assert.ok(!bad.ok && bad.fields.notice);
  });
  await test('Google Maps address is mandatory and end time must follow start', () => {
    const noMap = validateCourse(validCourse({ google_maps_url: '' }));
    assert.ok(!noMap.ok && noMap.fields.google_maps_url === 'googleRequired');
    const badTime = validateCourse(validCourse({ start_time: '11:00', end_time: '10:00' }));
    assert.ok(!badTime.ok && badTime.fields.time);
  });
  await test('valid course produces a real UTC instant', () => {
    const r = validateCourse(validCourse());
    assert.ok(r.ok, JSON.stringify(r.fields));
    assert.strictEqual(r.value.start_utc, '2026-12-01T02:00:00.000Z');
    assert.strictEqual(r.value.end_utc, '2026-12-01T03:00:00.000Z');
  });

  console.log('\n── Health, static pages & auth ───────────────────────────');
  await test('GET /healthz reports v3', async () => {
    const r = await anon.get('/healthz');
    assert.strictEqual(r.status, 200);
    assert.match(r.data.version, /^3\.\d+\.\d+$/);
  });
  for (const page of ['/', '/admin.html', '/login.html', '/register.html', '/calendar.html']) {
    await test(`static page ${page} returns 200 HTML`, async () => {
      const r = await anon.get(page);
      assert.strictEqual(r.status, 200);
      assert.ok(/<!DOCTYPE html>/i.test(r.text));
    });
  }
  await test('auth config advertises teacher invite registration', async () => {
    const r = await anon.get('/api/auth/config');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.teacherRegistrationEnabled, true);
    assert.strictEqual(r.data.teacherInviteCodeRequired, true);
  });
  await test('anonymous /api/auth/me is logged out', async () => {
    const r = await anon.get('/api/auth/me');
    assert.strictEqual(r.data.loggedIn, false);
  });
  await test('login rejects a wrong PIN', async () => {
    const r = await anon.post('/api/auth/login', { username: 'teacher', password: '9999' });
    assert.strictEqual(r.status, 401);
  });
  await test('demo accounts use 4-digit PINs (teacher 1111, teacher2 2345, student 1234)', async () => {
    for (const [c, u, p] of [[teacher, 'teacher', '1111'], [teacher2, 'teacher2', '2345'], [student, 'student', '1234']]) {
      const r = await c.post('/api/auth/login', { username: u, password: p });
      assert.strictEqual(r.status, 200, `${u}: ${JSON.stringify(r.data)}`);
      assert.strictEqual(r.data.success, true);
    }
  });
  await test('/api/auth/me reflects role for each session', async () => {
    assert.strictEqual((await teacher.get('/api/auth/me')).data.user.role, 'teacher');
    assert.strictEqual((await student.get('/api/auth/me')).data.user.role, 'student');
  });
  await test('login is case-insensitive for usernames', async () => {
    for (const variant of ['TEACHER', 'Teacher', 'TeAcHeR', '  teacher  ']) {
      const c = client();
      const r = await c.post('/api/auth/login', { username: variant, password: '1111' });
      assert.strictEqual(r.status, 200, `${variant}: ${JSON.stringify(r.data)}`);
      assert.strictEqual((await c.get('/api/auth/me')).data.loggedIn, true);
    }
  });
  await test('registration rejects a username that only differs by case', async () => {
    const r = await client().post('/api/auth/register', {
      username: 'STUDENT', password: '1234', displayName: 'Clone'
    });
    assert.strictEqual(r.status, 400, JSON.stringify(r.data));
  });
  await test('registration requires a 4-digit PIN', async () => {
    const r = await client().post('/api/auth/register', { username: 'badpin', password: 'test1234', displayName: 'Bad PIN' });
    assert.strictEqual(r.status, 400);
  });
  await test('student registration works and starts a session', async () => {
    const r = await student2.post('/api/auth/register', {
      username: 'student2', password: '5678', displayName: 'Second Student', phone: '0800000000'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.user.role, 'student');
    assert.strictEqual((await student2.get('/api/auth/me')).data.loggedIn, true);
  });
  await test('wrong teacher invite code is rejected', async () => {
    const r = await client().post('/api/auth/register', {
      username: 'badteacher', password: '4321', displayName: 'Nope', teacherCode: 'WRONG'
    });
    assert.strictEqual(r.status, 400);
  });
  await test('correct teacher invite code creates a second teacher', async () => {
    const r = await client().post('/api/auth/register', {
      username: 'teacher3', password: '3456', displayName: 'Teacher Three', teacherCode: 'TEACHER2026'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.user.role, 'teacher');
  });
  await test('a mixed-case account can log in with any casing', async () => {
    const reg = await client().post('/api/auth/register', {
      username: 'MixedCase', password: '2468', displayName: 'Mixed Case'
    });
    assert.strictEqual(reg.status, 200, JSON.stringify(reg.data));
    for (const variant of ['MixedCase', 'mixedcase', 'MIXEDCASE']) {
      const r = await client().post('/api/auth/login', { username: variant, password: '2468' });
      assert.strictEqual(r.status, 200, `${variant}: ${JSON.stringify(r.data)}`);
    }
  });
  await test('logout destroys the session', async () => {
    const c = client();
    await c.post('/api/auth/login', { username: 'student', password: '1234' });
    assert.strictEqual((await c.get('/api/auth/me')).data.loggedIn, true);
    await c.post('/api/auth/logout');
    assert.strictEqual((await c.get('/api/auth/me')).data.loggedIn, false);
  });

  console.log('\n── Site settings (merged from v2.1) ───────────────────────');
  await test('public settings expose site title and contact details', async () => {
    const r = await anon.get('/api/settings');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.site_title && r.data.site_email, JSON.stringify(r.data));
    // Phone is optional: an empty value must be allowed and must not break the API.
    assert.strictEqual(typeof r.data.site_phone, 'string');
  });
  await test('students cannot update site settings', async () => {
    const r = await student.put('/api/settings', { site_title: 'Nope' });
    assert.strictEqual(r.status, 403);
  });
  await test('teacher updates site settings and the change is public', async () => {
    const r = await teacher.put('/api/settings', { site_title: 'Test Class', site_phone: '123456' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const after = await anon.get('/api/settings');
    assert.strictEqual(after.data.site_title, 'Test Class');
    assert.strictEqual(after.data.site_phone, '123456');
  });

  console.log('\n── Course config, multi-teacher board & permissions ───────');
  await test('/api/courses/config exposes timezones + 100-char limit', async () => {
    const r = await anon.get('/api/courses/config');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.timezones.includes('Asia/Bangkok'));
    assert.strictEqual(r.data.maxNoticeLength, 100);
    assert.deepStrictEqual(r.data.runStatuses, ['pending', 'confirmed', 'cancelled', 'completed']);
  });
  await test('at least two teachers with classes are listed (multi-teacher board)', async () => {
    const r = await anon.get('/api/courses/teachers');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.teachers.length >= 2);
    assert.ok(r.data.teachers.every(t => t.course_count >= 1), 'only teachers with classes are listed');
  });
  await test('demo seed has courses from two different teachers', async () => {
    const r = await anon.get('/api/courses');
    assert.strictEqual(r.status, 200);
    const ids = new Set(r.data.courses.map(c => c.teacher_id));
    assert.ok(ids.size >= 2);
    assert.ok(r.data.courses.every(c => c.google_maps_url && c.timezone && c.start_utc));
  });
  await test('anonymous publishing is rejected', async () => {
    const r = await anon.post('/api/courses', validCourse());
    assert.strictEqual(r.status, 401);
  });
  await test('students cannot publish classes', async () => {
    const r = await student.post('/api/courses', validCourse());
    assert.strictEqual(r.status, 403);
  });
  await test('API errors honour the requested language (zh)', async () => {
    const r = await zh.post('/api/courses', validCourse());
    assert.strictEqual(r.status, 401);
    assert.ok(/[\u4e00-\u9fa5]/.test(r.data.error), `expected Chinese, got: ${r.data.error}`);
  });

  console.log('\n── Publishing: notice board + mandatory Google address ────');
  await test('missing Google Maps address fails with a field error', async () => {
    const r = await teacher.post('/api/courses', validCourse({ google_maps_url: '' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.fields.google_maps_url, 'googleRequired');
  });
  await test('fake Google Maps address fails', async () => {
    const r = await teacher.post('/api/courses', validCourse({ google_maps_url: 'https://example.com/maps' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.fields.google_maps_url, 'googleInvalid');
  });
  await test('missing timezone / date / place fails', async () => {
    const r = await teacher.post('/api/courses', validCourse({ timezone: '', place_name: '' }));
    assert.strictEqual(r.status, 400);
    assert.ok(r.data.fields.timezone && r.data.fields.place_name);
  });
  await test('101-character notice is rejected, 100 accepted', async () => {
    const tooLong = await teacher.post('/api/courses', validCourse({ notice: 'a'.repeat(101) }));
    assert.strictEqual(tooLong.status, 400);
    assert.strictEqual(tooLong.data.fields.notice, 'noticeTooLong');
    const ok = await teacher.post('/api/courses', validCourse({ notice: '字'.repeat(100) }));
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
    // free the slot again so later tests can publish at the same time
    await teacher.del(`/api/courses/${ok.data.id}`);
  });
  await test('teacher publishes a complete class', async () => {
    const r = await teacher.post('/api/courses', validCourse());
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.id > 0);
    courseId = r.data.id;
  });
  await test('published class exposes real UTC time, GMT offset and calendar link', async () => {
    const r = await anon.get(`/api/courses/${courseId}`);
    assert.strictEqual(r.status, 200);
    const c = r.data.course;
    assert.strictEqual(c.start_utc, '2026-12-01T02:00:00.000Z');
    assert.strictEqual(c.gmt_offset, 'GMT+7');
    assert.strictEqual(c.notice, 'Bring your notebook. 请带课本。');
    assert.ok(c.google_calendar_url.startsWith('https://calendar.google.com/calendar/render?'));
    assert.ok(c.google_calendar_url.includes('20261201T020000Z'));
    // SQLite CURRENT_TIMESTAMP is UTC without a marker; the API must normalise
    // it so browsers don't read it as local time.
    assert.ok(/Z$/.test(c.created_at), `created_at must be ISO UTC: ${c.created_at}`);
    assert.ok(/Z$/.test(c.last_update_at), `last_update_at must be ISO UTC: ${c.last_update_at}`);
  });
  await test('a second teacher cannot edit another teacher’s class', async () => {
    const r = await teacher2.put(`/api/courses/${courseId}`, validCourse({ title: 'Hijacked' }));
    assert.strictEqual(r.status, 403);
  });
  await test('editing the notice increments revision and logs an update', async () => {
    const before = (await anon.get(`/api/courses/${courseId}`)).data.course.revision;
    const r = await teacher.put(`/api/courses/${courseId}`, validCourse({ notice: 'Room changed to 3F. 换到三楼。' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const after = (await anon.get(`/api/courses/${courseId}`)).data.course;
    assert.ok(after.revision > before);
    assert.strictEqual(after.has_update, true);
    const u = await anon.get(`/api/courses/${courseId}/updates`);
    assert.ok(u.data.updates.some(x => x.change_type === 'notice'));
  });
  await test('course list filters by teacher, status and keyword', async () => {
    const byTeacher = await anon.get(`/api/courses?teacher=${(await teacher.get('/api/auth/me')).data.user.id}`);
    assert.ok(byTeacher.data.courses.every(c => c.title === 'Integration Test Class' || c.teacher_name === 'Teacher Yosowa'));
    const bySearch = await anon.get('/api/courses?q=Integration%20Test');
    assert.ok(bySearch.data.courses.some(c => c.id === courseId));
    const byStatus = await anon.get('/api/courses?status=cancelled');
    assert.ok(byStatus.data.courses.every(c => c.run_status === 'cancelled'));
  });

  console.log('\n── Booking flow & live teacher dashboard ──────────────────');
  await test('teachers cannot book classes', async () => {
    const r = await teacher.post(`/api/courses/${courseId}/book`);
    assert.strictEqual(r.status, 403);
  });
  await test('anonymous booking requires login', async () => {
    const r = await anon.post(`/api/courses/${courseId}/book`);
    assert.strictEqual(r.status, 401);
  });
  await test('student books the class', async () => {
    const r = await student.post(`/api/courses/${courseId}/book`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const c = (await student.get(`/api/courses/${courseId}`)).data.course;
    assert.strictEqual(c.booked_count, 1);
    assert.strictEqual(c.is_my_booking, true);
    assert.strictEqual(c.seats_left, 2);
  });
  await test('duplicate booking is rejected', async () => {
    const r = await student.post(`/api/courses/${courseId}/book`);
    assert.strictEqual(r.status, 400);
  });
  await test('?mine=1 returns only this student’s bookings', async () => {
    const r = await student.get('/api/courses?mine=1');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.courses.length >= 1);
    assert.ok(r.data.courses.every(c => c.is_my_booking));
  });
  await test('teacher sees the booking immediately in the live feed', async () => {
    const r = await teacher.get('/api/admin/bookings');
    assert.strictEqual(r.status, 200);
    const row = r.data.bookings.find(b => b.course_id === courseId);
    assert.ok(row, 'booking should be visible to the publishing teacher');
    assert.strictEqual(row.student_username, 'student');
  });
  await test('other teachers do not see someone else’s bookings', async () => {
    const r = await teacher2.get('/api/admin/bookings');
    assert.ok(!r.data.bookings.some(b => b.course_id === courseId));
  });
  await test('teacher overview reports courses, bookings and teachers', async () => {
    const r = await teacher.get('/api/admin/overview');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.courses >= 1 && r.data.bookings >= 1 && r.data.teachers >= 3, JSON.stringify(r.data));
  });
  await test('class detail exposes booked students to its own teacher only', async () => {
    const own = await teacher.get(`/api/courses/${courseId}`);
    assert.ok(own.data.bookings.length >= 1);
    const other = await student.get(`/api/courses/${courseId}`);
    assert.deepStrictEqual(other.data.bookings, []);
  });
  await test('student cancels a booking', async () => {
    const r = await student.post(`/api/courses/${courseId}/cancel`);
    assert.strictEqual(r.status, 200);
    const c = (await student.get(`/api/courses/${courseId}`)).data.course;
    assert.strictEqual(c.booked_count, 0);
  });
  await test('capacity limit is enforced', async () => {
    const small = await teacher.post('/api/courses', validCourse({
      title: 'Tiny Class', capacity: 1, start_time: '15:00', end_time: '16:00'
    }));
    assert.strictEqual(small.status, 200);
    const id = small.data.id;
    assert.strictEqual((await student.post(`/api/courses/${id}/book`)).status, 200);
    assert.strictEqual((await student2.post(`/api/courses/${id}/book`)).status, 400);
    await teacher.del(`/api/courses/${id}`);
  });

  console.log('\n── Run status, updates & calendar feeds ───────────────────');
  await test('teacher changes run status and students can see it', async () => {
    const r = await teacher.post(`/api/courses/${courseId}/status`, { status: 'cancelled', status_note: 'Teacher is sick' });
    assert.strictEqual(r.status, 200);
    const c = (await anon.get(`/api/courses/${courseId}`)).data.course;
    assert.strictEqual(c.run_status, 'cancelled');
    assert.strictEqual(c.status_note, 'Teacher is sick');
  });
  await test('cancelled classes cannot be booked', async () => {
    const r = await student.post(`/api/courses/${courseId}/book`);
    assert.strictEqual(r.status, 400);
  });
  await test('status change is recorded in update history', async () => {
    const r = await anon.get(`/api/courses/${courseId}/updates`);
    assert.ok(r.data.updates.some(u => u.change_type === 'status'));
  });
  await test('invalid status is rejected', async () => {
    const r = await teacher.post(`/api/courses/${courseId}/status`, { status: 'maybe' });
    assert.strictEqual(r.status, 400);
  });
  await test('ICS feed is valid, uses real UTC times and includes map + notice', async () => {
    const r = await anon.get('/api/calendar/schedule.ics');
    assert.strictEqual(r.status, 200);
    assert.ok(/text\/calendar/.test(r.headers.get('content-type')));
    assert.ok(r.text.includes('BEGIN:VCALENDAR') && r.text.includes('END:VCALENDAR'));
    assert.ok(r.text.includes('UID:course-'));
    assert.ok(r.text.includes('DTSTART:20261201T020000Z'), 'real UTC instant missing');
    assert.ok(r.text.includes('LOCATION:Test Studio\\, Bangkok'), 'place must be ICS-escaped');
    assert.ok(r.text.includes('https://maps.app.goo.gl/AbCdEf12345'));
    assert.ok(r.text.includes('Notice / 通知'));
    // Concrete courses must be UTC instants; only the legacy recurring grid is
    // allowed to use floating local time (it maps to the VTIMEZONE block).
    const blocks = r.text.split('BEGIN:VEVENT').slice(1).map(b => b.split('END:VEVENT')[0]);
    const courseBlocks = blocks.filter(b => b.includes('UID:course-'));
    assert.ok(courseBlocks.length >= 1, 'no course events found');
    assert.ok(courseBlocks.every(b => /DTSTART:\d{8}T\d{6}Z/.test(b)),
      'every published course must use a real UTC instant');
  });
  await test('public JSON schedule exposes timezone, place, map and notice', async () => {
    const r = await anon.get('/api/calendar/schedule');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.courses.length >= 1);
    const c = r.data.courses.find(x => x.id === courseId);
    assert.ok(c && c.timezone === 'Asia/Bangkok' && c.google_maps_url && c.start_utc);
    assert.ok(r.data.timeSlots.length === 8 && r.data.days.length === 7);
  });
  await test('/api/calendar/info reports v3 and public URLs', async () => {
    const r = await anon.get('/api/calendar/info');
    assert.match(r.data.version, /^3\.\d+\.\d+$/);
    assert.ok(r.data.icsSubscriptionUrl.endsWith('/api/calendar/schedule.ics'));
  });
  await test('legacy weekly grid endpoint still serves 7×8 slots', async () => {
    const r = await anon.get('/api/schedule');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.schedule['10:00-11:00'] && r.data.schedule['18:00-19:00']);
  });
  await test('legacy weekly slot booking still works for a logged-in student', async () => {
    const r = await student2.post('/api/schedule/book', { slotId: 1 });
    assert.ok([200, 400].includes(r.status), `unexpected ${r.status}: ${JSON.stringify(r.data)}`);
  });

  console.log('\n── Deletion & cleanup ─────────────────────────────────────');
  await test('teacher deletes own class and it disappears from the board', async () => {
    const r = await teacher.del(`/api/courses/${courseId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await anon.get(`/api/courses/${courseId}`)).status, 404);
  });
  await test('deleting a non-existent class returns 404', async () => {
    assert.strictEqual((await teacher.del('/api/courses/999999')).status, 404);
  });
  await test('unknown API route returns JSON 404', async () => {
    const r = await anon.get('/api/does-not-exist');
    assert.strictEqual(r.status, 404);
    assert.ok(r.data && r.data.error);
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  ${passed} passed · ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`   • ${f.name}: ${f.message}`));
  }
  console.log('════════════════════════════════════════════════════════════\n');

  await new Promise(resolve => server.close(resolve));
  try { fs.unlinkSync(dbPath); } catch (_) { /* ignore */ }
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 Test runner crashed:', err);
  try { fs.unlinkSync(dbPath); } catch (_) { /* ignore */ }
  process.exit(1);
});

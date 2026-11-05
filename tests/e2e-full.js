/**
 * tests/e2e-full.js — 全功能端到端验收
 *
 * 目标：在隔离的临时数据库上，模拟「多个老师 + 多个学生」的真实使用，
 * 逐项验证业务逻辑、数据隔离、时区、日历、安全边界与数据一致性。
 *
 * 与 tests/test-suite.js 的区别：test-suite 是回归测试（快速、覆盖 API 契约），
 * 本脚本是验收脚本（多角色并发、完整用户旅程、冲突场景、脏数据检查）。
 *
 * 运行：npm run test:e2e
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `ecb-e2e-${process.pid}-${Date.now()}.db`);
const port = 3900 + (process.pid % 90);
process.env.DB_PATH = dbPath;
process.env.PORT = String(port);
process.env.SESSION_SECRET = 'e2e-secret';
process.env.TEACHER_INVITE_CODE = 'TEACHER2026';
delete process.env.NODE_ENV; // http 下需要非 secure cookie

const { startServer } = require('../server');
const { getDb } = require('../database');

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

function client(lang = 'en') {
  let cookie = '';
  const call = async (method, url, body, extra) => {
    const headers = { 'X-Language': lang, ...(extra || {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + url, {
      method, headers, redirect: 'manual',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/connect\.sid=[^;]+/);
      if (m) cookie = m[0];
    }
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* raw */ }
    return { status: res.status, data, text, headers: res.headers };
  };
  return {
    get: (u, h) => call('GET', u, undefined, h),
    post: (u, b, h) => call('POST', u, b === undefined ? {} : b, h),
    put: (u, b, h) => call('PUT', u, b === undefined ? {} : b, h),
    del: (u, h) => call('DELETE', u, undefined, h),
    raw: call
  };
}

const MAP = 'https://maps.app.goo.gl/AbCdEf12345';
const course = (o = {}) => ({
  title: 'Conversation Practice',
  notice: 'Bring your notebook. 请带笔记本。',
  timezone: 'Asia/Bangkok',
  lesson_date: '2027-01-15',
  start_time: '10:00',
  end_time: '11:00',
  place_name: 'Sukhumvit Coffee Lab',
  google_maps_url: MAP,
  capacity: 2,
  run_status: 'confirmed',
  ...o
});

async function main() {
  const server = await startServer();
  BASE = `http://127.0.0.1:${port}`;
  const db = getDb();

  // ================================================================ 1. 账号
  console.log('\n── 1. 账号：注册 / 登录 / 角色 ─────────────────────────────');
  const alpha = client();
  const beta = client();
  const gamma = client();
  const s1 = client();
  const s2 = client();
  const s3 = client();
  const anon = client();

  await test('老师用邀请码注册（3 位不同老师）', async () => {
    for (const [c, name, pin] of [[alpha, 'Alice Chen', '1001'], [beta, 'Bob Smith', '1002'], [gamma, '陈老师', '1003']]) {
      const r = await c.post('/api/auth/register', {
        username: `t_${name.split(' ')[0].toLowerCase()}`, password: pin,
        displayName: name, teacherCode: 'TEACHER2026'
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.data));
      assert.strictEqual(r.data.user.role, 'teacher');
    }
  });

  await test('学生注册（3 位）', async () => {
    for (const [c, name, pin] of [[s1, 'Student One', '2001'], [s2, 'Student Two', '2002'], [s3, '学生三', '2003']]) {
      const r = await c.post('/api/auth/register', {
        username: `s_${pin}`, password: pin, displayName: name
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.data));
      assert.strictEqual(r.data.user.role, 'student');
    }
  });

  await test('错误的老师邀请码被拒绝', async () => {
    const c = client();
    const r = await c.post('/api/auth/register', {
      username: 't_bad', password: '1009', displayName: 'Bad', teacherCode: 'NOPE'
    });
    assert.strictEqual(r.status, 400);
    assert.ok(/code|邀请/i.test(r.data.error), r.data.error);
  });

  await test('PIN 不是 4 位数字被拒绝', async () => {
    const c = client();
    for (const pin of ['12345', '12a4', '']) {
      const r = await c.post('/api/auth/register', { username: 'x' + Math.random(), password: pin, displayName: 'X' });
      assert.strictEqual(r.status, 400, `PIN=${pin} 应被拒绝`);
    }
  });

  await test('重复用户名被拒绝', async () => {
    const r = await anon.post('/api/auth/register', { username: 's_2001', password: '2001', displayName: 'Dup' });
    assert.strictEqual(r.status, 400);
  });

  await test('错误 PIN 登录失败，正确 PIN 登录成功', async () => {
    const c = client();
    assert.strictEqual((await c.post('/api/auth/login', { username: 's_2001', password: '9999' })).status, 401);
    const ok = await c.post('/api/auth/login', { username: 's_2001', password: '2001' });
    assert.strictEqual(ok.status, 200);
    const me = await c.get('/api/auth/me');
    assert.strictEqual(me.data.user.role, 'student');
  });

  // ================================================================ 2. 多老师
  console.log('\n── 2. 多老师同时发布：隔离与冲突 ───────────────────────────');
  const sameSlot = { lesson_date: '2027-01-20', start_time: '19:00', end_time: '20:00' };
  let aCourse, bCourse, gCourse;

  await test('三位老师在同一日期同一时间各自发布课程', async () => {
    const [a, b, g] = await Promise.all([
      alpha.post('/api/courses', course({ ...sameSlot, title: 'Evening English', place_name: 'Room A' })),
      beta.post('/api/courses', course({ ...sameSlot, title: 'Evening English', place_name: 'Room B' })),
      gamma.post('/api/courses', course({ ...sameSlot, title: '晚间英语角', place_name: 'C 教室' }))
    ]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.data));
    assert.strictEqual(b.status, 200, JSON.stringify(b.data));
    assert.strictEqual(g.status, 200, JSON.stringify(g.data));
    aCourse = a.data.id; bCourse = b.data.id; gCourse = g.data.id;
  });

  await test('同一时间段三位老师的课都在，互不覆盖', async () => {
    const r = await anon.get('/api/courses');
    const list = r.data.courses.filter(c => c.lesson_date === '2027-01-20');
    assert.strictEqual(list.length, 3, `实际 ${list.length} 门`);
    const names = list.map(c => c.teacher_name).sort();
    assert.deepStrictEqual(names, ['Alice Chen', 'Bob Smith', '陈老师'].sort());
    const places = list.map(c => c.place_name).sort();
    assert.deepStrictEqual(places, ['C 教室', 'Room A', 'Room B'].sort());
  });

  await test('同名课程由不同老师发布时仍是两门独立课程', async () => {
    const r = await anon.get('/api/courses');
    const same = r.data.courses.filter(c => c.title === 'Evening English');
    assert.strictEqual(same.length, 2);
    assert.notStrictEqual(same[0].id, same[1].id);
    assert.notStrictEqual(same[0].teacher_id, same[1].teacher_id);
  });

  await test('按老师筛选只返回该老师的课程', async () => {
    const r = await anon.get(`/api/courses?teacher=${(await alpha.get('/api/auth/me')).data.user.id}`);
    assert.ok(r.data.courses.length >= 1);
    assert.ok(r.data.courses.every(c => c.teacher_name === 'Alice Chen'), JSON.stringify(r.data.courses.map(c => c.teacher_name)));
  });

  await test('老师筛选列表只包含有课的老师', async () => {
    const r = await anon.get('/api/courses/teachers');
    const names = r.data.teachers.map(t => t.display_name);
    for (const n of ['Alice Chen', 'Bob Smith', '陈老师']) {
      assert.ok(names.includes(n), `缺少 ${n}: ${names.join(', ')}`);
    }
    assert.ok(r.data.teachers.every(t => t.course_count >= 1), '不应出现 0 门课的老师');
  });

  await test('老师不能修改/删除/改状态别人的课程', async () => {
    assert.strictEqual((await beta.put(`/api/courses/${aCourse}`, course())).status, 403);
    assert.strictEqual((await beta.post(`/api/courses/${aCourse}/status`, { status: 'cancelled' })).status, 403);
    assert.strictEqual((await beta.del(`/api/courses/${aCourse}`)).status, 403);
  });

  await test('同一老师在同一时间段重复发布会被拒绝', async () => {
    const r = await alpha.post('/api/courses', course({ ...sameSlot, title: 'Duplicate Slot' }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.data));
    assert.strictEqual(r.data.fields.start_time, 'duplicateSlot');
  });

  await test('同一老师时间段重叠也会被拒绝', async () => {
    const r = await alpha.post('/api/courses', course({
      lesson_date: '2027-01-20', start_time: '19:30', end_time: '20:30', title: 'Overlapping Class'
    }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.data));
    assert.strictEqual(r.data.fields.start_time, 'duplicateSlot');
  });

  // ================================================================ 3. 通知栏
  console.log('\n── 3. 通知栏：100 字上限与更新提示 ─────────────────────────');
  let noticeCourse;

  await test('通知栏 100 个汉字可以发布', async () => {
    const notice = '通'.repeat(100);
    const r = await alpha.post('/api/courses', course({ title: 'Notice 100', notice, lesson_date: '2027-02-01' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    noticeCourse = r.data.id;
    const one = await anon.get(`/api/courses/${noticeCourse}`);
    assert.strictEqual([...one.data.course.notice].length, 100);
  });

  await test('通知栏 101 个字被拒绝', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'Notice 101', notice: '通'.repeat(101), lesson_date: '2027-02-02' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.fields.notice, 'noticeTooLong');
  });

  await test('emoji 按 1 个字符计算（100 个 emoji 可通过）', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'Emoji notice', notice: '😀'.repeat(100), lesson_date: '2027-02-03' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('编辑通知栏后学生端出现「有更新」与变更记录', async () => {
    const before = await anon.get(`/api/courses/${noticeCourse}`);
    assert.strictEqual(before.data.course.has_update, false);
    const r = await alpha.put(`/api/courses/${noticeCourse}`, course({
      title: 'Notice 100', notice: '教室换到 3 楼，请提前 10 分钟到。', lesson_date: '2027-02-01'
    }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const after = await anon.get(`/api/courses/${noticeCourse}`);
    assert.strictEqual(after.data.course.has_update, true);
    assert.ok(after.data.course.revision > 1);
    assert.ok(after.data.course.notice.includes('3 楼'));
    const updates = await anon.get(`/api/courses/${noticeCourse}/updates`);
    assert.ok(updates.data.updates.some(u => u.change_type === 'notice'), JSON.stringify(updates.data.updates));
  });

  // ================================================================ 4. 谷歌地址栏
  console.log('\n── 4. 谷歌地址栏：必填与真实性校验 ─────────────────────────');
  await test('缺少谷歌地址被拒绝', async () => {
    const r = await alpha.post('/api/courses', course({ google_maps_url: '' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.fields.google_maps_url, 'googleRequired');
  });

  await test('非 Google 链接、http 链接、伪域名全部被拒绝', async () => {
    const bad = [
      'http://maps.app.goo.gl/abc',
      'https://evil-google.com/maps/place/x',
      'https://google.com.evil.io/maps/place/x',
      'https://www.google.com/url?q=https://x.com',
      'javascript:alert(1)',
      'not a url'
    ];
    for (const url of bad) {
      const r = await alpha.post('/api/courses', course({ google_maps_url: url, lesson_date: '2027-02-10' }));
      assert.strictEqual(r.status, 400, `${url} 应被拒绝`);
    }
  });

  await test('合法的 Google Maps 链接全部通过', async () => {
    const good = [
      'https://maps.app.goo.gl/AbCdEf12345',
      'https://www.google.com/maps/place/Sukhumvit+Coffee',
      'https://google.co.th/maps/place/x',
      'https://maps.google.com/?q=13.7,100.5'
    ];
    for (let i = 0; i < good.length; i++) {
      const r = await alpha.post('/api/courses', course({
        google_maps_url: good[i], lesson_date: `2027-02-1${i + 1}`, title: `Map ${i}`
      }));
      assert.strictEqual(r.status, 200, `${good[i]} 应通过: ${JSON.stringify(r.data)}`);
      await alpha.del(`/api/courses/${r.data.id}`);
    }
  });

  await test('地点、时区、时间缺失都会定位到对应字段', async () => {
    const cases = [
      [{ place_name: '' }, 'place_name'],
      [{ timezone: '' }, 'timezone'],
      [{ lesson_date: '' }, 'lesson_date'],
      [{ start_time: '25:00' }, 'time'],
      [{ end_time: '09:00' }, 'time'],
      [{ capacity: 0 }, 'capacity'],
      [{ capacity: 51 }, 'capacity'],
      [{ title: 'x' }, 'title']
    ];
    for (const [patch, field] of cases) {
      const r = await alpha.post('/api/courses', course(patch));
      assert.strictEqual(r.status, 400, `${JSON.stringify(patch)} 应被拒绝`);
      assert.ok(r.data.fields[field], `${JSON.stringify(patch)} 应标记 ${field}: ${JSON.stringify(r.data.fields)}`);
    }
  });

  // ================================================================ 5. 时区
  console.log('\n── 5. 真实时间：时区换算与夏令时 ───────────────────────────');
  await test('曼谷 10:00 换算为 03:00Z', async () => {
    const r = await alpha.post('/api/courses', course({ timezone: 'Asia/Bangkok', start_time: '10:00', end_time: '11:00', lesson_date: '2027-03-01', title: 'TZ Bangkok' }));
    const c = (await anon.get(`/api/courses/${r.data.id}`)).data.course;
    assert.strictEqual(c.start_utc, '2027-03-01T03:00:00.000Z');
    assert.strictEqual(c.gmt_offset, 'GMT+7');
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('纽约夏令时切换前后偏移正确（EST→EDT）', async () => {
    const before = await alpha.post('/api/courses', course({
      timezone: 'America/New_York', start_time: '10:00', end_time: '11:00',
      lesson_date: '2027-03-13', title: 'NY before DST'
    }));
    const after = await alpha.post('/api/courses', course({
      timezone: 'America/New_York', start_time: '10:00', end_time: '11:00',
      lesson_date: '2027-03-14', title: 'NY after DST'
    }));
    const c1 = (await anon.get(`/api/courses/${before.data.id}`)).data.course;
    const c2 = (await anon.get(`/api/courses/${after.data.id}`)).data.course;
    assert.strictEqual(c1.start_utc, '2027-03-13T15:00:00.000Z', 'EST 应为 UTC-5');
    assert.strictEqual(c2.start_utc, '2027-03-14T14:00:00.000Z', 'EDT 应为 UTC-4');
    assert.strictEqual(c1.gmt_offset, 'GMT-5');
    assert.strictEqual(c2.gmt_offset, 'GMT-4');
    await alpha.del(`/api/courses/${before.data.id}`);
    await alpha.del(`/api/courses/${after.data.id}`);
  });

  await test('尼泊尔 +05:45 这类非整点时区正确', async () => {
    const r = await alpha.post('/api/courses', course({
      timezone: 'Asia/Kathmandu', start_time: '10:00', end_time: '11:00', lesson_date: '2027-03-02', title: 'TZ Nepal'
    }));
    const c = (await anon.get(`/api/courses/${r.data.id}`)).data.course;
    assert.strictEqual(c.start_utc, '2027-03-02T04:15:00.000Z');
    assert.strictEqual(c.gmt_offset, 'GMT+5:45');
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('Google 日历链接使用同一 UTC 时刻', async () => {
    const c = (await anon.get(`/api/courses/${aCourse}`)).data.course;
    assert.ok(c.google_calendar_url.startsWith('https://calendar.google.com/calendar/render?'));
    assert.ok(c.google_calendar_url.includes('20270120T120000Z'), c.google_calendar_url);
    assert.ok(c.google_calendar_url.includes('ctz=Asia%2FBangkok'));
  });

  // ================================================================ 6. 学生
  console.log('\n── 6. 学生：预约 / 满员 / 取消 / 重新预约 ───────────────────');
  let bookCourse;
  await test('老师发布一门 2 人小班课', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'Small Group', capacity: 2, lesson_date: '2027-04-01', start_time: '09:00', end_time: '10:00' }));
    assert.strictEqual(r.status, 200);
    bookCourse = r.data.id;
  });

  await test('未登录不能预约', async () => {
    assert.strictEqual((await anon.post(`/api/courses/${bookCourse}/book`)).status, 401);
  });

  await test('老师不能预约', async () => {
    assert.strictEqual((await beta.post(`/api/courses/${bookCourse}/book`)).status, 403);
  });

  await test('学生预约成功，名额减少，老师端可见', async () => {
    const r = await s1.post(`/api/courses/${bookCourse}/book`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const c = (await anon.get(`/api/courses/${bookCourse}`)).data.course;
    assert.strictEqual(c.booked_count, 1);
    assert.strictEqual(c.seats_left, 1);
    const mine = (await s1.get('/api/courses?mine=1')).data.courses.map(x => x.id);
    assert.ok(mine.includes(bookCourse));
    const feed = (await alpha.get('/api/admin/bookings')).data.bookings;
    assert.ok(feed.some(b => b.course_id === bookCourse && b.student_name === 'Student One'), JSON.stringify(feed));
  });

  await test('重复预约被拒绝', async () => {
    const r = await s1.post(`/api/courses/${bookCourse}/book`);
    assert.strictEqual(r.status, 400);
    assert.ok(/already|已预约|จองแล้ว|予約済み/i.test(r.data.error), r.data.error);
  });

  await test('满员后第三位学生无法预约', async () => {
    assert.strictEqual((await s2.post(`/api/courses/${bookCourse}/book`)).status, 200);
    const r = await s3.post(`/api/courses/${bookCourse}/book`);
    assert.strictEqual(r.status, 400);
    assert.ok(/full|满|เต็ม|満員/i.test(r.data.error), r.data.error);
  });

  await test('取消预约后名额释放，其他人可以补位', async () => {
    assert.strictEqual((await s1.post(`/api/courses/${bookCourse}/cancel`)).status, 200);
    let c = (await anon.get(`/api/courses/${bookCourse}`)).data.course;
    assert.strictEqual(c.booked_count, 1);
    assert.strictEqual(c.seats_left, 1);
    assert.strictEqual((await s3.post(`/api/courses/${bookCourse}/book`)).status, 200);
    c = (await anon.get(`/api/courses/${bookCourse}`)).data.course;
    assert.strictEqual(c.booked_count, 2);
    assert.strictEqual(c.seats_left, 0);
  });

  await test('取消后可以重新预约', async () => {
    assert.strictEqual((await s1.post(`/api/courses/${bookCourse}/cancel`)).status, 400, '没预约时取消应报错');
    assert.strictEqual((await s3.post(`/api/courses/${bookCourse}/cancel`)).status, 200);
    assert.strictEqual((await s1.post(`/api/courses/${bookCourse}/book`)).status, 200);
  });

  await test('已取消的课程不能预约', async () => {
    const r = await alpha.post(`/api/courses/${bookCourse}/status`, { status: 'cancelled', status_note: '老师临时有事' });
    assert.strictEqual(r.status, 200);
    const s = await s2.post(`/api/courses/${bookCourse}/book`);
    assert.strictEqual(s.status, 400);
    assert.ok(/cancel|取消|ยกเลิก|中止/i.test(s.data.error), s.data.error);
    const c = (await anon.get(`/api/courses/${bookCourse}`)).data.course;
    assert.strictEqual(c.run_status, 'cancelled');
    assert.strictEqual(c.status_note, '老师临时有事');
  });

  await test('已结束的课程不能预约', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'Past Class', lesson_date: '2020-01-01', start_time: '10:00', end_time: '11:00' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const b = await s1.post(`/api/courses/${r.data.id}/book`);
    assert.strictEqual(b.status, 400, JSON.stringify(b.data));
    assert.ok(/ended|结束|จบ|終了/i.test(b.data.error), b.data.error);
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('学生看不到别人的预约名单', async () => {
    const r = await s1.get(`/api/courses/${aCourse}`);
    assert.deepStrictEqual(r.data.bookings, []);
  });

  await test('课程详情只有发布老师能看到预约学生', async () => {
    const owner = await alpha.get(`/api/courses/${bookCourse}`);
    assert.ok(owner.data.bookings.some(b => b.display_name === 'Student One'));
    const other = await beta.get(`/api/courses/${bookCourse}`);
    assert.deepStrictEqual(other.data.bookings, []);
  });

  // ================================================================ 7. 老师端
  console.log('\n── 7. 老师工作台：概览 / 预约流 / 状态 ─────────────────────');
  await test('老师概览只统计自己的课程与预约', async () => {
    const a = (await alpha.get('/api/admin/overview')).data;
    const b = (await beta.get('/api/admin/overview')).data;
    assert.ok(a.courses > 0 && b.courses >= 0);
    const all = (await anon.get('/api/courses')).data.courses;
    const alphaId = (await alpha.get('/api/auth/me')).data.user.id;
    const mine = all.filter(c => c.teacher_id === alphaId);
    assert.strictEqual(a.courses, mine.length, `概览 ${a.courses} vs 实际 ${mine.length}`);
  });

  await test('老师预约流只包含自己课程的预约', async () => {
    const feed = (await alpha.get('/api/admin/bookings')).data.bookings;
    const myCourseIds = new Set((await alpha.get('/api/courses?teacher=me')).data.courses.map(c => c.id));
    assert.ok(feed.every(b => myCourseIds.has(b.course_id)), JSON.stringify(feed.map(b => b.course_id)));
  });

  await test('非法状态值被拒绝', async () => {
    const r = await alpha.post(`/api/courses/${aCourse}/status`, { status: 'whatever' });
    assert.strictEqual(r.status, 400);
  });

  await test('部分字段更新不会重置开课状态', async () => {
    await alpha.post(`/api/courses/${aCourse}/status`, { status: 'cancelled' });
    const partial = course({ ...sameSlot, title: 'Evening English', place_name: 'Room A2' });
    delete partial.run_status; // 模拟只改地点、不提交状态字段
    const r = await alpha.put(`/api/courses/${aCourse}`, partial);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const c = (await anon.get(`/api/courses/${aCourse}`)).data.course;
    assert.strictEqual(c.run_status, 'cancelled', '编辑其他字段不应把状态改回 confirmed');
    assert.strictEqual(c.place_name, 'Room A2');
    await alpha.post(`/api/courses/${aCourse}/status`, { status: 'confirmed' });
  });

  await test('修改时间会同步更新 UTC 时刻与更新记录', async () => {
    const r = await alpha.put(`/api/courses/${aCourse}`, course({
      ...sameSlot, title: 'Evening English', place_name: 'Room A2',
      start_time: '20:00', end_time: '21:00'
    }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const c = (await anon.get(`/api/courses/${aCourse}`)).data.course;
    assert.strictEqual(c.start_utc, '2027-01-20T13:00:00.000Z');
    const updates = (await anon.get(`/api/courses/${aCourse}/updates`)).data.updates;
    assert.ok(updates.some(u => u.change_type === 'time'));
    await alpha.put(`/api/courses/${aCourse}`, course({ ...sameSlot, title: 'Evening English', place_name: 'Room A2' }));
  });

  await test('修改地点会记录 place 变更', async () => {
    await alpha.put(`/api/courses/${aCourse}`, course({
      ...sameSlot, title: 'Evening English', place_name: 'Room A3'
    }));
    const updates = (await anon.get(`/api/courses/${aCourse}/updates`)).data.updates;
    assert.ok(updates.some(u => u.change_type === 'place'));
  });

  // ================================================================ 8. 日历
  console.log('\n── 8. 日历订阅：ICS 与公开视图 ─────────────────────────────');
  await test('ICS 含真实 UTC 事件、地点、通知与取消状态', async () => {
    const r = await anon.get('/api/calendar/schedule.ics');
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('BEGIN:VCALENDAR'));
    const ev = r.text.split('BEGIN:VEVENT').find(b => b.includes('Evening English'));
    assert.ok(ev, '未找到课程事件');
    assert.ok(ev.includes('DTSTART:20270120T120000Z'), ev);
    assert.ok(ev.includes('LOCATION:Room A3'));
    assert.ok(/STATUS:(CONFIRMED|TENTATIVE|CANCELLED)/.test(ev));
  });

  await test('ICS 正确转义逗号，不破坏事件格式', async () => {
    const r = await alpha.post('/api/courses', course({
      title: 'Comma Test', place_name: 'Room 5, Building A', lesson_date: '2027-07-01'
    }));
    const ics = await anon.get('/api/calendar/schedule.ics');
    const ev = ics.text.split('BEGIN:VEVENT').find(b => b.includes('Comma Test'));
    assert.ok(ev, '未找到含逗号的课程事件');
    assert.ok(ev.includes('LOCATION:Room 5\\, Building A'), ev);
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('公开 JSON 视图包含课程真实时间与老师', async () => {
    const r = await anon.get('/api/calendar/schedule');
    assert.strictEqual(r.status, 200);
    const c = r.data.courses.find(x => x.id === aCourse);
    assert.ok(c);
    assert.strictEqual(c.start_utc, '2027-01-20T12:00:00.000Z');
    assert.ok(c.teacher_name);
    assert.ok(!('student_name' in c));
  });

  // ================================================================ 9. 排序
  console.log('\n── 9. 课程广场排序与可见性 ─────────────────────────────────');
  await test('未来的课排在已结束的课之前，未来按时间升序', async () => {
    const r = await anon.get('/api/courses');
    const list = r.data.courses;
    const pastIdx = list.findIndex(c => c.is_past);
    const firstPast = pastIdx === -1 ? list.length : pastIdx;
    assert.ok(list.slice(firstPast).every(c => c.is_past), '已结束的课必须集中在末尾');
    assert.ok(list.slice(0, firstPast).every(c => !c.is_past), '未结束的课必须在前面');
    const future = list.slice(0, firstPast).map(c => c.start_utc);
    assert.deepStrictEqual(future, [...future].sort(), '未来课程应按开始时间升序');
  });

  // ================================================================ 10. 安全
  console.log('\n── 10. 安全与脏数据 ────────────────────────────────────────');
  await test('XSS 内容按原文存储，前端负责转义', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const r = await alpha.post('/api/courses', course({
      title: payload, notice: '<script>alert(1)</script>', place_name: payload,
      lesson_date: '2027-05-01'
    }));
    assert.strictEqual(r.status, 200);
    const c = (await anon.get(`/api/courses/${r.data.id}`)).data.course;
    assert.strictEqual(c.title, payload);
    await alpha.del(`/api/courses/${r.data.id}`);
  });

  await test('搜索中的 SQL 注入字符串不会报错', async () => {
    for (const q of ["'; DROP TABLE courses; --", "%' OR 1=1 --", '<script>']) {
      const r = await anon.get(`/api/courses?q=${encodeURIComponent(q)}`);
      assert.strictEqual(r.status, 200, `${q} 导致 ${r.status}`);
    }
    const still = await anon.get('/api/courses');
    assert.ok(still.data.courses.length > 0, '课程表被破坏');
  });

  await test('超长标题（81 字）被拒绝', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'a'.repeat(81) }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.fields.title, 'title');
  });

  await test('删除课程会同时清理预约与更新记录，不留孤儿数据', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'To Delete', lesson_date: '2027-06-01' }));
    const id = r.data.id;
    await s1.post(`/api/courses/${id}/book`);
    await alpha.put(`/api/courses/${id}`, course({ title: 'To Delete v2', lesson_date: '2027-06-01' }));
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM course_bookings WHERE course_id = ?').get(id).n > 0);
    assert.strictEqual((await alpha.del(`/api/courses/${id}`)).status, 200);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM course_bookings WHERE course_id = ?').get(id).n, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM course_updates WHERE course_id = ?').get(id).n, 0);
    assert.strictEqual((await anon.get(`/api/courses/${id}`)).status, 404);
  });

  await test('取消的预约不会计入名额', async () => {
    const r = await alpha.post('/api/courses', course({ title: 'Seat Count', capacity: 3, lesson_date: '2027-06-02' }));
    const id = r.data.id;
    await s1.post(`/api/courses/${id}/book`);
    await s2.post(`/api/courses/${id}/book`);
    await s1.post(`/api/courses/${id}/cancel`);
    const c = (await anon.get(`/api/courses/${id}`)).data.course;
    assert.strictEqual(c.booked_count, 1);
    assert.strictEqual(c.seats_left, 2);
    await alpha.del(`/api/courses/${id}`);
  });

  await test('所有公开接口在未登录时都可访问（除预约/管理）', async () => {
    for (const url of ['/api/courses', '/api/courses/teachers', '/api/courses/config', '/api/calendar/schedule', '/api/calendar/info', '/api/settings']) {
      const r = await anon.get(url);
      assert.strictEqual(r.status, 200, `${url} -> ${r.status}`);
    }
    for (const url of ['/api/admin/overview', '/api/admin/bookings']) {
      assert.strictEqual((await anon.get(url)).status, 401, `${url} 未登录应 401`);
    }
  });

  // ================================================================ 收尾
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  ${passed} passed · ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`   • ${f.name}\n     ${f.message}`));
  }
  console.log('════════════════════════════════════════════════════════════\n');

  await new Promise(resolve => server.close(resolve));
  try { fs.unlinkSync(dbPath); } catch (_) { /* ignore */ }
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 E2E runner crashed:', err);
  try { fs.unlinkSync(dbPath); } catch (_) { /* ignore */ }
  process.exit(1);
});

/**
 * tests/superadmin-suite.js — v3.1 超级管理员 / 审核体系验收
 *
 * 覆盖：最高权限边界、封禁、禁言、禁止发布、提权/降权、重置 PIN、
 *       课程下架/恢复、操作日志、账号删除级联，以及所有自我保护规则。
 *
 * 运行：npm run test:admin
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `ecb-sa-${process.pid}-${Date.now()}.db`);
const port = 3980 + (process.pid % 15);
process.env.DB_PATH = dbPath;
process.env.PORT = String(port);
process.env.SESSION_SECRET = 'sa-secret';
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
  const call = async (method, url, body) => {
    const headers = { 'X-Language': lang };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/connect\.sid=[^;]+/);
      if (m) cookie = m[0];
    }
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* raw */ }
    return { status: res.status, data, text };
  };
  return {
    get: u => call('GET', u),
    post: (u, b) => call('POST', u, b === undefined ? {} : b),
    put: (u, b) => call('PUT', u, b === undefined ? {} : b),
    del: u => call('DELETE', u),
    reset: () => { cookie = ''; }
  };
}

const MAP = 'https://maps.app.goo.gl/AbCdEf12345';
const course = (o = {}) => ({
  title: 'Super admin test class',
  notice: 'Bring your notebook.',
  timezone: 'Asia/Bangkok',
  lesson_date: '2027-03-10',
  start_time: '10:00',
  end_time: '11:00',
  place_name: 'Sukhumvit Coffee Lab',
  google_maps_url: MAP,
  capacity: 3,
  run_status: 'confirmed',
  ...o
});

const futureDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function main() {
  const server = await startServer();
  BASE = `http://127.0.0.1:${port}`;
  const db = getDb();

  const root = client();     // super admin
  const teacherA = client(); // ordinary teacher
  const teacherB = client(); // ordinary teacher, the target of most restrictions
  const student = client();

  let teacherBId = 0;
  let courseId = 0;

  // ================================================================ 1. 权限边界
  console.log('\n── 1. 最高权限边界 ────────────────────────────────────────');

  await test('创建账号：root / teacherA / teacherB / student', async () => {
    const r1 = await root.post('/api/auth/register', { username: 'root', password: '1111', displayName: 'Root Admin', teacherCode: 'TEACHER2026' });
    assert.equal(r1.status, 200, r1.text);
    const r2 = await teacherA.post('/api/auth/register', { username: 't_alpha', password: '1111', displayName: 'Teacher Alpha', teacherCode: 'TEACHER2026' });
    assert.equal(r2.status, 200, r2.text);
    const r3 = await teacherB.post('/api/auth/register', { username: 't_beta', password: '1111', displayName: 'Teacher Beta', teacherCode: 'TEACHER2026' });
    assert.equal(r3.status, 200, r3.text);
    const r4 = await student.post('/api/auth/register', { username: 's_one', password: '1111', displayName: 'Student One' });
    assert.equal(r4.status, 200, r4.text);
    teacherBId = r3.data.user.id;
  });

  await test('授予 root 超级管理员权限（数据库层面引导）', async () => {
    db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'root'").run();
    const me = await root.get('/api/auth/me');
    assert.equal(me.data.user.isAdmin, true);
  });

  await test('未登录访问超管接口返回 401', async () => {
    const anon = client();
    const r = await anon.get('/api/superadmin/users');
    assert.equal(r.status, 401, r.text);
  });

  await test('普通老师访问超管接口返回 403', async () => {
    const r = await teacherA.get('/api/superadmin/users');
    assert.equal(r.status, 403, r.text);
    assert.match(r.data.error, /administrator/i);
  });

  await test('超级管理员可列出全部账号（含老师与学生）', async () => {
    const r = await root.get('/api/superadmin/users');
    assert.equal(r.status, 200, r.text);
    const names = r.data.users.map(u => u.username);
    for (const n of ['root', 't_alpha', 't_beta', 's_one']) assert.ok(names.includes(n), n);
    assert.ok(r.data.users.some(u => u.isAdmin));
  });

  await test('概览统计与实际数据一致', async () => {
    const r = await root.get('/api/superadmin/overview');
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.users.total >= 4);
    assert.ok(r.data.users.admins >= 1);
    assert.ok(r.data.users.teachers >= 3);
    assert.ok(r.data.users.students >= 1);
  });

  // ================================================================ 2. 封禁
  console.log('\n── 2. 封禁（无法登录 / 立即失效） ──────────────────────────');

  await test('封禁必须填写原因', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/ban`, { reason: '' });
    assert.equal(r.status, 400, r.text);
  });

  await test('封禁老师后其登录被拒绝', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/ban`, { reason: 'Spam classes' });
    assert.equal(r.status, 200, r.text);
    const fresh = client();
    const login = await fresh.post('/api/auth/login', { username: 't_beta', password: '1111' });
    assert.equal(login.status, 403, login.text);
    assert.match(login.data.error, /suspend/i);
    assert.equal(login.data.reason, 'Spam classes');
  });

  await test('已登录的封禁账号下一次请求即失效', async () => {
    const r = await teacherB.get('/api/admin/overview');
    assert.equal(r.status, 403, r.text);
    const me = await teacherB.get('/api/auth/me');
    assert.equal(me.data.loggedIn, false);
  });

  await test('解封后可以重新登录', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/unban`, {});
    assert.equal(r.status, 200, r.text);
    teacherB.reset();
    const login = await teacherB.post('/api/auth/login', { username: 't_beta', password: '1111' });
    assert.equal(login.status, 200, login.text);
  });

  // ================================================================ 3. 禁言
  console.log('\n── 3. 禁言（不能发布 / 不能修改 / 学生不能预约） ────────────');

  await test('老师被封禁前先创建一门课（用于后续编辑测试）', async () => {
    const r = await teacherB.post('/api/courses', course({ title: 'Beta class', lesson_date: futureDate(5) }));
    assert.equal(r.status, 200, r.text);
    courseId = r.data.id;
  });

  await test('禁言老师后无法发布新课程', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/mute`, { hours: 24, reason: 'Off-topic notice' });
    assert.equal(r.status, 200, r.text);
    const create = await teacherB.post('/api/courses', course({ title: 'Blocked class', lesson_date: futureDate(6) }));
    assert.equal(create.status, 403, create.text);
    assert.match(create.data.error, /muted/i);
  });

  await test('禁言老师无法修改已有课程', async () => {
    const r = await teacherB.put(`/api/courses/${courseId}`, course({ title: 'Beta class v2', lesson_date: futureDate(5) }));
    assert.equal(r.status, 403, r.text);
    assert.match(r.data.error, /muted/i);
  });

  await test('禁言学生对课程不可预约', async () => {
    const studentId = db.prepare("SELECT id FROM users WHERE username = 's_one'").get().id;
    await root.post(`/api/superadmin/users/${studentId}/mute`, { hours: 2, reason: 'No-show twice' });
    const r = await student.post(`/api/courses/${courseId}/book`, {});
    assert.equal(r.status, 403, r.text);
    assert.match(r.data.error, /muted/i);
    await root.post(`/api/superadmin/users/${studentId}/mute`, { hours: 0 });
  });

  await test('解除禁言后恢复发布能力', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/mute`, { hours: 0 });
    assert.equal(r.status, 200, r.text);
    const create = await teacherB.post('/api/courses', course({ title: 'Recovered class', lesson_date: futureDate(7), start_time: '15:00', end_time: '16:00' }));
    assert.equal(create.status, 200, create.text);
  });

  await test('禁言状态在 /me 中可见（学生端可提示）', async () => {
    const studentId = db.prepare("SELECT id FROM users WHERE username = 's_one'").get().id;
    await root.post(`/api/superadmin/users/${studentId}/mute`, { hours: 5, reason: 'test' });
    const me = await student.get('/api/auth/me');
    assert.ok(me.data.user.mutedUntil, 'mutedUntil missing');
    assert.equal(me.data.user.muteReason, 'test');
    await root.post(`/api/superadmin/users/${studentId}/mute`, { hours: 0 });
  });

  // ================================================================ 4. 禁止发布
  console.log('\n── 4. 禁止发布课程（仍可编辑旧课） ────────────────────────');

  await test('限制发布后不能新建课程', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/publish-block`, { blocked: true, reason: 'Duplicate classes' });
    assert.equal(r.status, 200, r.text);
    const create = await teacherB.post('/api/courses', course({ title: 'Nope', lesson_date: futureDate(8), start_time: '17:00', end_time: '18:00' }));
    assert.equal(create.status, 403, create.text);
    assert.match(create.data.error, /Publishing/i);
  });

  await test('限制发布不影响编辑已有课程', async () => {
    const r = await teacherB.put(`/api/courses/${courseId}`, course({ title: 'Beta class v2', lesson_date: futureDate(5) }));
    assert.equal(r.status, 200, r.text);
  });

  await test('恢复发布权限后可再次发布', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/publish-block`, { blocked: false });
    assert.equal(r.status, 200, r.text);
    const create = await teacherB.post('/api/courses', course({ title: 'Allowed again', lesson_date: futureDate(9), start_time: '18:00', end_time: '19:00' }));
    assert.equal(create.status, 200, create.text);
  });

  // ================================================================ 5. 提权 / 降权
  console.log('\n── 5. 提权 / 降权与自我保护 ───────────────────────────────');

  await test('提升老师为超级管理员后即可访问超管接口', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/admin`, { isAdmin: true });
    assert.equal(r.status, 200, r.text);
    const access = await teacherB.get('/api/superadmin/users');
    assert.equal(access.status, 200, access.text);
  });

  await test('超级管理员之间不能互相封禁', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/ban`, { reason: 'x' });
    assert.equal(r.status, 400, r.text);
    assert.match(r.data.error, /administrators cannot/i);
  });

  await test('不能对自己采取限制措施', async () => {
    const me = await root.get('/api/auth/me');
    const selfId = me.data.user.id;
    const ban = await root.post(`/api/superadmin/users/${selfId}/ban`, { reason: 'x' });
    assert.equal(ban.status, 400, ban.text);
    const del = await root.del(`/api/superadmin/users/${selfId}`);
    assert.equal(del.status, 400, del.text);
    const demote = await root.post(`/api/superadmin/users/${selfId}/admin`, { isAdmin: false });
    assert.equal(demote.status, 400, demote.text);
  });

  await test('取消另一位管理员权限后其失去超管入口', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/admin`, { isAdmin: false });
    assert.equal(r.status, 200, r.text);
    const access = await teacherB.get('/api/superadmin/users');
    assert.equal(access.status, 403, access.text);
  });

  await test('系统必须保留至少一名超级管理员', async () => {
    // 只剩 root 自己：既不能自降，也不能删自己
    const demote = await root.post(`/api/superadmin/users/${db.prepare("SELECT id FROM users WHERE username='root'").get().id}/admin`, { isAdmin: false });
    assert.equal(demote.status, 400, demote.text);
    const count = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
    assert.equal(count, 1);
  });

  // ================================================================ 6. 重置 PIN
  console.log('\n── 6. 重置 PIN ───────────────────────────────────────────');

  await test('重置 PIN 后旧 PIN 失效、新 PIN 可登录', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/pin`, { pin: '4321' });
    assert.equal(r.status, 200, r.text);
    const oldLogin = client();
    const bad = await oldLogin.post('/api/auth/login', { username: 't_beta', password: '1111' });
    assert.equal(bad.status, 401, bad.text);
    const ok = await oldLogin.post('/api/auth/login', { username: 't_beta', password: '4321' });
    assert.equal(ok.status, 200, ok.text);
  });

  await test('PIN 必须是 4 位数字', async () => {
    const r = await root.post(`/api/superadmin/users/${teacherBId}/pin`, { pin: 'abc' });
    assert.equal(r.status, 400, r.text);
  });

  // ================================================================ 7. 课程审核
  console.log('\n── 7. 课程审核：下架 / 恢复 ───────────────────────────────');

  await test('审核列表包含老师姓名与预约人数', async () => {
    const r = await root.get('/api/superadmin/courses');
    assert.equal(r.status, 200, r.text);
    const c = r.data.courses.find(x => x.id === courseId);
    assert.ok(c, 'course missing');
    assert.equal(c.teacherName, 'Teacher Beta');
    assert.ok('bookedCount' in c);
  });

  await test('下架课程需要原因', async () => {
    const r = await root.post(`/api/superadmin/courses/${courseId}/takedown`, { reason: '' });
    assert.equal(r.status, 400, r.text);
  });

  await test('下架后课程被取消且学生看到原因', async () => {
    const r = await root.post(`/api/superadmin/courses/${courseId}/takedown`, { reason: 'Inappropriate content' });
    assert.equal(r.status, 200, r.text);
    const detail = await root.get(`/api/courses/${courseId}`);
    assert.equal(detail.data.course.run_status, 'cancelled');
    assert.match(detail.data.course.status_note, /Inappropriate content/);
    const adminEntry = detail.data.updates.find(u => /admin/i.test(u.summary));
    assert.ok(adminEntry, 'admin takedown not logged in course updates');
  });

  await test('已下架课程不可预约', async () => {
    const r = await student.post(`/api/courses/${courseId}/book`, {});
    assert.equal(r.status, 400, r.text);
  });

  await test('恢复课程后重新可预约', async () => {
    const r = await root.post(`/api/superadmin/courses/${courseId}/restore`, {});
    assert.equal(r.status, 200, r.text);
    const detail = await root.get(`/api/courses/${courseId}`);
    assert.equal(detail.data.course.run_status, 'confirmed');
    const book = await student.post(`/api/courses/${courseId}/book`, {});
    assert.equal(book.status, 200, book.text);
  });

  // ================================================================ 8. 日志与删除
  console.log('\n── 8. 操作日志与账号删除 ─────────────────────────────────');

  await test('操作日志记录执行人、动作与对象', async () => {
    const r = await root.get('/api/superadmin/actions?limit=100');
    assert.equal(r.status, 200, r.text);
    const actions = r.data.actions.map(a => a.action);
    for (const a of ['ban', 'unban', 'mute', 'publish_block', 'course_takedown', 'course_restore', 'reset_pin']) {
      assert.ok(actions.includes(a), `missing action ${a}`);
    }
    const ban = r.data.actions.find(a => a.action === 'ban');
    assert.equal(ban.admin_name, 'Root Admin');
    assert.equal(ban.target_name, 'Teacher Beta');
    assert.ok(ban.created_at);
  });

  await test('删除账号会级联清理其课程与预约', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ?').get(teacherBId).n;
    assert.ok(before > 0);
    const r = await root.del(`/api/superadmin/users/${teacherBId}`);
    assert.equal(r.status, 200, r.text);
    const leftCourses = db.prepare('SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ?').get(teacherBId).n;
    assert.equal(leftCourses, 0);
    const leftBookings = db.prepare('SELECT COUNT(*) AS n FROM course_bookings WHERE course_id = ?').get(courseId).n;
    assert.equal(leftBookings, 0);
    const leftUser = db.prepare('SELECT id FROM users WHERE id = ?').get(teacherBId);
    assert.equal(leftUser, null);
  });

  await test('筛选：只返回学生 / 关键词搜索生效', async () => {
    const onlyStudents = await root.get('/api/superadmin/users?role=student');
    assert.equal(onlyStudents.status, 200);
    assert.ok(onlyStudents.data.users.every(u => u.role === 'student'));
    const search = await root.get('/api/superadmin/users?q=alpha');
    assert.equal(search.data.users.length, 1);
    assert.equal(search.data.users[0].username, 't_alpha');
  });

  await test('普通老师无法使用审核接口（课程下架）', async () => {
    const list = await teacherA.get('/api/superadmin/courses');
    assert.equal(list.status, 403, list.text);
  });

  // ================================================================ 结果
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${passed} passed · ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  · ${f.name}\n    ${f.message}`);
  }
  console.log('═'.repeat(60) + '\n');

  server.close();
  try { fs.unlinkSync(dbPath); } catch (_) { /* ignore */ }
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});

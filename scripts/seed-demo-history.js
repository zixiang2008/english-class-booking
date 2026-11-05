#!/usr/bin/env node
/**
 * scripts/seed-demo-history.js — 生成「过去两周」的模拟课堂数据
 *
 * 用途：让第一次打开系统的人（老师 / 学生）看到真实的历史记录，
 *       明白通知栏、谷歌地址栏、预约、状态与更新记录是怎么用的。
 *
 * 规则（与产品要求一致）：
 *   - 3 位测试老师：测试老师1 / 测试老师2 / 测试老师3，PIN 1314
 *       · 测试老师1 → English Corner
 *       · 测试老师2 → English Corner
 *       · 测试老师3 → 英文学习课程
 *   - 5 位测试学生：测试1 … 测试5，PIN 1314
 *       · 每人每周 3 次课，随机在上述课程中选课
 *   - 每天只在三个时段产生课程：
 *       10:00-12:00 / 15:00-16:00 / 16:00-17:00（Asia/Bangkok）
 *   - 所有课程都落在过去（不含今天及以后），因此只出现在历史里
 *
 * ⚠️ 运行前先停服务（sql.js 会把整库读进内存，运行中的服务会覆盖磁盘结果）。
 *
 *   node scripts/seed-demo-history.js [weeks]
 */
const path = require('path');
const bcrypt = require('bcryptjs');

const WEEKS = Math.max(1, Number(process.argv[2]) || 2);
const PIN = '1314';
const TZ = 'Asia/Bangkok';
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'booking.db');

const { initDatabase } = require('../database');
const { zonedTimeToUtc } = require('../lib/time');

const SLOTS = [
  { start: '10:00', end: '12:00' },
  { start: '15:00', end: '16:00' },
  { start: '16:00', end: '17:00' }
];

const PLACES = [
  { name: 'Sukhumvit Coffee Lab, Bangkok', url: 'https://maps.app.goo.gl/8YqNzQd9LkF3xY7W8' },
  { name: 'Bangkok Language Center, Asok', url: 'https://www.google.com/maps/search/?api=1&query=Bangkok+Language+Center+Asok' },
  { name: 'Little Steps Studio, Thonglor', url: 'https://www.google.com/maps/search/?api=1&query=Little+Steps+Studio+Thonglor' },
  { name: 'Online · Google Meet', url: 'https://www.google.com/maps/search/?api=1&query=Google+Meet+Online' }
];

const NOTICES = [
  '请提前 5 分钟到教室，带上上次的单词卡。See you! 📚',
  '今天我们会做一次小组对话练习，记得带笔记本。',
  'Bring one question you want to ask in English today. 🎤',
  '课程改到三楼大教室，请留意通知栏更新。',
  '本周主题：日常点餐与购物表达，课堂会分组演练。',
  '请先看一遍上次的讲义，课堂上我们会直接开口练。'
];

/** 过去第 n 天（按曼谷时间）的 YYYY-MM-DD */
function dateOffsetBangkok(daysAgo) {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000); // Asia/Bangkok, no DST
  bkk.setUTCDate(bkk.getUTCDate() - daysAgo);
  return bkk.toISOString().slice(0, 10);
}

/** 可复现的伪随机（同一份数据每次生成一致） */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

(async () => {
  const db = await initDatabase();
  const rand = mulberry32(20261105);

  // ---------------------------------------------------------------- accounts
  const upsert = (username, displayName, role, { pin = PIN, resetPassword = true } = {}) => {
    const existing = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username);
    if (existing) {
      if (resetPassword) {
        db.prepare('UPDATE users SET password_hash = ?, display_name = ?, role = ? WHERE id = ?')
          .run(bcrypt.hashSync(pin, 10), displayName, role, existing.id);
      } else {
        db.prepare('UPDATE users SET display_name = ?, role = ? WHERE id = ?')
          .run(displayName, role, existing.id);
      }
      return existing.id;
    }
    return db.prepare('INSERT INTO users (username, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, bcrypt.hashSync(pin, 10), displayName, '', role).lastInsertRowid;
  };

  // 正式老师账号：只在首次创建时写入 PIN，之后不覆盖（避免重置他们的密码）
  upsert('hamish', 'Hamish', 'teacher', { pin: '1234', resetPassword: false });
  upsert('kevin', 'Kevin', 'teacher', { pin: '1234', resetPassword: false });

  const teachers = [
    { username: 'test_teacher1', name: '测试老师1', title: 'English Corner' },
    { username: 'test_teacher2', name: '测试老师2', title: 'English Corner' },
    { username: 'test_teacher3', name: '测试老师3', title: '英文学习课程' }
  ].map(t => ({ ...t, id: upsert(t.username, t.name, 'teacher') }));

  const students = [];
  for (let i = 1; i <= 5; i++) {
    students.push({ username: `test_student${i}`, name: `测试${i}`, id: upsert(`test_student${i}`, `测试${i}`, 'student') });
  }

  // 旧的演示账号（teacher / teacher2 / student）已被新的测试账号取代
  db.prepare("DELETE FROM users WHERE username IN ('teacher','teacher2','student')").run();

  // ---------------------------------------------------------------- wipe old demo classes
  const demoTeacherIds = teachers.map(t => t.id);
  const placeholders = demoTeacherIds.map(() => '?').join(',');
  const oldIds = db.prepare(`SELECT id FROM courses WHERE teacher_id IN (${placeholders})`).all(...demoTeacherIds).map(r => r.id);
  if (oldIds.length) {
    const ph = oldIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM course_bookings WHERE course_id IN (${ph})`).run(...oldIds);
    db.prepare(`DELETE FROM course_updates WHERE course_id IN (${ph})`).run(...oldIds);
    db.prepare(`DELETE FROM courses WHERE id IN (${ph})`).run(...oldIds);
  }

  // ---------------------------------------------------------------- courses
  const days = [];
  for (let d = WEEKS * 7; d >= 1; d--) days.push(dateOffsetBangkok(d));

  const courses = [];
  let seq = 0;
  for (const date of days) {
    SLOTS.forEach((slot, idx) => {
      const teacher = teachers[idx];
      const place = PLACES[(seq + idx) % PLACES.length];
      const notice = NOTICES[seq % NOTICES.length];
      const cancelled = seq % 11 === 7; // 少量取消，展示状态与更新记录
      const revised = !cancelled && seq % 6 === 3;
      const startUtc = zonedTimeToUtc(date, slot.start, TZ).toISOString();
      const endUtc = zonedTimeToUtc(date, slot.end, TZ).toISOString();

      const r = db.prepare(`
        INSERT INTO courses
          (teacher_id, title, notice, notice_updated_at, timezone, lesson_date,
           start_time, end_time, start_utc, end_utc, place_name, google_maps_url,
           capacity, run_status, status_note, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        teacher.id, teacher.title, notice, startUtc, TZ, date,
        slot.start, slot.end, startUtc, endUtc, place.name, place.url,
        8, cancelled ? 'cancelled' : 'completed',
        cancelled ? '老师临时有事，本次课程取消' : '',
        revised ? 2 : 1,
        new Date(new Date(startUtc).getTime() - 5 * 864e5).toISOString().slice(0, 19).replace('T', ' '),
        startUtc.slice(0, 19).replace('T', ' ')
      );

      const courseId = r.lastInsertRowid;
      db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(courseId, teacher.id, 'created', 'Course published / 发布课程',
          new Date(new Date(startUtc).getTime() - 5 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
      if (cancelled) {
        db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(courseId, teacher.id, 'status', 'Class status / 开课状态: cancelled',
            new Date(new Date(startUtc).getTime() - 864e5).toISOString().slice(0, 19).replace('T', ' '));
      }
      if (revised) {
        db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(courseId, teacher.id, 'notice', 'Notice / 通知栏 updated',
            new Date(new Date(startUtc).getTime() - 2 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
      }

      courses.push({ id: courseId, date, startUtc, cancelled });
      seq++;
    });
  }

  // ---------------------------------------------------------------- bookings
  // 每位学生每周 3 次课，随机在可选课程中挑选（不重复、不选已取消的课）。
  const openCourses = courses.filter(c => !c.cancelled);
  let bookings = 0;
  for (const student of students) {
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = w * 7;
      const pool = openCourses.slice(); // 打乱
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      let picked = 0;
      for (const c of pool) {
        if (picked >= 3) break;
        // 保证同一天不排两节课
        const dayIndex = days.indexOf(c.date);
        if (dayIndex < weekStart || dayIndex >= weekStart + 7) continue;
        const clash = db.prepare(`
          SELECT COUNT(*) AS n FROM course_bookings b
          JOIN courses cc ON cc.id = b.course_id
          WHERE b.student_id = ? AND b.status = 'booked' AND cc.lesson_date = ?
        `).get(student.id, c.date).n;
        if (clash) continue;
        const count = db.prepare("SELECT COUNT(*) AS n FROM course_bookings WHERE course_id = ? AND status = 'booked'").get(c.id).n;
        if (count >= 8) continue;

        const bookedAt = new Date(new Date(c.startUtc).getTime() - (1 + Math.floor(rand() * 3)) * 864e5)
          .toISOString().slice(0, 19).replace('T', ' ');
        db.prepare('INSERT INTO course_bookings (course_id, student_id, status, created_at) VALUES (?, ?, ?, ?)')
          .run(c.id, student.id, 'booked', bookedAt);
        bookings++;
        picked++;
      }
    }
  }

  // ---------------------------------------------------------------- report
  const totalCourses = db.prepare('SELECT COUNT(*) AS n FROM courses').get().n;
  const totalBookings = db.prepare("SELECT COUNT(*) AS n FROM course_bookings WHERE status = 'booked'").get().n;
  const users = db.prepare('SELECT username, display_name, role FROM users ORDER BY role, username').all();

  console.log(`Database : ${dbPath}`);
  console.log(`Window   : ${days[0]} → ${days[days.length - 1]} (${days.length} days, ${TZ})`);
  console.log(`Courses  : ${totalCourses} (${courses.filter(c => c.cancelled).length} cancelled)`);
  console.log(`Bookings : ${totalBookings}`);
  console.log('\nAccounts:');
  const pins = { hamish: '1234', kevin: '1234' };
  users.forEach(u => console.log(`  ${u.role.padEnd(8)} ${u.username.padEnd(16)} ${u.display_name.padEnd(12)} PIN ${pins[u.username] || PIN}`));
  console.log('\nDone. Restart the server so it reloads the new data.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

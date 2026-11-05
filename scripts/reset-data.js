#!/usr/bin/env node
/**
 * scripts/reset-data.js — 清空业务数据，保留管理员与站点设置
 *
 *   node scripts/reset-data.js [保留的用户名 ...]
 *
 * 默认保留 `elvis`。会删除：
 *   - 所有课程 / 预约 / 更新记录
 *   - 除保留名单外的所有账号（演示老师、测试学生、注入脏账号）
 *   - 周课表上的预约占用（恢复为全部可约）
 *
 * 会先备份数据库到 booking.backup-<时间戳>.db。
 *
 * ⚠️ 运行前请先停止服务：sql.js 把整库读进内存，运行中的服务会用内存副本
 *    覆盖磁盘上的清理结果。
 */
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'booking.db');
const keep = process.argv.slice(2).filter(Boolean);
if (!keep.length) keep.push('elvis');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = path.join(path.dirname(dbPath), `booking.backup-${stamp}.db`);
fs.copyFileSync(dbPath, backup);

const { initDatabase } = require('../database');

(async () => {
  const db = await initDatabase();
  const placeholders = keep.map(() => '?').join(', ');

  const before = {
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    courses: db.prepare('SELECT COUNT(*) AS n FROM courses').get().n,
    bookings: db.prepare('SELECT COUNT(*) AS n FROM course_bookings').get().n,
    updates: db.prepare('SELECT COUNT(*) AS n FROM course_updates').get().n,
    bookedSlots: db.prepare("SELECT COUNT(*) AS n FROM schedule WHERE status != 'available'").get().n
  };

  const kept = db.prepare(`SELECT id, username, role FROM users WHERE username IN (${placeholders})`).all(...keep);
  if (!kept.length) {
    console.error(`Refusing to wipe: none of the accounts to keep exist (${keep.join(', ')}).`);
    process.exit(1);
  }

  db.transaction(() => {
    db.prepare('DELETE FROM course_bookings').run();
    db.prepare('DELETE FROM course_updates').run();
    db.prepare('DELETE FROM courses').run();
    db.prepare(`DELETE FROM users WHERE username NOT IN (${placeholders})`).run(...keep);
    db.prepare("UPDATE schedule SET status = 'available', booked_by = NULL, booked_name = '', updated_at = CURRENT_TIMESTAMP").run();
    // Let new rows start from a clean sequence (SQLite still respects max(id)+1).
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('courses','course_bookings','course_updates')").run();
    } catch (_) { /* table may not exist */ }
  })();

  const after = {
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    courses: db.prepare('SELECT COUNT(*) AS n FROM courses').get().n,
    bookings: db.prepare('SELECT COUNT(*) AS n FROM course_bookings').get().n,
    updates: db.prepare('SELECT COUNT(*) AS n FROM course_updates').get().n,
    bookedSlots: db.prepare("SELECT COUNT(*) AS n FROM schedule WHERE status != 'available'").get().n
  };

  console.log(`Database : ${dbPath}`);
  console.log(`Backup   : ${backup}`);
  console.log(`Kept     : ${kept.map(u => `${u.username}(${u.role})`).join(', ')}`);
  console.log('');
  console.log('              before   after');
  for (const k of Object.keys(before)) {
    console.log(`${k.padEnd(12)} ${String(before[k]).padStart(6)}  ${String(after[k]).padStart(6)}`);
  }
  console.log('\nRemaining accounts:');
  db.prepare('SELECT id, username, display_name, role FROM users ORDER BY id').all()
    .forEach(u => console.log(`  ${u.id}  ${u.username}  ${u.display_name}  (${u.role})`));
  console.log('\nDone. Restart the server so it reloads the cleaned database.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

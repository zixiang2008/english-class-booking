/**
 * database.js — SQLite (sql.js) storage layer
 *
 * v3 adds a course-centric model on top of the original weekly slot grid:
 *   users            : students + teachers (many teachers supported)
 *   schedule         : legacy recurring 7x8 weekly availability grid
 *   courses          : concrete class sessions published by teachers
 *   course_bookings  : student reservations for courses
 *   course_updates   : change log so students can see "what changed"
 *
 * DB_PATH env var allows tests to run against an isolated database.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { zonedTimeToUtc } = require('./lib/time');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'booking.db');

const TIME_SLOTS = [
  '10:00-11:00', '11:00-12:00', '13:00-14:00', '14:00-15:00',
  '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00'
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let db = null;

/** Minimal better-sqlite3-like wrapper over sql.js, with automatic persistence. */
class DBWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._inTransaction = false;
  }

  prepare(sql) {
    const self = this;
    return {
      get(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        let result = null;
        if (stmt.step()) result = stmt.getAsObject();
        stmt.free();
        return result;
      },
      all(...params) {
        const results = [];
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
      },
      run(...params) {
        self._db.run(sql, params);
        const lastId = self._db.exec('SELECT last_insert_rowid() as id')[0];
        const changes = self._db.getRowsModified();
        if (!self._inTransaction) self._save();
        return { lastInsertRowid: lastId ? lastId.values[0][0] : 0, changes };
      }
    };
  }

  exec(sql) {
    this._db.exec(sql);
    if (!this._inTransaction) this._save();
  }

  transaction(fn) {
    return (...args) => {
      this._inTransaction = true;
      this._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        this._db.run('COMMIT');
        this._inTransaction = false;
        this._save();
        return result;
      } catch (e) {
        this._inTransaction = false;
        try { this._db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    };
  }

  _save() {
    fs.writeFileSync(dbPath, Buffer.from(this._db.export()));
  }
}

function localDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function initDatabase() {
  const SQL = await initSqlJs();
  const sqlDb = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();
  db = new DBWrapper(sqlDb);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      role TEXT DEFAULT 'student' CHECK(role IN ('student', 'teacher')),
      google_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      time_slot TEXT NOT NULL,
      status TEXT DEFAULT 'available' CHECK(status IN ('available', 'not_available', 'booked')),
      booked_by INTEGER DEFAULT NULL,
      booked_name TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booked_by) REFERENCES users(id),
      UNIQUE(day_of_week, time_slot)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      notice TEXT NOT NULL DEFAULT '',
      notice_updated_at DATETIME,
      timezone TEXT NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      place_name TEXT NOT NULL,
      google_maps_url TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
      run_status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK(run_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
      status_note TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS course_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS course_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );

    CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_courses_start ON courses(start_utc);
    CREATE INDEX IF NOT EXISTS idx_bookings_course ON course_bookings(course_id);
  `);

  // Backward-compatible migration for v1 databases.
  try { db.exec('ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT NULL'); } catch (_) { /* exists */ }

  // ---- Seed accounts (idempotent) ----
  if (!db.prepare("SELECT id FROM users WHERE username = ?").get('teacher')) {
    db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
      .run('teacher', bcrypt.hashSync('1111', 10), 'Teacher Yosowa', 'teacher');
  }
  if (!db.prepare("SELECT id FROM users WHERE username = ?").get('teacher2')) {
    db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
      .run('teacher2', bcrypt.hashSync('2345', 10), 'Teacher Anna', 'teacher');
  }
  if (!db.prepare("SELECT id FROM users WHERE username = ?").get('student')) {
    db.prepare('INSERT INTO users (username, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run('student', bcrypt.hashSync('1234', 10), 'Demo Student', '', 'student');
  }

  // v3 migration: v2 shipped a 10-character teacher password, but every account
  // now uses a 4-digit PIN. Upgrade the legacy demo teacher in existing databases.
  try {
    const legacy = db.prepare("SELECT id, password_hash FROM users WHERE username = 'teacher'").get();
    if (legacy && bcrypt.compareSync('teacher123', legacy.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(bcrypt.hashSync('1111', 10), legacy.id);
    }
  } catch (_) { /* database created fresh — nothing to migrate */ }

  // ---- Seed legacy weekly grid (idempotent) ----
  if (db.prepare('SELECT COUNT(*) as count FROM schedule').get().count === 0) {
    const insert = db.prepare('INSERT INTO schedule (day_of_week, time_slot, status, booked_name) VALUES (?, ?, ?, ?)');
    const defaults = [
      [0, 0, 'booked', 'Mama'], [1, 0, 'not_available', ''], [2, 0, 'booked', 'Mama'],
      [3, 0, 'not_available', ''], [4, 0, 'booked', 'Mama'], [5, 0, 'booked', 'Jason'], [6, 0, 'booked', 'Jason'],
      [0, 1, 'not_available', ''], [1, 1, 'available', ''], [2, 1, 'not_available', ''],
      [3, 1, 'available', ''], [4, 1, 'available', ''], [5, 1, 'booked', 'Jason'], [6, 1, 'booked', 'Jason'],
      [0, 2, 'not_available', ''], [1, 2, 'not_available', ''], [2, 2, 'available', ''],
      [3, 2, 'not_available', ''], [4, 2, 'not_available', ''], [5, 2, 'available', ''], [6, 2, 'available', ''],
      [0, 3, 'available', ''], [1, 3, 'available', ''], [2, 3, 'available', ''],
      [3, 3, 'available', ''], [4, 3, 'not_available', ''], [5, 3, 'not_available', ''], [6, 3, 'not_available', ''],
      [0, 4, 'available', ''], [1, 4, 'available', ''], [2, 4, 'available', ''], [3, 4, 'available', ''],
      [4, 4, 'available', ''], [5, 4, 'available', ''], [6, 4, 'available', ''],
      [0, 5, 'booked', 'Cc'], [1, 5, 'booked', 'CH'], [2, 5, 'booked', 'Cc'], [3, 5, 'available', ''],
      [4, 5, 'booked', 'CH'], [5, 5, 'available', ''], [6, 5, 'not_available', ''],
      [0, 6, 'booked', 'Cc'], [1, 6, 'available', ''], [2, 6, 'booked', 'CH'], [3, 6, 'booked', 'CH'],
      [4, 6, 'available', ''], [5, 6, 'available', ''], [6, 6, 'not_available', ''],
      [0, 7, 'available', ''], [1, 7, 'available', ''], [2, 7, 'booked', 'Jason'], [3, 7, 'available', ''],
      [4, 7, 'available', ''], [5, 7, 'available', ''], [6, 7, 'available', '']
    ];
    db.transaction(entries => {
      for (const [day, idx, status, name] of entries) insert.run(day, TIME_SLOTS[idx], status, name);
    })(defaults);
  }

  // ---- Seed demo courses so the multi-teacher board is alive on first run ----
  if (db.prepare('SELECT COUNT(*) as count FROM courses').get().count === 0) {
    const t1 = db.prepare("SELECT id FROM users WHERE username = 'teacher'").get().id;
    const t2 = db.prepare("SELECT id FROM users WHERE username = 'teacher2'").get().id;
    const demos = [
      {
        teacher_id: t1, title: 'Conversational English · Beginner',
        notice: '请提前 5 分钟到教室，带上上次的单词卡。See you! 📚',
        timezone: 'Asia/Bangkok', dateOffset: 1, start: '10:00', end: '11:00',
        place: 'Sukhumvit Coffee Lab, Bangkok',
        map: 'https://maps.app.goo.gl/8YqNzQd9LkF3xY7W8',
        capacity: 4, status: 'confirmed'
      },
      {
        teacher_id: t2, title: 'IELTS Speaking Practice',
        notice: 'Bring one Part 2 cue card idea. We will record a mock test. 🎤',
        timezone: 'Asia/Bangkok', dateOffset: 2, start: '14:00', end: '15:00',
        place: 'Bangkok Language Center, Asok',
        map: 'https://www.google.com/maps/search/?api=1&query=Bangkok+Language+Center+Asok',
        capacity: 6, status: 'confirmed'
      },
      {
        teacher_id: t1, title: 'Business Email Writing',
        notice: '本次课程改为线上，链接会在课前发送，请留意通知栏更新。',
        timezone: 'Asia/Shanghai', dateOffset: 3, start: '19:00', end: '20:00',
        place: 'Online · Google Meet',
        map: 'https://www.google.com/maps/search/?api=1&query=Google+Meet+Online',
        capacity: 8, status: 'pending', status_note: 'Waiting for at least 2 students / 满 2 人开课',
        updated: true
      },
      {
        teacher_id: t2, title: 'Kids Phonics Fun',
        notice: 'Parents are welcome to stay for the last 10 minutes. 🧸',
        timezone: 'Asia/Bangkok', dateOffset: 4, start: '11:00', end: '12:00',
        place: 'Little Steps Studio, Thonglor',
        map: 'https://www.google.com/maps/search/?api=1&query=Little+Steps+Studio+Thonglor',
        capacity: 5, status: 'confirmed'
      }
    ];
    db.transaction(entries => {
      for (const c of entries) {
        const date = localDateOffset(c.dateOffset);
        const startUtc = zonedTimeToUtc(date, c.start, c.timezone).toISOString();
        const endUtc = zonedTimeToUtc(date, c.end, c.timezone).toISOString();
        const r = db.prepare(`
          INSERT INTO courses
            (teacher_id, title, notice, notice_updated_at, timezone, lesson_date,
             start_time, end_time, start_utc, end_utc, place_name, google_maps_url,
             capacity, run_status, status_note, revision)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(c.teacher_id, c.title, c.notice, c.timezone, date, c.start, c.end,
          startUtc, endUtc, c.place, c.map, c.capacity, c.status, c.status_note || '');
        db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary) VALUES (?, ?, ?, ?)')
          .run(r.lastInsertRowid, c.teacher_id, 'created', 'Course published / 发布课程');
        if (c.updated) {
          db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary) VALUES (?, ?, ?, ?)')
            .run(r.lastInsertRowid, c.teacher_id, 'notice', 'Changed to online class / 改为线上上课，请查看通知栏');
          db.prepare('UPDATE courses SET revision = 2 WHERE id = ?').run(r.lastInsertRowid);
        }
      }
    })(demos);
  }

  // ---- Site settings (v2.1 feature, kept in v3) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
  const defaultSettings = {
    site_phone: '',
    site_email: 'zixiang2008@gmail.com',
    site_title: "财神'S Class",
    site_line_url: 'https://line.me/ti/p/LJq8xrH-HU'
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (!db.prepare('SELECT key FROM site_settings WHERE key = ?').get(key)) {
      db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(key, value);
    }
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb, TIME_SLOTS, DAYS };

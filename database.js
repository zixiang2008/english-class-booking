const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'booking.db');

// Time slots matching the image
const TIME_SLOTS = [
  '10:00-11:00',
  '11:00-12:00',
  '13:00-14:00',
  '14:00-15:00',
  '15:00-16:00',
  '16:00-17:00',
  '17:00-18:00',
  '18:00-19:00'
];

// Days of week: 0=Monday ... 6=Sunday
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let db = null;

// Helper: wraps sql.js to provide a similar API to better-sqlite3
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
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },
      all(...params) {
        const results = [];
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
      run(...params) {
        self._db.run(sql, params);
        const lastId = self._db.exec("SELECT last_insert_rowid() as id")[0];
        const changes = self._db.getRowsModified();
        if (!self._inTransaction) {
          self._save();
        }
        return {
          lastInsertRowid: lastId ? lastId.values[0][0] : 0,
          changes
        };
      }
    };
  }

  exec(sql) {
    this._db.exec(sql);
    if (!this._inTransaction) {
      this._save();
    }
  }

  transaction(fn) {
    return (...args) => {
      this._inTransaction = true;
      this._db.run('BEGIN TRANSACTION');
      try {
        fn(...args);
        this._db.run('COMMIT');
        this._inTransaction = false;
        this._save();
      } catch (e) {
        this._inTransaction = false;
        try { this._db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    };
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new DBWrapper(sqlDb);

  // Create tables
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
  `);

  // Add google_id column if it doesn't exist (migration for existing databases)
  try {
    db.exec('ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT NULL');
  } catch (e) {
    // Column already exists, ignore
  }

  // Initialize default teacher account if not exists
  const teacherExists = db.prepare('SELECT id FROM users WHERE role = ?').get('teacher');
  if (!teacherExists) {
    const hash = bcrypt.hashSync('teacher123', 10);
    db.prepare(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run('teacher', hash, 'Teacher Yosowa', 'teacher');
  }

  // Initialize schedule slots if empty
  const slotCount = db.prepare('SELECT COUNT(*) as count FROM schedule').get();
  if (slotCount.count === 0) {
    const insert = db.prepare('INSERT INTO schedule (day_of_week, time_slot, status, booked_name) VALUES (?, ?, ?, ?)');

    // Default schedule matching the image
    const defaults = [
      // 10:00-11:00
      [0, 0, 'booked', 'Mama'], [1, 0, 'not_available', ''], [2, 0, 'booked', 'Mama'],
      [3, 0, 'not_available', ''], [4, 0, 'booked', 'Mama'], [5, 0, 'booked', 'Jason'],
      [6, 0, 'booked', 'Jason'],
      // 11:00-12:00
      [0, 1, 'not_available', ''], [1, 1, 'available', ''], [2, 1, 'not_available', ''],
      [3, 1, 'available', ''], [4, 1, 'available', ''], [5, 1, 'booked', 'Jason'],
      [6, 1, 'booked', 'Jason'],
      // 13:00-14:00
      [0, 2, 'not_available', ''], [1, 2, 'not_available', ''], [2, 2, 'available', ''],
      [3, 2, 'not_available', ''], [4, 2, 'not_available', ''], [5, 2, 'available', ''],
      [6, 2, 'available', ''],
      // 14:00-15:00
      [0, 3, 'available', ''], [1, 3, 'available', ''], [2, 3, 'available', ''],
      [3, 3, 'available', ''], [4, 3, 'not_available', ''], [5, 3, 'not_available', ''],
      [6, 3, 'not_available', ''],
      // 15:00-16:00
      [0, 4, 'available', ''], [1, 4, 'available', ''], [2, 4, 'available', ''],
      [3, 4, 'available', ''], [4, 4, 'available', ''], [5, 4, 'available', ''],
      [6, 4, 'available', ''],
      // 16:00-17:00
      [0, 5, 'booked', 'Cc'], [1, 5, 'booked', 'CH'], [2, 5, 'booked', 'Cc'],
      [3, 5, 'available', ''], [4, 5, 'booked', 'CH'], [5, 5, 'available', ''],
      [6, 5, 'not_available', ''],
      // 17:00-18:00
      [0, 6, 'booked', 'Cc'], [1, 6, 'available', ''], [2, 6, 'booked', 'CH'],
      [3, 6, 'booked', 'CH'], [4, 6, 'available', ''], [5, 6, 'available', ''],
      [6, 6, 'not_available', ''],
      // 18:00-19:00
      [0, 7, 'available', ''], [1, 7, 'available', ''], [2, 7, 'booked', 'Jason'],
      [3, 7, 'available', ''], [4, 7, 'available', ''], [5, 7, 'available', ''],
      [6, 7, 'available', ''],
    ];

    const insertMany = db.transaction((entries) => {
      for (const [day, slotIdx, status, name] of entries) {
        insert.run(day, TIME_SLOTS[slotIdx], status, name);
      }
    });

    insertMany(defaults);
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb, TIME_SLOTS, DAYS };

#!/usr/bin/env node
/**
 * Create or reset a booking account.
 *
 *   node scripts/create-user.js <username> <4-digit-pin> [role] [displayName]
 *
 *   role: teacher | student   (default: teacher)
 *
 * Examples:
 *   node scripts/create-user.js elvis 1314 teacher Elvis
 *   node scripts/create-user.js student 1234 student "Demo Student"
 *
 * The database is loaded into memory by sql.js, so stop the running server
 * before using this script, then start it again — otherwise the server will
 * flush its own copy of the database over your change.
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { initDatabase } = require('../database');

const [username, pin, roleArg, ...nameParts] = process.argv.slice(2);
const role = roleArg === 'student' ? 'student' : 'teacher';
const displayName = nameParts.join(' ').trim() || username;

function usage(msg) {
  if (msg) console.error('Error: ' + msg);
  console.error('Usage: node scripts/create-user.js <username> <4-digit-pin> [teacher|student] [displayName]');
  process.exit(1);
}

if (!username) usage('username is required');
if (!/^\d{4}$/.test(pin || '')) usage('PIN must be exactly 4 digits');

(async () => {
  const db = await initDatabase();
  const hash = bcrypt.hashSync(pin, 10);
  const existing = db.prepare('SELECT id, role FROM users WHERE username = ?').get(username);

  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, display_name = ? WHERE id = ?')
      .run(hash, role, displayName, existing.id);
    console.log(`Updated  ${username}  (id ${existing.id}, role ${role}) — PIN reset to ${pin}`);
  } else {
    const r = db.prepare('INSERT INTO users (username, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, hash, displayName, '', role);
    console.log(`Created  ${username}  (id ${r.lastInsertRowid}, role ${role}) — PIN ${pin}`);
  }
  console.log(`Database: ${process.env.DB_PATH || path.join(__dirname, '..', 'booking.db')}`);
  console.log('Remember to restart the server if it is running.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Grant or revoke super-administrator rights (v3.1).
 *
 *   node scripts/grant-admin.js <username>            # grant
 *   node scripts/grant-admin.js <username> --revoke   # revoke
 *   node scripts/grant-admin.js --list                # show every super admin
 *
 * Super admins can manage every teacher and student account, suspend or mute
 * them, block publishing, take classes down and read the audit log.
 *
 * The database is loaded into memory by sql.js, so stop the running server
 * first, then start it again — otherwise the server flushes its own copy over
 * your change.
 */
const path = require('path');
const { initDatabase } = require('../database');

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const list = args.includes('--list');
const username = String(args.find(a => !a.startsWith('--')) || '').trim();

(async () => {
  const db = await initDatabase();

  if (list || !username) {
    const admins = db.prepare(
      "SELECT id, username, display_name FROM users WHERE is_admin = 1 ORDER BY id"
    ).all();
    if (!admins.length) console.log('No super administrator yet.');
    else {
      console.log(`Super administrators (${admins.length}):`);
      for (const a of admins) console.log(`  #${a.id}  ${a.username}  ·  ${a.display_name}`);
    }
    return;
  }

  const user = db.prepare('SELECT id, username, display_name, role, is_admin FROM users WHERE lower(username) = lower(?)').get(username);
  if (!user) {
    console.error(`No such user: ${username}`);
    process.exit(1);
  }

  if (revoke) {
    const others = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id != ?').get(user.id).n;
    if (others === 0) {
      console.error('Refused: at least one super administrator must remain.');
      process.exit(1);
    }
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(user.id);
    console.log(`Revoked super admin from ${username}.`);
  } else {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    console.log(`Granted super admin to ${username} (${user.display_name}).`);
  }
  console.log(`Database: ${process.env.DB_PATH || path.join(__dirname, '..', 'booking.db')}`);
  console.log('Remember to restart the server if it is running.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

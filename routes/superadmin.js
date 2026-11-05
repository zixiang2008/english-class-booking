/**
 * routes/superadmin.js — v3.1 super-administrator console.
 *
 * The super admin is the highest authority in the system: it can manage every
 * teacher and student account, suspend accounts, mute them, block publishing,
 * review and take down any class, and inspect the audit trail.
 *
 * Every mutating call writes an `admin_actions` row so moderation stays
 * accountable. Guard rails: you cannot restrict yourself, admins cannot
 * restrict each other, and the last remaining admin cannot be demoted/deleted.
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { t } = require('../i18n-server');
const { requireAdmin, actor, isMuted } = require('../lib/guards');
const { sqliteToIso } = require('../lib/time');

const PERMANENT_MUTE = '9999-12-31T23:59:59.000Z';

router.use(requireAdmin);

// ------------------------------------------------------------------ helpers

function logAction(db, req, { action, targetUser = null, targetCourse = null, detail = '' }) {
  const me = actor(req);
  db.prepare(`
    INSERT INTO admin_actions (admin_id, admin_name, target_user_id, target_name, target_course_id, action, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    me.id, me.display_name,
    targetUser ? targetUser.id : null, targetUser ? targetUser.display_name : '',
    targetCourse ? targetCourse.id : null,
    action, String(detail || '').slice(0, 300)
  );
}

function adminCount(db, excludeId = null) {
  return excludeId
    ? db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id != ?').get(excludeId).n
    : db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
}

function findUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
}

/** Load target user + run the shared guard rails for destructive actions. */
function guardTarget(req, res, { allowAdmin = false } = {}) {
  const db = getDb();
  const me = actor(req);
  const target = findUser(db, req.params.id);
  if (!target) { res.status(404).json({ error: t(req, 'userNotFound') }); return null; }
  if (target.id === me.id) { res.status(400).json({ error: t(req, 'cannotRestrictSelf') }); return null; }
  if (!allowAdmin && Number(target.is_admin) === 1) {
    res.status(400).json({ error: t(req, 'cannotRestrictAdmin') });
    return null;
  }
  return target;
}

function decorateUser(row) {
  const mutedUntil = row.muted_until ? sqliteToIso(row.muted_until) : null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phone: row.phone || '',
    role: row.role,
    isAdmin: Number(row.is_admin) === 1,
    status: row.status || 'active',
    banned: row.status === 'banned',
    banReason: row.ban_reason || '',
    bannedAt: sqliteToIso(row.banned_at),
    muted: isMuted(row),
    mutedUntil: mutedUntil && new Date(mutedUntil).getTime() > Date.now() ? mutedUntil : null,
    muteReason: row.mute_reason || '',
    publishBlocked: Number(row.publish_blocked) === 1,
    publishBlockReason: row.publish_block_reason || '',
    courseCount: Number(row.course_count || 0),
    bookingCount: Number(row.booking_count || 0),
    createdAt: sqliteToIso(row.created_at)
  };
}

// ------------------------------------------------------------------ overview

router.get('/overview', (req, res) => {
  try {
    const db = getDb();
    const one = sql => db.prepare(sql).get().n;
    const users = db.prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM courses c WHERE c.teacher_id = u.id) AS course_count,
        (SELECT COUNT(*) FROM course_bookings b WHERE b.student_id = u.id AND b.status = 'booked') AS booking_count
       FROM users u`
    ).all();
    const mutedCount = users.filter(isMuted).length;

    res.json({
      users: {
        total: users.length,
        teachers: users.filter(u => u.role === 'teacher').length,
        students: users.filter(u => u.role === 'student').length,
        admins: users.filter(u => Number(u.is_admin) === 1).length,
        banned: users.filter(u => u.status === 'banned').length,
        muted: mutedCount,
        publishBlocked: users.filter(u => Number(u.publish_blocked) === 1).length
      },
      courses: {
        total: one('SELECT COUNT(*) AS n FROM courses'),
        upcoming: one(`SELECT COUNT(*) AS n FROM courses WHERE end_utc > datetime('now')`),
        cancelled: one("SELECT COUNT(*) AS n FROM courses WHERE run_status = 'cancelled'"),
        pending: one("SELECT COUNT(*) AS n FROM courses WHERE run_status = 'pending'")
      },
      bookings: one("SELECT COUNT(*) AS n FROM course_bookings WHERE status = 'booked'"),
      recentActions: db.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT 8').all()
        .map(a => ({ ...a, created_at: sqliteToIso(a.created_at) }))
    });
  } catch (err) {
    console.error('Superadmin overview error:', err);
    res.status(500).json({ error: t(req, 'actionFailed') });
  }
});

// ------------------------------------------------------------------ users

router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const role = String(req.query.role || '');
    const q = String(req.query.q || '').trim().toLowerCase();
    const filter = String(req.query.filter || ''); // banned | muted | blocked | admin

    let rows = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM courses c WHERE c.teacher_id = u.id) AS course_count,
        (SELECT COUNT(*) FROM course_bookings b WHERE b.student_id = u.id AND b.status = 'booked') AS booking_count
      FROM users u
      ORDER BY u.is_admin DESC, CASE u.role WHEN 'teacher' THEN 0 ELSE 1 END, u.display_name COLLATE NOCASE
    `).all();

    if (role === 'teacher' || role === 'student') rows = rows.filter(u => u.role === role);
    if (q) {
      rows = rows.filter(u =>
        String(u.username).toLowerCase().includes(q) ||
        String(u.display_name).toLowerCase().includes(q) ||
        String(u.phone || '').toLowerCase().includes(q));
    }
    if (filter === 'banned') rows = rows.filter(u => u.status === 'banned');
    if (filter === 'muted') rows = rows.filter(isMuted);
    if (filter === 'blocked') rows = rows.filter(u => Number(u.publish_blocked) === 1);
    if (filter === 'admin') rows = rows.filter(u => Number(u.is_admin) === 1);

    res.json({ users: rows.map(decorateUser), total: rows.length });
  } catch (err) {
    console.error('Superadmin users error:', err);
    res.status(500).json({ error: t(req, 'actionFailed') });
  }
});

// ---- suspend / restore

router.post('/users/:id/ban', (req, res) => {
  const db = getDb();
  const target = guardTarget(req, res);
  if (!target) return;
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) return res.status(400).json({ error: t(req, 'reasonRequired') });

  db.prepare("UPDATE users SET status = 'banned', ban_reason = ?, banned_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(reason, target.id);
  logAction(db, req, { action: 'ban', targetUser: target, detail: reason });
  res.json({ success: true, message: t(req, 'userBanned') });
});

router.post('/users/:id/unban', (req, res) => {
  const db = getDb();
  const target = guardTarget(req, res);
  if (!target) return;
  db.prepare("UPDATE users SET status = 'active', ban_reason = '', banned_at = NULL WHERE id = ?").run(target.id);
  logAction(db, req, { action: 'unban', targetUser: target });
  res.json({ success: true, message: t(req, 'userUnbanned') });
});

// ---- mute (cannot post / book) — hours: >0 duration, -1 permanent, 0 lift

router.post('/users/:id/mute', (req, res) => {
  const db = getDb();
  const target = guardTarget(req, res);
  if (!target) return;

  const hours = Number(req.body.hours);
  if (!Number.isFinite(hours)) return res.status(400).json({ error: t(req, 'actionFailed') });

  if (hours === 0) {
    db.prepare('UPDATE users SET muted_until = NULL, mute_reason = ? WHERE id = ?').run('', target.id);
    logAction(db, req, { action: 'unmute', targetUser: target });
    return res.json({ success: true, message: t(req, 'userUnmuted') });
  }

  const reason = String(req.body.reason || '').trim().slice(0, 200);
  const until = hours < 0 ? PERMANENT_MUTE : new Date(Date.now() + hours * 3600 * 1000).toISOString();
  db.prepare('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?').run(until, reason, target.id);
  logAction(db, req, {
    action: 'mute', targetUser: target,
    detail: hours < 0 ? `permanent · ${reason}` : `${hours}h · ${reason}`
  });
  res.json({ success: true, message: t(req, 'userMuted'), mutedUntil: until });
});

// ---- publish block (can still edit own existing classes)

router.post('/users/:id/publish-block', (req, res) => {
  const db = getDb();
  const target = guardTarget(req, res);
  if (!target) return;
  const blocked = req.body.blocked !== false;
  const reason = String(req.body.reason || '').trim().slice(0, 200);

  db.prepare('UPDATE users SET publish_blocked = ?, publish_block_reason = ? WHERE id = ?')
    .run(blocked ? 1 : 0, blocked ? reason : '', target.id);
  logAction(db, req, {
    action: blocked ? 'publish_block' : 'publish_allow',
    targetUser: target, detail: blocked ? reason : ''
  });
  res.json({ success: true, message: blocked ? t(req, 'publishBlockedOk') : t(req, 'publishAllowed') });
});

// ---- promote / demote

router.post('/users/:id/admin', (req, res) => {
  const db = getDb();
  const me = actor(req);
  const grant = req.body.isAdmin !== false;
  const target = findUser(db, req.params.id);
  if (!target) return res.status(404).json({ error: t(req, 'userNotFound') });

  if (grant) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(target.id);
    logAction(db, req, { action: 'promote', targetUser: target });
    return res.json({ success: true, message: t(req, 'adminGranted') });
  }

  if (target.id === me.id) return res.status(400).json({ error: t(req, 'cannotRestrictSelf') });
  if (Number(target.is_admin) !== 1) return res.json({ success: true, message: t(req, 'adminRevoked') });
  if (adminCount(db, target.id) === 0) return res.status(400).json({ error: t(req, 'lastAdmin') });

  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(target.id);
  logAction(db, req, { action: 'demote', targetUser: target });
  res.json({ success: true, message: t(req, 'adminRevoked') });
});

// ---- reset PIN

router.post('/users/:id/pin', (req, res) => {
  const db = getDb();
  const target = guardTarget(req, res, { allowAdmin: true });
  if (!target) return;
  const pin = String(req.body.pin || '');
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: t(req, 'invalidPin') });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pin, 10), target.id);
  logAction(db, req, { action: 'reset_pin', targetUser: target });
  res.json({ success: true, message: t(req, 'pinReset') });
});

// ---- delete account (cascades classes, bookings, updates)

router.delete('/users/:id', (req, res) => {
  const db = getDb();
  const me = actor(req);
  const target = findUser(db, req.params.id);
  if (!target) return res.status(404).json({ error: t(req, 'userNotFound') });
  if (target.id === me.id) return res.status(400).json({ error: t(req, 'cannotDeleteSelf') });
  if (Number(target.is_admin) === 1) {
    if (adminCount(db, target.id) === 0) return res.status(400).json({ error: t(req, 'lastAdmin') });
    return res.status(400).json({ error: t(req, 'cannotRestrictAdmin') });
  }

  db.transaction(() => {
    const owned = db.prepare('SELECT id FROM courses WHERE teacher_id = ?').all(target.id).map(r => r.id);
    for (const cid of owned) {
      db.prepare('DELETE FROM course_bookings WHERE course_id = ?').run(cid);
      db.prepare('DELETE FROM course_updates WHERE course_id = ?').run(cid);
    }
    db.prepare('DELETE FROM courses WHERE teacher_id = ?').run(target.id);
    db.prepare('DELETE FROM course_bookings WHERE student_id = ?').run(target.id);
    db.prepare("UPDATE schedule SET status = 'available', booked_by = NULL, booked_name = '' WHERE booked_by = ?").run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  })();
  logAction(db, req, {
    action: 'delete_user', targetUser: target,
    detail: `${target.role} · @${target.username}`
  });
  res.json({ success: true, message: t(req, 'userDeleted') });
});

// ------------------------------------------------------------------ courses

router.get('/courses', (req, res) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '');
    const teacherId = Number(req.query.teacher || 0);

    let rows = db.prepare(`
      SELECT c.*, u.display_name AS teacher_name, u.username AS teacher_username,
        (SELECT COUNT(*) FROM course_bookings b WHERE b.course_id = c.id AND b.status = 'booked') AS booked_count
      FROM courses c JOIN users u ON u.id = c.teacher_id
      ORDER BY c.start_utc DESC
    `).all();

    if (status) rows = rows.filter(c => c.run_status === status);
    if (teacherId) rows = rows.filter(c => c.teacher_id === teacherId);
    if (q) {
      rows = rows.filter(c =>
        String(c.title).toLowerCase().includes(q) ||
        String(c.teacher_name).toLowerCase().includes(q) ||
        String(c.place_name).toLowerCase().includes(q));
    }

    res.json({
      courses: rows.slice(0, 300).map(c => ({
        id: c.id,
        title: c.title,
        teacherId: c.teacher_id,
        teacherName: c.teacher_name,
        teacherUsername: c.teacher_username,
        lessonDate: c.lesson_date,
        startTime: c.start_time,
        endTime: c.end_time,
        timezone: c.timezone,
        startUtc: c.start_utc,
        endUtc: c.end_utc,
        placeName: c.place_name,
        googleMapsUrl: c.google_maps_url,
        runStatus: c.run_status,
        statusNote: c.status_note,
        notice: c.notice,
        revision: Number(c.revision),
        bookedCount: Number(c.booked_count || 0),
        isPast: new Date(c.end_utc).getTime() <= Date.now(),
        updatedAt: sqliteToIso(c.updated_at)
      })),
      total: rows.length
    });
  } catch (err) {
    console.error('Superadmin courses error:', err);
    res.status(500).json({ error: t(req, 'actionFailed') });
  }
});

router.post('/courses/:id/takedown', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.id));
  if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) return res.status(400).json({ error: t(req, 'reasonRequired') });

  const note = `⛔ Admin / 管理员：${reason}`.slice(0, 200);
  db.transaction(() => {
    db.prepare("UPDATE courses SET run_status = 'cancelled', status_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(note, course.id);
    db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary) VALUES (?, ?, ?, ?)')
      .run(course.id, course.teacher_id, 'status', `Class taken down by admin / 管理员下架：${reason}`);
    db.prepare('UPDATE courses SET revision = revision + 1 WHERE id = ?').run(course.id);
  })();
  logAction(db, req, { action: 'course_takedown', targetCourse: course, detail: reason });
  res.json({ success: true, message: t(req, 'courseTakenDown') });
});

router.post('/courses/:id/restore', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.id));
  if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });

  db.transaction(() => {
    db.prepare("UPDATE courses SET run_status = 'confirmed', status_note = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(course.id);
    db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary) VALUES (?, ?, ?, ?)')
      .run(course.id, course.teacher_id, 'status', 'Class restored by admin / 管理员恢复课程');
    db.prepare('UPDATE courses SET revision = revision + 1 WHERE id = ?').run(course.id);
  })();
  logAction(db, req, { action: 'course_restore', targetCourse: course });
  res.json({ success: true, message: t(req, 'courseRestored') });
});

// ------------------------------------------------------------------ audit log

router.get('/actions', (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const rows = db.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ actions: rows.map(a => ({ ...a, created_at: sqliteToIso(a.created_at) })) });
  } catch (err) {
    res.status(500).json({ error: t(req, 'actionFailed') });
  }
});

module.exports = router;

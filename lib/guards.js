/**
 * lib/guards.js — session guards shared by all API routers.
 *
 * The actor is always re-read from the database (cached per request) instead of
 * trusting the session, so a ban, mute or promotion takes effect on the very
 * next request without forcing the user to log in again.
 */
const { getDb } = require('../database');
const { t } = require('../i18n-server');
const { sqliteToIso } = require('./time');

/** Load (and memoise) the current user row for this request. */
function actor(req) {
  if (req._actor !== undefined) return req._actor;
  const uid = req.session && req.session.userId;
  if (!uid) { req._actor = null; return null; }
  let row = null;
  try {
    row = getDb().prepare(
      `SELECT id, username, display_name, role, is_admin, status, ban_reason,
              muted_until, mute_reason, publish_blocked, publish_block_reason
       FROM users WHERE id = ?`
    ).get(uid);
  } catch (_) { row = null; }
  req._actor = row || null;
  return req._actor;
}

function isAdmin(user) {
  return !!user && Number(user.is_admin) === 1;
}

function isBanned(user) {
  return !!user && user.status === 'banned';
}

/** A mute is active until its timestamp passes. `null` means "not muted". */
function isMuted(user) {
  if (!user || !user.muted_until) return false;
  const iso = sqliteToIso(user.muted_until);
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

function isPublishBlocked(user) {
  return !!user && Number(user.publish_blocked) === 1;
}

/** 401 when anonymous, 403 when the account has been banned. */
function requireLogin(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isBanned(me)) {
    req.session.destroy(() => { });
    return res.status(403).json({ error: t(req, 'accountBanned'), reason: me.ban_reason || '' });
  }
  next();
}

function requireTeacher(req, res, next) {
  // Distinguish "not authenticated" (401) from "authenticated but wrong role"
  // (403) so clients can decide whether to show a login prompt.
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isBanned(me)) {
    req.session.destroy(() => { });
    return res.status(403).json({ error: t(req, 'accountBanned'), reason: me.ban_reason || '' });
  }
  if (me.role !== 'teacher') {
    return res.status(403).json({ error: t(req, 'teacherRequired') });
  }
  next();
}

function requireStudent(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isBanned(me)) {
    req.session.destroy(() => { });
    return res.status(403).json({ error: t(req, 'accountBanned'), reason: me.ban_reason || '' });
  }
  if (me.role === 'teacher') return res.status(403).json({ error: t(req, 'teacherCantBook') });
  next();
}

/** Highest privilege in the system: super administrators only. */
function requireAdmin(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isBanned(me)) {
    req.session.destroy(() => { });
    return res.status(403).json({ error: t(req, 'accountBanned'), reason: me.ban_reason || '' });
  }
  if (!isAdmin(me)) return res.status(403).json({ error: t(req, 'adminRequired') });
  next();
}

/** Teachers who may create classes (not muted, not publish-blocked). */
function requireCanPublish(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isMuted(me)) return res.status(403).json({ error: t(req, 'accountMuted'), until: me.muted_until, reason: me.mute_reason || '' });
  if (isPublishBlocked(me)) return res.status(403).json({ error: t(req, 'publishBlocked'), reason: me.publish_block_reason || '' });
  next();
}

/** Teachers who may edit content of classes they already own (mute only). */
function requireCanEdit(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isMuted(me)) return res.status(403).json({ error: t(req, 'accountMuted'), until: me.muted_until, reason: me.mute_reason || '' });
  next();
}

/** Students who may book (a muted student is read-only). */
function requireCanBook(req, res, next) {
  const me = actor(req);
  if (!me) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (isMuted(me)) return res.status(403).json({ error: t(req, 'accountMuted'), until: me.muted_until, reason: me.mute_reason || '' });
  next();
}

module.exports = {
  actor, isAdmin, isBanned, isMuted, isPublishBlocked,
  requireLogin, requireTeacher, requireStudent, requireAdmin,
  requireCanPublish, requireCanEdit, requireCanBook
};

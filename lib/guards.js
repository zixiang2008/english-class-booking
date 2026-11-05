/** lib/guards.js — tiny session guards shared by all API routers. */
const { t } = require('../i18n-server');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: t(req, 'loginFirst') });
  next();
}

function requireTeacher(req, res, next) {
  // Distinguish "not authenticated" (401) from "authenticated but wrong role"
  // (403) so clients can decide whether to show a login prompt.
  if (!req.session.userId) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (req.session.role !== 'teacher') {
    return res.status(403).json({ error: t(req, 'teacherRequired') });
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: t(req, 'loginFirst') });
  if (req.session.role === 'teacher') return res.status(403).json({ error: t(req, 'teacherCantBook') });
  next();
}

module.exports = { requireLogin, requireTeacher, requireStudent };

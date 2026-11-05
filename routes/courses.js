/**
 * routes/courses.js — v3 course API
 *
 * Public:  GET  /api/courses, /api/courses/teachers, /api/courses/:id,
 *               /api/courses/:id/updates
 * Teacher: POST /api/courses, PUT /api/courses/:id,
 *          POST /api/courses/:id/status, DELETE /api/courses/:id
 * Student: POST /api/courses/:id/book, POST /api/courses/:id/cancel
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { t } = require('../i18n-server');
const { requireTeacher, requireStudent, requireLogin } = require('../lib/guards');
const { validateCourse, RUN_STATUSES } = require('../lib/course-validation');
const { gmtOffsetLabel, googleCalendarUrl, COMMON_TIMEZONES, sqliteToIso } = require('../lib/time');

const TIMESTAMP_FIELDS = ['created_at', 'updated_at', 'notice_updated_at', 'last_update_at'];

const COURSE_SELECT = `
  SELECT c.*, u.display_name AS teacher_name,
    (SELECT COUNT(*) FROM course_bookings b WHERE b.course_id = c.id AND b.status = 'booked') AS booked_count,
    (SELECT b.id FROM course_bookings b WHERE b.course_id = c.id AND b.student_id = ? AND b.status = 'booked' LIMIT 1) AS my_booking_id,
    (SELECT MAX(cu.created_at) FROM course_updates cu WHERE cu.course_id = c.id) AS last_update_at,
    (SELECT cu.summary FROM course_updates cu WHERE cu.course_id = c.id ORDER BY cu.id DESC LIMIT 1) AS last_update_summary
  FROM courses c JOIN users u ON u.id = c.teacher_id
`;

function decorate(row) {
  if (!row) return null;
  const c = { ...row };
  for (const k of TIMESTAMP_FIELDS) c[k] = sqliteToIso(c[k]);
  c.booked_count = Number(c.booked_count || 0);
  c.seats_left = Math.max(0, Number(c.capacity) - c.booked_count);
  c.is_my_booking = !!c.my_booking_id;
  c.has_update = Number(c.revision) > 1;
  c.is_past = new Date(c.end_utc).getTime() <= Date.now();
  c.gmt_offset = gmtOffsetLabel(c.timezone, new Date(c.start_utc));
  c.google_calendar_url = googleCalendarUrl({ ...c, teacher_name: row.teacher_name });
  return c;
}

function getCourse(db, id, userId) {
  return decorate(db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(userId || 0, id));
}

function logUpdate(db, courseId, teacherId, type, summary, { bumpRevision = true } = {}) {
  db.prepare('INSERT INTO course_updates (course_id, teacher_id, change_type, summary) VALUES (?, ?, ?, ?)')
    .run(courseId, teacherId, type, summary);
  if (!bumpRevision) return; // the initial "published" entry must not flag the class as updated
  db.prepare('UPDATE courses SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(courseId);
}

function describeChanges(oldRow, v) {
  const changes = [];
  if (oldRow.notice !== v.notice) changes.push({ type: 'notice', text: 'Notice / 通知栏 updated' });
  if (oldRow.lesson_date !== v.lesson_date || oldRow.start_time !== v.start_time ||
      oldRow.end_time !== v.end_time || oldRow.timezone !== v.timezone) {
    changes.push({ type: 'time', text: 'Time / 时间·时区 changed' });
  }
  if (oldRow.place_name !== v.place_name || oldRow.google_maps_url !== v.google_maps_url) {
    changes.push({ type: 'place', text: 'Place / 地点·谷歌地址 changed' });
  }
  if (oldRow.run_status !== v.run_status || oldRow.status_note !== v.status_note) {
    changes.push({ type: 'status', text: `Class status / 开课状态: ${v.run_status}` });
  }
  if (oldRow.title !== v.title) changes.push({ type: 'title', text: 'Course title changed' });
  if (Number(oldRow.capacity) !== v.capacity) changes.push({ type: 'capacity', text: `Capacity: ${v.capacity}` });
  if (!changes.length) changes.push({ type: 'edit', text: 'Course details updated' });
  return changes;
}

// ------------------------------------------------------------------ public

router.get('/teachers', (req, res) => {
  try {
    const db = getDb();
    const teachers = db.prepare(
      `SELECT u.id, u.display_name, COUNT(c.id) AS course_count
       FROM users u JOIN courses c ON c.teacher_id = u.id
       WHERE u.role = 'teacher' GROUP BY u.id ORDER BY u.display_name`
    ).all();
    res.json({ teachers });
  } catch (err) {
    console.error('List teachers error:', err);
    res.status(500).json({ error: t(req, 'coursesFailed') });
  }
});

/** Publishing form options (single source of truth for timezones). */
router.get('/config', (req, res) => {
  res.json({
    timezones: COMMON_TIMEZONES,
    runStatuses: RUN_STATUSES,
    maxNoticeLength: require('../lib/course-validation').MAX_NOTICE_LENGTH,
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
});

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.userId || 0;
    const rows = db.prepare(`${COURSE_SELECT} ORDER BY c.start_utc ASC`).all(userId);
    let courses = rows.map(decorate);

    // Upcoming classes first (soonest at the top), finished ones pushed to the
    // end (most recent first) so the board never opens on stale lessons.
    const nowIso = new Date().toISOString();
    courses.sort((a, b) => {
      if (a.is_past !== b.is_past) return a.is_past ? 1 : -1;
      return a.is_past
        ? String(b.start_utc).localeCompare(String(a.start_utc))
        : String(a.start_utc).localeCompare(String(b.start_utc));
    });

    const teacherParam = String(req.query.teacher || '');
    const teacherId = teacherParam === 'me' ? (req.session.userId || -1) : Number(teacherParam || 0);
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim().toLowerCase();
    if (teacherId) courses = courses.filter(c => c.teacher_id === teacherId);
    if (status) courses = courses.filter(c => c.run_status === status);
    if (q) courses = courses.filter(c =>
      [c.title, c.place_name, c.notice, c.teacher_name].some(v => String(v || '').toLowerCase().includes(q)));
    if (req.query.mine === '1') courses = courses.filter(c => c.is_my_booking);

    res.json({
      courses,
      viewer: req.session.userId ? {
        id: req.session.userId, role: req.session.role, displayName: req.session.displayName
      } : null,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('List courses error:', err);
    res.status(500).json({ error: t(req, 'coursesFailed') });
  }
});

router.get('/:id/updates', (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(id);
    if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });
    const updates = db.prepare(
      `SELECT cu.*, u.display_name AS teacher_name FROM course_updates cu
       JOIN users u ON u.id = cu.teacher_id WHERE cu.course_id = ? ORDER BY cu.id DESC LIMIT 30`
    ).all(id).map(u => ({ ...u, created_at: sqliteToIso(u.created_at) }));
    res.json({ updates });
  } catch (err) {
    res.status(500).json({ error: t(req, 'coursesFailed') });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const course = getCourse(db, Number(req.params.id), req.session.userId);
    if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });
    const updates = db.prepare(
      'SELECT cu.*, u.display_name AS teacher_name FROM course_updates cu JOIN users u ON u.id = cu.teacher_id WHERE cu.course_id = ? ORDER BY cu.id DESC LIMIT 10'
    ).all(course.id).map(u => ({ ...u, created_at: sqliteToIso(u.created_at) }));
    const bookings = req.session.role === 'teacher' && req.session.userId === course.teacher_id
      ? db.prepare(
        `SELECT b.id, b.created_at, u.display_name FROM course_bookings b
         JOIN users u ON u.id = b.student_id WHERE b.course_id = ? AND b.status = 'booked' ORDER BY b.id DESC`
      ).all(course.id)
      : [];
    res.json({ course, updates, bookings });
  } catch (err) {
    res.status(500).json({ error: t(req, 'coursesFailed') });
  }
});

// ------------------------------------------------------------------ teacher

router.post('/', requireTeacher, (req, res) => {
  try {
    const db = getDb();
    const result = validateCourse(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: t(req, 'invalidCourse'), fields: result.fields, firstCode: result.firstCode });
    }
    const v = result.value;
    const clash = db.prepare(
      'SELECT id, title FROM courses WHERE teacher_id = ? AND start_utc < ? AND end_utc > ? LIMIT 1'
    ).get(req.session.userId, v.end_utc, v.start_utc);
    if (clash) {
      return res.status(400).json({
        error: t(req, 'duplicateSlot'),
        fields: { start_time: 'duplicateSlot' },
        duplicateId: clash.id
      });
    }
    const r = db.prepare(`
      INSERT INTO courses
        (teacher_id, title, notice, notice_updated_at, timezone, lesson_date,
         start_time, end_time, start_utc, end_utc, place_name, google_maps_url,
         capacity, run_status, status_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.session.userId, v.title, v.notice, v.notice ? new Date().toISOString() : null,
      v.timezone, v.lesson_date, v.start_time, v.end_time, v.start_utc, v.end_utc,
      v.place_name, v.google_maps_url, v.capacity, v.run_status, v.status_note
    );
    logUpdate(db, r.lastInsertRowid, req.session.userId, 'created', 'Course published / 发布课程', { bumpRevision: false });
    res.json({ success: true, id: r.lastInsertRowid, message: t(req, 'courseCreated') });
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: t(req, 'updateFailed') });
  }
});

router.put('/:id', requireTeacher, (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ error: t(req, 'courseNotFound') });
    if (old.teacher_id !== req.session.userId) {
      return res.status(403).json({ error: t(req, 'courseNoPermission') });
    }
    const payload = { ...req.body };
    // A partial update must not silently reset the class status.
    if (payload.run_status === undefined) payload.run_status = old.run_status;
    if (payload.status_note === undefined) payload.status_note = old.status_note;
    const result = validateCourse(payload);
    if (!result.ok) {
      return res.status(400).json({ error: t(req, 'invalidCourse'), fields: result.fields, firstCode: result.firstCode });
    }
    const v = result.value;
    const clash = db.prepare(
      'SELECT id FROM courses WHERE teacher_id = ? AND start_utc < ? AND end_utc > ? AND id != ? LIMIT 1'
    ).get(req.session.userId, v.end_utc, v.start_utc, id);
    if (clash) {
      return res.status(400).json({
        error: t(req, 'duplicateSlot'),
        fields: { start_time: 'duplicateSlot' },
        duplicateId: clash.id
      });
    }
    db.prepare(`
      UPDATE courses SET title = ?, notice = ?, notice_updated_at = ?, timezone = ?,
        lesson_date = ?, start_time = ?, end_time = ?, start_utc = ?, end_utc = ?,
        place_name = ?, google_maps_url = ?, capacity = ?, run_status = ?, status_note = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      v.title, v.notice, v.notice ? new Date().toISOString() : old.notice_updated_at,
      v.timezone, v.lesson_date, v.start_time, v.end_time, v.start_utc, v.end_utc,
      v.place_name, v.google_maps_url, v.capacity, v.run_status, v.status_note, id
    );
    for (const ch of describeChanges(old, v)) logUpdate(db, id, req.session.userId, ch.type, ch.text);
    res.json({ success: true, message: t(req, 'courseUpdated') });
  } catch (err) {
    console.error('Update course error:', err);
    res.status(500).json({ error: t(req, 'updateFailed') });
  }
});

router.post('/:id/status', requireTeacher, (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ error: t(req, 'courseNotFound') });
    if (old.teacher_id !== req.session.userId) {
      return res.status(403).json({ error: t(req, 'courseNoPermission') });
    }
    const status = String(req.body.status || '');
    if (!RUN_STATUSES.includes(status)) return res.status(400).json({ error: t(req, 'invalidStatus') });
    const note = String(req.body.status_note || '').trim().slice(0, 200);
    db.prepare('UPDATE courses SET run_status = ?, status_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, note, id);
    logUpdate(db, id, req.session.userId, 'status', `Class status / 开课状态: ${status}`);
    res.json({ success: true, message: t(req, 'courseStatusUpdated') });
  } catch (err) {
    res.status(500).json({ error: t(req, 'updateFailed') });
  }
});

router.delete('/:id', requireTeacher, (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ error: t(req, 'courseNotFound') });
    if (old.teacher_id !== req.session.userId) {
      return res.status(403).json({ error: t(req, 'courseNoPermission') });
    }
    db.transaction(() => {
      db.prepare('DELETE FROM course_bookings WHERE course_id = ?').run(id);
      db.prepare('DELETE FROM course_updates WHERE course_id = ?').run(id);
      db.prepare('DELETE FROM courses WHERE id = ?').run(id);
    })();
    res.json({ success: true, message: t(req, 'courseDeleted') });
  } catch (err) {
    res.status(500).json({ error: t(req, 'removeFailed') });
  }
});

// ------------------------------------------------------------------ student

router.post('/:id/book', requireStudent, (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });
    if (['cancelled', 'completed'].includes(course.run_status)) {
      return res.status(400).json({ error: t(req, 'courseClosed') });
    }
    if (new Date(course.end_utc).getTime() <= Date.now()) {
      return res.status(400).json({ error: t(req, 'courseEnded') });
    }
    const existing = db.prepare(
      "SELECT id FROM course_bookings WHERE course_id = ? AND student_id = ? AND status = 'booked'"
    ).get(id, req.session.userId);
    if (existing) return res.status(400).json({ error: t(req, 'courseAlreadyBooked') });
    const count = db.prepare("SELECT COUNT(*) AS n FROM course_bookings WHERE course_id = ? AND status = 'booked'").get(id).n;
    if (count >= course.capacity) return res.status(400).json({ error: t(req, 'courseFull') });

    db.prepare('INSERT INTO course_bookings (course_id, student_id, status) VALUES (?, ?, ?)')
      .run(id, req.session.userId, 'booked');
    res.json({ success: true, message: t(req, 'courseBookSuccess') });
  } catch (err) {
    console.error('Book course error:', err);
    res.status(500).json({ error: t(req, 'bookFailed') });
  }
});

router.post('/:id/cancel', requireLogin, (req, res) => {
  try {
    const db = getDb();
    const id = Number(req.params.id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!course) return res.status(404).json({ error: t(req, 'courseNotFound') });
    const booking = db.prepare(
      "SELECT * FROM course_bookings WHERE course_id = ? AND student_id = ? AND status = 'booked'"
    ).get(id, req.session.userId);
    const isOwnerTeacher = req.session.role === 'teacher' && course.teacher_id === req.session.userId;
    if (!booking && !isOwnerTeacher) return res.status(400).json({ error: t(req, 'courseNotBooked') });
    if (booking) {
      db.prepare("UPDATE course_bookings SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(booking.id);
    } else {
      // A teacher may dismiss a booking; find the most recent one.
      const b = db.prepare("SELECT id FROM course_bookings WHERE course_id = ? AND status = 'booked' ORDER BY id DESC LIMIT 1").get(id);
      if (!b) return res.status(400).json({ error: t(req, 'courseNotBooked') });
      db.prepare("UPDATE course_bookings SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?").run(b.id);
    }
    res.json({ success: true, message: t(req, 'courseCancelSuccess') });
  } catch (err) {
    res.status(500).json({ error: t(req, 'cancelFailed') });
  }
});

module.exports = router;

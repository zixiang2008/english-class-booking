const express = require('express');
const router = express.Router();
const { getDb, TIME_SLOTS, DAYS } = require('../database');
const { t } = require('../i18n-server');
const { requireTeacher } = require('../lib/guards');
const { sqliteToIso } = require('../lib/time');

// Get all schedule with booking details
router.get('/schedule', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const slots = db.prepare(`
      SELECT s.*, u.display_name as student_name, u.phone as student_phone, u.username as student_username
      FROM schedule s
      LEFT JOIN users u ON s.booked_by = u.id
      ORDER BY s.day_of_week, s.time_slot
    `).all();

        res.json({
            timeSlots: TIME_SLOTS,
            days: DAYS,
            slots
        });
    } catch (err) {
        console.error('Admin schedule error:', err);
        res.status(500).json({ error: t(req, 'scheduleFailed') });
    }
});

// Update slot status
router.post('/update-slot', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const { slotId, status } = req.body;

        if (!slotId || !status) {
            return res.status(400).json({ error: t(req, 'paramsIncomplete') });
        }

        if (!['available', 'not_available'].includes(status)) {
            return res.status(400).json({ error: t(req, 'invalidStatus') });
        }

        db.prepare(
            'UPDATE schedule SET status = ?, booked_by = NULL, booked_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(status, '', slotId);

        res.json({ success: true });
    } catch (err) {
        console.error('Update slot error:', err);
        res.status(500).json({ error: t(req, 'updateFailed') });
    }
});

// Remove a booking (set back to available)
router.post('/remove-booking', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const { slotId } = req.body;

        db.prepare(
            'UPDATE schedule SET status = ?, booked_by = NULL, booked_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run('available', '', slotId);

        res.json({ success: true, message: t(req, 'removed') });
    } catch (err) {
        console.error('Remove booking error:', err);
        res.status(500).json({ error: t(req, 'removeFailed') });
    }
});

// Get all students
router.get('/students', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const students = db.prepare(
            'SELECT id, username, display_name, phone, created_at FROM users WHERE role = ? ORDER BY created_at DESC'
        ).all('student');

        // Count bookings per student — v3 bookings live in course_bookings,
        // the legacy `schedule` table is empty on a v3 database.
        const bookingCounts = db.prepare(`
      SELECT student_id, COUNT(*) as count FROM course_bookings
      WHERE status = 'booked'
      GROUP BY student_id
    `).all();

        const countMap = {};
        for (const bc of bookingCounts) {
            countMap[bc.student_id] = bc.count;
        }

        const result = students.map(s => ({
            ...s,
            created_at: sqliteToIso(s.created_at),
            bookingCount: countMap[s.id] || 0
        }));

        res.json(result);
    } catch (err) {
        console.error('Get students error:', err);
        res.status(500).json({ error: t(req, 'studentsFailed') });
    }
});

// ------------------------------------------------------------------ v3 dashboard

/** Live booking feed for the logged-in teacher (newest first). */
router.get('/bookings', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const bookings = db.prepare(`
            SELECT b.id AS booking_id, b.status AS booking_status, b.created_at AS booked_at,
                   u.display_name AS student_name, u.username AS student_username, u.phone AS student_phone,
                   c.id AS course_id, c.title AS course_title, c.lesson_date, c.start_time,
                   c.end_time, c.timezone, c.start_utc, c.place_name, c.run_status
            FROM course_bookings b
            JOIN courses c ON c.id = b.course_id
            JOIN users u ON u.id = b.student_id
            WHERE c.teacher_id = ? AND b.status = 'booked'
            ORDER BY b.id DESC LIMIT 200
        `).all(req.session.userId).map(b => ({ ...b, booked_at: sqliteToIso(b.booked_at) }));
        res.json({ bookings, serverTime: new Date().toISOString() });
    } catch (err) {
        console.error('Admin bookings error:', err);
        res.status(500).json({ error: t(req, 'bookingsFailed') });
    }
});

/** Numbers for the teacher dashboard cards. */
router.get('/overview', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const uid = req.session.userId;
        const courses = db.prepare('SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ?').get(uid).n;
        const confirmed = db.prepare("SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ? AND run_status = 'confirmed'").get(uid).n;
        const pending = db.prepare("SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ? AND run_status = 'pending'").get(uid).n;
        const bookings = db.prepare(`
            SELECT COUNT(*) AS n FROM course_bookings b JOIN courses c ON c.id = b.course_id
            WHERE c.teacher_id = ? AND b.status = 'booked'
        `).get(uid).n;
        const students = db.prepare(`
            SELECT COUNT(DISTINCT b.student_id) AS n FROM course_bookings b JOIN courses c ON c.id = b.course_id
            WHERE c.teacher_id = ? AND b.status = 'booked'
        `).get(uid).n;
        const teachers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'").get().n;
        res.json({ courses, confirmed, pending, bookings, students, teachers });
    } catch (err) {
        res.status(500).json({ error: t(req, 'bookingsFailed') });
    }
});

module.exports = router;

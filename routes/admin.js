const express = require('express');
const router = express.Router();
const { getDb, TIME_SLOTS, DAYS } = require('../database');
const { t } = require('../i18n-server');

// Middleware: check if user is teacher
function requireTeacher(req, res, next) {
    if (!req.session.userId || req.session.role !== 'teacher') {
        return res.status(403).json({ error: t(req, 'teacherRequired') });
    }
    next();
}

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

        // Count bookings per student
        const bookingCounts = db.prepare(`
      SELECT booked_by, COUNT(*) as count FROM schedule 
      WHERE status = 'booked' AND booked_by IS NOT NULL 
      GROUP BY booked_by
    `).all();

        const countMap = {};
        for (const bc of bookingCounts) {
            countMap[bc.booked_by] = bc.count;
        }

        const result = students.map(s => ({
            ...s,
            bookingCount: countMap[s.id] || 0
        }));

        res.json(result);
    } catch (err) {
        console.error('Get students error:', err);
        res.status(500).json({ error: t(req, 'studentsFailed') });
    }
});

module.exports = router;

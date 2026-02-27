const express = require('express');
const router = express.Router();
const { getDb, TIME_SLOTS, DAYS } = require('../database');
const { t } = require('../i18n-server');

// Get full schedule
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const slots = db.prepare('SELECT * FROM schedule ORDER BY day_of_week, time_slot').all();

        // Build schedule grid
        const schedule = {};
        for (const slot of slots) {
            if (!schedule[slot.time_slot]) {
                schedule[slot.time_slot] = {};
            }
            schedule[slot.time_slot][slot.day_of_week] = {
                id: slot.id,
                status: slot.status,
                bookedName: slot.booked_name || '',
                bookedBy: slot.booked_by
            };
        }

        res.json({
            timeSlots: TIME_SLOTS,
            days: DAYS,
            schedule,
            currentUser: req.session.userId ? {
                id: req.session.userId,
                displayName: req.session.displayName,
                role: req.session.role
            } : null
        });
    } catch (err) {
        console.error('Get schedule error:', err);
        res.status(500).json({ error: t(req, 'scheduleFailed') });
    }
});

// Book a slot
router.post('/book', (req, res) => {
    try {
        const db = getDb();
        if (!req.session.userId) {
            return res.status(401).json({ error: t(req, 'loginFirst') });
        }

        if (req.session.role === 'teacher') {
            return res.status(403).json({ error: t(req, 'teacherCantBook') });
        }

        const { slotId } = req.body;
        if (!slotId) {
            return res.status(400).json({ error: t(req, 'selectSlot') });
        }

        const slot = db.prepare('SELECT * FROM schedule WHERE id = ?').get(slotId);
        if (!slot) {
            return res.status(404).json({ error: t(req, 'slotNotFound') });
        }

        if (slot.status !== 'available') {
            return res.status(400).json({ error: t(req, 'slotUnavailable') });
        }

        db.prepare(
            'UPDATE schedule SET status = ?, booked_by = ?, booked_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run('booked', req.session.userId, req.session.displayName, slotId);

        res.json({ success: true, message: t(req, 'bookSuccess') });
    } catch (err) {
        console.error('Book error:', err);
        res.status(500).json({ error: t(req, 'bookFailed') });
    }
});

// Cancel booking
router.post('/cancel', (req, res) => {
    try {
        const db = getDb();
        if (!req.session.userId) {
            return res.status(401).json({ error: t(req, 'loginFirst') });
        }

        const { slotId } = req.body;
        const slot = db.prepare('SELECT * FROM schedule WHERE id = ?').get(slotId);

        if (!slot) {
            return res.status(404).json({ error: t(req, 'slotNotFound') });
        }

        // Only the person who booked or teacher can cancel
        if (slot.booked_by !== req.session.userId && req.session.role !== 'teacher') {
            return res.status(403).json({ error: t(req, 'noPermission') });
        }

        db.prepare(
            'UPDATE schedule SET status = ?, booked_by = NULL, booked_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run('available', '', slotId);

        res.json({ success: true, message: t(req, 'cancelled') });
    } catch (err) {
        console.error('Cancel error:', err);
        res.status(500).json({ error: t(req, 'cancelFailed') });
    }
});

module.exports = router;

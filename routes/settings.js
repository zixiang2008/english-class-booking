const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { t } = require('../i18n-server');

// Middleware: check if user is teacher
function requireTeacher(req, res, next) {
    if (!req.session.userId || req.session.role !== 'teacher') {
        return res.status(403).json({ error: t(req, 'teacherRequired') });
    }
    next();
}

// GET /api/settings - public, return all site settings
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT key, value FROM site_settings').all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

// PUT /api/settings - teacher only, update settings
router.put('/', requireTeacher, (req, res) => {
    try {
        const db = getDb();
        const updates = req.body;

        const allowedKeys = ['site_phone', 'site_email', 'site_title', 'site_line_url'];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedKeys.includes(key)) {
                const exists = db.prepare('SELECT key FROM site_settings WHERE key = ?').get(key);
                if (exists) {
                    db.prepare('UPDATE site_settings SET value = ? WHERE key = ?').run(String(value), key);
                } else {
                    db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(key, String(value));
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: t(req, 'updateFailed') });
    }
});

module.exports = router;

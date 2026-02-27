const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { t } = require('../i18n-server');

// Register
router.post('/register', (req, res) => {
    try {
        const db = getDb();
        const { username, password, displayName, phone } = req.body;

        if (!username || !password || !displayName) {
            return res.status(400).json({ error: t(req, 'fillRequired') });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: t(req, 'passwordMin') });
        }

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: t(req, 'usernameExists') });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(
            'INSERT INTO users (username, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)'
        ).run(username, hash, displayName, phone || '', 'student');

        req.session.userId = result.lastInsertRowid;
        req.session.role = 'student';
        req.session.displayName = displayName;

        res.json({ success: true, user: { id: result.lastInsertRowid, displayName, role: 'student' } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: t(req, 'registerFailed') });
    }
});

// Login
router.post('/login', (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: t(req, 'loginRequired') });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: t(req, 'invalidCredentials') });
        }

        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: t(req, 'invalidCredentials') });
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.displayName = user.display_name;

        res.json({ success: true, user: { id: user.id, displayName: user.display_name, role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: t(req, 'loginFailed') });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
router.get('/me', (req, res) => {
    if (req.session.userId) {
        res.json({
            loggedIn: true,
            user: {
                id: req.session.userId,
                displayName: req.session.displayName,
                role: req.session.role
            }
        });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;

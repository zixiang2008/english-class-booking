const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../database');
const { t } = require('../i18n-server');
const { sqliteToIso } = require('../lib/time');

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
// Teachers self-register with this invite code (change it in production).
const TEACHER_INVITE_CODE = process.env.TEACHER_INVITE_CODE || 'TEACHER2026';

let googleClient = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// Register (now supports 4-digit PIN)
router.post('/register', (req, res) => {
    try {
        const db = getDb();
        const { password, displayName, phone, teacherCode } = req.body;
        // Usernames are case-insensitive everywhere, so "Hamish" and "hamish"
        // are the same account. We keep the spelling the user typed.
        const username = String(req.body.username || '').trim();

        if (!username || !password || !displayName) {
            return res.status(400).json({ error: t(req, 'fillRequired') });
        }

        // Validate 4-digit PIN
        if (!/^\d{4}$/.test(password)) {
            return res.status(400).json({ error: t(req, 'pinDigitsOnly') });
        }

        const existing = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username);
        if (existing) {
            return res.status(400).json({ error: t(req, 'usernameExists') });
        }

        let role = 'student';
        if (teacherCode) {
            if (teacherCode !== TEACHER_INVITE_CODE) {
                return res.status(400).json({ error: t(req, 'teacherCodeInvalid') });
            }
            role = 'teacher';
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(
            'INSERT INTO users (username, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)'
        ).run(username, hash, displayName, phone || '', role);

        req.session.userId = result.lastInsertRowid;
        req.session.role = role;
        req.session.displayName = displayName;

        res.json({ success: true, user: { id: result.lastInsertRowid, displayName, role } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: t(req, 'registerFailed') });
    }
});

// Login (supports both PIN and password for backward compatibility)
router.post('/login', (req, res) => {
    try {
        const db = getDb();
        const { password } = req.body;
        const username = String(req.body.username || '').trim();

        if (!username || !password) {
            return res.status(400).json({ error: t(req, 'loginRequired') });
        }

        // Case-insensitive lookup: "Hamish", "hamish" and "HAMISH" all work.
        const user = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username);
        if (!user) {
            return res.status(401).json({ error: t(req, 'invalidCredentials') });
        }

        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: t(req, 'invalidCredentials') });
        }

        // A banned account cannot sign in at all — the super admin must lift it.
        if (user.status === 'banned') {
            return res.status(403).json({
                error: t(req, 'accountBanned'),
                reason: user.ban_reason || ''
            });
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.displayName = user.display_name;

        res.json({
            success: true,
            user: {
                id: user.id, displayName: user.display_name, role: user.role,
                isAdmin: Number(user.is_admin) === 1
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: t(req, 'loginFailed') });
    }
});

// ============================
// Auth Config (for frontend)
// ============================
router.get('/config', (req, res) => {
    res.json({
        googleOAuthEnabled: !!googleClient,
        teacherRegistrationEnabled: true,
        teacherInviteCodeRequired: !!TEACHER_INVITE_CODE
    });
});

// ============================
// Google OAuth Routes
// ============================

// Initiate Google OAuth
router.get('/google', (req, res) => {
    if (!googleClient) {
        // If Google OAuth is not configured, redirect back with error
        return res.redirect('/login.html?google_auth=error&message=' + encodeURIComponent('Google login is not configured. Please contact the administrator.'));
    }

    const authorizeUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'profile', 'email'],
        prompt: 'select_account'
    });

    res.redirect(authorizeUrl);
});

// Google OAuth Callback
router.get('/google/callback', async (req, res) => {
    try {
        if (!googleClient) {
            return res.redirect('/login.html?google_auth=error&message=' + encodeURIComponent('Google login is not configured'));
        }

        const { code } = req.query;
        if (!code) {
            return res.redirect('/login.html?google_auth=error&message=' + encodeURIComponent('No authorization code received'));
        }

        // Exchange code for tokens
        const { tokens } = await googleClient.getToken(code);
        googleClient.setCredentials(tokens);

        // Verify the ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name || email.split('@')[0];

        const db = getDb();

        // Check if user exists with this Google ID or email
        let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR lower(username) = lower(?)').get(googleId, email);

        if (user) {
            if (user.status === 'banned') {
                return res.redirect('/login.html?google_auth=error&message=' +
                    encodeURIComponent('This account has been suspended. Please contact the administrator.'));
            }
            // Update Google ID if not set
            if (!user.google_id) {
                db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, user.id);
            }
        } else {
            // Create new user
            const result = db.prepare(
                'INSERT INTO users (username, password_hash, display_name, phone, role, google_id) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(email, 'google_oauth_no_password', name, '', 'student', googleId);
            user = {
                id: result.lastInsertRowid,
                display_name: name,
                role: 'student'
            };
        }

        // Set session
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.displayName = user.display_name;

        // Redirect with success
        res.redirect('/?google_auth=success&name=' + encodeURIComponent(user.display_name) + '&role=' + user.role);
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        res.redirect('/login.html?google_auth=error&message=' + encodeURIComponent('Google authentication failed. Please try again.'));
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
router.get('/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const db = getDb();
    const user = db.prepare(
        `SELECT id, display_name, role, is_admin, status, ban_reason,
                muted_until, mute_reason, publish_blocked, publish_block_reason
         FROM users WHERE id = ?`
    ).get(req.session.userId);
    if (!user) {
        req.session.destroy(() => { });
        return res.json({ loggedIn: false });
    }
    if (user.status === 'banned') {
        req.session.destroy(() => { });
        return res.json({ loggedIn: false, banned: true, reason: user.ban_reason || '' });
    }
    const mutedUntil = user.muted_until ? sqliteToIso(user.muted_until) : null;
    res.json({
        loggedIn: true,
        user: {
            id: user.id,
            displayName: user.display_name,
            role: user.role,
            isAdmin: Number(user.is_admin) === 1,
            mutedUntil: mutedUntil && new Date(mutedUntil).getTime() > Date.now() ? mutedUntil : null,
            muteReason: user.mute_reason || '',
            publishBlocked: Number(user.publish_blocked) === 1,
            publishBlockReason: user.publish_block_reason || ''
        }
    });
});

module.exports = router;

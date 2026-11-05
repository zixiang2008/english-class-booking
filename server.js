/**
 * server.js — Express entry point (v3)
 * Start with: npm start   (PORT, DB_PATH, SESSION_SECRET, TEACHER_INVITE_CODE supported)
 */
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./database');

async function startServer() {
    await initDatabase();
    console.log('✅ Database initialized');

    const app = express();
    const PORT = Number(process.env.PORT) || 3000;
    const isProduction = process.env.NODE_ENV === 'production';

    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(express.json({ limit: '64kb' }));
    app.use(express.urlencoded({ extended: true }));

    app.use(session({
        secret: process.env.SESSION_SECRET || 'english-class-booking-secret-key-2024',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            secure: isProduction,
            httpOnly: true,
            sameSite: isProduction ? 'none' : 'lax'
        }
    }));

    // Basic security headers + no-cache for API responses (live booking feed).
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
        if (req.headers['x-language']) {
            res.setHeader('Content-Language', String(req.headers['x-language']));
        }
        next();
    });

    app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

    app.get('/healthz', (req, res) => res.json({ ok: true, version: '3.4.0', time: new Date().toISOString() }));

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/schedule', require('./routes/schedule'));
    app.use('/api/courses', require('./routes/courses'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/superadmin', require('./routes/superadmin'));
    app.use('/api/calendar', require('./routes/calendar'));
    app.use('/api/settings', require('./routes/settings'));

    app.use('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));

    app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
        console.error('Server error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    const server = app.listen(PORT, () => {
        const host = process.env.SITE_URL || `http://localhost:${PORT}`;
        console.log('\n🎓 English Class Booking System v3.4.0 is running!');
        console.log(`   📖 Student / course board : ${host}/`);
        console.log(`   🔧 Teacher admin          : ${host}/admin.html`);
        console.log(`   🛡️  Super admin console    : ${host}/superadmin.html`);
        console.log(`   🌐 Local domain           : ${process.env.SITE_URL || `http://localhost:${PORT}`}`);
        console.log('   👩‍🏫 Demo PIN: teacher / 1111 · teacher2 / 2345 · student / 1234\n');
    });

    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return server;
}

if (require.main === module) {
    startServer().catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}

module.exports = { startServer };

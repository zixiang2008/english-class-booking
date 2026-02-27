const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./database');

async function startServer() {
    // Initialize database first
    await initDatabase();
    console.log('✅ Database initialized');

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Trust proxy for cloud deployment (Render, Railway, etc.)
    app.set('trust proxy', 1);

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const isProduction = process.env.NODE_ENV === 'production';

    app.use(session({
        secret: process.env.SESSION_SECRET || 'english-class-booking-secret-key-2024',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            secure: isProduction,        // HTTPS only in production
            httpOnly: true,              // Prevent XSS
            sameSite: isProduction ? 'none' : 'lax'  // 'none' needed for cross-origin in production
        }
    }));

    // Static files
    app.use(express.static(path.join(__dirname, 'public')));

    // Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/schedule', require('./routes/schedule'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/calendar', require('./routes/calendar'));

    // 404 handler for API routes
    app.use('/api/*', (req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    // Global error handler (catches malformed JSON, etc.)
    app.use((err, req, res, next) => {
        if (err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        console.error('Server error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    // Start server
    app.listen(PORT, () => {
        console.log(`\n🎓 English Class Booking System is running!`);
        console.log(`📖 Student view: http://localhost:${PORT}`);
        console.log(`🔧 Teacher admin: http://localhost:${PORT}/admin.html`);
        console.log(`\n👩‍🏫 Default teacher login: username: teacher / password: teacher123\n`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

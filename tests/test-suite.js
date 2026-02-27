/**
 * ============================
 * Test Suite for English Class Booking System
 * White-box + Black-box Tests
 * ============================
 */

const http = require('http');
const assert = require('assert');

const BASE = 'http://localhost:3000';

// Helper: make HTTP request
function request(method, path, body = null, headers = {}, cookies = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                ...headers,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(cookies ? { 'Cookie': cookies } : {}),
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (e) { }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data,
                    json,
                    cookies: (res.headers['set-cookie'] || []).join('; ')
                });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Extract session cookie
function extractSessionCookie(setCookie) {
    if (!setCookie) return '';
    const match = setCookie.match(/connect\.sid=[^;]+/);
    return match ? match[0] : '';
}

let passed = 0;
let failed = 0;
let errors = [];

function ok(testName) {
    passed++;
    console.log(`  ✅ ${testName}`);
}

function fail(testName, error) {
    failed++;
    const msg = `  ❌ ${testName}: ${error}`;
    errors.push(msg);
    console.log(msg);
}

async function test(name, fn) {
    try {
        await fn();
        ok(name);
    } catch (e) {
        fail(name, e.message);
    }
}

// ============================
// TEST MODULES
// ============================

async function testAuth() {
    console.log('\n🔐 AUTH MODULE TESTS');
    console.log('─'.repeat(50));

    // 1. Register with valid data
    await test('Register new student', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: `test_user_${Date.now()}`,
            password: 'test1234',
            displayName: 'Test Student',
            phone: '0812345678'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.json.success, true);
        assert.strictEqual(res.json.user.role, 'student');
    });

    // 2. Register with missing fields
    await test('Register with missing fields returns 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'incomplete'
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.json.error);
    });

    // 3. Register with short password
    await test('Register with short password returns 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: `short_pw_${Date.now()}`,
            password: '12',
            displayName: 'ShortPW'
        });
        assert.strictEqual(res.status, 400);
    });

    // 4. Register duplicate username
    await test('Register duplicate username returns 400', async () => {
        const uname = `dup_${Date.now()}`;
        await request('POST', '/api/auth/register', {
            username: uname,
            password: 'test1234',
            displayName: 'Dup1'
        });
        const res = await request('POST', '/api/auth/register', {
            username: uname,
            password: 'test1234',
            displayName: 'Dup2'
        });
        assert.strictEqual(res.status, 400);
    });

    // 5. Login with correct credentials
    await test('Login with correct credentials', async () => {
        const res = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.json.success, true);
        assert.strictEqual(res.json.user.role, 'teacher');
    });

    // 6. Login with wrong password
    await test('Login with wrong password returns 401', async () => {
        const res = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'wrongpassword'
        });
        assert.strictEqual(res.status, 401);
    });

    // 7. Login with non-existent user
    await test('Login with non-existent user returns 401', async () => {
        const res = await request('POST', '/api/auth/login', {
            username: 'nonexistent_user_xyz',
            password: 'whatever'
        });
        assert.strictEqual(res.status, 401);
    });

    // 8. Login with missing fields
    await test('Login with missing fields returns 400', async () => {
        const res = await request('POST', '/api/auth/login', {});
        assert.strictEqual(res.status, 400);
    });

    // 9. Get current user (not logged in)
    await test('GET /me when not logged in', async () => {
        const res = await request('GET', '/api/auth/me');
        assert.strictEqual(res.json.loggedIn, false);
    });

    // 10. Get current user (logged in)
    await test('GET /me after login returns user', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('GET', '/api/auth/me', null, {}, cookie);
        assert.strictEqual(res.json.loggedIn, true);
        assert.strictEqual(res.json.user.role, 'teacher');
    });

    // 11. Logout
    await test('Logout clears session', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        await request('POST', '/api/auth/logout', null, {}, cookie);
        // After logout, /me should show not logged in
        const res = await request('GET', '/api/auth/me', null, {}, cookie);
        assert.strictEqual(res.json.loggedIn, false);
    });
}

async function testSchedule() {
    console.log('\n📅 SCHEDULE MODULE TESTS');
    console.log('─'.repeat(50));

    // 1. Get schedule (public)
    await test('GET /api/schedule returns data', async () => {
        const res = await request('GET', '/api/schedule');
        assert.strictEqual(res.status, 200);
        assert.ok(res.json.timeSlots);
        assert.ok(res.json.days);
        assert.ok(res.json.schedule);
        assert.ok(res.json.timeSlots.length >= 7, `Expected at least 7 time slots, got ${res.json.timeSlots.length}`);
        assert.strictEqual(res.json.days.length, 7);
    });

    // 2. Book without auth
    await test('Book without auth returns 401', async () => {
        const res = await request('POST', '/api/schedule/book', { slotId: 1 });
        assert.strictEqual(res.status, 401);
    });

    // 3. Cancel without auth
    await test('Cancel without auth returns 401', async () => {
        const res = await request('POST', '/api/schedule/cancel', { slotId: 1 });
        assert.strictEqual(res.status, 401);
    });

    // 4. Teacher cannot book
    await test('Teacher cannot book returns 403', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('POST', '/api/schedule/book', { slotId: 1 }, {}, cookie);
        assert.strictEqual(res.status, 403);
    });

    // 5. Book without slotId
    await test('Book without slotId returns 400', async () => {
        // Register a student
        const regRes = await request('POST', '/api/auth/register', {
            username: `student_book_${Date.now()}`,
            password: 'test1234',
            displayName: 'BookTest'
        });
        const cookie = extractSessionCookie(regRes.cookies);
        const res = await request('POST', '/api/schedule/book', {}, {}, cookie);
        assert.strictEqual(res.status, 400);
    });

    // 6. Book non-existent slot
    await test('Book non-existent slot returns 404', async () => {
        const regRes = await request('POST', '/api/auth/register', {
            username: `student_ne_${Date.now()}`,
            password: 'test1234',
            displayName: 'NETest'
        });
        const cookie = extractSessionCookie(regRes.cookies);
        const res = await request('POST', '/api/schedule/book', { slotId: 99999 }, {}, cookie);
        assert.strictEqual(res.status, 404);
    });
}

async function testAdmin() {
    console.log('\n👩‍🏫 ADMIN MODULE TESTS');
    console.log('─'.repeat(50));

    // 1. Admin schedule without auth
    await test('Admin schedule without auth returns 403', async () => {
        const res = await request('GET', '/api/admin/schedule');
        assert.strictEqual(res.status, 403);
    });

    // 2. Admin schedule with student auth
    await test('Admin schedule with student returns 403', async () => {
        const regRes = await request('POST', '/api/auth/register', {
            username: `student_admin_${Date.now()}`,
            password: 'test1234',
            displayName: 'AdminTest'
        });
        const cookie = extractSessionCookie(regRes.cookies);
        const res = await request('GET', '/api/admin/schedule', null, {}, cookie);
        assert.strictEqual(res.status, 403);
    });

    // 3. Admin schedule with teacher auth
    await test('Admin schedule with teacher returns data', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('GET', '/api/admin/schedule', null, {}, cookie);
        assert.strictEqual(res.status, 200);
        assert.ok(res.json.timeSlots);
        assert.ok(res.json.slots);
    });

    // 4. Update slot without auth
    await test('Update slot without auth returns 403', async () => {
        const res = await request('POST', '/api/admin/update-slot', { slotId: 1, status: 'available' });
        assert.strictEqual(res.status, 403);
    });

    // 5. Update slot with invalid status
    await test('Update slot with invalid status returns 400', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('POST', '/api/admin/update-slot', { slotId: 1, status: 'invalid' }, {}, cookie);
        assert.strictEqual(res.status, 400);
    });

    // 6. Update slot with missing params
    await test('Update slot with missing params returns 400', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('POST', '/api/admin/update-slot', {}, {}, cookie);
        assert.strictEqual(res.status, 400);
    });

    // 7. Get students with teacher auth
    await test('Get students with teacher auth succeeds', async () => {
        const loginRes = await request('POST', '/api/auth/login', {
            username: 'teacher',
            password: 'teacher123'
        });
        const cookie = extractSessionCookie(loginRes.cookies);
        const res = await request('GET', '/api/admin/students', null, {}, cookie);
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.json));
    });

    // 8. Get students without auth
    await test('Get students without auth returns 403', async () => {
        const res = await request('GET', '/api/admin/students');
        assert.strictEqual(res.status, 403);
    });
}

async function testCalendar() {
    console.log('\n📆 CALENDAR MODULE TESTS');
    console.log('─'.repeat(50));

    // 1. ICS feed returns valid calendar
    await test('GET /api/calendar/schedule.ics returns ICS', async () => {
        const res = await request('GET', '/api/calendar/schedule.ics');
        assert.strictEqual(res.status, 200);
        assert.ok(res.headers['content-type'].includes('text/calendar'));
        assert.ok(res.data.includes('BEGIN:VCALENDAR'));
        assert.ok(res.data.includes('END:VCALENDAR'));
        assert.ok(res.data.includes('BEGIN:VEVENT'));
    });

    // 2. ICS has proper timezone
    await test('ICS contains Asia/Bangkok timezone', async () => {
        const res = await request('GET', '/api/calendar/schedule.ics');
        assert.ok(res.data.includes('TZID:Asia/Bangkok'));
        assert.ok(res.data.includes('X-WR-TIMEZONE:Asia/Bangkok'));
    });

    // 3. ICS has privacy-safe names (initials only)
    await test('ICS shows only initials for privacy', async () => {
        const res = await request('GET', '/api/calendar/schedule.ics');
        // Should contain abbreviated names like "M." not full names
        const lines = res.data.split('\n');
        const summaryLines = lines.filter(l => l.startsWith('SUMMARY:') && l.includes('Booked'));
        for (const line of summaryLines) {
            // format: "📚 Booked - X."  (1 letter + period)
            const match = line.match(/Booked - (.+)/);
            if (match) {
                assert.ok(match[1].length <= 3, `Name not abbreviated: ${match[1]}`);
            }
        }
    });

    // 4. Public schedule JSON
    await test('GET /api/calendar/schedule returns JSON', async () => {
        const res = await request('GET', '/api/calendar/schedule');
        assert.strictEqual(res.status, 200);
        assert.ok(res.json.timeSlots);
        assert.ok(res.json.schedule);
        assert.ok(res.json.subscribeUrl);
    });

    // 5. Calendar info endpoint
    await test('GET /api/calendar/info returns info', async () => {
        const res = await request('GET', '/api/calendar/info');
        assert.strictEqual(res.status, 200);
        assert.ok(res.json.icsSubscriptionUrl);
        assert.ok(res.json.instructions);
        assert.ok(res.json.privacy);
    });
}

async function testI18n() {
    console.log('\n🌐 I18N MODULE TESTS');
    console.log('─'.repeat(50));

    // 1. Server responds with Chinese error when Accept-Language is zh
    await test('Server i18n: Chinese error message', async () => {
        const res = await request('POST', '/api/auth/login', {}, { 'Accept-Language': 'zh-CN' });
        assert.strictEqual(res.status, 400);
        // Should contain Chinese characters
        assert.ok(/[\u4e00-\u9fff]/.test(res.json.error), `Expected Chinese error, got: ${res.json.error}`);
    });

    // 2. Server responds with Thai error  
    await test('Server i18n: Thai error message', async () => {
        const res = await request('POST', '/api/auth/login', {}, { 'Accept-Language': 'th' });
        assert.strictEqual(res.status, 400);
        assert.ok(/[\u0e00-\u0e7f]/.test(res.json.error), `Expected Thai error, got: ${res.json.error}`);
    });

    // 3. Server responds with Japanese error
    await test('Server i18n: Japanese error message', async () => {
        const res = await request('POST', '/api/auth/login', {}, { 'Accept-Language': 'ja' });
        assert.strictEqual(res.status, 400);
        assert.ok(/[\u3000-\u9fff]/.test(res.json.error), `Expected Japanese error, got: ${res.json.error}`);
    });

    // 4. Server responds with English error for unknown lang
    await test('Server i18n: English fallback for unknown language', async () => {
        const res = await request('POST', '/api/auth/login', {}, { 'Accept-Language': 'xx-XX' });
        assert.strictEqual(res.status, 400);
        assert.ok(/[a-zA-Z]/.test(res.json.error), `Expected English error, got: ${res.json.error}`);
    });

    // 5. Custom X-Language header
    await test('Server i18n: X-Language header overrides Accept-Language', async () => {
        const res = await request('POST', '/api/auth/login', {}, {
            'Accept-Language': 'en',
            'X-Language': 'zh'
        });
        assert.strictEqual(res.status, 400);
        assert.ok(/[\u4e00-\u9fff]/.test(res.json.error), `Expected Chinese from X-Language, got: ${res.json.error}`);
    });
}

async function testStaticPages() {
    console.log('\n📄 STATIC PAGE TESTS');
    console.log('─'.repeat(50));

    const pages = [
        { path: '/', name: 'Homepage' },
        { path: '/login.html', name: 'Login Page' },
        { path: '/register.html', name: 'Register Page' },
        { path: '/admin.html', name: 'Admin Page' },
        { path: '/calendar.html', name: 'Calendar Page' },
    ];

    for (const page of pages) {
        await test(`${page.name} loads (200)`, async () => {
            const res = await request('GET', page.path);
            assert.strictEqual(res.status, 200);
            assert.ok(res.data.includes('<!DOCTYPE html>') || res.data.includes('<!doctype html>'));
        });

        await test(`${page.name} includes i18n.js`, async () => {
            const res = await request('GET', page.path);
            assert.ok(res.data.includes('/js/i18n.js'), `${page.name} missing i18n.js`);
        });

        await test(`${page.name} has data-i18n attributes`, async () => {
            const res = await request('GET', page.path);
            assert.ok(res.data.includes('data-i18n='), `${page.name} missing data-i18n`);
        });
    }

    // CSS and JS files load
    await test('CSS file loads', async () => {
        const res = await request('GET', '/css/style.css');
        assert.strictEqual(res.status, 200);
    });

    await test('i18n.js loads', async () => {
        const res = await request('GET', '/js/i18n.js');
        assert.strictEqual(res.status, 200);
    });

    await test('schedule.js loads', async () => {
        const res = await request('GET', '/js/schedule.js');
        assert.strictEqual(res.status, 200);
    });

    await test('admin.js loads', async () => {
        const res = await request('GET', '/js/admin.js');
        assert.strictEqual(res.status, 200);
    });

    await test('auth.js loads', async () => {
        const res = await request('GET', '/js/auth.js');
        assert.strictEqual(res.status, 200);
    });
}

async function testEdgeCases() {
    console.log('\n⚡ EDGE CASE TESTS');
    console.log('─'.repeat(50));

    // 1. Malformed JSON body
    await test('Malformed JSON body handled gracefully', async () => {
        const url = new URL('/api/auth/login', BASE);
        const res = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve({ status: resp.statusCode, data }));
            });
            req.on('error', reject);
            req.write('{invalid json');
            req.end();
        });
        assert.ok(res.status >= 400, 'Should return error status');
    });

    // 2. Non-existent API endpoint
    await test('Non-existent API returns 404', async () => {
        const res = await request('GET', '/api/nonexistent');
        assert.strictEqual(res.status, 404);
    });

    // 3. XSS attempt in username
    await test('XSS in username does not crash', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: '<script>alert(1)</script>',
            password: 'test1234',
            displayName: '<img onerror=alert(1)>',
        });
        // Should either succeed (storing escaped) or return validation error
        assert.ok([200, 400].includes(res.status));
    });

    // 4. Very long input
    await test('Very long username handled', async () => {
        const res = await request('POST', '/api/auth/register', {
            username: 'a'.repeat(10000),
            password: 'test1234',
            displayName: 'Long'
        });
        // Should not crash
        assert.ok([200, 400, 413, 500].includes(res.status));
    });

    // 5. SQL injection attempt
    await test('SQL injection attempt does not crash', async () => {
        const res = await request('POST', '/api/auth/login', {
            username: "' OR '1'='1",
            password: "' OR '1'='1"
        });
        assert.ok([400, 401].includes(res.status));
    });

    // 6. Empty body
    await test('Empty POST body handled', async () => {
        const res = await request('POST', '/api/auth/register');
        assert.ok(res.status >= 400);
    });
}

// ============================
// RUN ALL TESTS
// ============================
async function runAll() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  🧪 English Class Booking - Test Suite          ║');
    console.log('║  White-box + Black-box Tests                    ║');
    console.log('╚══════════════════════════════════════════════════╝');

    const startTime = Date.now();

    await testAuth();
    await testSchedule();
    await testAdmin();
    await testCalendar();
    await testI18n();
    await testStaticPages();
    await testEdgeCases();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '═'.repeat(50));
    console.log(`📊 RESULTS: ${passed} passed, ${failed} failed (${duration}s)`);
    console.log('═'.repeat(50));

    if (errors.length > 0) {
        console.log('\n❌ FAILURES:');
        errors.forEach(e => console.log(e));
    }

    if (failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! ✅');
    }

    process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});

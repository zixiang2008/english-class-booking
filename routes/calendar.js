const express = require('express');
const router = express.Router();
const { getDb, TIME_SLOTS, DAYS } = require('../database');

/**
 * Generate iCal/ICS feed for teacher schedule
 * Public endpoint - no authentication required
 * Only exposes booking status, not private student data
 */
router.get('/schedule.ics', (req, res) => {
    try {
        const db = getDb();
        const slots = db.prepare(`
            SELECT s.day_of_week, s.time_slot, s.status, s.booked_name, s.updated_at
            FROM schedule s
            ORDER BY s.day_of_week, s.time_slot
        `).all();

        // Generate ICS content
        const now = new Date();
        const icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//English Class Booking//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:English Class Schedule - Teacher Yosowa',
            'X-WR-TIMEZONE:Asia/Bangkok',
            // Timezone definition
            'BEGIN:VTIMEZONE',
            'TZID:Asia/Bangkok',
            'BEGIN:STANDARD',
            'DTSTART:19700101T000000',
            'TZOFFSETFROM:+0700',
            'TZOFFSETTO:+0700',
            'TZNAME:ICT',
            'END:STANDARD',
            'END:VTIMEZONE',
        ];

        // Generate recurring weekly events for each slot
        // We generate events for the next 12 weeks from the current Monday
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);

        for (const slot of slots) {
            const [startTime, endTime] = slot.time_slot.split('-');
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);

            // Generate events for 12 weeks
            for (let week = 0; week < 12; week++) {
                const eventDate = new Date(monday);
                eventDate.setDate(monday.getDate() + slot.day_of_week + (week * 7));

                const dtStart = formatICSDate(eventDate, startH, startM);
                const dtEnd = formatICSDate(eventDate, endH, endM);
                const uid = `slot-${slot.day_of_week}-${slot.time_slot.replace(':', '')}-w${week}@english-class-booking`;

                let summary, description, status;
                if (slot.status === 'available') {
                    summary = '✅ Available - English Class';
                    description = 'This time slot is available for booking.';
                    status = 'TENTATIVE';
                } else if (slot.status === 'booked') {
                    // Show only first letter of name for privacy
                    const initial = slot.booked_name ? slot.booked_name.charAt(0) + '.' : 'Student';
                    summary = `📚 Booked - ${initial}`;
                    description = 'This time slot has been booked.';
                    status = 'CONFIRMED';
                } else {
                    summary = '❌ Not Available';
                    description = 'This time slot is not available.';
                    status = 'CANCELLED';
                }

                icsLines.push('BEGIN:VEVENT');
                icsLines.push(`UID:${uid}`);
                icsLines.push(`DTSTAMP:${formatICSDateNow()}`);
                icsLines.push(`DTSTART;TZID=Asia/Bangkok:${dtStart}`);
                icsLines.push(`DTEND;TZID=Asia/Bangkok:${dtEnd}`);
                icsLines.push(`SUMMARY:${summary}`);
                icsLines.push(`DESCRIPTION:${description}`);
                icsLines.push(`STATUS:${status}`);
                icsLines.push(`LOCATION:Online / Teacher Yosowa`);
                icsLines.push('TRANSP:OPAQUE');
                icsLines.push('END:VEVENT');
            }
        }

        icsLines.push('END:VCALENDAR');

        const icsContent = icsLines.join('\r\n');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="english-class-schedule.ics"');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(icsContent);
    } catch (err) {
        console.error('ICS generation error:', err);
        res.status(500).send('Error generating calendar');
    }
});

/**
 * Public web view of the schedule (read-only, no auth needed)
 */
router.get('/schedule', (req, res) => {
    try {
        const db = getDb();
        const slots = db.prepare(`
            SELECT s.day_of_week, s.time_slot, s.status, 
                   CASE WHEN s.status = 'booked' THEN substr(s.booked_name, 1, 1) || '.' ELSE '' END as display_name
            FROM schedule s
            ORDER BY s.day_of_week, s.time_slot
        `).all();

        // Build schedule grid (limited data for privacy)
        const schedule = {};
        for (const slot of slots) {
            if (!schedule[slot.time_slot]) {
                schedule[slot.time_slot] = {};
            }
            schedule[slot.time_slot][slot.day_of_week] = {
                status: slot.status,
                displayName: slot.display_name || ''
            };
        }

        res.json({
            title: 'English Class Schedule - Teacher Yosowa',
            timezone: 'Asia/Bangkok (ICT, UTC+7)',
            timeSlots: TIME_SLOTS,
            days: DAYS,
            schedule,
            note: 'This is a public view. Only booking status is shown. Student details are private.',
            subscribeUrl: '/api/calendar/schedule.ics'
        });
    } catch (err) {
        console.error('Public schedule error:', err);
        res.status(500).json({ error: 'Failed to load schedule' });
    }
});

/**
 * Public info endpoint with subscription URLs
 */
router.get('/info', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        calendarName: 'English Class Schedule - Teacher Yosowa',
        icsSubscriptionUrl: `${baseUrl}/api/calendar/schedule.ics`,
        webViewUrl: `${baseUrl}/api/calendar/schedule`,
        publicViewUrl: `${baseUrl}/calendar.html`,
        timezone: 'Asia/Bangkok (ICT, UTC+7)',
        privacy: {
            note: 'Only booking status is publicly visible. Student names are abbreviated to initials.',
            dataExposed: ['slot status (available/booked/not available)', 'first initial of student name'],
            dataProtected: ['full student names', 'phone numbers', 'usernames', 'booking history']
        },
        instructions: {
            googleCalendar: `1. Open Google Calendar\n2. Click + next to "Other calendars"\n3. Select "From URL"\n4. Paste: ${baseUrl}/api/calendar/schedule.ics\n5. Click "Add calendar"`,
            appleiCal: `1. Open Calendar app\n2. File > New Calendar Subscription\n3. Paste: ${baseUrl}/api/calendar/schedule.ics\n4. Click Subscribe`,
            outlook: `1. Open Outlook Calendar\n2. Add calendar > From Internet\n3. Paste: ${baseUrl}/api/calendar/schedule.ics`,
        }
    });
});

// Helper: format date for ICS (YYYYMMDDTHHMMSS)
function formatICSDate(date, hours, minutes) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(hours).padStart(2, '0');
    const min = String(minutes).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00`;
}

// Helper: format current timestamp for ICS
function formatICSDateNow() {
    const now = new Date();
    return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

module.exports = router;

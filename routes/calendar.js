/**
 * routes/calendar.js — public iCal feed + read-only JSON view.
 * v3: real published courses (timezone / place / Google Maps / notice) are
 * included as concrete events, so a subscriber sees the true time and place.
 */
const express = require('express');
const router = express.Router();
const { getDb, TIME_SLOTS, DAYS } = require('../database');
const { toICSUTC } = require('../lib/time');
const { platformLabel } = require('../lib/platforms');

const esc = s => String(s || '')
  .replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
  .replace(/,/g, '\\,').replace(/;/g, '\\;');

function formatICSDate(date, hours, minutes) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}T${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;
}

const formatICSDateNow = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

router.get('/schedule.ics', (req, res) => {
  try {
    const db = getDb();
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//English Class Booking v3//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:English Class Schedule',
      'X-WR-TIMEZONE:Asia/Bangkok',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Bangkok', 'BEGIN:STANDARD',
      'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700',
      'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE'
    ];

    // --- Published courses: exact UTC instants (unambiguous across timezones) ---
    const courses = db.prepare(`
      SELECT c.*, u.display_name AS teacher_name FROM courses c
      JOIN users u ON u.id = c.teacher_id ORDER BY c.start_utc
    `).all();
    for (const c of courses) {
      const status = c.run_status === 'cancelled' ? 'CANCELLED'
        : c.run_status === 'pending' ? 'TENTATIVE' : 'CONFIRMED';
      const online = c.mode === 'online';
      const platform = online ? platformLabel(c.online_platform) : '';
      const description = [
        `Teacher / 老师: ${c.teacher_name}`,
        c.notice ? `Notice / 通知: ${c.notice}` : '',
        `Timezone / 时区: ${c.timezone}`,
        online ? `Online / 线上: ${platform}${c.online_note ? ` (${c.online_note})` : ''}` : '',
        online ? (c.online_url ? `Join / 会议链接: ${c.online_url}` : '') : '',
        !online ? `Map / 谷歌地址: ${c.google_maps_url}` : ''
      ].filter(Boolean).map(esc).join('\\n');
      const location = online
        ? [platform, c.online_note].filter(Boolean).join(' · ')
        : c.place_name;
      const url = online ? c.online_url : c.google_maps_url;
      lines.push(
        'BEGIN:VEVENT',
        `UID:course-${c.id}@english-class-booking`,
        `DTSTAMP:${formatICSDateNow()}`,
        `DTSTART:${toICSUTC(c.start_utc)}`,
        `DTEND:${toICSUTC(c.end_utc)}`,
        `SUMMARY:${esc(`[${c.run_status}] ${c.title}`)}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${esc(location)}`,
        ...(url ? [`URL:${esc(url)}`] : []),
        `STATUS:${status}`,
        'TRANSP:OPAQUE',
        'END:VEVENT'
      );
    }

    // --- Legacy recurring weekly availability grid (next 12 weeks) ---
    const slots = db.prepare('SELECT day_of_week, time_slot, status, booked_name FROM schedule ORDER BY day_of_week, time_slot').all();
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    monday.setHours(0, 0, 0, 0);

    for (const slot of slots) {
      const [startTime, endTime] = slot.time_slot.split('-');
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      for (let week = 0; week < 12; week++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + slot.day_of_week + week * 7);
        let summary, description, status;
        if (slot.status === 'available') {
          summary = 'Available - English Class'; description = 'Open for booking'; status = 'TENTATIVE';
        } else if (slot.status === 'booked') {
          const initial = slot.booked_name ? slot.booked_name.charAt(0) + '.' : 'Student';
          summary = `Booked - ${initial}`; description = 'This time slot has been booked'; status = 'CONFIRMED';
        } else {
          summary = 'Not Available'; description = 'This time slot is not available'; status = 'CANCELLED';
        }
        lines.push(
          'BEGIN:VEVENT',
          `UID:slot-${slot.day_of_week}-${slot.time_slot.replace(':', '')}-w${week}@english-class-booking`,
          `DTSTAMP:${formatICSDateNow()}`,
          `DTSTART;TZID=Asia/Bangkok:${formatICSDate(d, sh, sm)}`,
          `DTEND;TZID=Asia/Bangkok:${formatICSDate(d, eh, em)}`,
          `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`,
          `STATUS:${status}`, 'LOCATION:Online / Teacher',
          'TRANSP:OPAQUE', 'END:VEVENT'
        );
      }
    }

    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="english-class-schedule.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(lines.join('\r\n'));
  } catch (err) {
    console.error('ICS generation error:', err);
    res.status(500).send('Error generating calendar');
  }
});

/** Public read-only JSON view (privacy: no full student names). */
router.get('/schedule', (req, res) => {
  try {
    const db = getDb();
    const slots = db.prepare(`
      SELECT s.day_of_week, s.time_slot, s.status,
             CASE WHEN s.status = 'booked' THEN substr(s.booked_name, 1, 1) || '.' ELSE '' END AS display_name
      FROM schedule s ORDER BY s.day_of_week, s.time_slot
    `).all();
    const courses = db.prepare(`
      SELECT c.id, c.title, c.timezone, c.lesson_date, c.start_time, c.end_time,
             c.start_utc, c.end_utc, c.place_name, c.google_maps_url, c.notice,
             c.mode, c.online_platform, c.online_url, c.online_note,
             c.run_status, c.status_note, u.display_name AS teacher_name
      FROM courses c JOIN users u ON u.id = c.teacher_id ORDER BY c.start_utc
    `).all();
    const schedule = {};
    for (const slot of slots) {
      (schedule[slot.time_slot] ||= {})[slot.day_of_week] = {
        status: slot.status, displayName: slot.display_name || ''
      };
    }
    res.json({
      title: 'English Class Schedule',
      timezone: 'Per-course IANA timezone (e.g. Asia/Bangkok, UTC+7)',
      timeSlots: TIME_SLOTS, days: DAYS, schedule, courses,
      note: 'Public view. Student names are abbreviated; course time is shown as a real UTC instant plus the teacher timezone.',
      subscribeUrl: '/api/calendar/schedule.ics'
    });
  } catch (err) {
    console.error('Public schedule error:', err);
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

router.get('/info', (req, res) => {
  const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    calendarName: 'English Class Schedule',
    icsSubscriptionUrl: `${baseUrl}/api/calendar/schedule.ics`,
    webViewUrl: `${baseUrl}/api/calendar/schedule`,
    publicViewUrl: `${baseUrl}/calendar.html`,
    siteUrl: baseUrl,
    version: '3.3.0',
    privacy: {
      note: 'Only booking status is publicly visible. Student names are abbreviated to initials.',
      dataExposed: ['slot status', 'course time / timezone / place / Google Maps link / notice', 'first initial of student name'],
      dataProtected: ['full student names', 'phone numbers', 'usernames', 'booking history']
    },
    instructions: {
      googleCalendar: `1. Open Google Calendar\n2. + next to "Other calendars"\n3. From URL\n4. Paste: ${baseUrl}/api/calendar/schedule.ics`,
      appleiCal: `1. Calendar app\n2. File > New Calendar Subscription\n3. Paste: ${baseUrl}/api/calendar/schedule.ics`,
      outlook: `1. Outlook Calendar\n2. Add calendar > From Internet\n3. Paste: ${baseUrl}/api/calendar/schedule.ics`
    }
  });
});

module.exports = router;

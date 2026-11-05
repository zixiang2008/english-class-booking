/**
 * lib/time.js
 * Timezone helpers used for the "Google address bar" feature.
 *
 * A course stores a *local* wall-clock time (lesson_date + start_time) plus
 * an IANA timezone. We convert that to a real UTC instant on the server so
 * that every viewer, whatever their own timezone, sees the correct moment.
 * No external dependency: Intl.DateTimeFormat does the heavy lifting.
 */

const { platformLabel } = require('./platforms');

const COMMON_TIMEZONES = [
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Kuala_Lumpur',
  'Asia/Jakarta', 'Asia/Manila', 'Asia/Ho_Chi_Minh', 'Asia/Kolkata',
  'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC'
];

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
  // "UTC" is valid too
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

/** Offset (in minutes) of `tz` at the given instant, e.g. +420 for Bangkok. */
function getOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? 0 : parts.hour), Number(parts.minute), Number(parts.second)
  );
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "GMT+7", "GMT+5:30", "GMT-4" */
function gmtOffsetLabel(tz, date = new Date()) {
  const off = getOffsetMinutes(date, tz);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/**
 * Convert a local wall-clock time in `tz` into a real UTC Date.
 * Two passes converge even across DST boundaries.
 */
function zonedTimeToUtc(dateStr, timeStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, hh, mm, 0);
  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    guess = new Date(naive - getOffsetMinutes(guess, tz) * 60000);
  }
  return guess;
}

/**
 * SQLite CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" in UTC but without a
 * timezone marker. Browsers parse that as *local* time, which silently shifts
 * every "booked at / updated at" label. Normalise all DB timestamps to real
 * ISO-8601 UTC strings before sending them to the client.
 */
function sqliteToIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/);
  if (m) return `${m[1]}T${m[2]}${m[3] || ''}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Compact UTC stamp used by Google Calendar / ICS: 20261110T030000Z */
function toICSUTC(isoString) {
  return new Date(isoString).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Build an "Add to Google Calendar" URL for a course. */
function googleCalendarUrl(course) {
  const start = course.start_utc || zonedTimeToUtc(course.lesson_date, course.start_time, course.timezone).toISOString();
  const end = course.end_utc || zonedTimeToUtc(course.lesson_date, course.end_time, course.timezone).toISOString();
  const online = course.mode === 'online';
  const platform = online ? (course.online_platform_label || platformLabel(course.online_platform)) : '';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: course.title,
    dates: `${toICSUTC(start)}/${toICSUTC(end)}`,
    details: [
      course.notice ? `Notice / 通知: ${course.notice}` : '',
      online
        ? `Online / 线上: ${platform}${course.online_note ? ` (${course.online_note})` : ''}`
        : (course.place_name ? `Place / 地点: ${course.place_name}` : ''),
      online
        ? (course.online_url ? `Join / 会议链接: ${course.online_url}` : '')
        : (course.google_maps_url ? `Map / 地图: ${course.google_maps_url}` : ''),
      course.teacher_name ? `Teacher / 老师: ${course.teacher_name}` : ''
    ].filter(Boolean).join('\n'),
    // A meeting link is far more useful in the location field than an empty pin.
    location: online
      ? [platform, course.online_url].filter(Boolean).join(' ')
      : (course.google_maps_url || course.place_name || ''),
    ctz: course.timezone
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Human friendly "class time" in a given IANA timezone, using Intl. */
function formatInZone(isoString, tz, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz, dateStyle: 'full', timeStyle: 'short'
  }).format(new Date(isoString));
}

module.exports = {
  COMMON_TIMEZONES, isValidTimeZone, getOffsetMinutes, gmtOffsetLabel,
  zonedTimeToUtc, toICSUTC, googleCalendarUrl, formatInZone, sqliteToIso
};

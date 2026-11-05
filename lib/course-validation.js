/**
 * lib/course-validation.js
 * Single source of truth for course publishing rules.
 * Both the API and the tests use this module, so the browser and the server
 * can never disagree about what a valid course looks like.
 */

const { isValidTimeZone, zonedTimeToUtc } = require('./time');

const RUN_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
const MAX_NOTICE_LENGTH = 100;

/** Only real Google Maps links are accepted for the required address field. */
function isGoogleMapsUrl(raw) {
  if (!raw || typeof raw !== 'string') return false;
  let u;
  try { u = new URL(raw.trim()); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const isGoogleHost =
    host === 'google.com' || host.endsWith('.google.com') ||
    /^google\.(co|com)\.[a-z]{2}$/.test(host) ||
    host === 'goo.gl' || host.endsWith('.goo.gl') ||
    host === 'maps.app.goo.gl';
  if (!isGoogleHost) return false;
  if (host.includes('goo.gl')) return true;           // short shared links
  return u.pathname.startsWith('/maps');               // /maps/place/... or /maps?q=...
}

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isClock(s) {
  if (!/^\d{2}:\d{2}$/.test(s || '')) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function minutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

const charLen = s => Array.from(String(s || '')).length; // Chinese counts as 1 char
const trimmed = s => (typeof s === 'string' ? s.trim() : '');

/**
 * Validate + normalise a course payload.
 * @returns {{ok:boolean, value?:object, fields?:object, firstCode?:string}}
 *          fields is a map of field -> stable error code (translated in the UI)
 */
function validateCourse(input) {
  const b = input || {};
  const fields = {};
  const value = {};

  value.title = trimmed(b.title);
  if (charLen(value.title) < 2 || charLen(value.title) > 80) fields.title = 'title';

  value.notice = trimmed(b.notice);
  if (charLen(value.notice) > MAX_NOTICE_LENGTH) fields.notice = 'noticeTooLong';

  value.timezone = trimmed(b.timezone);
  if (!value.timezone) fields.timezone = 'timezoneRequired';
  else if (!isValidTimeZone(value.timezone)) fields.timezone = 'timezoneInvalid';

  value.lesson_date = trimmed(b.lesson_date);
  if (!value.lesson_date) fields.lesson_date = 'dateRequired';
  else if (!isRealDate(value.lesson_date)) fields.lesson_date = 'dateInvalid';

  value.start_time = trimmed(b.start_time);
  value.end_time = trimmed(b.end_time);
  if (!isClock(value.start_time) || !isClock(value.end_time)) {
    fields.time = 'timeInvalid';
  } else if (minutes(value.end_time) <= minutes(value.start_time)) {
    fields.time = 'timeOrder';
  }

  value.place_name = trimmed(b.place_name);
  if (charLen(value.place_name) < 2 || charLen(value.place_name) > 120) fields.place_name = 'placeRequired';

  value.google_maps_url = trimmed(b.google_maps_url);
  if (!value.google_maps_url) fields.google_maps_url = 'googleRequired';
  else if (!isGoogleMapsUrl(value.google_maps_url)) fields.google_maps_url = 'googleInvalid';

  const cap = Number(b.capacity === undefined || b.capacity === '' ? 1 : b.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) fields.capacity = 'capacityInvalid';
  value.capacity = cap;

  value.run_status = RUN_STATUSES.includes(b.run_status) ? b.run_status : 'confirmed';
  value.status_note = trimmed(b.status_note).slice(0, 200);

  if (Object.keys(fields).length) {
    return { ok: false, fields, firstCode: fields[Object.keys(fields)[0]] };
  }

  // Derived, unambiguous instants — the "real time" viewers rely on.
  const startUtc = zonedTimeToUtc(value.lesson_date, value.start_time, value.timezone);
  const endUtc = zonedTimeToUtc(value.lesson_date, value.end_time, value.timezone);
  value.start_utc = startUtc.toISOString();
  value.end_utc = endUtc.toISOString();

  return { ok: true, value };
}

module.exports = {
  RUN_STATUSES, MAX_NOTICE_LENGTH, isGoogleMapsUrl, isRealDate, isClock,
  validateCourse, charLen
};

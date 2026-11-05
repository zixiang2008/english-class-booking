# Changelog

All notable changes to **CM English Class / English Class Booking**.
This project follows [Semantic Versioning](https://semver.org/).

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.th.md">ไทย</a>
</p>

---

## [3.4.0] — 2026-11-06

### Changed
- **The weekly timetable keeps the whole time span.** Rows are no longer only the
  start times somebody happened to publish; the table now renders a continuous
  ruler (every class boundary plus every whole hour in between) and a class
  occupies exactly the rows it runs for via `rowspan`. A 10:00–12:00 class fills
  the 10:00 and 11:00 rows instead of collapsing into one line, and 12:00 / 13:00
  / 14:00 stay on screen.
- Every slot without a published class is labelled **not published** (was "not
  bookable"), so the table reads as "here is the whole day, these are the parts
  teachers have published".
- Overlapping classes on the same day are merged into one block that starts once
  and spans to the latest end, so a second class in the same hour still has a
  place to render.
- The phone day cards follow the same ruler: gaps between classes are folded into
  a single dashed "12:00–15:00 · not published" line.

### Tests
- Browser smoke: asserts a class really occupies multiple rows (`rowspan`) and
  keeps the proportional split for overlapping classes.

---

## [3.3.1] — 2026-11-05

### Fixed
- **The proportional split was not real.** A cell's height was auto, so
  `flex-grow` had no free space to distribute and every class in a shared slot
  rendered the same height. The cell now gets a definite height derived from the
  slot length and the busiest cell, so a 90-minute class really is taller than a
  60-minute one (measured 90 / 65 / 65 px in a three-class slot).
- **The phone day list collapsed.** Giving every chip `flex-basis: 0` also
  shrank the day cards to a single line, because they are flex children of the
  day body. Only chips inside the grid split now; the day cards size to content.

### Tests
- The browser smoke suite asserts that overlapping classes differ in height and
  that none of them is clipped, and it matches the language switch against both
  the Google address bar and the online meeting bar headings.

---

## [3.3.0] — 2026-11-05

### Added
- **Online classes.** A class now has a *format*: **offline** (unchanged) or
  **online**. Publishing online replaces the place + Google Maps fields with:
  - platform — Tencent Meeting, Zoom, Microsoft Teams, Google Meet, VooV Meeting,
    DingTalk, WeChat, Other (`lib/platforms.js` is the single source of truth)
  - meeting link (required; any `https://` meeting URL is accepted so tenant
    domains such as `zoom.us/j/…` or `meeting.tencent.com/…` are never rejected)
  - an optional meeting ID / passcode note (≤120 characters)
- The meeting surfaces everywhere a class is shown: board card (`🎥` badge, platform
  name, **Join meeting**), class detail, weekly-timetable hover preview, calendar page,
  ICS feed (`LOCATION` = platform + note, `URL` = meeting link) and the Google
  Calendar link.
- Super admin class list and moderation show the format and open the meeting link
  instead of the map.

### Changed
- **Weekly timetable rebuilt (v3.2.2).** It no longer renders the legacy fixed rota.
  Rows are the start times that teachers actually published, columns are Monday →
  Sunday, and every published class becomes a chip inside its own cell. Several
  teachers in the same slot share the cell, split **in proportion to class length**.
  Hovering a chip opens a preview with Book / Cancel / Join / Details; clicking it
  opens the full detail dialog. `‹ ›` walks through weeks, "jump to the latest week
  with classes" lands on the demo history, and finished weeks are banner-marked.
  Below 760 px the grid becomes seven day cards.
- **Bookability is now truthful.** A cell with no published class renders as
  **not bookable**. Previously the grid offered every legacy slot, so students could
  try to book a slot nobody had published.

### Fixed
- History is visible in the timetable: past weeks can be browsed, so new users can
  see how the system looks with real data.

### Migration
- `courses` gains `mode TEXT NOT NULL DEFAULT 'offline'`, `online_platform`,
  `online_url`, `online_note` via idempotent `ALTER TABLE … ADD COLUMN` wrapped in
  `try/catch`. Verified on a copy of the production database: 44 existing classes
  all read back as `offline` with `place_name` / `google_maps_url` intact, and all
  30 bookings untouched.
- 18 new i18n strings × 4 languages (289 keys, full coverage).

### Tests
- `npm test` 74 · `npm run test:e2e` 54 · `npm run test:admin` 35 ·
  `npm run test:ui` 47 · `npm run test:visual` 25 — all green.

---

## [3.2.1] — 2026-11-05

### Changed
- **Login page:** the "demo accounts" block (three teacher logins and five student
  logins printed under the form) was removed. A platform disclaimer now sits
  below the card: information/booking channel for Chiang Mai only, teacher and
  student responsibility, legal compliance, dispute handling, and platform
  liability that the law does not exclude.
- The disclaimer is available in all four languages (11 new strings each).
- `auth-wrap-compact` keeps the login card from floating in a full-height empty
  column now that the page carries more content.

### Fixed
- Browser smoke test no longer depends on demo credentials that may not exist in
  a given dataset, and accepts a history-only dataset on the calendar page.

---

## [3.2.0] — 2026-11-05

### Added
- **Three-section class board:** `Next 7 days` (highlighted panel), `Later classes`
  (beyond 7 days, hidden when empty) and `Past classes` (collapsed by default,
  one-click toggle). Each section carries its own count.
- When nothing is scheduled ahead, the past section opens automatically so the
  board never greets a visitor with an empty page; an explicit toggle by the
  visitor is remembered across auto-refreshes.

### Changed
- Section labels localised in all four languages.
- UI smoke and visual audit no longer hard-code a single demo account; they try
  the known teachers in turn.

---

## [3.1.0] — 2026-11-05

### Added
- **Super administrator** (`is_admin`, independent of the teacher/student role):
  - account governance: ban, mute (1 h / 24 h / 7 d / 30 d / permanent),
    publish-block, lift restrictions, grant/revoke admin, reset PIN, delete account
  - class moderation: take down and restore any class, with the reason shown to students
  - audit log (`admin_actions`): actor, action, target, reason, timestamp
  - self-protection: cannot act on yourself, admins cannot restrict each other,
    the last admin cannot be removed
- Super admin console at `/superadmin.html` (overview / accounts / moderation / log)
- Restriction banner in the teacher studio explaining why and until when
- `scripts/grant-admin.js`, `npm run test:admin`

### Fixed
- Per-student booking count always reported 0 (it counted the legacy weekly grid)
- Phone-friendly booking and student tables (card layout below 700 px)

---

## [3.0.0] — 2026-11-05

### Added
- **Class-centric model:** date, time zone, start/end, place, capacity, run status
- **Multi-teacher publishing** on a single page, isolated by `teacher_id`
- **Notice board** per class, hard-capped at 100 characters
- **Google address bar:** IANA time zone, teacher local time, visitor local time,
  place, Google Maps link, add-to-Google-Calendar — all required
- **Real UTC conversion** on the server (DST-safe), ICS feed and Google Calendar links
- **Student booking:** capacity, duplicate and full checks, cancellation
- **Live teacher feed:** 15-second refresh, new bookings flagged NEW
- **Run status** (`pending` / `confirmed` / `cancelled` / `completed`) and a
  **change history** with revision bumping
- Mobile-first redesign, bottom-sheet dialogs, four-language coverage
- Site settings (title, phone, email, LINE) driving the public footer

---

## [2.0.0]

### Added
- 4-digit PIN login, Google OAuth, full i18n (EN/ZH/TH/JA)
- Calendar subscription page, weekly grid management

---

## [1.0.0]

### Added
- Initial release: single-teacher weekly timetable

---

[3.4.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.3.1...v3.4.0
[3.3.1]: https://github.com/zixiang2008/CMenglishClass/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.2.1...v3.3.0
[3.2.1]: https://github.com/zixiang2008/CMenglishClass/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/zixiang2008/CMenglishClass/compare/v2.0.0...v3.0.0

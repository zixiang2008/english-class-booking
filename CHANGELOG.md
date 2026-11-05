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

[3.2.1]: https://github.com/zixiang2008/CMenglishClass/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/zixiang2008/CMenglishClass/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/zixiang2008/CMenglishClass/compare/v2.0.0...v3.0.0

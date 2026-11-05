# English Class Booking · CM English Class

**A multi-teacher class board for a real English school in Chiang Mai.** Teachers publish classes from one page — each with a notice board, a Google Maps address bar and a real time zone — and students browse, book and track changes. A super administrator governs accounts and moderates classes.

<p align="center">
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.th.md">ไทย</a>
</p>

- **Stack:** Node.js 18+ · Express 4 · sql.js (SQLite compiled to WebAssembly)
- **Front end:** plain HTML + CSS + JavaScript, no build step, no framework
- **Languages:** English / 中文 / ไทย / 日本語, mobile-first
- **Live:** <https://en.caishen.today>

---

## Table of contents

1. [What v3 solves](#1-what-v3-solves)
2. [Feature tour](#2-feature-tour)
3. [Quick start](#3-quick-start)
4. [Accounts and demo data](#4-accounts-and-demo-data)
5. [Environment variables](#5-environment-variables)
6. [Project structure](#6-project-structure)
7. [Data model](#7-data-model)
8. [API reference](#8-api-reference)
9. [Testing](#9-testing)
10. [Deployment](#10-deployment)
11. [How time zones work](#11-how-time-zones-work)
12. [Privacy and security](#12-privacy-and-security)
13. [Version history](#13-version-history)
14. [License](#14-license)
15. [Repositories](#15-repositories)

---

## 1. What v3 solves

The v2 product was a single recurring weekly grid. It could not answer the two
questions that actually matter: *when does this class really start in my time
zone*, and *where do we meet*.

| Capability | v2 | v3 |
| --- | --- | --- |
| Class model | A 7-day × 8-slot recurring grid | Concrete classes: date, time, time zone, place, capacity |
| Multiple teachers | Single-teacher view | Many teachers publish on one page, isolated by `teacher_id` |
| Notice board | — | Every class carries a notice, hard-capped at 100 characters |
| Meeting place | Free text | Google address bar: time zone / date / start / end / place / Maps link, all required |
| Time accuracy | Wall-clock time, ambiguous across zones | The server converts teacher-local time to true UTC; students see *both* teacher time and their own |
| Booking | Occupying a grid slot | Per-class booking with capacity, duplicate and full checks, cancellation |
| Teacher's view of bookings | Refresh the dashboard | Live booking feed, 15-second auto refresh, new rows flagged NEW |
| Run status | — | `pending` / `confirmed` / `cancelled` / `completed`, visible to students |
| Change history | — | `revision` + change log; students see an "updated" badge and a timeline |
| Calendar | Weekly-grid ICS only | Real UTC events in ICS plus a Google Calendar link per class |
| Interface | Desktop-first | Redesigned mobile-first UI: single-column cards, bottom-sheet dialogs |
| Account governance | — | v3.1 super admin: ban / mute / publish-block / reset PIN / delete |
| Class moderation | — | v3.1 takedown and restore, with the reason shown to students |
| Audit trail | — | v3.1 `admin_actions` log: who did what, to whom, why, when |
| Class board | One flat list with finished classes mixed in | v3.2 three sections: next 7 days (highlighted) / later / finished (collapsed) |
| Weekly timetable | A fixed rota that always looked bookable | v3.2.2 renders the classes that were actually published, stacked in proportion inside the same cell; empty cells say *not bookable* |
| Meeting format | Offline only | v3.3 offline **or** online: pick a platform (Tencent Meeting, Zoom, Teams, Google Meet, VooV, DingTalk, WeChat, other) and paste the meeting link |

---

## 2. Feature tour

### 2.1 Teacher studio (`/admin.html`)

- **Overview:** my classes, confirmed, tentative, bookings, students, teachers on site
- **Publish:** title, notice board (≤100 chars), time zone, date, start/end time, **class format**, capacity, run status
  - **Offline** (default): place + Google Maps URL, both required
  - **Online:** platform (8 options) + meeting link (required, any `https://` meeting URL) + optional meeting ID / passcode note; the map fields are hidden and not required

- **Edit:** any field; saving bumps `revision` and writes a change-log entry
- **Status:** tentative / confirmed / cancelled / completed, with an optional note
- **Live booking feed:** student name, username, phone, class, class time, booking time
- **Weekly grid:** the v2 7×8 recurring slots are still manageable
- **Student list:** registered students and their booking counts
- **Permissions:** a teacher can only edit or delete their own classes
- **Restriction banner:** if muted or publish-blocked, a yellow banner explains why and until when

### 2.2 Student board (`/`)

- **Class board** with filters by teacher, status and keyword, plus "only my bookings"
  - **Three sections:** `Next 7 days` (its own highlighted panel) → `Later classes` (beyond 7 days) → `Past classes` (finished, collapsed by default, one click to expand)
  - Each section shows its own count; an empty next-week panel says so; if nothing at all is scheduled ahead, the finished section opens by itself so the page is never blank
- **Every card shows**
  - teacher, run status, whether the class was updated
  - the notice board (≤100 chars)
  - the Google address bar: IANA time zone + GMT offset, teacher's local time, my local time, place, Maps link, add-to-Google-Calendar
    - for an **online** class the address bar becomes a meeting bar: 🎥 platform name, meeting ID / passcode, **Join meeting** button, and the calendar link points at the meeting URL
  - seats left and how many are booked
- **One-click book / cancel** — duplicates, full classes and cancelled classes are rejected
- **Class detail:** full information, change timeline, and (for the owning teacher) the list of booked students
- **Weekly timetable (v3.2.2):** rows are the start times that were actually published, columns are Monday → Sunday
  - every published class appears as a chip inside its own cell; several teachers in the same slot share the cell, split **in proportion to class length**
  - hovering a chip opens a preview with **Book / Cancel / Join / Details**; clicking it opens the full detail dialog
  - the whole day stays on the ruler: a class only fills the rows it really runs for, and every other slot is labelled **not published** — the grid never offers a slot nobody published
  - `‹ ›` walks through weeks, "jump to the latest week with classes" lands on the demo history, and a past week is banner-marked as finished
  - below 760 px the grid becomes seven day cards with the same data
- **Login page:** platform disclaimer (see §12)

### 2.3 Super admin console (`/superadmin.html`, visible only when `is_admin`)

- **Overview:** accounts, teachers, students, admins, banned, muted, classes, bookings
- **Accounts:** search by name / username / phone, filter by role and restriction state
- Actions on any teacher or student:
  - **Ban** — cannot sign in; an existing session dies on its next request
  - **Mute** — 1 h / 24 h / 7 d / 30 d / permanent; cannot publish or edit, students cannot book
  - **Publish block** — may edit existing classes, may not create new ones
  - **Lift** any of the above
  - **Grant / revoke super admin**, **reset the 4-digit PIN**, **delete the account** (classes and bookings cascade)
- **Moderation:** search all classes, **take down** (turns the class into cancelled, writes a change-log entry, students see the reason) and **restore**
- **Audit log:** actor, action, target, reason, timestamp
- **Self-protection:** you cannot ban, delete or demote yourself; admins cannot restrict each other; the system refuses to remove the last admin

### 2.4 Common

- Four-language UI; API errors are localised too, driven by `X-Language`
- Login / register with a 4-digit PIN; teachers register with an invite code
- Google OAuth (the button appears only when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set)
- Calendar subscription page `/calendar.html`: ICS URL, public JSON, how-to
- Mobile: single-column cards, bottom-sheet dialogs, horizontally scrollable weekly grid, touch targets ≥44 px

---

## 3. Quick start

```bash
git clone https://github.com/zixiang2008/CMenglishClass.git
cd CMenglishClass
npm install
npm start
```

Open <http://localhost:3000>.

The first start creates `booking.db`, builds the schema and seeds demo accounts
plus four sample classes.

```bash
npm run dev                       # same as start, no watcher
PORT=3210 DB_PATH=/tmp/x.db npm start   # a throwaway instance for experiments
```

---

## 4. Accounts and demo data

Every password is a **4-digit PIN**. **Usernames are case-insensitive**:
`Hamish`, `hamish` and `HAMISH` are the same account (registration de-duplicates
the same way).

**Production accounts**

| Role | Username | PIN | Notes |
| --- | --- | --- | --- |
| **Super admin** / teacher | `elvis` | `1314` | Full system authority: accounts, restrictions, moderation, audit log |
| Teacher | `hamish` | `1234` | Real teacher account, no classes published yet |
| Teacher | `kevin` | `1234` | Real teacher account, no classes published yet |

> Super admin is an `is_admin` flag, decoupled from the role. `elvis` is both a
> teacher and an admin, so the account can still publish classes normally.

**Demo accounts (historical data, they really can sign in)**

| Role | Username | PIN | Notes |
| --- | --- | --- | --- |
| Teacher | `test_teacher1` | `1314` | Publishes `English Corner`, 14 classes over the past two weeks |
| Teacher | `test_teacher2` | `1314` | Publishes `English Corner`, 14 classes |
| Teacher | `test_teacher3` | `1314` | Publishes `英文学习课程`, 14 classes |
| Student | `test_student1` … `test_student5` | `1314` | Three classes a week, six historical bookings each |

Demo accounts live in this document and in the database only — the **login page
no longer advertises them**; that block was replaced by the platform disclaimer.

Demo data covers the **past 14 days** (today excluded), with three fixed slots a
day: `10:00-12:00`, `15:00-16:00`, `16:00-17:00` (Asia/Bangkok). That is 42
classes (38 completed, 4 cancelled) and 30 bookings, all in the past so they
never occupy a bookable future slot.

> `elvis` / `hamish` / `kevin` are not created automatically in a brand-new
> database. Use the register page with the invite code, or the commands below.

```bash
# stop the running server first, then restart it afterwards
node scripts/create-user.js elvis 1314 teacher Elvis
node scripts/create-user.js hamish 1234 teacher Hamish
node scripts/create-user.js kevin 1234 teacher Kevin
```

`scripts/create-user.js` also resets the PIN of any account, or promotes a
student to teacher.

Grant, revoke or list super admins:

```bash
node scripts/grant-admin.js elvis           # grant
node scripts/grant-admin.js elvis --revoke  # revoke (refuses to remove the last admin)
node scripts/grant-admin.js --list          # list
```

Regenerate the demo history (deletes the old classes of the three test teachers
first):

```bash
# stop the server, run, then start it again
SEED_DEMO=0 node scripts/seed-demo-history.js     # two weeks (default)
SEED_DEMO=0 node scripts/seed-demo-history.js 4   # four weeks
```

**Site settings:** teacher studio → *Site settings* edits the site title, phone,
email and LINE link. Those values drive the public footer; **an empty phone is
hidden**, never rendered as an empty link.

Teacher invite code: `TEACHER2026` (override with `TEACHER_INVITE_CODE`).

---

## 5. Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `DB_PATH` | `./booking.db` | SQLite file; point tests at a temp file to isolate them |
| `SESSION_SECRET` | built-in dev value | **Must** be set in production |
| `NODE_ENV` | empty | `production` enables `secure` + `SameSite=None` cookies |
| `TEACHER_INVITE_CODE` | `TEACHER2026` | Invite code for teacher self-registration |
| `SEED_DEMO` | on | `0` skips demo teachers, demo classes and fake grid bookings — **use `0` in production** |
| `SITE_URL` | inferred | Public origin used by calendar endpoints and the startup log |
| `GOOGLE_CLIENT_ID` | empty | Enables Google sign-in |
| `GOOGLE_CLIENT_SECRET` | empty | Same |
| `GOOGLE_REDIRECT_URI` | empty | e.g. `https://en.caishen.today/api/auth/google/callback` |

---

## 6. Project structure

```
CMenglishClass/
├── server.js                 Express entry: security headers, static files, routes
├── database.js               sql.js wrapper, schema, migrations, demo seed
├── i18n-server.js            Server-side error messages (en/zh/th/ja)
├── lib/
│   ├── time.js               Zone conversion, GMT offset, ICS / Google Calendar, timestamp normalisation
│   ├── course-validation.js  Field validation (100-char notice, required Maps URL, …)
│   └── guards.js             Login / teacher / student / admin middleware
├── routes/
│   ├── auth.js               Register, login, logout, Google OAuth
│   ├── courses.js            Class CRUD, status, booking, change history
│   ├── admin.js              Studio overview, live bookings, weekly grid, students
│   ├── superadmin.js         Account governance, moderation, audit log
│   ├── calendar.js           ICS feed, public JSON
│   └── schedule.js           Legacy recurring grid API
├── public/
│   ├── index.html            Student class board
│   ├── admin.html            Teacher studio
│   ├── superadmin.html       Super admin console
│   ├── login.html            Sign in (+ platform disclaimer)
│   ├── register.html         Register (with teacher invite code)
│   ├── calendar.html         Calendar subscription
│   ├── css/style.css         v3 design system and responsive rules
│   └── js/
│       ├── i18n.js           Original four-language engine
│       ├── i18n-v3.js        v3 strings (all four languages)
│       ├── common.js         Shared App layer: fetch, toast, modal, nav, date formatting
│       ├── schedule.js       Student board logic
│       ├── admin.js          Teacher studio logic
│       ├── superadmin.js     Super admin logic
│       └── auth.js           Login / register logic
├── scripts/
│   ├── check-i18n.js         Static i18n audit
│   ├── create-user.js        Create / reset an account
│   ├── grant-admin.js        Grant / revoke super admin
│   ├── reset-data.js         Wipe business data, keep admins and site settings
│   ├── seed-demo-history.js  Generate the past two weeks of demo classes
│   ├── visual-audit.js       Multi-viewport visual audit (overflow / columns / tap size / screenshots)
│   └── ui-smoke.js           Real-browser smoke test over the Chrome DevTools Protocol
├── tests/
│   ├── test-suite.js         API + unit integration tests (self-hosted, isolated DB)
│   ├── e2e-full.js           Multi-role acceptance journey
│   └── superadmin-suite.js   Admin authority / restrictions / moderation / audit
├── README.md                 This file (English)
├── README.zh-CN.md           简体中文
├── README.ja.md              日本語
├── README.th.md              ไทย
├── CHANGELOG.md              Release history
└── render.yaml               Render blueprint
```

---

## 7. Data model

```sql
users            id, username, password_hash, display_name, phone, role, google_id,
                 is_admin, status, ban_reason, banned_at,
                 muted_until, mute_reason, publish_blocked, publish_block_reason
schedule         id, day_of_week, time_slot, status, booked_by, booked_name   -- v2 grid
courses          id, teacher_id, title, notice, notice_updated_at,
                 timezone, lesson_date, start_time, end_time, start_utc, end_utc,
                 mode, online_platform, online_url, online_note,          -- v3.3
                 place_name, google_maps_url, capacity, run_status, status_note,
                 revision, created_at, updated_at
course_bookings  id, course_id, student_id, status, created_at, cancelled_at
course_updates   id, course_id, teacher_id, change_type, summary, created_at
admin_actions    id, admin_id, admin_name, target_user_id, target_name,
                 target_course_id, action, detail, created_at   -- v3.1 audit log
```

Design notes:

- `start_time` / `end_time` are the teacher's wall-clock time; `timezone` is an IANA zone
- `start_utc` / `end_utc` are the true UTC instants computed on the server — all
  sorting, the ICS feed and calendar links use them
- `mode` is `offline` (default) or `online`; `online_platform` is one of
  `tencent_meeting / zoom / teams / google_meet / voov / dingtalk / wechat / other`,
  `online_url` is the meeting link, `online_note` an optional ID / passcode (≤120)
- old rows migrate automatically: `ALTER TABLE courses ADD COLUMN mode TEXT NOT NULL DEFAULT 'offline'`
  inside a `try/catch`, so every pre-v3.3 class stays offline with its
  `place_name` / `google_maps_url` untouched
- `run_status` decides whether a student can book
- `revision > 1` is what makes the front end show an "updated" badge
- `is_admin` is independent of `role`; `status='banned'` blocks sign-in,
  `muted_until` blocks every publishing action, `publish_blocked` only blocks
  creating new classes
- Timestamps are normalised to ISO-8601 UTC before leaving the server (SQLite's
  `CURRENT_TIMESTAMP` carries no zone marker, which browsers would read as local time)

---

## 8. API reference

Every write returns `{ success, message }` or `{ error }`; error messages are
localised from `X-Language` / `Accept-Language`.

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | Register; with `teacherCode` creates a teacher |
| POST | `/api/auth/login` | Username + 4-digit PIN |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current session |
| GET | `/api/auth/config` | Google OAuth / teacher registration flags |
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback |

### Classes

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/courses` | public | `teacher=me|ID`, `status`, `q`, `mine=1` |
| GET | `/api/courses/config` | public | Time zones, status enum, notice limit, `onlinePlatforms` (8 keys + labels) |
| GET | `/api/courses/teachers` | public | Teachers and their class counts |
| GET | `/api/courses/:id` | public | Detail + updates + bookings (owner only) |
| GET | `/api/courses/:id/updates` | public | Change history |
| POST | `/api/courses` | teacher | Publish a class |
| PUT | `/api/courses/:id` | owning teacher | Edit and log the change |
| POST | `/api/courses/:id/status` | owning teacher | Change run status |
| DELETE | `/api/courses/:id` | owning teacher | Delete the class and its bookings |
| POST | `/api/courses/:id/book` | student | Book |
| POST | `/api/courses/:id/cancel` | student / owning teacher | Cancel a booking |

### Studio

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/overview` | Classes, confirmed, tentative, bookings, students, teachers |
| GET | `/api/admin/bookings` | Live booking feed for the current teacher |
| GET | `/api/admin/schedule` | All weekly-grid slots |
| POST | `/api/admin/update-slot` | Set slot availability |
| POST | `/api/admin/remove-booking` | Release a slot |
| GET | `/api/admin/students` | Student list |

### Super admin (all require `is_admin`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/superadmin/overview` | Account / class / booking stats and recent actions |
| GET | `/api/superadmin/users` | All accounts; `q`, `role`, `filter=banned|muted|blocked|admin` |
| POST | `/api/superadmin/users/:id/ban` | Ban (requires `reason`) |
| POST | `/api/superadmin/users/:id/unban` | Unban |
| POST | `/api/superadmin/users/:id/mute` | `{ hours, reason }`; `-1` permanent, `0` lift |
| POST | `/api/superadmin/users/:id/publish-block` | `{ blocked, reason }` |
| POST | `/api/superadmin/users/:id/admin` | `{ isAdmin }` grant / revoke |
| POST | `/api/superadmin/users/:id/pin` | Reset the 4-digit PIN |
| DELETE | `/api/superadmin/users/:id` | Delete and cascade |
| GET | `/api/superadmin/courses` | All classes for moderation; `q`, `status`, `teacher` |
| POST | `/api/superadmin/courses/:id/takedown` | Take down (requires `reason`) |
| POST | `/api/superadmin/courses/:id/restore` | Restore |
| GET | `/api/superadmin/actions` | Audit log |

### Calendar

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/calendar/schedule.ics` | ICS feed: UTC events with place, map and notice |
| GET | `/api/calendar/schedule` | Public read-only JSON |
| GET | `/api/calendar/info` | Subscription URLs and privacy note |

### Misc

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/healthz` | `{ ok: true, version: "3.4.0" }` |

---

## 9. Testing

```bash
npm test              # 74 API contract regressions (self-hosted, isolated DB)
npm run test:e2e      # 54 multi-teacher / multi-student journeys and edge cases
npm run test:admin    # 35 admin authority, bans, mutes, promotion, moderation, audit, cascade
npm run check:i18n    # every referenced key exists in all four languages
npm run test:ui       # 49 real-browser smoke checks (needs a running server)
npm run test:visual   # 25 multi-viewport visual checks (needs a running server)
npm run check         # i18n + syntax + integration tests
```

`npm test` and `npm run test:e2e` boot their own server on a random port with a
temporary database, so `booking.db` is never touched.

The browser suites drive a local Chrome over the DevTools Protocol — no extra
dependency:

```bash
PORT=3210 DB_PATH=/tmp/ecb-browser.db node server.js   # terminal 1
BASE=http://127.0.0.1:3210 npm run test:ui             # terminal 2
BASE=http://127.0.0.1:3210 npm run test:visual         # terminal 2 (seeds extreme data)
```

`test:ui` covers card rendering, the notice board, the Google address bar,
time-zone pills, multiple teachers, language switching, login, the teacher
studio, the publish form's required fields and 100-character counter, the
**offline ↔ online format switch** (fields swap, all 8 platforms listed, the
config endpoint publishes the same catalogue), the **weekly timetable** (chips
render, 7 day columns, empty cells are labelled *not bookable*, the mobile day
list mirrors the grid), the calendar page, mobile viewports (no horizontal
overflow, tap sizes), uncaught JS exceptions and failed HTTP responses.

`test:visual` seeds five teachers plus extreme data — an 80-character title, a
100-character notice, a very long place name, clashing slots, a cancelled class
and a finished class — then checks 1440 / 1024 / 820 / 390 / 360 px for
horizontal overflow, card column counts, text breaking out of a card and tap
target height, saving screenshots to the OS temp directory.

---

## 10. Deployment

### 10.1 Render

`render.yaml` in the repo already declares:

- `buildCommand: npm install`
- `startCommand: node server.js`
- `NODE_ENV=production`
- `SESSION_SECRET` generated automatically
- `TEACHER_INVITE_CODE` defaults to `TEACHER2026` — change it before going live

> On Render's free tier the filesystem is ephemeral: `booking.db` is reset on
> every deploy. Mount a disk or move to an external database if you need
> persistence.

### 10.2 Local machine + Cloudflare Tunnel (`en.caishen.today`)

The tunnel `english-class-booking` is already created:

```
Tunnel ID : 02e615a5-3b68-4052-9d03-45c7544f855d
Config    : ~/.cloudflared/english-class-booking.yml
Ingress   : http://localhost:3000
```

```bash
# terminal 1: the app
cd /Volumes/OS2App/AiColding/english-class-booking
NODE_ENV=production PORT=3000 SITE_URL=https://en.caishen.today \
SESSION_SECRET='<random string>' TEACHER_INVITE_CODE='TEACHER2026' node server.js

# terminal 2: the tunnel
cloudflared tunnel --config ~/.cloudflared/english-class-booking.yml run english-class-booking
```

Add this DNS record in the Cloudflare account that owns `caishen.today`:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `en` | `02e615a5-3b68-4052-9d03-45c7544f855d.cfargotunnel.com` | Proxied (orange cloud) |

Start at login (both plists live in `~/Library/LaunchAgents/`):

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking-tunnel.plist

# stop and remove
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking-tunnel
```

Logs: `~/Library/Logs/english-class-booking/`

### 10.3 Local domain only (no public exposure)

One `sudo` step to point the hostname at this machine:

```bash
sudo sh -c 'printf "\n127.0.0.1 en.caishen.today\n" >> /etc/hosts'
```

Then open `http://en.caishen.today:3000` (the app listens on 3000, not 80).

---

## 11. How time zones work

1. The teacher enters a local date, start/end time and an IANA zone (e.g. `Asia/Bangkok`).
2. The server asks `Intl.DateTimeFormat` for that zone's UTC offset on that day
   and iterates two or three times to converge (so DST is handled), producing
   `start_utc` / `end_utc`.
3. The student page renders the same UTC instant twice with `Intl.DateTimeFormat`:
   - teacher's local time + zone abbreviation
   - the student's own browser time + zone name
4. The ICS feed and Google Calendar links use real UTC (`YYYYMMDDTHHMMSSZ`), so
   subscribers never see a floating time.

Verified edge cases:

- `Asia/Bangkok` 10:00 → `03:00Z` (GMT+7)
- `America/New_York` summer 09:00 → `13:00Z` (EDT)
- `America/New_York` winter 09:00 → `14:00Z` (EST)

---

## 12. Privacy and security

- Passwords are bcrypt hashes; session cookies are `httpOnly`, and `secure` +
  `SameSite=None` in production.
- Class listings are public, but a student roster is visible only to the teacher
  who owns that class.
- The public calendar exposes class status, time, place, map link, notice and
  teacher name only; in the legacy grid, student names are reduced to initials.
- Google Maps URLs must be `https` and on a Google domain — this blocks arbitrary
  link injection.
- The notice board is capped at 100 characters on both the server and the client.
- Every class write verifies `teacher_id` ownership.
- The login page shows a **platform disclaimer**: the site is an information and
  booking channel for Chiang Mai, not the provider of the classes; teachers and
  students settle arrangements, payment, quality, safety and disputes between
  themselves; teachers are responsible for their own qualifications, visa and
  work permit; statutory platform liability is not excluded.

---

## 13. Version history

- **v3.3.0** — online classes: offline/online format, 8 meeting platforms, meeting link
  replaces the map, meeting join on every surface (board, detail, timetable preview, calendar
  page, ICS, Google Calendar); the weekly timetable was rebuilt around published classes
  (proportional stacking, hover preview, "not bookable" empty cells, mobile day cards)
- **v3.2.1** — login page: the demo-account hint became the platform disclaimer
- **v3.2.0** — class board split into next 7 days / later / finished
- **v3.1.0** — super administrator: account governance, restrictions, moderation, audit log
- **v3.0.0** — class-centric model, multi-teacher publishing, notice board, Google address bar,
  real UTC time zones, booking, live feed, run status, change history, ICS / Google Calendar,
  mobile-first redesign, four-language coverage
- **v2.0.0** — 4-digit PIN login, Google OAuth, four languages, weekly grid management
- **v1.0.0** — initial release: single-teacher weekly timetable

See [CHANGELOG.md](CHANGELOG.md) for details.

---

## 14. License

MIT

---

## 15. Repositories

| Remote | URL | Role |
| --- | --- | --- |
| `origin` | `https://github.com/zixiang2008/english-class-booking` | public repository |
| `mirror` | `https://github.com/zixiang2008/CMenglishClass` | private archive |

`origin` carries **two push URLs**, so a single `git push origin main` updates the
public repository *and* the private archive — the archive can never fall behind.

```bash
git remote -v          # shows both push URLs on origin
git push origin main   # pushes to both repositories
```

// ============================
// Admin.js - Teacher Admin Panel Logic (i18n-enabled)
// ============================

let adminScheduleData = null;
let adminWeekOffset = 0;

// ============================
// Thailand Public Holidays 2026 (same as schedule.js)
// ============================
const THAI_HOLIDAYS_2026 = [
    { month: 1, day: 1, name: "New Year's Day", nameTh: "วันขึ้นปีใหม่", emoji: "🎉" },
    { month: 1, day: 2, name: "New Year Special Holiday", nameTh: "วันหยุดพิเศษปีใหม่", emoji: "🎊" },
    { month: 2, day: 17, name: "Chinese New Year", nameTh: "วันตรุษจีน", emoji: "🧧" },
    { month: 3, day: 3, name: "Makha Bucha Day", nameTh: "วันมาฆบูชา", emoji: "🕯️" },
    { month: 4, day: 6, name: "Chakri Memorial Day", nameTh: "วันจักรี", emoji: "👑" },
    { month: 4, day: 13, name: "Songkran Festival", nameTh: "วันสงกรานต์", emoji: "💦" },
    { month: 4, day: 14, name: "Songkran Festival", nameTh: "วันสงกรานต์", emoji: "💦" },
    { month: 4, day: 15, name: "Songkran Festival", nameTh: "วันสงกรานต์", emoji: "💦" },
    { month: 5, day: 1, name: "National Labour Day", nameTh: "วันแรงงานแห่งชาติ", emoji: "⚒️" },
    { month: 5, day: 4, name: "Coronation Day", nameTh: "วันฉัตรมงคล", emoji: "👑" },
    { month: 5, day: 11, name: "Royal Ploughing Ceremony", nameTh: "วันพืชมงคล", emoji: "🌾" },
    { month: 5, day: 31, name: "Visakha Bucha Day", nameTh: "วันวิสาขบูชา", emoji: "🪷" },
    { month: 6, day: 1, name: "Substitution for Visakha Bucha", nameTh: "ชดเชยวันวิสาขบูชา", emoji: "🪷" },
    { month: 6, day: 3, name: "Queen Suthida's Birthday", nameTh: "วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี", emoji: "👸" },
    { month: 7, day: 28, name: "King's Birthday", nameTh: "วันเฉลิมพระชนมพรรษา ร.10", emoji: "🤴" },
    { month: 7, day: 29, name: "Asanha Bucha Day", nameTh: "วันอาสาฬหบูชา", emoji: "🕯️" },
    { month: 7, day: 30, name: "Buddhist Lent Day", nameTh: "วันเข้าพรรษา", emoji: "🙏" },
    { month: 8, day: 12, name: "Queen Mother's Birthday / Mother's Day", nameTh: "วันแม่แห่งชาติ", emoji: "💐" },
    { month: 10, day: 13, name: "King Bhumibol Memorial Day", nameTh: "วันคล้ายวันสวรรคต ร.9", emoji: "🖤" },
    { month: 10, day: 23, name: "Chulalongkorn Day", nameTh: "วันปิยมหาราช", emoji: "👑" },
    { month: 12, day: 5, name: "Father's Day / King Bhumibol's Birthday", nameTh: "วันพ่อแห่งชาติ", emoji: "💛" },
    { month: 12, day: 7, name: "Substitution for Father's Day", nameTh: "ชดเชยวันพ่อแห่งชาติ", emoji: "💛" },
    { month: 12, day: 10, name: "Constitution Day", nameTh: "วันรัฐธรรมนูญ", emoji: "📜" },
    { month: 12, day: 25, name: "Christmas Day", nameTh: "วันคริสต์มาส", emoji: "🎄" },
    { month: 12, day: 31, name: "New Year's Eve", nameTh: "วันสิ้นปี", emoji: "🎆" },
];

function buildHolidayMap() {
    const map = {};
    for (const h of THAI_HOLIDAYS_2026) {
        const key = `${h.month}-${h.day}`;
        map[key] = h;
    }
    return map;
}
const holidayMap = buildHolidayMap();

function getHoliday(date) {
    const key = `${date.getMonth() + 1}-${date.getDate()}`;
    return holidayMap[key] || null;
}

function getWeekDates(offset) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + (offset * 7));
    monday.setHours(0, 0, 0, 0);

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
    }
    return dates;
}

// ============================
// i18n helpers
// ============================
function applyI18nToPage() {
    document.title = I18N.t('pageTitleAdmin');

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', I18N.t('metaDescAdmin'));

    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = I18N.t(el.getAttribute('data-i18n'));
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = I18N.t(el.getAttribute('data-i18n-placeholder'));
    });

    // Insert language switcher
    const navLang = document.getElementById('nav-lang');
    if (navLang && !navLang.querySelector('.lang-switcher')) {
        navLang.appendChild(I18N.createLanguageSwitcher());
    }

    if (adminScheduleData) {
        renderAdminSchedule(adminScheduleData);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyI18nToPage();
    verifyTeacher();
    loadAdminSchedule();
});

I18N.onChange(() => {
    applyI18nToPage();
    const btn = document.getElementById('lang-switcher-btn');
    if (btn) {
        const lang = I18N.languages[I18N.getLang()];
        btn.innerHTML = `<span class="lang-flag">${lang.flag}</span><span class="lang-name">${lang.nativeName}</span><span class="lang-arrow">▾</span>`;
    }
});

// Verify teacher auth
async function verifyTeacher() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.loggedIn || data.user.role !== 'teacher') {
            showToast(I18N.t('adminLoginRedirect'), 'error');
            setTimeout(() => window.location.href = '/login.html', 1500);
        }
    } catch (err) {
        window.location.href = '/login.html';
    }
}

// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`panel-${tab}`).classList.remove('hidden');

    if (tab === 'students') {
        loadStudents();
    }
}

// Week nav for admin
function adminPrevWeek() {
    adminWeekOffset--;
    renderAdminSchedule(adminScheduleData);
}

function adminNextWeek() {
    adminWeekOffset++;
    renderAdminSchedule(adminScheduleData);
}

function adminGoToday() {
    adminWeekOffset = 0;
    renderAdminSchedule(adminScheduleData);
}

// Load admin schedule
async function loadAdminSchedule() {
    try {
        const res = await fetch('/api/admin/schedule');
        if (res.status === 403) {
            showToast(I18N.t('adminNeedPermission'), 'error');
            setTimeout(() => window.location.href = '/login.html', 1500);
            return;
        }
        const data = await res.json();
        adminScheduleData = data;
        renderAdminSchedule(data);
    } catch (err) {
        console.error('Load admin schedule failed:', err);
        document.getElementById('admin-loading').innerHTML = `<p style="color:#e91e63;">${I18N.t('adminLoadFailed')}</p>`;
    }
}

// Render admin schedule table
function renderAdminSchedule(data) {
    const { timeSlots, days, slots } = data;
    const weekDates = getWeekDates(adminWeekOffset);
    const dayShortNames = I18N.getDayShortNames();

    // Update admin week navigation
    const weekNav = document.getElementById('admin-week-nav');
    if (weekNav) {
        document.getElementById('admin-week-range-text').textContent = I18N.formatWeekRange(weekDates[0], weekDates[6]);
        const todayBtn = document.getElementById('admin-btn-today');
        if (todayBtn) {
            todayBtn.style.display = adminWeekOffset === 0 ? 'none' : 'inline-flex';
        }
    }

    // Build slot lookup
    const slotMap = {};
    for (const s of slots) {
        const key = `${s.day_of_week}-${s.time_slot}`;
        slotMap[key] = s;
    }

    // Header
    const headerRow = document.getElementById('admin-schedule-header');
    headerRow.innerHTML = `<th>${I18N.t('scheduleTimeHeader')}</th>`;
    days.forEach((day, idx) => {
        const th = document.createElement('th');
        const date = weekDates[idx];
        const dateStr = I18N.formatDateShort(date);
        const holiday = getHoliday(date);

        let headerHTML = `<div class="th-day-name">${dayShortNames[idx]}</div>`;
        headerHTML += `<div class="th-date">${dateStr}</div>`;

        if (holiday) {
            headerHTML += `<div class="th-holiday-sm" title="${holiday.name} / ${holiday.nameTh}">${holiday.emoji}</div>`;
            th.classList.add('holiday-header');
        }

        th.innerHTML = headerHTML;
        headerRow.appendChild(th);
    });

    // Body
    const tbody = document.getElementById('admin-schedule-body');
    tbody.innerHTML = '';

    timeSlots.forEach(slot => {
        const tr = document.createElement('tr');

        // Time cell
        const tdTime = document.createElement('td');
        const [start, end] = slot.split('-');
        tdTime.innerHTML = `${I18N.formatTime(start)}<br>${I18N.formatTime(end)}`;
        tr.appendChild(tdTime);

        // Day cells
        for (let d = 0; d < 7; d++) {
            const td = document.createElement('td');
            const cellData = slotMap[`${d}-${slot}`];
            const holiday = getHoliday(weekDates[d]);

            if (holiday) {
                td.classList.add('holiday-cell');
            }

            if (cellData) {
                td.appendChild(createAdminSlotCell(cellData));
            }

            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    });

    document.getElementById('admin-loading').classList.add('hidden');
    document.getElementById('admin-schedule-table').classList.remove('hidden');
}

// Create admin slot cell with action buttons
function createAdminSlotCell(slot) {
    const container = document.createElement('div');
    container.classList.add('admin-slot-actions');

    const status = document.createElement('span');
    status.classList.add('admin-slot-status');

    if (slot.status === 'available') {
        status.style.background = '#e8f5e9';
        status.style.color = '#2e7d32';
        status.textContent = I18N.t('slotAvailable');
    } else if (slot.status === 'booked') {
        status.style.background = '#fff3e0';
        status.style.color = '#e65100';
        status.textContent = slot.booked_name || I18N.t('slotBooked');
    } else {
        status.style.background = '#fce4ec';
        status.style.color = '#c62828';
        status.textContent = 'N/A';
    }
    container.appendChild(status);

    // Action buttons
    if (slot.status === 'available') {
        const btn = document.createElement('button');
        btn.classList.add('admin-slot-btn', 'toggle-unavailable');
        btn.textContent = I18N.t('adminSetUnavailable');
        btn.onclick = () => updateSlot(slot.id, 'not_available');
        container.appendChild(btn);
    } else if (slot.status === 'not_available') {
        const btn = document.createElement('button');
        btn.classList.add('admin-slot-btn', 'toggle-available');
        btn.textContent = I18N.t('adminSetAvailable');
        btn.onclick = () => updateSlot(slot.id, 'available');
        container.appendChild(btn);
    } else if (slot.status === 'booked') {
        const btn = document.createElement('button');
        btn.classList.add('admin-slot-btn', 'remove-booking');
        btn.textContent = I18N.t('adminRemoveBooking');
        btn.onclick = () => removeBooking(slot.id);
        container.appendChild(btn);
    }

    return container;
}

// Update slot status
async function updateSlot(slotId, status) {
    try {
        const res = await fetch('/api/admin/update-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId, status })
        });
        const data = await res.json();
        if (data.success) {
            showToast(I18N.t('adminUpdated'), 'success');
            loadAdminSchedule();
        } else {
            showToast(data.error || I18N.t('adminUpdateFailed'), 'error');
        }
    } catch (err) {
        showToast(I18N.t('errorNetwork'), 'error');
    }
}

// Remove booking
async function removeBooking(slotId) {
    if (!confirm(I18N.t('adminRemoveConfirm'))) return;
    try {
        const res = await fetch('/api/admin/remove-booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(I18N.t('adminRemoved'), 'success');
            loadAdminSchedule();
        } else {
            showToast(data.error || I18N.t('adminUpdateFailed'), 'error');
        }
    } catch (err) {
        showToast(I18N.t('errorNetwork'), 'error');
    }
}

// Load students
async function loadStudents() {
    try {
        const res = await fetch('/api/admin/students');
        const students = await res.json();
        renderStudents(students);
    } catch (err) {
        console.error('Load students failed:', err);
    }
}

// Render student list
function renderStudents(students) {
    const container = document.getElementById('student-list');
    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center; padding:40px;">${I18N.t('adminNoStudents')}</p>`;
    } else {
        students.forEach(s => {
            const card = document.createElement('div');
            card.classList.add('student-card');

            const regDate = I18N.formatDate(new Date(s.created_at));

            card.innerHTML = `
                <div class="student-name">${s.display_name}</div>
                <div class="student-info">${I18N.t('adminStudentUsername', { name: s.username })}</div>
                <div class="student-info">${I18N.t('adminStudentPhone', { phone: s.phone || I18N.t('adminPhoneNotProvided') })}</div>
                <div class="student-info">${I18N.t('adminStudentRegistered', { date: regDate })}</div>
                <span class="student-bookings">${I18N.t('adminStudentBookings', { count: s.bookingCount })}</span>
            `;
            container.appendChild(card);
        });
    }

    document.getElementById('students-loading').classList.add('hidden');
    container.classList.remove('hidden');
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast(I18N.t('logoutSuccess'), 'info');
        setTimeout(() => window.location.href = '/login.html', 1000);
    } catch (err) {
        window.location.href = '/login.html';
    }
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

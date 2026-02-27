// ============================
// Schedule.js - Main Page Logic (i18n-enabled)
// ============================

let currentUser = null;
let scheduleData = null;
let currentWeekOffset = 0;

// ============================
// Thailand Public Holidays 2026
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

// ============================
// Week date calculation
// ============================
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
// i18n-aware Formatters
// ============================
function formatDateShortI18n(date) {
    return I18N.formatDateShort(date);
}

function formatWeekRangeI18n(dates) {
    return I18N.formatWeekRange(dates[0], dates[6]);
}

function formatTimeI18n(time) {
    return I18N.formatTime(time);
}

// ============================
// Apply i18n to all static elements
// ============================
function applyI18nToPage() {
    // Update document title
    document.title = I18N.t('pageTitleSchedule');

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', I18N.t('metaDescSchedule'));

    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = I18N.t(el.getAttribute('data-i18n'));
    });

    // Update all data-i18n-placeholder elements
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = I18N.t(el.getAttribute('data-i18n-placeholder'));
    });

    // Update week nav buttons
    const prevBtn = document.getElementById('btn-prev-week');
    if (prevBtn) prevBtn.title = I18N.t('weekPrevTitle');
    const nextBtn = document.getElementById('btn-next-week');
    if (nextBtn) nextBtn.title = I18N.t('weekNextTitle');

    // Insert language switcher
    const navLang = document.getElementById('nav-lang');
    if (navLang && !navLang.querySelector('.lang-switcher')) {
        navLang.appendChild(I18N.createLanguageSwitcher());
    }

    // Re-apply auth-specific nav
    checkAuth();

    // Re-render schedule with new language
    if (scheduleData) {
        renderSchedule(scheduleData);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyI18nToPage();
    checkAuth();
    loadSchedule();
});

// Listen for language changes
I18N.onChange(() => {
    applyI18nToPage();
    // Update switcher button text
    const btn = document.getElementById('lang-switcher-btn');
    if (btn) {
        const lang = I18N.languages[I18N.getLang()];
        btn.innerHTML = `<span class="lang-flag">${lang.flag}</span><span class="lang-name">${lang.nativeName}</span><span class="lang-arrow">▾</span>`;
    }
});

// Check if user is logged in
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        const navRight = document.getElementById('nav-right');

        if (data.loggedIn) {
            currentUser = data.user;
            const greetText = I18N.t('navGreeting', { name: data.user.displayName });
            navRight.innerHTML = `
                <span class="nav-user">${greetText}</span>
                ${data.user.role === 'teacher' ? `<a href="/admin.html" class="btn btn-sm btn-secondary">${I18N.t('navAdmin')}</a>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="logout()">${I18N.t('navLogout')}</button>
            `;
            document.getElementById('legend-my').classList.remove('hidden');
        } else {
            currentUser = null;
            navRight.innerHTML = `
                <a href="/login.html" class="btn btn-sm btn-primary">${I18N.t('navLogin')}</a>
                <a href="/register.html" class="btn btn-sm btn-secondary">${I18N.t('navRegister')}</a>
            `;
        }
    } catch (err) {
        console.error('Auth check failed:', err);
    }
}

// Load schedule data
async function loadSchedule() {
    try {
        const res = await fetch('/api/schedule');
        const data = await res.json();
        scheduleData = data;
        renderSchedule(data);
    } catch (err) {
        console.error('Load schedule failed:', err);
        document.getElementById('loading').innerHTML = `<p style="color:#e91e63;">${I18N.t('scheduleLoadFailed')}</p>`;
    }
}

// Navigate weeks
function prevWeek() {
    currentWeekOffset--;
    renderSchedule(scheduleData);
}

function nextWeek() {
    currentWeekOffset++;
    renderSchedule(scheduleData);
}

function goToday() {
    currentWeekOffset = 0;
    renderSchedule(scheduleData);
}

// Render the schedule table
function renderSchedule(data) {
    const { timeSlots, days, schedule } = data;
    const weekDates = getWeekDates(currentWeekOffset);
    const dayShortNames = I18N.getDayShortNames();

    // Update week navigation bar
    const weekNav = document.getElementById('week-nav');
    if (weekNav) {
        const weekRange = formatWeekRangeI18n(weekDates);
        document.getElementById('week-range-text').textContent = weekRange;

        const todayBtn = document.getElementById('btn-today');
        if (todayBtn) {
            todayBtn.style.display = currentWeekOffset === 0 ? 'none' : 'inline-flex';
        }
    }

    // Build header with dates
    const headerRow = document.getElementById('schedule-header');
    headerRow.innerHTML = `<th>${I18N.t('scheduleTimeHeader')}</th>`;
    days.forEach((day, idx) => {
        const th = document.createElement('th');
        const date = weekDates[idx];
        const dateStr = formatDateShortI18n(date);
        const holiday = getHoliday(date);

        let headerHTML = `<div class="th-day-name">${dayShortNames[idx]}</div>`;
        headerHTML += `<div class="th-date">${dateStr}</div>`;

        if (holiday) {
            headerHTML += `<div class="th-holiday" title="${holiday.name} / ${holiday.nameTh}">${holiday.emoji} ${holiday.nameTh}</div>`;
            th.classList.add('holiday-header');
        }

        th.innerHTML = headerHTML;
        headerRow.appendChild(th);
    });

    // Build body
    const tbody = document.getElementById('schedule-body');
    tbody.innerHTML = '';

    timeSlots.forEach((slot, idx) => {
        const tr = document.createElement('tr');

        // Time cell
        const tdTime = document.createElement('td');
        const [start, end] = slot.split('-');
        tdTime.innerHTML = `${formatTimeI18n(start)}<br>${formatTimeI18n(end)}`;
        tr.appendChild(tdTime);

        // Day cells
        for (let d = 0; d < 7; d++) {
            const td = document.createElement('td');
            const cellData = schedule[slot] && schedule[slot][d];
            const holiday = getHoliday(weekDates[d]);

            if (holiday) {
                td.classList.add('holiday-cell');
            }

            if (cellData) {
                td.appendChild(createSlotBadge(cellData));
            } else {
                td.textContent = '—';
            }

            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    });

    // Show table, hide loading
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('schedule-table').classList.remove('hidden');
}

// Create a slot badge element
function createSlotBadge(slotData) {
    const badge = document.createElement('span');
    badge.classList.add('slot-badge');

    if (slotData.status === 'available') {
        badge.classList.add('slot-available');
        badge.textContent = I18N.t('slotAvailable');
        badge.title = I18N.t('bookClickToBook');
        badge.onclick = () => handleBookClick(slotData.id);
    } else if (slotData.status === 'booked') {
        badge.classList.add('slot-booked');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('slot-name');
        nameSpan.textContent = slotData.bookedName;
        badge.appendChild(nameSpan);

        const statusText = document.createTextNode(I18N.t('slotNotAvailable'));
        badge.appendChild(statusText);

        if (currentUser && slotData.bookedBy === currentUser.id) {
            badge.classList.add('my-booking');
            badge.title = I18N.t('cancelClickToCancel');
            badge.onclick = () => handleCancelClick(slotData.id, slotData.bookedName);
        }
    } else if (slotData.status === 'not_available') {
        badge.classList.add('slot-not-available');
        badge.textContent = I18N.t('slotNotAvailable');
    }

    return badge;
}

// Handle book click
function handleBookClick(slotId) {
    if (!currentUser) {
        showToast(I18N.t('bookLoginFirst'), 'info');
        setTimeout(() => window.location.href = '/login.html', 1500);
        return;
    }
    showModal(
        I18N.t('bookConfirmTitle'),
        I18N.t('bookConfirmMsg'),
        async () => {
            try {
                const res = await fetch('/api/schedule/book', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slotId })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(I18N.t('bookSuccess'), 'success');
                    loadSchedule();
                    closeModal();
                } else {
                    showToast(data.error || I18N.t('bookFailed'), 'error');
                }
            } catch (err) {
                showToast(I18N.t('errorNetwork'), 'error');
            }
        }
    );
}

// Handle cancel click
function handleCancelClick(slotId, name) {
    showModal(
        I18N.t('cancelTitle'),
        I18N.t('cancelConfirmMsg', { name }),
        async () => {
            try {
                const res = await fetch('/api/schedule/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slotId })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(I18N.t('cancelSuccess'), 'success');
                    loadSchedule();
                    closeModal();
                } else {
                    showToast(data.error || I18N.t('cancelFailed'), 'error');
                }
            } catch (err) {
                showToast(I18N.t('errorNetwork'), 'error');
            }
        }
    );
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast(I18N.t('logoutSuccess'), 'info');
        currentUser = null;
        checkAuth();
        loadSchedule();
    } catch (err) {
        console.error('Logout failed:', err);
    }
}

// Modal functions
function showModal(title, message, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-confirm').onclick = onConfirm;
    // Update modal button text
    document.getElementById('modal-cancel').textContent = I18N.t('modalCancel');
    document.getElementById('modal-confirm').textContent = I18N.t('modalConfirm');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
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

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

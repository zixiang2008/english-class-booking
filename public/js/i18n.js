// ============================
// i18n.js - Internationalization System
// Supports: en, zh, th, ja
// ============================

const I18N = {
  _currentLang: 'en',
  _listeners: [],

  // Supported languages metadata
  languages: {
    en: { name: 'English', nativeName: 'English', flag: '🇬🇧', locale: 'en-US', dir: 'ltr' },
    zh: { name: 'Chinese', nativeName: '中文', flag: '🇨🇳', locale: 'zh-CN', dir: 'ltr' },
    th: { name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', locale: 'th-TH', dir: 'ltr' },
    ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', locale: 'ja-JP', dir: 'ltr' }
  },

  // ============================
  // Translation Strings
  // ============================
  translations: {
    // ---- Common / Shared ----
    en: {
      // App
      appName: '📖 English Class',
      appTitle: 'English Class Schedule',
      appSubtitle: 'View available times and book your class',
      adminSubtitle: 'Teacher Admin Panel',

      // Navigation
      navLogin: 'Login',
      navRegister: 'Register',
      navLogout: 'Logout',
      navAdmin: '🔧 Admin Panel',
      navBackSchedule: '← Schedule',
      navBackHome: '← Back to Schedule',
      navGreeting: '👋 {name}',

      // Legend
      legendAvailable: 'Available',
      legendBooked: 'Booked',
      legendNotAvailable: 'Not Available',
      legendMyBooking: 'My Booking',

      // Schedule
      scheduleTimeHeader: 'TIME',
      scheduleLoading: 'Loading schedule...',
      scheduleLoadFailed: 'Load failed, please refresh',
      slotAvailable: 'Available',
      slotNotAvailable: 'Not Available',
      slotBooked: 'Booked',

      // Week Navigation
      weekToday: '📍 This Week',
      weekPrevTitle: 'Previous week',
      weekNextTitle: 'Next week',

      // Days of week
      dayMonday: 'Monday',
      dayTuesday: 'Tuesday',
      dayWednesday: 'Wednesday',
      dayThursday: 'Thursday',
      dayFriday: 'Friday',
      daySaturday: 'Saturday',
      daySunday: 'Sunday',
      dayMon: 'MON',
      dayTue: 'TUE',
      dayWed: 'WED',
      dayThu: 'THU',
      dayFri: 'FRI',
      daySat: 'SAT',
      daySun: 'SUN',

      // Booking actions
      bookConfirmTitle: 'Confirm Booking',
      bookConfirmMsg: 'Do you want to book this time slot?',
      bookSuccess: 'Booking successful! 🎉',
      bookFailed: 'Booking failed',
      bookLoginFirst: 'Please login first to book a class',
      bookClickToBook: 'Click to book',

      // Cancel actions
      cancelTitle: 'Cancel Booking',
      cancelConfirmMsg: 'Are you sure you want to cancel {name}\'s booking?',
      cancelSuccess: 'Booking cancelled',
      cancelFailed: 'Cancel failed',
      cancelClickToCancel: 'Click to cancel',

      // Modal
      modalCancel: 'Cancel',
      modalConfirm: 'Confirm',

      // Errors
      errorNetwork: 'Network error, please try again',
      errorGeneral: 'An error occurred',

      // Auth - Login
      loginTitle: '👋 Welcome Back',
      loginSubtitle: 'Login to start booking classes',
      loginUsername: 'Username',
      loginPassword: 'Password',
      loginUsernamePlaceholder: 'Enter your username',
      loginPasswordPlaceholder: 'Enter your password',
      loginButton: 'Login',
      loginLoading: 'Logging in...',
      loginNoAccount: "Don't have an account?",
      loginRegisterLink: 'Register now',
      loginFillAll: 'Please fill in all fields',
      loginWelcome: 'Welcome back, {name}!',
      loginFailed: 'Login failed, please try again',
      loginInvalidCredentials: 'Invalid username or password',

      // Auth - Register
      registerTitle: '✨ Create Account',
      registerSubtitle: 'Register to book classes online',
      registerUsername: 'Username *',
      registerDisplayName: 'Your Name *',
      registerPhone: 'Phone Number',
      registerPassword: 'Password *',
      registerConfirmPassword: 'Confirm Password *',
      registerUsernamePlaceholder: 'Enter username',
      registerDisplayNamePlaceholder: 'Enter your name (shown on schedule)',
      registerPhonePlaceholder: 'Enter phone number (optional)',
      registerPasswordPlaceholder: 'At least 4 characters',
      registerConfirmPasswordPlaceholder: 'Re-enter password',
      registerButton: 'Register',
      registerLoading: 'Registering...',
      registerHasAccount: 'Already have an account?',
      registerLoginLink: 'Login',
      registerSuccess: 'Registration successful! Redirecting...',
      registerFailed: 'Registration failed, please try again',
      registerFillRequired: 'Please fill in all required fields',
      registerPasswordMinLength: 'Password must be at least 4 characters',
      registerPasswordMismatch: 'Passwords do not match',
      registerUsernameExists: 'Username already exists',

      // Admin Panel
      adminTabSchedule: '📅 Schedule Management',
      adminTabStudents: '👥 Student List',
      adminScheduleTitle: '📅 Schedule Management',
      adminScheduleDesc: 'Click buttons to toggle slot status or remove bookings',
      adminStudentsTitle: '👥 Registered Students',
      adminNoStudents: 'No registered students',
      adminSetAvailable: 'Set Available',
      adminSetUnavailable: 'Set Unavailable',
      adminRemoveBooking: 'Remove Booking',
      adminRemoveConfirm: 'Are you sure you want to remove this booking?',
      adminUpdated: 'Updated',
      adminUpdateFailed: 'Update failed',
      adminRemoved: 'Booking removed',
      adminNeedPermission: 'Teacher permission required',
      adminLoginRedirect: 'Teacher permission needed, please login',
      adminStudentUsername: '👤 Username: {name}',
      adminStudentPhone: '📞 Phone: {phone}',
      adminStudentRegistered: '📅 Registered: {date}',
      adminStudentBookings: '{count} classes booked',
      adminPhoneNotProvided: 'Not provided',
      adminLoadingText: 'Loading...',
      adminLoadFailed: 'Load failed, please refresh',

      // Logout
      logoutSuccess: 'Logged out',
      logoutText: 'Logout',

      // Footer
      footerText: 'Interested In My Classes? Book Now!',
      footerContact: 'TEL 098 007 8731 | Yosowa.toeskol@gmail.com | Wechat ID Ysowa 098 007 8731',
      footerAdmin: 'Teacher Admin Panel',
      footerAdminSub: 'English Class Booking System',

      // Toasts
      toastLoggedOut: 'Logged out successfully',

      // API Error Messages (from backend)
      apiFillRequired: 'Please fill in all required fields',
      apiPasswordMin: 'Password must be at least 4 characters',
      apiUsernameExists: 'Username already exists',
      apiRegisterFailed: 'Registration failed, please try again',
      apiLoginRequired: 'Please enter username and password',
      apiInvalidCredentials: 'Invalid username or password',
      apiLoginFailed: 'Login failed, please try again',
      apiScheduleFailed: 'Failed to load schedule',
      apiLoginFirst: 'Please login first',
      apiTeacherCantBook: 'Teachers cannot book classes',
      apiSelectSlot: 'Please select a time slot',
      apiSlotNotFound: 'Time slot not found',
      apiSlotUnavailable: 'This time slot is not available',
      apiBookFailed: 'Booking failed, please try again',
      apiBookSuccess: 'Booking successful!',
      apiNoPermission: 'You do not have permission to cancel this booking',
      apiCancelFailed: 'Cancel failed, please try again',
      apiCancelled: 'Booking cancelled',
      apiTeacherRequired: 'Teacher permission required',
      apiParamsIncomplete: 'Parameters incomplete',
      apiInvalidStatus: 'Invalid status',
      apiUpdateFailed: 'Update failed',
      apiStudentsFailed: 'Failed to load student list',
      apiRemoveFailed: 'Operation failed',
      apiRemoved: 'Booking removed',

      // Page titles
      pageTitleSchedule: 'English Class Schedule',
      pageTitleLogin: 'Login - English Class Booking',
      pageTitleRegister: 'Register - English Class Booking',
      pageTitleAdmin: 'Teacher Admin - English Class Booking',

      // Meta descriptions
      metaDescSchedule: 'English Class Schedule - Book your English lessons online. View available time slots and reserve your class today.',
      metaDescLogin: 'Login to English Class Booking System',
      metaDescRegister: 'Register for English Class Booking System',
      metaDescAdmin: 'Teacher Admin Panel - English Class Booking System',

      // Calendar subscription
      calendarSubscribe: '📅 Subscribe Calendar',
      calendarTitle: 'Subscribe to Teacher Schedule',
      calendarDesc: 'Add to your calendar app to see the class schedule.',
      calendarICalLink: 'iCal/ICS Link',
      calendarWebLink: 'Web View',
      calendarCopied: 'Link copied to clipboard!',
    },

    zh: {
      appName: '📖 英语课堂',
      appTitle: '英语课程表',
      appSubtitle: '查看可用时间并预约课程',
      adminSubtitle: '教师管理后台',
      navLogin: '登录',
      navRegister: '注册',
      navLogout: '退出',
      navAdmin: '🔧 管理后台',
      navBackSchedule: '← 课程表',
      navBackHome: '← 返回课程表',
      navGreeting: '👋 {name}',
      legendAvailable: '可约',
      legendBooked: '已约',
      legendNotAvailable: '不可约',
      legendMyBooking: '我的预约',
      scheduleTimeHeader: '时间',
      scheduleLoading: '正在加载课程表...',
      scheduleLoadFailed: '加载失败，请刷新重试',
      slotAvailable: '可约',
      slotNotAvailable: '不可约',
      slotBooked: '已约',
      weekToday: '📍 本周',
      weekPrevTitle: '上一周',
      weekNextTitle: '下一周',
      dayMonday: '星期一',
      dayTuesday: '星期二',
      dayWednesday: '星期三',
      dayThursday: '星期四',
      dayFriday: '星期五',
      daySaturday: '星期六',
      daySunday: '星期日',
      dayMon: '周一',
      dayTue: '周二',
      dayWed: '周三',
      dayThu: '周四',
      dayFri: '周五',
      daySat: '周六',
      daySun: '周日',
      bookConfirmTitle: '确认约课',
      bookConfirmMsg: '确定要预约这个时间段吗？',
      bookSuccess: '约课成功！🎉',
      bookFailed: '约课失败',
      bookLoginFirst: '请先登录后再约课',
      bookClickToBook: '点击约课',
      cancelTitle: '取消预约',
      cancelConfirmMsg: '确定要取消 {name} 的预约吗？',
      cancelSuccess: '已取消预约',
      cancelFailed: '取消失败',
      cancelClickToCancel: '点击取消预约',
      modalCancel: '取消',
      modalConfirm: '确认',
      errorNetwork: '网络错误，请重试',
      errorGeneral: '发生错误',
      loginTitle: '👋 欢迎回来',
      loginSubtitle: '登录您的账号开始约课',
      loginUsername: '用户名',
      loginPassword: '密码',
      loginUsernamePlaceholder: '请输入用户名',
      loginPasswordPlaceholder: '请输入密码',
      loginButton: '登录',
      loginLoading: '登录中...',
      loginNoAccount: '还没有账号？',
      loginRegisterLink: '立即注册',
      loginFillAll: '请填写所有字段',
      loginWelcome: '欢迎回来，{name}！',
      loginFailed: '登录失败，请重试',
      loginInvalidCredentials: '用户名或密码错误',
      registerTitle: '✨ 创建账号',
      registerSubtitle: '注册后即可在线约课',
      registerUsername: '用户名 *',
      registerDisplayName: '您的姓名 *',
      registerPhone: '电话号码',
      registerPassword: '密码 *',
      registerConfirmPassword: '确认密码 *',
      registerUsernamePlaceholder: '请输入用户名',
      registerDisplayNamePlaceholder: '请输入姓名（将显示在课表上）',
      registerPhonePlaceholder: '请输入电话号码（选填）',
      registerPasswordPlaceholder: '至少4个字符',
      registerConfirmPasswordPlaceholder: '请再次输入密码',
      registerButton: '注册',
      registerLoading: '注册中...',
      registerHasAccount: '已有账号？',
      registerLoginLink: '去登录',
      registerSuccess: '注册成功！正在跳转...',
      registerFailed: '注册失败，请重试',
      registerFillRequired: '请填写所有必填字段',
      registerPasswordMinLength: '密码至少需要4个字符',
      registerPasswordMismatch: '两次密码输入不一致',
      registerUsernameExists: '用户名已存在',
      adminTabSchedule: '📅 课程表管理',
      adminTabStudents: '👥 学生列表',
      adminScheduleTitle: '📅 课程表管理',
      adminScheduleDesc: '点击按钮切换时间段状态，或移除已有预约',
      adminStudentsTitle: '👥 注册学生列表',
      adminNoStudents: '暂无注册学生',
      adminSetAvailable: '设为可约',
      adminSetUnavailable: '设为不可约',
      adminRemoveBooking: '移除预约',
      adminRemoveConfirm: '确定要移除这个预约吗？',
      adminUpdated: '已更新',
      adminUpdateFailed: '更新失败',
      adminRemoved: '已移除预约',
      adminNeedPermission: '需要教师权限',
      adminLoginRedirect: '需要教师权限，请先登录',
      adminStudentUsername: '👤 用户名：{name}',
      adminStudentPhone: '📞 电话：{phone}',
      adminStudentRegistered: '📅 注册：{date}',
      adminStudentBookings: '已约 {count} 节课',
      adminPhoneNotProvided: '未填写',
      adminLoadingText: '加载中...',
      adminLoadFailed: '加载失败，请刷新重试',
      logoutSuccess: '已退出登录',
      logoutText: '退出',
      footerText: '对我的课程感兴趣？立即预约！',
      footerContact: '电话 098 007 8731 | Yosowa.toeskol@gmail.com | 微信 Ysowa 098 007 8731',
      footerAdmin: '教师管理后台',
      footerAdminSub: '英语约课系统',
      toastLoggedOut: '已退出登录',
      apiFillRequired: '请填写所有必填字段',
      apiPasswordMin: '密码至少需要4个字符',
      apiUsernameExists: '用户名已存在',
      apiRegisterFailed: '注册失败，请重试',
      apiLoginRequired: '请输入用户名和密码',
      apiInvalidCredentials: '用户名或密码错误',
      apiLoginFailed: '登录失败，请重试',
      apiScheduleFailed: '获取课程表失败',
      apiLoginFirst: '请先登录',
      apiTeacherCantBook: '老师不能约课',
      apiSelectSlot: '请选择时间段',
      apiSlotNotFound: '时间段不存在',
      apiSlotUnavailable: '该时间段不可预约',
      apiBookFailed: '约课失败，请重试',
      apiBookSuccess: '约课成功！',
      apiNoPermission: '无权取消该预约',
      apiCancelFailed: '取消失败，请重试',
      apiCancelled: '已取消预约',
      apiTeacherRequired: '需要教师权限',
      apiParamsIncomplete: '参数不完整',
      apiInvalidStatus: '无效状态',
      apiUpdateFailed: '更新失败',
      apiStudentsFailed: '获取学生列表失败',
      apiRemoveFailed: '操作失败',
      apiRemoved: '已移除预约',
      pageTitleSchedule: '英语课程表',
      pageTitleLogin: '登录 - 英语约课系统',
      pageTitleRegister: '注册 - 英语约课系统',
      pageTitleAdmin: '教师管理 - 英语约课系统',
      metaDescSchedule: '英语课程表 - 在线预约英语课程，查看可用时间段。',
      metaDescLogin: '登录英语约课系统',
      metaDescRegister: '注册英语约课系统',
      metaDescAdmin: '教师管理后台 - 英语约课系统',
      calendarSubscribe: '📅 订阅日历',
      calendarTitle: '订阅教师课程日历',
      calendarDesc: '添加到您的日历应用以查看课程安排。',
      calendarICalLink: 'iCal/ICS 链接',
      calendarWebLink: '网页查看',
      calendarCopied: '链接已复制到剪贴板！',
    },

    th: {
      appName: '📖 ภาษาอังกฤษ',
      appTitle: 'ตารางเรียนภาษาอังกฤษ',
      appSubtitle: 'ดูเวลาว่างและจองคลาสเรียนของคุณ',
      adminSubtitle: 'แผงควบคุมครูผู้สอน',
      navLogin: 'เข้าสู่ระบบ',
      navRegister: 'ลงทะเบียน',
      navLogout: 'ออกจากระบบ',
      navAdmin: '🔧 แผงควบคุม',
      navBackSchedule: '← ตารางเรียน',
      navBackHome: '← กลับไปตารางเรียน',
      navGreeting: '👋 {name}',
      legendAvailable: 'ว่าง',
      legendBooked: 'จองแล้ว',
      legendNotAvailable: 'ไม่ว่าง',
      legendMyBooking: 'การจองของฉัน',
      scheduleTimeHeader: 'เวลา',
      scheduleLoading: 'กำลังโหลดตารางเรียน...',
      scheduleLoadFailed: 'โหลดไม่สำเร็จ กรุณารีเฟรช',
      slotAvailable: 'ว่าง',
      slotNotAvailable: 'ไม่ว่าง',
      slotBooked: 'จองแล้ว',
      weekToday: '📍 สัปดาห์นี้',
      weekPrevTitle: 'สัปดาห์ก่อน',
      weekNextTitle: 'สัปดาห์ถัดไป',
      dayMonday: 'วันจันทร์',
      dayTuesday: 'วันอังคาร',
      dayWednesday: 'วันพุธ',
      dayThursday: 'วันพฤหัสบดี',
      dayFriday: 'วันศุกร์',
      daySaturday: 'วันเสาร์',
      daySunday: 'วันอาทิตย์',
      dayMon: 'จ.',
      dayTue: 'อ.',
      dayWed: 'พ.',
      dayThu: 'พฤ.',
      dayFri: 'ศ.',
      daySat: 'ส.',
      daySun: 'อา.',
      bookConfirmTitle: 'ยืนยันการจอง',
      bookConfirmMsg: 'คุณต้องการจองช่วงเวลานี้หรือไม่?',
      bookSuccess: 'จองสำเร็จ! 🎉',
      bookFailed: 'การจองล้มเหลว',
      bookLoginFirst: 'กรุณาเข้าสู่ระบบก่อนจองคลาส',
      bookClickToBook: 'คลิกเพื่อจอง',
      cancelTitle: 'ยกเลิกการจอง',
      cancelConfirmMsg: 'คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการจองของ {name}?',
      cancelSuccess: 'ยกเลิกการจองแล้ว',
      cancelFailed: 'ยกเลิกไม่สำเร็จ',
      cancelClickToCancel: 'คลิกเพื่อยกเลิก',
      modalCancel: 'ยกเลิก',
      modalConfirm: 'ยืนยัน',
      errorNetwork: 'เครือข่ายผิดพลาด กรุณาลองใหม่',
      errorGeneral: 'เกิดข้อผิดพลาด',
      loginTitle: '👋 ยินดีต้อนรับกลับ',
      loginSubtitle: 'เข้าสู่ระบบเพื่อเริ่มจองคลาสเรียน',
      loginUsername: 'ชื่อผู้ใช้',
      loginPassword: 'รหัสผ่าน',
      loginUsernamePlaceholder: 'กรอกชื่อผู้ใช้',
      loginPasswordPlaceholder: 'กรอกรหัสผ่าน',
      loginButton: 'เข้าสู่ระบบ',
      loginLoading: 'กำลังเข้าสู่ระบบ...',
      loginNoAccount: 'ยังไม่มีบัญชี?',
      loginRegisterLink: 'ลงทะเบียนเลย',
      loginFillAll: 'กรุณากรอกข้อมูลให้ครบ',
      loginWelcome: 'ยินดีต้อนรับ {name}!',
      loginFailed: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
      loginInvalidCredentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      registerTitle: '✨ สร้างบัญชี',
      registerSubtitle: 'ลงทะเบียนเพื่อจองคลาสออนไลน์',
      registerUsername: 'ชื่อผู้ใช้ *',
      registerDisplayName: 'ชื่อของคุณ *',
      registerPhone: 'เบอร์โทรศัพท์',
      registerPassword: 'รหัสผ่าน *',
      registerConfirmPassword: 'ยืนยันรหัสผ่าน *',
      registerUsernamePlaceholder: 'กรอกชื่อผู้ใช้',
      registerDisplayNamePlaceholder: 'กรอกชื่อของคุณ (แสดงในตารางเรียน)',
      registerPhonePlaceholder: 'กรอกเบอร์โทรศัพท์ (ไม่บังคับ)',
      registerPasswordPlaceholder: 'อย่างน้อย 4 ตัวอักษร',
      registerConfirmPasswordPlaceholder: 'กรอกรหัสผ่านอีกครั้ง',
      registerButton: 'ลงทะเบียน',
      registerLoading: 'กำลังลงทะเบียน...',
      registerHasAccount: 'มีบัญชีอยู่แล้ว?',
      registerLoginLink: 'เข้าสู่ระบบ',
      registerSuccess: 'ลงทะเบียนสำเร็จ! กำลังเปลี่ยนเส้นทาง...',
      registerFailed: 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่',
      registerFillRequired: 'กรุณากรอกข้อมูลที่จำเป็น',
      registerPasswordMinLength: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร',
      registerPasswordMismatch: 'รหัสผ่านไม่ตรงกัน',
      registerUsernameExists: 'ชื่อผู้ใช้นี้มีอยู่แล้ว',
      adminTabSchedule: '📅 จัดการตารางเรียน',
      adminTabStudents: '👥 รายชื่อนักเรียน',
      adminScheduleTitle: '📅 จัดการตารางเรียน',
      adminScheduleDesc: 'คลิกปุ่มเพื่อสลับสถานะช่วงเวลา หรือลบการจอง',
      adminStudentsTitle: '👥 นักเรียนที่ลงทะเบียน',
      adminNoStudents: 'ยังไม่มีนักเรียนลงทะเบียน',
      adminSetAvailable: 'ตั้งว่าง',
      adminSetUnavailable: 'ตั้งไม่ว่าง',
      adminRemoveBooking: 'ลบการจอง',
      adminRemoveConfirm: 'คุณแน่ใจหรือไม่ว่าต้องการลบการจองนี้?',
      adminUpdated: 'อัพเดทแล้ว',
      adminUpdateFailed: 'อัพเดทไม่สำเร็จ',
      adminRemoved: 'ลบการจองแล้ว',
      adminNeedPermission: 'ต้องการสิทธิ์ครูผู้สอน',
      adminLoginRedirect: 'ต้องการสิทธิ์ครูผู้สอน กรุณาเข้าสู่ระบบ',
      adminStudentUsername: '👤 ชื่อผู้ใช้: {name}',
      adminStudentPhone: '📞 โทรศัพท์: {phone}',
      adminStudentRegistered: '📅 ลงทะเบียน: {date}',
      adminStudentBookings: 'จอง {count} คลาส',
      adminPhoneNotProvided: 'ไม่ระบุ',
      adminLoadingText: 'กำลังโหลด...',
      adminLoadFailed: 'โหลดไม่สำเร็จ กรุณารีเฟรช',
      logoutSuccess: 'ออกจากระบบแล้ว',
      logoutText: 'ออกจากระบบ',
      footerText: 'สนใจคลาสเรียนของฉัน? จองเลย!',
      footerContact: 'โทร 098 007 8731 | Yosowa.toeskol@gmail.com | Wechat ID Ysowa 098 007 8731',
      footerAdmin: 'แผงควบคุมครูผู้สอน',
      footerAdminSub: 'ระบบจองคลาสเรียนภาษาอังกฤษ',
      toastLoggedOut: 'ออกจากระบบสำเร็จ',
      apiFillRequired: 'กรุณากรอกข้อมูลที่จำเป็น',
      apiPasswordMin: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร',
      apiUsernameExists: 'ชื่อผู้ใช้นี้มีอยู่แล้ว',
      apiRegisterFailed: 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่',
      apiLoginRequired: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
      apiInvalidCredentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      apiLoginFailed: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
      apiScheduleFailed: 'โหลดตารางเรียนไม่สำเร็จ',
      apiLoginFirst: 'กรุณาเข้าสู่ระบบก่อน',
      apiTeacherCantBook: 'ครูไม่สามารถจองคลาสได้',
      apiSelectSlot: 'กรุณาเลือกช่วงเวลา',
      apiSlotNotFound: 'ไม่พบช่วงเวลา',
      apiSlotUnavailable: 'ช่วงเวลานี้ไม่สามารถจองได้',
      apiBookFailed: 'จองไม่สำเร็จ กรุณาลองใหม่',
      apiBookSuccess: 'จองสำเร็จ!',
      apiNoPermission: 'คุณไม่มีสิทธิ์ยกเลิกการจองนี้',
      apiCancelFailed: 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่',
      apiCancelled: 'ยกเลิกการจองแล้ว',
      apiTeacherRequired: 'ต้องการสิทธิ์ครูผู้สอน',
      apiParamsIncomplete: 'ข้อมูลไม่ครบ',
      apiInvalidStatus: 'สถานะไม่ถูกต้อง',
      apiUpdateFailed: 'อัพเดทไม่สำเร็จ',
      apiStudentsFailed: 'โหลดรายชื่อนักเรียนไม่สำเร็จ',
      apiRemoveFailed: 'ดำเนินการไม่สำเร็จ',
      apiRemoved: 'ลบการจองแล้ว',
      pageTitleSchedule: 'ตารางเรียนภาษาอังกฤษ',
      pageTitleLogin: 'เข้าสู่ระบบ - จองคลาสภาษาอังกฤษ',
      pageTitleRegister: 'ลงทะเบียน - จองคลาสภาษาอังกฤษ',
      pageTitleAdmin: 'ครูผู้สอน - จองคลาสภาษาอังกฤษ',
      metaDescSchedule: 'ตารางเรียนภาษาอังกฤษ - จองคลาสเรียนออนไลน์',
      metaDescLogin: 'เข้าสู่ระบบจองคลาสเรียนภาษาอังกฤษ',
      metaDescRegister: 'ลงทะเบียนระบบจองคลาสเรียนภาษาอังกฤษ',
      metaDescAdmin: 'แผงควบคุมครูผู้สอน - ระบบจองคลาสเรียนภาษาอังกฤษ',
      calendarSubscribe: '📅 ติดตามปฏิทิน',
      calendarTitle: 'ติดตามตารางเรียนครู',
      calendarDesc: 'เพิ่มในแอปปฏิทินของคุณเพื่อดูตารางเรียน',
      calendarICalLink: 'ลิงค์ iCal/ICS',
      calendarWebLink: 'ดูบนเว็บ',
      calendarCopied: 'คัดลอกลิงค์ไปยังคลิปบอร์ดแล้ว!',
    },

    ja: {
      appName: '📖 英語教室',
      appTitle: '英語レッスンスケジュール',
      appSubtitle: '空き時間を確認してレッスンを予約',
      adminSubtitle: '講師管理パネル',
      navLogin: 'ログイン',
      navRegister: '新規登録',
      navLogout: 'ログアウト',
      navAdmin: '🔧 管理パネル',
      navBackSchedule: '← スケジュール',
      navBackHome: '← スケジュールに戻る',
      navGreeting: '👋 {name}',
      legendAvailable: '予約可',
      legendBooked: '予約済',
      legendNotAvailable: '不可',
      legendMyBooking: '自分の予約',
      scheduleTimeHeader: '時間',
      scheduleLoading: 'スケジュールを読み込み中...',
      scheduleLoadFailed: '読み込み失敗。更新してください',
      slotAvailable: '予約可',
      slotNotAvailable: '不可',
      slotBooked: '予約済',
      weekToday: '📍 今週',
      weekPrevTitle: '前の週',
      weekNextTitle: '次の週',
      dayMonday: '月曜日',
      dayTuesday: '火曜日',
      dayWednesday: '水曜日',
      dayThursday: '木曜日',
      dayFriday: '金曜日',
      daySaturday: '土曜日',
      daySunday: '日曜日',
      dayMon: '月',
      dayTue: '火',
      dayWed: '水',
      dayThu: '木',
      dayFri: '金',
      daySat: '土',
      daySun: '日',
      bookConfirmTitle: '予約の確認',
      bookConfirmMsg: 'この時間帯を予約しますか？',
      bookSuccess: '予約成功！🎉',
      bookFailed: '予約失敗',
      bookLoginFirst: '予約するにはログインしてください',
      bookClickToBook: 'クリックして予約',
      cancelTitle: '予約キャンセル',
      cancelConfirmMsg: '{name}さんの予約をキャンセルしますか？',
      cancelSuccess: '予約をキャンセルしました',
      cancelFailed: 'キャンセル失敗',
      cancelClickToCancel: 'クリックしてキャンセル',
      modalCancel: 'キャンセル',
      modalConfirm: '確認',
      errorNetwork: 'ネットワークエラー。もう一度お試しください',
      errorGeneral: 'エラーが発生しました',
      loginTitle: '👋 おかえりなさい',
      loginSubtitle: 'ログインしてレッスンを予約',
      loginUsername: 'ユーザー名',
      loginPassword: 'パスワード',
      loginUsernamePlaceholder: 'ユーザー名を入力',
      loginPasswordPlaceholder: 'パスワードを入力',
      loginButton: 'ログイン',
      loginLoading: 'ログイン中...',
      loginNoAccount: 'アカウントをお持ちでないですか？',
      loginRegisterLink: '新規登録',
      loginFillAll: 'すべてのフィールドを入力してください',
      loginWelcome: 'おかえりなさい、{name}さん！',
      loginFailed: 'ログイン失敗。もう一度お試しください',
      loginInvalidCredentials: 'ユーザー名またはパスワードが違います',
      registerTitle: '✨ アカウント作成',
      registerSubtitle: '登録してオンラインで予約',
      registerUsername: 'ユーザー名 *',
      registerDisplayName: 'お名前 *',
      registerPhone: '電話番号',
      registerPassword: 'パスワード *',
      registerConfirmPassword: 'パスワード確認 *',
      registerUsernamePlaceholder: 'ユーザー名を入力',
      registerDisplayNamePlaceholder: 'お名前を入力（スケジュールに表示）',
      registerPhonePlaceholder: '電話番号を入力（任意）',
      registerPasswordPlaceholder: '4文字以上',
      registerConfirmPasswordPlaceholder: 'パスワードを再入力',
      registerButton: '登録',
      registerLoading: '登録中...',
      registerHasAccount: 'すでにアカウントをお持ちですか？',
      registerLoginLink: 'ログイン',
      registerSuccess: '登録成功！リダイレクト中...',
      registerFailed: '登録失敗。もう一度お試しください',
      registerFillRequired: '必須フィールドを入力してください',
      registerPasswordMinLength: 'パスワードは4文字以上必要です',
      registerPasswordMismatch: 'パスワードが一致しません',
      registerUsernameExists: 'このユーザー名は既に使用されています',
      adminTabSchedule: '📅 スケジュール管理',
      adminTabStudents: '👥 生徒リスト',
      adminScheduleTitle: '📅 スケジュール管理',
      adminScheduleDesc: 'ボタンをクリックしてスロットの状態を切り替えるか、予約を削除します',
      adminStudentsTitle: '👥 登録済み生徒',
      adminNoStudents: '登録済みの生徒はいません',
      adminSetAvailable: '予約可に設定',
      adminSetUnavailable: '不可に設定',
      adminRemoveBooking: '予約を削除',
      adminRemoveConfirm: 'この予約を削除しますか？',
      adminUpdated: '更新しました',
      adminUpdateFailed: '更新失敗',
      adminRemoved: '予約を削除しました',
      adminNeedPermission: '講師権限が必要です',
      adminLoginRedirect: '講師権限が必要です。ログインしてください',
      adminStudentUsername: '👤 ユーザー名：{name}',
      adminStudentPhone: '📞 電話：{phone}',
      adminStudentRegistered: '📅 登録日：{date}',
      adminStudentBookings: '{count}クラス予約済み',
      adminPhoneNotProvided: '未入力',
      adminLoadingText: '読み込み中...',
      adminLoadFailed: '読み込み失敗。更新してください',
      logoutSuccess: 'ログアウトしました',
      logoutText: 'ログアウト',
      footerText: 'レッスンに興味がありますか？今すぐ予約！',
      footerContact: 'TEL 098 007 8731 | Yosowa.toeskol@gmail.com | Wechat ID Ysowa 098 007 8731',
      footerAdmin: '講師管理パネル',
      footerAdminSub: '英語レッスン予約システム',
      toastLoggedOut: 'ログアウトしました',
      apiFillRequired: '必須フィールドを入力してください',
      apiPasswordMin: 'パスワードは4文字以上必要です',
      apiUsernameExists: 'このユーザー名は既に使用されています',
      apiRegisterFailed: '登録失敗。もう一度お試しください',
      apiLoginRequired: 'ユーザー名とパスワードを入力してください',
      apiInvalidCredentials: 'ユーザー名またはパスワードが違います',
      apiLoginFailed: 'ログイン失敗。もう一度お試しください',
      apiScheduleFailed: 'スケジュールの読み込みに失敗しました',
      apiLoginFirst: 'ログインしてください',
      apiTeacherCantBook: '講師は予約できません',
      apiSelectSlot: '時間帯を選択してください',
      apiSlotNotFound: '時間帯が見つかりません',
      apiSlotUnavailable: 'この時間帯は予約できません',
      apiBookFailed: '予約失敗。もう一度お試しください',
      apiBookSuccess: '予約成功！',
      apiNoPermission: 'この予約をキャンセルする権限がありません',
      apiCancelFailed: 'キャンセル失敗。もう一度お試しください',
      apiCancelled: '予約をキャンセルしました',
      apiTeacherRequired: '講師権限が必要です',
      apiParamsIncomplete: 'パラメータが不完全です',
      apiInvalidStatus: '無効なステータス',
      apiUpdateFailed: '更新失敗',
      apiStudentsFailed: '生徒リストの読み込みに失敗しました',
      apiRemoveFailed: '操作失敗',
      apiRemoved: '予約を削除しました',
      pageTitleSchedule: '英語レッスンスケジュール',
      pageTitleLogin: 'ログイン - 英語レッスン予約',
      pageTitleRegister: '新規登録 - 英語レッスン予約',
      pageTitleAdmin: '講師管理 - 英語レッスン予約',
      metaDescSchedule: '英語レッスンスケジュール - オンラインで予約',
      metaDescLogin: '英語レッスン予約システムにログイン',
      metaDescRegister: '英語レッスン予約システムに登録',
      metaDescAdmin: '講師管理パネル - 英語レッスン予約システム',
      calendarSubscribe: '📅 カレンダー登録',
      calendarTitle: '講師スケジュールを購読',
      calendarDesc: 'カレンダーアプリに追加してスケジュールを確認。',
      calendarICalLink: 'iCal/ICSリンク',
      calendarWebLink: 'ウェブ表示',
      calendarCopied: 'リンクをクリップボードにコピーしました！',
    }
  },

  // ============================
  // Core Methods
  // ============================

  /**
   * Initialize i18n - load saved language or detect from browser
   */
  init() {
    const saved = localStorage.getItem('ecb-language');
    if (saved && this.languages[saved]) {
      this._currentLang = saved;
    } else {
      // Auto-detect
      const browserLang = navigator.language || navigator.userLanguage || 'en';
      if (browserLang.startsWith('zh')) this._currentLang = 'zh';
      else if (browserLang.startsWith('th')) this._currentLang = 'th';
      else if (browserLang.startsWith('ja')) this._currentLang = 'ja';
      else this._currentLang = 'en';
    }
    document.documentElement.lang = this.languages[this._currentLang].locale;
  },

  /**
   * Get current language code
   */
  getLang() {
    return this._currentLang;
  },

  /**
   * Get the locale string for the current language
   */
  getLocale() {
    return this.languages[this._currentLang].locale;
  },

  /**
   * Switch language
   */
  setLang(langCode) {
    if (!this.languages[langCode]) return;
    this._currentLang = langCode;
    localStorage.setItem('ecb-language', langCode);
    document.documentElement.lang = this.languages[langCode].locale;
    // Notify all listeners
    this._listeners.forEach(fn => fn(langCode));
  },

  /**
   * Register a callback for language changes
   */
  onChange(fn) {
    this._listeners.push(fn);
  },

  /**
   * Translate a key, with optional interpolation
   * t('loginWelcome', { name: 'John' }) => 'Welcome back, John!'
   */
  t(key, params) {
    let str = this.translations[this._currentLang]?.[key]
           || this.translations['en']?.[key]
           || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  },

  // ============================
  // Locale-aware Formatting
  // ============================

  /**
   * Format a date according to current locale
   */
  formatDate(date, options) {
    const locale = this.getLocale();
    const defaultOpts = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Intl.DateTimeFormat(locale, options || defaultOpts).format(date);
  },

  /**
   * Format short date (month/day style)
   */
  formatDateShort(date) {
    const locale = this.getLocale();
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
  },

  /**
   * Format a week range string
   */
  formatWeekRange(startDate, endDate) {
    const locale = this.getLocale();
    const fmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    return `${fmt.format(startDate)} — ${new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(endDate)}`;
  },

  /**
   * Format time (e.g. 10:00 => 10.00 am)
   */
  formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const locale = this.getLocale();
    const date = new Date(2000, 0, 1, parseInt(h), parseInt(m));
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: locale === 'en-US' }).format(date);
  },

  /**
   * Format a number
   */
  formatNumber(num) {
    return new Intl.NumberFormat(this.getLocale()).format(num);
  },

  /**
   * Format currency
   */
  formatCurrency(amount, currency = 'THB') {
    return new Intl.NumberFormat(this.getLocale(), { style: 'currency', currency }).format(amount);
  },

  /**
   * Get day short names array (Mon-Sun order)
   */
  getDayShortNames() {
    const lang = this._currentLang;
    return [
      this.t('dayMon'), this.t('dayTue'), this.t('dayWed'),
      this.t('dayThu'), this.t('dayFri'), this.t('daySat'), this.t('daySun')
    ];
  },

  // ============================
  // Language Switcher UI
  // ============================

  /**
   * Create a language switcher dropdown element
   */
  createLanguageSwitcher() {
    const container = document.createElement('div');
    container.className = 'lang-switcher';
    container.id = 'lang-switcher';

    const current = this.languages[this._currentLang];

    const btn = document.createElement('button');
    btn.className = 'lang-switcher-btn';
    btn.id = 'lang-switcher-btn';
    btn.innerHTML = `<span class="lang-flag">${current.flag}</span><span class="lang-name">${current.nativeName}</span><span class="lang-arrow">▾</span>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('lang-dropdown');
      dropdown.classList.toggle('show');
    };

    const dropdown = document.createElement('div');
    dropdown.className = 'lang-dropdown';
    dropdown.id = 'lang-dropdown';

    Object.entries(this.languages).forEach(([code, lang]) => {
      const option = document.createElement('button');
      option.className = 'lang-option' + (code === this._currentLang ? ' active' : '');
      option.innerHTML = `<span class="lang-flag">${lang.flag}</span><span>${lang.nativeName}</span>`;
      option.onclick = (e) => {
        e.stopPropagation();
        this.setLang(code);
        dropdown.classList.remove('show');
      };
      dropdown.appendChild(option);
    });

    container.appendChild(btn);
    container.appendChild(dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    return container;
  }
};

// Initialize on load
I18N.init();

// ============================
// i18n-server.js - Server-side i18n support
// ============================

const translations = {
    en: {
        fillRequired: 'Please fill in all required fields',
        passwordMin: 'Password must be at least 4 characters',
        usernameExists: 'Username already exists',
        registerFailed: 'Registration failed, please try again',
        loginRequired: 'Please enter username and password',
        invalidCredentials: 'Invalid username or password',
        loginFailed: 'Login failed, please try again',
        scheduleFailed: 'Failed to load schedule',
        loginFirst: 'Please login first',
        teacherCantBook: 'Teachers cannot book classes',
        selectSlot: 'Please select a time slot',
        slotNotFound: 'Time slot not found',
        slotUnavailable: 'This time slot is not available',
        bookFailed: 'Booking failed, please try again',
        bookSuccess: 'Booking successful!',
        noPermission: 'You do not have permission to cancel this booking',
        cancelFailed: 'Cancel failed, please try again',
        cancelled: 'Booking cancelled',
        teacherRequired: 'Teacher permission required',
        paramsIncomplete: 'Parameters incomplete',
        invalidStatus: 'Invalid status',
        updateFailed: 'Update failed',
        studentsFailed: 'Failed to load student list',
        removeFailed: 'Operation failed',
        removed: 'Booking removed',
        pinDigitsOnly: 'PIN must be exactly 4 digits',
    },
    zh: {
        fillRequired: '请填写所有必填字段',
        passwordMin: '密码至少需要4个字符',
        usernameExists: '用户名已存在',
        registerFailed: '注册失败，请重试',
        loginRequired: '请输入用户名和密码',
        invalidCredentials: '用户名或密码错误',
        loginFailed: '登录失败，请重试',
        scheduleFailed: '获取课程表失败',
        loginFirst: '请先登录',
        teacherCantBook: '老师不能约课',
        selectSlot: '请选择时间段',
        slotNotFound: '时间段不存在',
        slotUnavailable: '该时间段不可预约',
        bookFailed: '约课失败，请重试',
        bookSuccess: '约课成功！',
        noPermission: '无权取消该预约',
        cancelFailed: '取消失败，请重试',
        cancelled: '已取消预约',
        teacherRequired: '需要教师权限',
        paramsIncomplete: '参数不完整',
        invalidStatus: '无效状态',
        updateFailed: '更新失败',
        studentsFailed: '获取学生列表失败',
        removeFailed: '操作失败',
        removed: '已移除预约',
        pinDigitsOnly: '密码必须是4位数字',
    },
    th: {
        fillRequired: 'กรุณากรอกข้อมูลที่จำเป็น',
        passwordMin: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร',
        usernameExists: 'ชื่อผู้ใช้นี้มีอยู่แล้ว',
        registerFailed: 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่',
        loginRequired: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
        invalidCredentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
        loginFailed: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
        scheduleFailed: 'โหลดตารางเรียนไม่สำเร็จ',
        loginFirst: 'กรุณาเข้าสู่ระบบก่อน',
        teacherCantBook: 'ครูไม่สามารถจองคลาสได้',
        selectSlot: 'กรุณาเลือกช่วงเวลา',
        slotNotFound: 'ไม่พบช่วงเวลา',
        slotUnavailable: 'ช่วงเวลานี้ไม่สามารถจองได้',
        bookFailed: 'จองไม่สำเร็จ กรุณาลองใหม่',
        bookSuccess: 'จองสำเร็จ!',
        noPermission: 'คุณไม่มีสิทธิ์ยกเลิกการจองนี้',
        cancelFailed: 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่',
        cancelled: 'ยกเลิกการจองแล้ว',
        teacherRequired: 'ต้องการสิทธิ์ครูผู้สอน',
        paramsIncomplete: 'ข้อมูลไม่ครบ',
        invalidStatus: 'สถานะไม่ถูกต้อง',
        updateFailed: 'อัพเดทไม่สำเร็จ',
        studentsFailed: 'โหลดรายชื่อนักเรียนไม่สำเร็จ',
        removeFailed: 'ดำเนินการไม่สำเร็จ',
        removed: 'ลบการจองแล้ว',
        pinDigitsOnly: 'PIN ต้องเป็นตัวเลข 4 หลัก',
    },
    ja: {
        fillRequired: '必須フィールドを入力してください',
        passwordMin: 'パスワードは4文字以上必要です',
        usernameExists: 'このユーザー名は既に使用されています',
        registerFailed: '登録失敗。もう一度お試しください',
        loginRequired: 'ユーザー名とパスワードを入力してください',
        invalidCredentials: 'ユーザー名またはパスワードが違います',
        loginFailed: 'ログイン失敗。もう一度お試しください',
        scheduleFailed: 'スケジュールの読み込みに失敗しました',
        loginFirst: 'ログインしてください',
        teacherCantBook: '講師は予約できません',
        selectSlot: '時間帯を選択してください',
        slotNotFound: '時間帯が見つかりません',
        slotUnavailable: 'この時間帯は予約できません',
        bookFailed: '予約失敗。もう一度お試しください',
        bookSuccess: '予約成功！',
        noPermission: 'この予約をキャンセルする権限がありません',
        cancelFailed: 'キャンセル失敗。もう一度お試しください',
        cancelled: '予約をキャンセルしました',
        teacherRequired: '講師権限が必要です',
        paramsIncomplete: 'パラメータが不完全です',
        invalidStatus: '無効なステータス',
        updateFailed: '更新失敗',
        studentsFailed: '生徒リストの読み込みに失敗しました',
        removeFailed: '操作失敗',
        removed: '予約を削除しました',
        pinDigitsOnly: 'PINは4桁の数字でなければなりません',
    }
};

/**
 * Extract language from Accept-Language header or custom header
 */
function detectLang(req) {
    // Check custom header first
    const customLang = req.headers['x-language'];
    if (customLang && translations[customLang]) return customLang;

    // Check session
    if (req.session && req.session.language && translations[req.session.language]) {
        return req.session.language;
    }

    // Check Accept-Language header
    const acceptLang = req.headers['accept-language'] || '';
    if (acceptLang.startsWith('zh')) return 'zh';
    if (acceptLang.startsWith('th')) return 'th';
    if (acceptLang.startsWith('ja')) return 'ja';
    return 'en';
}

/**
 * Translate a key using the request's language
 */
function t(req, key) {
    const lang = detectLang(req);
    return translations[lang]?.[key] || translations['en']?.[key] || key;
}

module.exports = { t, detectLang, translations };

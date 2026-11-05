# English Class Booking v3.2

多老师英语课程预约系统：一个页面发布课程、通知栏、谷歌地址栏、真实时区时间、学生预约、老师实时看板、开课状态与更新记录，外加**超级管理员**的账号治理与课程审核。

- Node.js 18+ / Express 4 / sql.js（SQLite）
- 原生 HTML + CSS + JavaScript，无前端构建步骤
- 英文 / 中文 / 泰文 / 日文四语言，移动端优先

> 四语言项目说明见 [PROJECT_GUIDE.md](PROJECT_GUIDE.md)。

---

## 1. v3 解决了什么

| 能力 | v2 | v3 |
| --- | --- | --- |
| 课程模型 | 只有 7 天 × 8 时段的循环周表 | 新增「具体课程」：日期、时间、时区、地点、名额 |
| 多老师 | 单一老师视角 | 多位老师在同一页面发布，按 `teacher_id` 隔离权限 |
| 通知栏 | 无 | 每门课可写通知，硬性限制 100 字 |
| 上课地点 | 纯文本 | 谷歌地址栏：时区 / 日期 / 起止时间 / 地点 / Google Maps 链接，全部必填 |
| 时间准确性 | 本地墙钟时间，跨时区会误解 | 服务端把老师本地时间换算为真实 UTC，学生同时看到「老师当地时间」和「我的当地时间」 |
| 学生预约 | 只能占用周表格子 | 针对具体课程预约，含名额、重复预约、满员、取消 |
| 老师看预约 | 需要刷新后台 | 工作台实时预约流，15 秒自动刷新，新预约标记 NEW |
| 开课状态 | 无 | pending / confirmed / cancelled / completed，学生可见 |
| 更新记录 | 无 | revision + 变更日志，学生看到「有更新」和时间线 |
| 日历 | 仅周表 ICS | 具体课程以真实 UTC 事件写入 ICS，并生成 Google Calendar 链接 |
| 界面 | 桌面优先 | 重新设计的移动优先界面，手机单列卡片、底部抽屉弹窗 |
| 账号治理 | 无 | v3.1 超级管理员：封禁 / 禁言 / 禁止发布 / 重置 PIN / 删除账号 |
| 课程审核 | 无 | v3.1 课程审核：任意课程可下架与恢复，学生同步看到原因 |
| 管理留痕 | 无 | v3.1 操作日志：每条管理动作记录执行人、对象、原因与时间 |
| 课程广场 | 单一列表，已结束的课混在中间 | v3.2 三段式：下周课程（高亮）/ 更远的课程 / 已结束课程（默认折叠） |

---

## 2. 功能清单

### 2.1 老师端（`/admin.html`）

- 工作台概览：我的课程、已确认、待确认、预约数、学生数、站点老师数
- 发布课程：标题、通知栏（≤100 字）、时区、日期、开始/结束时间、地点、Google Maps 地址、名额、开课状态
- 编辑课程：任意字段，保存后自动递增 revision 并写入更新历史
- 状态切换：待确认 / 确认开课 / 已取消 / 已完成，可附状态说明
- 实时预约流：学生姓名、用户名、电话、课程、上课时间、预约时间
- 周表管理：保留 v2 的 7×8 循环时段开关
- 学生列表：注册学生与预约次数
- 权限：只能编辑/删除自己发布的课程

### 2.2 学生端（`/`）

- 课程广场：按老师、状态、关键词筛选，支持「只看我的预约」
  - **三段式分区**：`下周课程`（未来 7 天，独立高亮面板）→ `更远的课程`（7 天以后）→ `已结束课程`（已过时间，默认折叠、可一键展开）
  - 三个区各自显示数量；下周无课时给出「下周暂无课程安排」；若全站没有未来课程，已结束区自动展开，避免打开就是空页面
- 每张课程卡片展示：
  - 老师、开课状态、是否有更新
  - 通知栏（100 字以内）
  - 谷歌地址栏：IANA 时区 + GMT 偏移、老师当地时间、我的当地时间、地点、Google Maps 链接、加入 Google 日历
  - 剩余名额与已预约人数
- 一键预约 / 取消预约，重复预约、满员、已取消课程会被拦截
- 登录页底部展示**平台免责声明**（清迈地区课程信息平台定位、师生独立责任、合法合规、纠纷处理、平台责任），四语言同步
- 课程详情：完整信息、更新历史、老师可见的预约学生
- 周课表视图：保留旧的循环时间表

### 2.3 超级管理员端（`/superadmin.html`，仅 `is_admin` 可见）

- 概览：账号总数 / 老师 / 学生 / 超管 / 已封禁 / 已禁言 / 课程 / 预约
- 账号管理：搜索（姓名、用户名、电话）、按角色与限制状态筛选
- 对任意老师或学生执行：
  - **封禁账号**：立即无法登录，已登录会话下一次请求即失效
  - **禁言**：1 小时 / 24 小时 / 7 天 / 30 天 / 永久，期间不能发布或修改课程，学生不能预约
  - **禁止发布课程**：只能编辑已有课程，不能新建
  - **解除**以上全部限制
  - **设为 / 取消超级管理员**、**重置 4 位 PIN**、**删除账号**（级联清理其课程与预约）
- 课程审核：搜索全部课程，**下架**（转为已取消并写入更新记录，学生可见原因）与**恢复**
- 操作日志：执行人、动作、对象、原因、时间
- 自我保护：不能封禁/删除/降权自己；超管之间不能互相限制；系统必须保留至少一名超管
- 被限制的老师登录教师工作台后，页面顶部会显示黄色横幅说明原因与到期时间

### 2.4 通用

- 四语言切换，服务端 API 错误也会按 `X-Language` 返回对应语言
- 登录 / 注册：4 位数字 PIN，老师可用邀请码注册
- Google OAuth（配置了 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 才会显示按钮）
- 日历订阅页 `/calendar.html`：ICS 地址、公开 JSON、订阅教程
- 移动端：单列卡片、底部抽屉弹窗、横向滚动周表、44px 以上触控目标

---

## 3. 快速开始

```bash
git clone https://github.com/zixiang2008/english-class-booking.git
cd english-class-booking
npm install
npm start
```

打开 http://localhost:3000

首次启动会自动创建 `booking.db`、建表、写入演示账号与 4 门示例课程。

---

## 4. 账号

所有账号密码均为 **4 位数字 PIN**。**用户名不区分大小写**：`Hamish`、`hamish`、`HAMISH` 登录的是同一个账号（注册查重同样不区分大小写）。

**正式账号**

| 角色 | 用户名 | PIN | 说明 |
| --- | --- | --- | --- |
| **超级管理员** / 老师 | `elvis` | `1314` | 系统最高权限：管理所有账号、封禁/禁言/限制发布、审核课程、查看操作日志 |
| 老师 | `hamish` | `1234` | 真实老师账号，尚未发布课程 |
| 老师 | `kevin` | `1234` | 真实老师账号，尚未发布课程 |

> 超级管理员权限通过 `is_admin` 标记，与角色（老师/学生）解耦：`elvis` 既是老师也是超管，因此仍可正常发布课程。

**演示账号（历史数据用，可真实登录）**

| 角色 | 用户名 | PIN | 说明 |
| --- | --- | --- | --- |
| 老师 | `test_teacher1` | `1314` | 发布 `English Corner`，过去两周 14 节 |
| 老师 | `test_teacher2` | `1314` | 发布 `English Corner`，过去两周 14 节 |
| 老师 | `test_teacher3` | `1314` | 发布 `英文学习课程`，过去两周 14 节 |
| 学生 | `test_student1` … `test_student5` | `1314` | 每人每周 3 次课，共 6 条历史预约 |

演示账号只在本文档与数据库中保留，**登录页不再展示**（原「演示账号」提示块已改为平台免责声明）。

演示数据覆盖**过去 14 天**（不含今天），每天固定三个时段：`10:00-12:00`、`15:00-16:00`、`16:00-17:00`（Asia/Bangkok）。共 42 节课（38 节已完成、4 节已取消）、30 条预约，全部只出现在历史里，不会占用未来的时间段。

> `elvis` / `hamish` / `kevin` 不会在全新数据库中自动创建，可用注册页 + 邀请码，或下面的命令创建 / 重置：

```bash
# 先停止正在运行的服务，执行完再启动
node scripts/create-user.js elvis 1314 teacher Elvis
node scripts/create-user.js hamish 1234 teacher Hamish
node scripts/create-user.js kevin 1234 teacher Kevin
```

> `scripts/create-user.js` 也可以用来重置任意账号的 PIN，或把学生升级为老师。

授予 / 取消超级管理员（或列出全部超管）：

```bash
node scripts/grant-admin.js elvis          # 授予
node scripts/grant-admin.js elvis --revoke # 取消（系统会拒绝移除最后一名超管）
node scripts/grant-admin.js --list         # 查看
```

重新生成演示历史（会先删除这 3 位测试老师名下的旧课程）：

```bash
# 先停服务，再执行，最后重启
SEED_DEMO=0 node scripts/seed-demo-history.js        # 默认两周
SEED_DEMO=0 node scripts/seed-demo-history.js 4      # 四周
```

**站点设置**：老师工作台 →「站点设置」可修改站点标题、电话、邮箱、LINE 链接。这些值同时驱动公开页页脚；**电话留空即从页脚隐藏**，不会显示空链接。

老师注册邀请码：`TEACHER2026`（通过 `TEACHER_INVITE_CODE` 环境变量修改）。

---

## 5. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `./booking.db` | SQLite 文件路径，测试时指向临时文件即可隔离 |
| `SESSION_SECRET` | 内置开发值 | 生产环境必须设置 |
| `NODE_ENV` | 空 | 设为 `production` 时启用 secure + SameSite=None Cookie |
| `TEACHER_INVITE_CODE` | `TEACHER2026` | 老师自助注册邀请码 |
| `SEED_DEMO` | 开启 | 设为 `0` 时不写入演示老师 / 演示课程 / 假的周表预约（**正式上线请设为 0**） |
| `SITE_URL` | 自动推断 | 用于日历接口和启动日志的公开地址 |
| `GOOGLE_CLIENT_ID` | 空 | 配置后启用 Google 登录 |
| `GOOGLE_CLIENT_SECRET` | 空 | 同上 |
| `GOOGLE_REDIRECT_URI` | 空 | 例如 `https://en.caishen.today/api/auth/google/callback` |

---

## 6. 目录结构

```
english-class-booking/
├── server.js                 Express 入口，安全头、静态资源、路由挂载
├── database.js               sql.js 封装、建表、迁移、演示数据
├── i18n-server.js            服务端错误消息（en/zh/th/ja）
├── lib/
│   ├── time.js               时区换算、GMT 偏移、ICS/Google 日历、时间戳规范化
│   ├── course-validation.js  课程字段校验（通知栏 100 字、Google Maps 必填等）
│   └── guards.js             登录 / 老师 / 学生权限中间件
├── routes/
│   ├── auth.js               注册、登录、登出、Google OAuth
│   ├── courses.js            课程 CRUD、状态、预约、更新历史
│   ├── admin.js              工作台概览、实时预约、周表、学生
│   ├── superadmin.js         超级管理员：账号治理、课程审核、操作日志
│   ├── calendar.js           ICS 订阅、公开 JSON
│   └── schedule.js           旧版循环周表接口
├── public/
│   ├── index.html            学生课程广场
│   ├── admin.html            老师工作台
│   ├── superadmin.html       超级管理员控制台
│   ├── login.html            登录
│   ├── register.html         注册（含老师邀请码）
│   ├── calendar.html         日历订阅
│   ├── css/style.css         v3 设计系统与响应式
│   └── js/
│       ├── i18n.js           原四语言引擎
│       ├── i18n-v3.js        v3 词条（四种语言全覆盖）
│       ├── common.js         共享 App 层：请求、toast、弹窗、导航、时间格式化
│       ├── schedule.js       学生端逻辑
│       ├── admin.js          老师端逻辑
│       ├── superadmin.js     超管台逻辑
│       └── auth.js           登录/注册逻辑
├── scripts/
│   ├── check-i18n.js         i18n 静态审计
│   ├── create-user.js        创建 / 重置账号
│   ├── grant-admin.js        授予 / 取消超级管理员
│   ├── reset-data.js         清空业务数据（保留管理员与站点设置）
│   ├── seed-demo-history.js  生成过去两周的模拟课堂与选课记录
│   ├── visual-audit.js       多视口视觉审计（溢出 / 列数 / 触控尺寸 / 截图）
│   └── ui-smoke.js           Chrome DevTools Protocol 真实浏览器冒烟测试
├── tests/
│   ├── test-suite.js         接口 + 单元集成测试（自启动、隔离数据库）
│   ├── e2e-full.js           多角色验收
│   └── superadmin-suite.js   超管权限 / 限制 / 审核 / 日志验收
```

---

## 7. 数据模型

```sql
users            id, username, password_hash, display_name, phone, role, google_id,
                 is_admin, status, ban_reason, banned_at,
                 muted_until, mute_reason, publish_blocked, publish_block_reason
schedule         id, day_of_week, time_slot, status, booked_by, booked_name   -- v2 周表
courses          id, teacher_id, title, notice, notice_updated_at,
                 timezone, lesson_date, start_time, end_time, start_utc, end_utc,
                 place_name, google_maps_url, capacity, run_status, status_note,
                 revision, created_at, updated_at
course_bookings  id, course_id, student_id, status, created_at, cancelled_at
course_updates   id, course_id, teacher_id, change_type, summary, created_at
admin_actions    id, admin_id, admin_name, target_user_id, target_name,
                 target_course_id, action, detail, created_at   -- v3.1 操作日志
```

关键设计：

- `start_time` / `end_time` 是老师本地墙钟时间，`timezone` 是 IANA 时区；
- `start_utc` / `end_utc` 是服务端换算出的真实 UTC 时刻，所有排序、ICS、日历链接都基于它；
- `run_status` 决定学生能否预约；
- `revision` 大于 1 时前端显示「有更新」；
- `is_admin` 独立于 `role`，是系统最高权限标记；`status='banned'` 阻止登录，
  `muted_until` 阻止一切发布行为，`publish_blocked` 只阻止新建课程；
- 数据库时间戳在返回前统一规范化为 ISO-8601 UTC（SQLite 的 `CURRENT_TIMESTAMP` 不带时区标记，浏览器会误判为本地时间）。

---

## 8. API

所有写操作返回 `{ success, message }` 或 `{ error }`；错误消息按 `X-Language` / `Accept-Language` 本地化。

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册；带 `teacherCode` 则创建老师 |
| POST | `/api/auth/login` | 用户名 + 4 位 PIN |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前会话 |
| GET | `/api/auth/config` | Google OAuth / 老师注册开关 |
| GET | `/api/auth/google` | 发起 Google OAuth |
| GET | `/api/auth/google/callback` | OAuth 回调 |

### 课程

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/courses` | 公开 | 支持 `teacher=me|ID`、`status`、`q`、`mine=1` |
| GET | `/api/courses/config` | 公开 | 时区列表、状态枚举、通知栏上限 |
| GET | `/api/courses/teachers` | 公开 | 老师及其课程数 |
| GET | `/api/courses/:id` | 公开 | 课程详情 + 更新 + 老师可见的预约 |
| GET | `/api/courses/:id/updates` | 公开 | 更新历史 |
| POST | `/api/courses` | 老师 | 发布课程 |
| PUT | `/api/courses/:id` | 课程所属老师 | 编辑并记录变更 |
| POST | `/api/courses/:id/status` | 课程所属老师 | 修改开课状态 |
| DELETE | `/api/courses/:id` | 课程所属老师 | 删除课程及其预约 |
| POST | `/api/courses/:id/book` | 学生 | 预约 |
| POST | `/api/courses/:id/cancel` | 学生 / 所属老师 | 取消预约 |

### 工作台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/overview` | 课程数、确认/待确认、预约数、学生数、老师数 |
| GET | `/api/admin/bookings` | 当前老师的实时预约流 |
| GET | `/api/admin/schedule` | 周表全部时段 |
| POST | `/api/admin/update-slot` | 设置时段可用性 |
| POST | `/api/admin/remove-booking` | 释放时段 |
| GET | `/api/admin/students` | 学生列表 |

### 超级管理员（全部需要 `is_admin`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/superadmin/overview` | 账号 / 课程 / 预约统计与最近操作 |
| GET | `/api/superadmin/users` | 全部账号，支持 `q`、`role`、`filter=banned|muted|blocked|admin` |
| POST | `/api/superadmin/users/:id/ban` | 封禁（需 `reason`） |
| POST | `/api/superadmin/users/:id/unban` | 解封 |
| POST | `/api/superadmin/users/:id/mute` | `{ hours, reason }`，`-1` 永久，`0` 解除 |
| POST | `/api/superadmin/users/:id/publish-block` | `{ blocked, reason }` |
| POST | `/api/superadmin/users/:id/admin` | `{ isAdmin }` 授予 / 取消超管 |
| POST | `/api/superadmin/users/:id/pin` | 重置 4 位 PIN |
| DELETE | `/api/superadmin/users/:id` | 删除账号并级联清理 |
| GET | `/api/superadmin/courses` | 全部课程（审核用），支持 `q`、`status`、`teacher` |
| POST | `/api/superadmin/courses/:id/takedown` | 下架（需 `reason`） |
| POST | `/api/superadmin/courses/:id/restore` | 恢复 |
| GET | `/api/superadmin/actions` | 操作日志 |

### 日历

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/calendar/schedule.ics` | ICS 订阅（课程为 UTC 事件，含地点、地图、通知） |
| GET | `/api/calendar/schedule` | 公开只读 JSON |
| GET | `/api/calendar/info` | 订阅地址与隐私说明 |

### 其他

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/healthz` | `{ ok: true, version: "3.2.1" }` |

---

## 9. 测试

```bash
npm test              # 65 项：接口契约回归（自启动、隔离数据库）
npm run test:e2e      # 54 项：多老师 / 多学生完整业务旅程与边界验收
npm run test:admin    # 35 项：超管权限、封禁/禁言/限制发布、提权、审核、日志、级联删除
npm run check:i18n    # 校验所有被引用的词条在四种语言中都存在
npm run test:ui       # 37 项真实浏览器冒烟（需先启动服务）
npm run test:visual   # 25 项多视口视觉审计（需先启动服务）
npm run check         # i18n + 语法 + 集成测试
```

`npm test` / `npm run test:e2e` 会自行在随机端口启动服务，使用临时数据库，不会污染 `booking.db`。

浏览器测试使用本机 Chrome 的 DevTools Protocol，无需额外依赖：

```bash
PORT=3210 DB_PATH=/tmp/ecb-browser.db node server.js   # 终端 1
BASE=http://127.0.0.1:3210 npm run test:ui             # 终端 2
BASE=http://127.0.0.1:3210 npm run test:visual         # 终端 2（会构造极端数据）
```

`test:ui` 覆盖：课程卡片渲染、通知栏、谷歌地址栏、时区徽章、多老师、语言切换、登录、教师工作台、发布表单必填项与 100 字计数器、日历页、手机视口无横向溢出与触控尺寸、JS 异常、HTTP 失败请求。

`test:visual` 会写入 5 位老师、超长标题 / 100 字通知 / 超长地名 / 同时段 / 取消 / 已结束等极端数据，然后在 1440 / 1024 / 820 / 390 / 360 五个视口检查横向溢出、卡片列数、长文本撑破卡片与按钮触控高度，并截图到系统临时目录。

---

## 10. 部署

### 10.1 Render

仓库内 `render.yaml` 已配置：

- `buildCommand: npm install`
- `startCommand: node server.js`
- `NODE_ENV=production`
- `SESSION_SECRET` 自动生成
- `TEACHER_INVITE_CODE` 默认 `TEACHER2026`，上线前请修改

注意：Render 免费实例的文件系统是临时的，`booking.db` 会在重新部署后重置。需要持久化时请挂载磁盘或改用外部数据库。

### 10.2 本机 + Cloudflare Tunnel（`en.caishen.today`）

本机已创建隧道 `english-class-booking`：

```
Tunnel ID : 02e615a5-3b68-4052-9d03-45c7544f855d
配置      : ~/.cloudflared/english-class-booking.yml
入口      : http://localhost:3000
```

启动：

```bash
# 终端 1：应用
cd /Volumes/OS2App/AiColding/english-class-booking
NODE_ENV=production PORT=3000 SITE_URL=https://en.caishen.today \
SESSION_SECRET='请替换为随机字符串' TEACHER_INVITE_CODE='TEACHER2026' node server.js

# 终端 2：隧道
cloudflared tunnel --config ~/.cloudflared/english-class-booking.yml run english-class-booking
```

**还需要在 `caishen.today` 所属的 Cloudflare 账号添加一条 DNS 记录**（当前 `cloudflared` 登录的是另一个 Cloudflare 账号，无法代写该区域的记录）：

| 类型 | 名称 | 目标 | 代理状态 |
| --- | --- | --- | --- |
| CNAME | `en` | `02e615a5-3b68-4052-9d03-45c7544f855d.cfargotunnel.com` | 已代理（橙色云） |

添加后 `https://en.caishen.today` 即可访问。

另外，执行 `cloudflared tunnel route dns` 时曾在 `ai1996.cloudns.org` 区域误建一条名为 `en.caishen.today` 的记录，如不再需要请在 Cloudflare 面板删除。

开机自启（可选，两个 plist 已放在 `~/Library/LaunchAgents/`）：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking-tunnel.plist

# 停止并移除
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking-tunnel
```

日志：`~/Library/Logs/english-class-booking/`

### 10.3 仅本机域名（不经过公网）

需要一次 sudo 操作，把域名指向本机：

```bash
sudo sh -c 'printf "\n127.0.0.1 en.caishen.today\n" >> /etc/hosts'
```

然后访问 `http://en.caishen.today:3000`（应用监听 3000，非 80 端口）。

---

## 11. 时间与时区如何工作

1. 老师填写本地日期、开始/结束时间和 IANA 时区（如 `Asia/Bangkok`）。
2. 服务端用 `Intl.DateTimeFormat` 计算该时区在当天的 UTC 偏移，做两到三轮迭代收敛（可跨夏令时），得到 `start_utc` / `end_utc`。
3. 学生端用 `Intl.DateTimeFormat` 把同一个 UTC 时刻渲染两次：
   - 老师当地时间 + 时区缩写
   - 学生浏览器当地时间 + 本地时区名
4. ICS 与 Google Calendar 链接使用 `YYYYMMDDTHHMMSSZ` 形式的真实 UTC，订阅者不会看到「浮动时间」。

已验证的边界：

- `Asia/Bangkok` 10:00 → `03:00Z`（GMT+7）
- `America/New_York` 夏季 09:00 → `13:00Z`（EDT）
- `America/New_York` 冬季 09:00 → `14:00Z`（EST）

---

## 12. 隐私与安全

- 密码使用 bcrypt 哈希；会话 Cookie 为 `httpOnly`，生产环境 `secure` + `SameSite=None`。
- 课程列表公开可见，但学生名单只对课程所属老师可见。
- 公开日历只暴露课程状态、时间、地点、地图链接、通知栏和老师姓名；学生姓名在旧周表中仅显示首字母。
- Google Maps 地址必须是 `https` 且属于 Google 域名，防止任意链接注入。
- 通知栏长度在服务端和前端双重限制为 100 字。
- 所有课程写操作校验 `teacher_id` 归属。

---

## 13. 版本历史

- **v3.0.0**（当前）
  - 课程中心模型、多老师发布、通知栏、谷歌地址栏
  - 真实 UTC 时间与时区展示、ICS / Google Calendar
  - 学生预约、老师实时预约看板、开课状态、更新历史
  - v3 设计系统、移动端适配、四语言词条补全
  - 62 项集成测试 + 34 项浏览器冒烟测试
- **v2.0.0**
  - 4 位 PIN 登录、Google OAuth、四语言、周表管理
- **v1.0.0**
  - 初始版本：单一老师周课表

---

## 14. 许可

MIT

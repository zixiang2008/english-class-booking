# 英語クラス予約システム · CM English Class

**チェンマイの実際の英語教室のための、複数講師対応クラスボード。** 講師は 1 つのページから授業を公開でき、各授業にはお知らせ欄・Google マップの住所欄・実際のタイムゾーンが付きます。生徒は閲覧・予約・変更の追跡ができ、スーパー管理者がアカウント管理と授業の審査を担当します。

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <b>日本語</b> ·
  <a href="README.th.md">ไทย</a>
</p>

- **技術スタック：** Node.js 18+ · Express 4 · sql.js（WebAssembly 版 SQLite）
- **フロントエンド：** 素の HTML + CSS + JavaScript。ビルド不要、フレームワークなし
- **言語：** 英語 / 中国語 / タイ語 / 日本語、モバイルファースト
- **公開サイト：** <https://en.caishen.today>

---

## 目次

1. [v3 が解決したこと](#1-v3-が解決したこと)
2. [機能一覧](#2-機能一覧)
3. [クイックスタート](#3-クイックスタート)
4. [アカウントとデモデータ](#4-アカウントとデモデータ)
5. [環境変数](#5-環境変数)
6. [ディレクトリ構成](#6-ディレクトリ構成)
7. [データモデル](#7-データモデル)
8. [API](#8-api)
9. [テスト](#9-テスト)
10. [デプロイ](#10-デプロイ)
11. [タイムゾーンの扱い](#11-タイムゾーンの扱い)
12. [プライバシーとセキュリティ](#12-プライバシーとセキュリティ)
13. [バージョン履歴](#13-バージョン履歴)
14. [ライセンス](#14-ライセンス)
15. [リポジトリ](#15-リポジトリ)

---

## 1. v3 が解決したこと

v2 は 1 つの繰り返し週間表しか持たず、本当に重要な 2 つの問いに答えられませんでした —— *この授業は自分のタイムゾーンで何時に始まるのか*、そして*どこで会うのか*。

| 機能 | v2 | v3 |
| --- | --- | --- |
| 授業モデル | 7 日 × 8 コマの繰り返し表のみ | 「具体的な授業」を追加：日付・時刻・タイムゾーン・場所・定員 |
| 複数講師 | 単一講師の視点 | 複数の講師が同じページで公開、`teacher_id` で権限を分離 |
| お知らせ欄 | なし | 授業ごとにお知らせを記載、100 文字の厳格な上限 |
| 授業場所 | 自由記述のみ | Google 住所欄：タイムゾーン / 日付 / 開始・終了時刻 / 場所 / マップ URL、すべて必須 |
| 時刻の正確さ | ローカル壁時計時刻で、時差を誤解しやすい | サーバーが講師の現地時刻を真の UTC に変換し、生徒は「講師の現地時刻」と「自分の現地時刻」の両方を見られる |
| 予約 | 週間表のコマを占有するだけ | 授業単位の予約。定員・重複・満席・キャンセルに対応 |
| 講師の予約確認 | 管理画面を更新する必要あり | リアルタイムの予約フィード、15 秒ごとに自動更新、新規は NEW 表示 |
| 開講ステータス | なし | pending / confirmed / cancelled / completed、生徒にも表示 |
| 変更履歴 | なし | revision + 変更ログ。生徒には「更新あり」バッジとタイムライン |
| カレンダー | 週間表の ICS のみ | 授業を真の UTC イベントとして ICS に出力し、Google カレンダーのリンクも生成 |
| UI | デスクトップ優先 | モバイルファーストに再設計。スマホは 1 列カード、下部シートのダイアログ |
| アカウント管理 | なし | v3.1 スーパー管理者：BAN / ミュート / 公開禁止 / PIN リセット / 削除 |
| 授業の審査 | なし | v3.1 授業の非公開化と復元。理由は生徒にも表示 |
| 操作履歴 | なし | v3.1 操作ログ：実行者・対象・理由・時刻を記録 |
| クラスボード | 単一リストで終了済みが混在 | v3.2 三段構成：今後 7 日（強調）/ それ以降 / 終了済み（既定で折りたたみ） |
| 週間表 | 固定の繰り返し表で、常に「予約可」に見える | v3.2.2 実際に公開された授業を描画。同じコマの複数授業は**授業時間の比率**で分割し、授業がないコマは「予約不可」と明示 |
| 授業形式 | 対面のみ | v3.3 対面 **または** オンライン：Tencent Meeting / Zoom / Teams / Google Meet / VooV / DingTalk / WeChat / その他 を選び、会議リンクを登録 |

---

## 2. 機能一覧

### 2.1 講師画面（`/admin.html`）

- **概要：** 自分の授業、開講決定、仮確定、予約数、生徒数、サイト内の講師数
- **授業の公開：** タイトル、お知らせ欄（100 文字以内）、タイムゾーン、日付、開始・終了時刻、**授業形式**、定員、開講ステータス
  - **対面**（既定）：場所 + Google マップ URL がどちらも必須
  - **オンライン**：プラットフォーム（8 択）+ 会議リンク（必須、任意の `https://` 会議 URL を受け付け）+ 会議 ID / パスコードのメモ（任意）。地図項目は自動的に隠れ、必須ではなくなる
- **授業の編集：** すべての項目。保存すると `revision` が増え、変更履歴に 1 行追加される
- **ステータス変更：** 仮確定 / 開講決定 / 中止 / 終了。補足コメントを添えられる
- **リアルタイム予約フィード：** 生徒名、ユーザー名、電話番号、授業、授業時刻、予約時刻
- **週間表の管理：** v2 の 7×8 の繰り返しコマを引き続き管理できる
- **生徒一覧：** 登録済みの生徒と予約回数
- **権限：** 自分が公開した授業だけを編集・削除できる
- **制限バナー：** ミュートまたは公開禁止の場合、画面上部に理由と解除日時を示す黄色いバナーが出る

### 2.2 生徒画面（`/`）

- **クラスボード**：講師・ステータス・キーワードで絞り込み、「自分の予約のみ」も可能
  - **三段構成**：`今後 7 日`（独立した強調パネル）→ `それ以降のクラス`（7 日より先）→ `終了したクラス`（過去、既定で折りたたみ、ワンクリックで展開）
  - 各セクションに件数を表示。今後 7 日に何もなければその旨を表示。先の予定がまったくない場合は終了済みセクションが自動で開き、開いた瞬間に空のページにならない
- **各カードの表示内容：**
  - 講師、開講ステータス、更新の有無
  - お知らせ欄（100 文字以内）
  - Google 住所欄：IANA タイムゾーン + GMT オフセット、講師の現地時刻、自分の現地時刻、場所、Google マップへのリンク、Google カレンダーへの追加
    - **オンライン授業**では会議バーに変わる：🎥 プラットフォーム名、会議 ID / パスコード、**会議に参加** ボタン。カレンダーのリンクは会議 URL を指す
  - 残席数と予約済み人数
- **ワンクリックで予約 / キャンセル**。重複予約・満席・中止済みの授業は拒否される
- **授業詳細：** 全情報、変更タイムライン、担当講師には予約した生徒の一覧
- **週間表（v3.2.2）：** 行は実際に公開された開始時刻、列は月曜 → 日曜
  - 公開された授業はすべてコマの中にカードとして並ぶ。同じ時間に複数の講師がいれば、**授業時間の比率**で高さを分ける
  - カードにカーソルを合わせるとプレビューが開き、**予約 / 取消 / 会議に参加 / 詳細** をその場で実行できる。クリックで詳細ダイアログ
  - 時間軸は一日中そのまま残り、クラスは実際に授業する行だけを占めます。それ以外のコマは**未公開**と表示され、誰も公開していない時間を予約できてしまう問題を解消
  - `‹ ›` で週を移動、授業のない週は「授業がある直近の週へ」をワンクリック、終了した週は上部にバナー
  - 760px 未満では 7 枚の日別カードに切り替わり、内容は同じ
- **ログインページ：** プラットフォーム免責事項を表示（第 12 節）

### 2.3 スーパー管理者画面（`/superadmin.html`、`is_admin` のみ表示）

- **概要：** アカウント総数 / 講師 / 生徒 / 管理者 / BAN 済み / ミュート中 / 授業 / 予約
- **アカウント管理：** 氏名・ユーザー名・電話番号で検索、役割と制限状態で絞り込み
- **任意の講師・生徒に対して：**
  - **BAN**：即座にログイン不可。ログイン中のセッションも次のリクエストで失効
  - **ミュート**：1 時間 / 24 時間 / 7 日 / 30 日 / 永久。期間中は公開も編集もできず、生徒の予約も不可
  - **公開禁止**：既存の授業は編集できるが、新規作成はできない
  - **上記すべての解除**
  - **スーパー管理者の付与 / 解除**、**4 桁 PIN のリセット**、**アカウント削除**（授業と予約も連鎖削除）
- **授業の審査：** すべての授業を検索し、**非公開化**（中止扱いにし、変更履歴に記録、理由は生徒にも表示）と**復元**
- **操作ログ：** 実行者、操作、対象、理由、時刻
- **自己保護：** 自分自身の BAN・削除・降格は不可。管理者同士で制限し合うことも不可。最後の 1 名は削除できない

### 2.4 共通

- 4 言語の切り替え。API のエラーも `X-Language` に応じて各言語で返る
- ログイン / 登録は 4 桁の PIN。講師は招待コードで登録できる
- Google OAuth（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定した場合のみボタン表示）
- カレンダー購読ページ `/calendar.html`：ICS の URL、公開 JSON、購読手順
- モバイル：1 列カード、下部シートのダイアログ、横スクロールの週間表、44px 以上のタップ領域

---

## 3. クイックスタート

```bash
git clone https://github.com/zixiang2008/CMenglishClass.git
cd CMenglishClass
npm install
npm start
```

<http://localhost:3000> を開きます。

初回起動時に `booking.db` を作成し、テーブルを定義してデモアカウントと 4 件のサンプル授業を投入します。

```bash
npm run dev                                  # start と同じ
PORT=3210 DB_PATH=/tmp/x.db npm start        # 使い捨ての検証用インスタンス
```

---

## 4. アカウントとデモデータ

パスワードはすべて **4 桁の PIN** です。**ユーザー名は大文字小文字を区別しません**：`Hamish`、`hamish`、`HAMISH` は同一アカウントとして扱われます（登録時の重複判定も同様）。

**本番アカウント**

| 役割 | ユーザー名 | PIN | 説明 |
| --- | --- | --- | --- |
| **スーパー管理者** / 講師 | `elvis` | `1314` | システム最高権限：全アカウント管理、BAN・ミュート・公開禁止、授業審査、操作ログ |
| 講師 | `hamish` | `1234` | 実在の講師アカウント。授業は未公開 |
| 講師 | `kevin` | `1234` | 実在の講師アカウント。授業は未公開 |

> スーパー管理者は `is_admin` フラグで表現し、役割（講師 / 生徒）とは分離しています。`elvis` は講師かつ管理者なので、通常どおり授業を公開できます。

**デモアカウント（履歴データ用、実際にログイン可能）**

| 役割 | ユーザー名 | PIN | 説明 |
| --- | --- | --- | --- |
| 講師 | `test_teacher1` | `1314` | `English Corner` を公開、過去 2 週間で 14 件 |
| 講師 | `test_teacher2` | `1314` | `English Corner` を公開、14 件 |
| 講師 | `test_teacher3` | `1314` | `英文学习课程` を公開、14 件 |
| 生徒 | `test_student1` … `test_student5` | `1314` | 週 3 回、履歴予約は各 6 件 |

デモアカウントは本文書とデータベースにのみ存在し、**ログインページには表示されません**（旧「デモアカウント」欄はプラットフォーム免責事項に置き換えました）。

デモデータは**過去 14 日分**（当日を除く）で、毎日 3 つの固定枠 `10:00-12:00`、`15:00-16:00`、`16:00-17:00`（Asia/Bangkok）に配置されています。授業 42 件（完了 38・中止 4）と予約 30 件で、すべて過去にのみ存在するため将来の予約枠を占有しません。

> `elvis` / `hamish` / `kevin` は新規データベースでは自動作成されません。登録ページ + 招待コード、または以下のコマンドで作成・リセットしてください。

```bash
# 実行中のサーバーを止めてから実行し、終わったら再起動
node scripts/create-user.js elvis 1314 teacher Elvis
node scripts/create-user.js hamish 1234 teacher Hamish
node scripts/create-user.js kevin 1234 teacher Kevin
```

> `scripts/create-user.js` は任意のアカウントの PIN リセットや、生徒から講師への昇格にも使えます。

スーパー管理者の付与 / 解除 / 一覧：

```bash
node scripts/grant-admin.js elvis           # 付与
node scripts/grant-admin.js elvis --revoke  # 解除（最後の 1 名は拒否されます）
node scripts/grant-admin.js --list          # 一覧
```

デモ履歴の再生成（3 名のテスト講師の既存授業を先に削除します）：

```bash
# サーバーを停止 → 実行 → 再起動
SEED_DEMO=0 node scripts/seed-demo-history.js        # 2 週間（既定）
SEED_DEMO=0 node scripts/seed-demo-history.js 4      # 4 週間
```

**サイト設定：** 講師画面 →「サイト設定」でサイト名・電話・メール・LINE リンクを編集できます。これらの値は公開ページのフッターにも反映され、**電話を空にするとフッターから消えます**（空リンクは表示されません）。

講師登録の招待コード：`TEACHER2026`（`TEACHER_INVITE_CODE` で変更可能）。

---

## 5. 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `DB_PATH` | `./booking.db` | SQLite ファイル。テスト時は一時ファイルを指定して隔離する |
| `SESSION_SECRET` | 開発用の内蔵値 | 本番では必ず設定する |
| `NODE_ENV` | 空 | `production` で secure + SameSite=None の Cookie を有効化 |
| `TEACHER_INVITE_CODE` | `TEACHER2026` | 講師セルフ登録の招待コード |
| `SEED_DEMO` | 有効 | `0` でデモ講師・デモ授業・偽の週間表予約を投入しない（**本番は 0 を推奨**） |
| `SITE_URL` | 自動推定 | カレンダー API と起動ログに使う公開 URL |
| `GOOGLE_CLIENT_ID` | 空 | 設定すると Google ログインが有効になる |
| `GOOGLE_CLIENT_SECRET` | 空 | 同上 |
| `GOOGLE_REDIRECT_URI` | 空 | 例：`https://en.caishen.today/api/auth/google/callback` |

---

## 6. ディレクトリ構成

```
CMenglishClass/
├── server.js                 Express エントリ。セキュリティヘッダ、静的配信、ルーティング
├── database.js               sql.js ラッパー、スキーマ、マイグレーション、デモ投入
├── i18n-server.js            サーバー側エラーメッセージ（en/zh/th/ja）
├── lib/
│   ├── time.js               タイムゾーン変換、GMT オフセット、ICS / Google カレンダー、時刻正規化
│   ├── course-validation.js  授業項目の検証（お知らせ 100 文字、マップ URL 必須 など）
│   └── guards.js             ログイン / 講師 / 生徒 / 管理者のミドルウェア
├── routes/
│   ├── auth.js               登録・ログイン・ログアウト・Google OAuth
│   ├── courses.js            授業 CRUD、ステータス、予約、変更履歴
│   ├── admin.js              講師画面の概要、リアルタイム予約、週間表、生徒
│   ├── superadmin.js         アカウント管理、授業審査、操作ログ
│   ├── calendar.js           ICS フィード、公開 JSON
│   └── schedule.js           旧・繰り返し週間表 API
├── public/
│   ├── index.html            生徒のクラスボード
│   ├── admin.html            講師画面
│   ├── superadmin.html       スーパー管理者画面
│   ├── login.html            ログイン（プラットフォーム免責事項を含む）
│   ├── register.html         登録（講師招待コード対応）
│   ├── calendar.html         カレンダー購読
│   ├── css/style.css         v3 デザインシステムとレスポンシブ
│   └── js/
│       ├── i18n.js           既存の 4 言語エンジン
│       ├── i18n-v3.js        v3 の文言（4 言語すべて）
│       ├── common.js         共通 App 層：fetch、toast、モーダル、ナビ、日時整形
│       ├── schedule.js       生徒画面のロジック
│       ├── admin.js          講師画面のロジック
│       ├── superadmin.js     管理者画面のロジック
│       └── auth.js           ログイン / 登録のロジック
├── scripts/
│   ├── check-i18n.js         i18n の静的監査
│   ├── create-user.js        アカウントの作成 / リセット
│   ├── grant-admin.js        スーパー管理者の付与 / 解除
│   ├── reset-data.js         業務データの削除（管理者とサイト設定は保持）
│   ├── seed-demo-history.js  過去 2 週間のデモ授業と予約を生成
│   ├── visual-audit.js       マルチビューポートの視覚監査（はみ出し / 列数 / タップ領域 / スクリーンショット）
│   └── ui-smoke.js           Chrome DevTools Protocol による実ブラウザのスモークテスト
├── tests/
│   ├── test-suite.js         API + ユニット統合テスト（自前起動、DB 隔離）
│   ├── e2e-full.js           複数役割の受け入れシナリオ
│   └── superadmin-suite.js   管理者権限 / 制限 / 審査 / ログの受け入れ
├── README.md                 英語
├── README.zh-CN.md           中国語（簡体）
├── README.ja.md              本ファイル
├── README.th.md              タイ語
├── CHANGELOG.md              リリース履歴
└── render.yaml               Render のブループリント
```

---

## 7. データモデル

```sql
users            id, username, password_hash, display_name, phone, role, google_id,
                 is_admin, status, ban_reason, banned_at,
                 muted_until, mute_reason, publish_blocked, publish_block_reason
schedule         id, day_of_week, time_slot, status, booked_by, booked_name   -- v2 週間表
courses          id, teacher_id, title, notice, notice_updated_at,
                 timezone, lesson_date, start_time, end_time, start_utc, end_utc,
                 mode, online_platform, online_url, online_note,          -- v3.3
                 place_name, google_maps_url, capacity, run_status, status_note,
                 revision, created_at, updated_at
course_bookings  id, course_id, student_id, status, created_at, cancelled_at
course_updates   id, course_id, teacher_id, change_type, summary, created_at
admin_actions    id, admin_id, admin_name, target_user_id, target_name,
                 target_course_id, action, detail, created_at   -- v3.1 操作ログ
```

設計上の要点：

- `start_time` / `end_time` は講師のローカル壁時計時刻、`timezone` は IANA ゾーン
- `start_utc` / `end_utc` はサーバーが算出した真の UTC 時刻。並び替え・ICS・カレンダーリンクはすべてこれを使う
- `mode` は `offline`（既定）または `online`。`online_platform` は
  `tencent_meeting / zoom / teams / google_meet / voov / dingtalk / wechat / other`、
  `online_url` は会議リンク、`online_note` は任意の会議 ID / パスコード（120 文字以内）
- 既存データは自動移行：`ALTER TABLE courses ADD COLUMN mode TEXT NOT NULL DEFAULT 'offline'`
  を `try/catch` で実行するため、v3.3 以前の授業はすべて対面として読まれ、
  `place_name` / `google_maps_url` はそのまま残る
- `run_status` が生徒の予約可否を決める
- `revision` が 1 より大きいと「更新あり」バッジが出る
- `is_admin` は `role` から独立した最上位の権限フラグ。`status='banned'` はログインを、
  `muted_until` はあらゆる公開行為を、`publish_blocked` は新規作成のみを止める
- タイムスタンプは返す前に ISO-8601 UTC へ正規化する（SQLite の `CURRENT_TIMESTAMP` にはゾーン表記がなく、ブラウザがローカル時刻と誤認するため）

---

## 8. API

書き込み系は `{ success, message }` または `{ error }` を返します。エラーメッセージは `X-Language` / `Accept-Language` で翻訳されます。

### 認証

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 登録。`teacherCode` があれば講師として作成 |
| POST | `/api/auth/login` | ユーザー名 + 4 桁 PIN |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | 現在のセッション |
| GET | `/api/auth/config` | Google OAuth / 講師登録の可否 |
| GET | `/api/auth/google` | Google OAuth 開始 |
| GET | `/api/auth/google/callback` | OAuth コールバック |

### 授業

| メソッド | パス | 権限 | 説明 |
| --- | --- | --- | --- |
| GET | `/api/courses` | 公開 | `teacher=me|ID`、`status`、`q`、`mine=1` |
| GET | `/api/courses/config` | 公開 | タイムゾーン一覧、ステータス列挙、お知らせ上限、`onlinePlatforms`（8 キー + 名称） |
| GET | `/api/courses/teachers` | 公開 | 講師とその授業数 |
| GET | `/api/courses/:id` | 公開 | 詳細 + 更新履歴 + 担当講師のみ予約者一覧 |
| GET | `/api/courses/:id/updates` | 公開 | 変更履歴 |
| POST | `/api/courses` | 講師 | 授業を公開 |
| PUT | `/api/courses/:id` | 担当講師 | 編集し変更を記録 |
| POST | `/api/courses/:id/status` | 担当講師 | 開講ステータスを変更 |
| DELETE | `/api/courses/:id` | 担当講師 | 授業と予約を削除 |
| POST | `/api/courses/:id/book` | 生徒 | 予約 |
| POST | `/api/courses/:id/cancel` | 生徒 / 担当講師 | 予約取消 |

### 講師画面

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/admin/overview` | 授業数、確定 / 仮確定、予約数、生徒数、講師数 |
| GET | `/api/admin/bookings` | ログイン中の講師のリアルタイム予約 |
| GET | `/api/admin/schedule` | 週間表の全コマ |
| POST | `/api/admin/update-slot` | コマの可用性を設定 |
| POST | `/api/admin/remove-booking` | コマを解放 |
| GET | `/api/admin/students` | 生徒一覧 |

### スーパー管理者（すべて `is_admin` が必要）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/superadmin/overview` | アカウント / 授業 / 予約の統計と最近の操作 |
| GET | `/api/superadmin/users` | 全アカウント。`q`、`role`、`filter=banned|muted|blocked|admin` |
| POST | `/api/superadmin/users/:id/ban` | BAN（`reason` 必須） |
| POST | `/api/superadmin/users/:id/unban` | BAN 解除 |
| POST | `/api/superadmin/users/:id/mute` | `{ hours, reason }`。`-1` で永久、`0` で解除 |
| POST | `/api/superadmin/users/:id/publish-block` | `{ blocked, reason }` |
| POST | `/api/superadmin/users/:id/admin` | `{ isAdmin }` 付与 / 解除 |
| POST | `/api/superadmin/users/:id/pin` | 4 桁 PIN のリセット |
| DELETE | `/api/superadmin/users/:id` | アカウント削除（連鎖削除） |
| GET | `/api/superadmin/courses` | 審査用の全授業。`q`、`status`、`teacher` |
| POST | `/api/superadmin/courses/:id/takedown` | 非公開化（`reason` 必須） |
| POST | `/api/superadmin/courses/:id/restore` | 復元 |
| GET | `/api/superadmin/actions` | 操作ログ |

### カレンダー

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/calendar/schedule.ics` | ICS フィード（UTC イベント、場所・マップ・お知らせを含む） |
| GET | `/api/calendar/schedule` | 公開の読み取り専用 JSON |
| GET | `/api/calendar/info` | 購読 URL とプライバシー説明 |

### その他

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/healthz` | `{ ok: true, version: "3.4.0" }` |

---

## 9. テスト

```bash
npm test              # 74 件：API 契約のリグレッション（自前起動・DB 隔離）
npm run test:e2e      # 54 件：複数講師 / 複数生徒の業務シナリオと境界
npm run test:admin    # 35 件：管理者権限、BAN、ミュート、公開禁止、昇格、審査、ログ、連鎖削除
npm run check:i18n    # 参照されている全キーが 4 言語に存在するか検証
npm run test:ui       # 49 件の実ブラウザスモーク（サーバー起動が必要）
npm run test:visual   # 25 件のマルチビューポート視覚監査（サーバー起動が必要）
npm run check         # i18n + 構文 + 統合テスト
```

`npm test` / `npm run test:e2e` はランダムなポートでサーバーを自前起動し、一時データベースを使うため `booking.db` は汚れません。

ブラウザ系テストはローカル Chrome の DevTools Protocol を使うので追加依存は不要です：

```bash
PORT=3210 DB_PATH=/tmp/ecb-browser.db node server.js   # ターミナル 1
BASE=http://127.0.0.1:3210 npm run test:ui             # ターミナル 2
BASE=http://127.0.0.1:3210 npm run test:visual         # ターミナル 2（極端なデータを投入）
```

`test:ui` の対象：カード描画、お知らせ欄、Google 住所欄、タイムゾーンバッジ、複数講師、言語切替、ログイン、講師画面、公開フォームの必須項目と 100 文字カウンター、**対面 ↔ オンラインの切替**（項目の入れ替え、8 プラットフォーム、config が同じ一覧を返す）、**週間表**（カード描画、7 日列、空コマが「予約不可」、モバイル日別カードが表と一致）、カレンダーページ、モバイルビューポート（横スクロールなし・タップ領域）、JS 例外、HTTP 失敗。

`test:visual` は講師 5 名と、80 文字のタイトル・100 文字のお知らせ・非常に長い地名・同時刻の重複・中止・終了済みといった極端なデータを投入し、1440 / 1024 / 820 / 390 / 360 px で横スクロール、カードの列数、長文がカードからはみ出さないか、タップ領域の高さを検査し、スクリーンショットを一時ディレクトリに保存します。

---

## 10. デプロイ

### 10.1 Render

リポジトリの `render.yaml` に以下を定義済み：

- `buildCommand: npm install`
- `startCommand: node server.js`
- `NODE_ENV=production`
- `SESSION_SECRET` は自動生成
- `TEACHER_INVITE_CODE` は既定 `TEACHER2026`。公開前に変更してください

> Render の無料枠はファイルシステムが一時的で、再デプロイのたびに `booking.db` がリセットされます。永続化が必要ならディスクをマウントするか外部データベースへ移行してください。

### 10.2 ローカル + Cloudflare Tunnel（`en.caishen.today`）

トンネル `english-class-booking` は作成済みです：

```
Tunnel ID : 02e615a5-3b68-4052-9d03-45c7544f855d
設定      : ~/.cloudflared/english-class-booking.yml
入口      : http://localhost:3000
```

```bash
# ターミナル 1：アプリ
cd /Volumes/OS2App/AiColding/english-class-booking
NODE_ENV=production PORT=3000 SITE_URL=https://en.caishen.today \
SESSION_SECRET='<ランダムな文字列>' TEACHER_INVITE_CODE='TEACHER2026' node server.js

# ターミナル 2：トンネル
cloudflared tunnel --config ~/.cloudflared/english-class-booking.yml run english-class-booking
```

`caishen.today` を持つ Cloudflare アカウントで、次の DNS レコードを追加します：

| 種別 | 名前 | ターゲット | プロキシ |
| --- | --- | --- | --- |
| CNAME | `en` | `02e615a5-3b68-4052-9d03-45c7544f855d.cfargotunnel.com` | プロキシあり（オレンジ雲） |

ログイン時の自動起動（plist は `~/Library/LaunchAgents/` に配置済み）：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.caishen.english-class-booking-tunnel.plist

# 停止して削除
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking
launchctl bootout gui/$(id -u)/com.caishen.english-class-booking-tunnel
```

ログ：`~/Library/Logs/english-class-booking/`

### 10.3 ローカルドメインのみ（外部公開なし）

`sudo` が 1 回必要です。ホスト名をこのマシンに向けます：

```bash
sudo sh -c 'printf "\n127.0.0.1 en.caishen.today\n" >> /etc/hosts'
```

その後 `http://en.caishen.today:3000` を開きます（アプリは 3000 番で待ち受け、80 番ではありません）。

---

## 11. タイムゾーンの扱い

1. 講師は現地の日付・開始 / 終了時刻・IANA ゾーン（例 `Asia/Bangkok`）を入力します。
2. サーバーは `Intl.DateTimeFormat` でそのゾーンの当日の UTC オフセットを求め、2〜3 回の反復で収束させて（夏時間も考慮）`start_utc` / `end_utc` を算出します。
3. 生徒画面は同じ UTC 時刻を `Intl.DateTimeFormat` で 2 回描画します：
   - 講師の現地時刻 + ゾーン略称
   - 生徒のブラウザの現地時刻 + ゾーン名
4. ICS と Google カレンダーのリンクは `YYYYMMDDTHHMMSSZ` 形式の真の UTC を使うため、購読者に「浮いた時刻」は表示されません。

検証済みの境界：

- `Asia/Bangkok` 10:00 → `03:00Z`（GMT+7）
- `America/New_York` 夏時間 09:00 → `13:00Z`（EDT）
- `America/New_York` 冬時間 09:00 → `14:00Z`（EST）

---

## 12. プライバシーとセキュリティ

- パスワードは bcrypt ハッシュ。セッション Cookie は `httpOnly`、本番では `secure` + `SameSite=None`
- 授業一覧は公開ですが、予約者名簿はその授業の担当講師だけが見られます
- 公開カレンダーが出すのは授業のステータス・時刻・場所・マップリンク・お知らせ・講師名のみ。旧週間表では生徒名を頭文字に短縮します
- Google マップの URL は `https` かつ Google ドメインであることを必須にし、任意リンクの注入を防ぎます
- お知らせはサーバーとクライアントの両方で 100 文字に制限
- 授業の書き込みはすべて `teacher_id` の所有権を検証
- ログインページには**プラットフォーム免責事項**を表示：本サイトはチェンマイ地域の講師と生徒に授業情報の掲載・表示・予約の場を提供するものであり、授業の提供者ではありません。授業の調整・費用・品質・安全・紛争は当事者間で解決し、講師はタイで適法に指導するための資格・ビザ・労働許可に自ら責任を負います。法令上プラットフォームが負う責任は本免責事項で免除されません。

---

## 13. バージョン履歴

- **v3.3.0** —— オンライン授業：対面 / オンラインの 2 形式、8 つの会議プラットフォーム、
  会議リンクが地図に代わり、カード・詳細・週間表プレビュー・カレンダー・ICS・
  Google カレンダーまで一貫して反映。週間表は実際の授業を描く形に全面書き換え
  （時間比率で積み上げ、ホバープレビュー、空コマは「予約不可」、モバイルは日別カード）
- **v3.2.1** —— ログインページ：デモアカウント欄をプラットフォーム免責事項に置き換え
- **v3.2.0** —— クラスボードを「今後 7 日 / それ以降 / 終了済み」の 3 段構成に
- **v3.1.0** —— スーパー管理者：アカウント管理、制限措置、授業審査、操作ログ
- **v3.0.0** —— 授業中心のモデル、複数講師の公開、お知らせ欄、Google 住所欄、
  真の UTC タイムゾーン、予約、リアルタイムフィード、開講ステータス、変更履歴、
  ICS / Google カレンダー、モバイルファーストの再設計、4 言語対応
- **v2.0.0** —— 4 桁 PIN ログイン、Google OAuth、4 言語、週間表の管理
- **v1.0.0** —— 初期版：単一講師の週間時間割

詳細は [CHANGELOG.md](CHANGELOG.md) を参照してください。

---

## 14. ライセンス

MIT

---

## 15. リポジトリ

| リモート | URL | 役割 |
| --- | --- | --- |
| `origin` | `https://github.com/zixiang2008/english-class-booking` | 公開リポジトリ |
| `mirror` | `https://github.com/zixiang2008/CMenglishClass` | 非公開アーカイブ |

`origin` には**プッシュ先 URL が 2 つ**登録されているため、`git push origin main` 1 回で
公開リポジトリと非公開アーカイブの両方が更新されます。アーカイブが遅れることはありません。

```bash
git remote -v          # origin に 2 つの push URL が表示される
git push origin main   # 1 回のプッシュで両方に反映
```

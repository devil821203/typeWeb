# REST API v1

Base path /api。JSON UTF-8。時間為 ISO-8601 UTC offset，生日 yyyy-MM-dd。整數 ID；回應資料庫欄位使用 snake_case。API 型別另見 frontend/src/api-types.d.ts。

文章列表只列出未封存文章。生成教材共 200 篇，分為倉頡、嘸蝦米、注音、英文各 30 課，以及中文／英文長文各 40 篇（10 篇全文與 30 個分段）。原文章及課程保留供歷史紀錄、統計與既有 ID 連結使用；`GET /courses` 包含原課程。封存狀態為內部欄位，不加入 Article 回應。新教材均開放訪客練習，登入後可保存紀錄。教材分類表示教材用途，不代表自動偵測使用者輸入法。

認證為 HttpOnly JSESSIONID cookie；客戶端 fetch 使用 credentials: same-origin。先 GET /csrf，取得 {token,headerName}，所有 POST / PUT（含註冊、登入、登出）均需在該 headerName 帶 token。登出後須重新取得 CSRF token。禁止以 query/body 傳入會員 ID 代替身份驗證。

| Method | Path | 認證 | 輸入 | 回應 |
| --- | --- | --- | --- | --- |
| GET | /health | 無 | — | 200 {status:"UP"}，包含 DB 連線檢查 |
| GET | /csrf | 無 | — | 200 {token,headerName} |
| POST | /auth/register | CSRF | Register | 201 {message}，不自動登入 |
| POST | /auth/login | CSRF | {email,password} | 200 Member，設定 session |
| POST | /auth/logout | CSRF | 無 | 200 空內容，session 失效 |
| GET | /me | 會員 | — | 200 Member |
| PUT | /me | 會員 + CSRF | Profile | 200 Member |
| GET | /courses | 無 | — | 200 Course[] |
| GET | /articles | 無 | courseId? | 200 ArticleSummary[]，永不含 content |
| GET | /articles/{id} | 會員限定文章需登入 | id | 200 Article |
| POST | /attempts | 會員 + CSRF | {articleId} | 201 Attempt（開始計時） |
| PUT | /attempts/{id} | 本人 + CSRF | {typedText,completed,chineseMetrics?} | 200 Attempt（finalize） |
| GET | /statistics | 會員 | date, period=all, zone=Asia/Taipei, courseId?, articleId? | 200 StatisticsSummary |
| GET | /attempts/daily | 會員 | date, period=week, mode=zh, zone=Asia/Taipei, courseId?, articleId? | 200 DailyTrend |
| GET | /attempts | 會員 | courseId?, articleId?, page=0 | 200 HistoryAttempt[]，每頁 20 筆 |

Profile = {birthday,phone,name,nickname}，所有欄位必填。生日須過去日期；電話 6–30 個數字、+、空格、括號、減號；名稱與暱稱最多 80 字元。
Register = Profile + {email,password}。Email 最多 254 字元且大小寫不敏感；密碼至少 10 字元、不超過 72 字元或 72 UTF-8 bytes。Login 無註冊最小長度限制，錯誤帳密同樣回 401。

completed=true 僅允許輸入全文與快照相同；false 可保存部分輸入（最多 20000 UTF-16 字元）。伺服器自行计算時間與成績，不接受客戶端速度。已結束紀錄再次 PUT 會回原結果。讀寫他人的 attempt 回 404。

Attempt 含 id、member_id、article_id、content_snapshot、started_at、finished_at、elapsed_ms、typed_text、correct_chars、cpm、wpm、accuracy、status。未結束時結果欄位為 null。HistoryAttempt 額外含 article_title、course_title。status 為 IN_PROGRESS / COMPLETED / ABANDONED。會員沒有讀取他人資料的 API。

應用錯誤格式 {message:string}；400 欄位錯誤／無效完成／頁碼不合法、401 未登入或帳密錯誤、403 會員文章或 CSRF 拒絕、404 找不到或無權讀取、409 Email 重複。Spring filter、無法解析 JSON、Nginx 429 或其他基礎設施錯誤可能使用框架預設格式；前端不依賴所有錯誤皆為 JSON。頁碼範圍 0–1000000，兩個篩選同时指定時採交集。

## 範例

```json
{
  "email": "student@example.com",
  "password": "a-long-demo-password",
  "birthday": "2000-01-01",
  "phone": "0912345678",
  "name": "王小明",
  "nickname": "小明"
}
```

會員必須先 GET /csrf，再帶 session cookie 送出註冊／登入。登入後 POST /attempts {"articleId":1}；停止時 PUT /attempts/1 {"typedText":"The sun","completed":false}。GET /attempts?courseId=1&articleId=1&page=0 讀取本人篩選紀錄。

## 中打與英打

新練習依文章快照決定 scoring_mode：包含 Unicode Han 漢字為 zh，其餘為 en；混合文章算中打。舊紀錄為 null，沿用舊評分，不回填過程資料。
英打保留 CPM、WPM = CPM / 5、全文位置正確率，包含英文標點。中打 cpm 計目前位置正確的漢字與全形標點，不含空格或英文；wpm 為 null。正確率仍按目前全文比對，修正後會提升；空輸入為 0%。耗時由伺服器計算。
PUT 可帶 chineseMetrics（省略或 null 表示未記錄）：
```json
{"backspaces":2,"selectionErrors":1,"frequentWords":[{"word":"練習","count":1}],"firstCpm":60,"lastCpm":48,"declinePercent":20}
```
- backspaces：Backspace keydown 次數，含組字與長按重複事件；不是刪除字數，無 keydown 的鍵盤不計。
- selectionErrors：每次 compositionend 確認新增或替換文字有位置不符，計一次；取消或文字未變不計。不是候選清單操作次數。
- frequentWords：按原文 Intl.Segmenter('zh', word) 斷詞；每次確認編輯對同一错詞計一次，修正不扣除，取前五名；多餘字沒有對應原文，不列入錯詞。
- 速度：固定 15 秒區間，計確認輸入且當下位置正確的漢字與全形標點（重新輸入也計），字數乘 4 為 CPM。比較首個與最後一個完整區間，停頓也計時。少於 30 秒時三項速度欄位為 null；首段零字時 declinePercent 為 null。下降百分比 = (firstCpm - lastCpm) / firstCpm × 100，正值表示下降。
- 計數限 0–1000000；最多五個錯詞，每詞 1–200 UTF-16 字元、次數 1–1000000；區間速度 0–1000000，下降百分比 -100000000–100。欄位驗證失敗回 400。

Attempt / HistoryAttempt 新增 scoring_mode 與 chinese_metrics（上述物件的 JSON 字串或 null）。僅中打保存過程分析，英打忽略。分析來自瀏覽器回報，不能由最終文字重建，並非防作弊證明；CPM、正確率仍由伺服器計算。重送保持第一次保存結果。未設定總分權重，不另算綜合分數。

ArticleSummary / Article 新增 language（zh / en），供文章類型標示與前端篩選；摘要仍不含 content。

中打標點範圍：Unicode 標點類別中 U+3000–303F、U+FF01–FF60 的字元，以及 —–…‧‘’“”（常見中文破折號、省略號、引號）。每個 Unicode code point 計一字，故「……」計兩字。全形／半形不轉換，例如原文「，」輸入「,」算錯；兩種模式的標點皆須逐字符合原文才可完成。已保存的舊結果不重新計算。

## 每日平均速度

GET /attempts/daily?date=2026-09-16&period=month&mode=zh&zone=Asia%2FTaipei 回傳 DailyTrend：
`{from,to,mode,zone,average_cpm,attempts,days:[{date,average_cpm,attempts}]}`。
日期為 yyyy-MM-dd；date 必填，年份限 1900–9998。period 為 day / week / month / year，以所選日期所在曆週（週一到週日）、曆月、曆年計算；zone 為有效 IANA 時區（前端帶瀏覽器時區）。無效參數回 400，未登入回 401。

僅統計登入會員的 COMPLETED，需有 finished_at、cpm、正耗時，依 finished_at 轉指定時區歸日。mode 分開中打與英打，scoring_mode=null 的舊紀錄不納入；原始明細仍可查看。courseId / articleId 篩選取交集，資料來自整個期間，不受明細每頁 20 筆限制。

每日平均是當日各次保存 CPM 的算術平均；期間 average_cpm 是期間各次 CPM 的算術平均，非每日平均再平均。中打 CPM 包含全形標點，英打 CPM 保留原有計分。days 按日期遞增，包含所有 1／7／28–31／365–366 天；無練習時 average_cpm=null、attempts=0，實際零分保持 0。查詢區间起點包含、終點排除，依時區處理跨日與夏令時間。回應不包含其他會員資料。

## 個人統計

GET /statistics?date=2026-10-07&period=all&zone=Asia%2FTaipei 回傳 StatisticsSummary：
`{from,to,zone,overall,averages,courses,articles}`。

- date 必填，格式、年份與時區驗證同每日 API；period 為 all（預設）/ day / week / month / year。all 的 from、to 為 null；其餘為包含首尾的曆日期。
- overall 是帳號全部完成紀錄的中打與英打平均，不受期間、courseId 或 articleId 影響。
- averages 是所選期間、種類與文章篩選交集的平均。每個平均為 `{mode,average_cpm,average_wpm,attempts}`，固定依 zh、en 排序；英打 average_wpm=average_cpm/5，中打為 null。
- courses、articles 是符合相同條件、至少有一筆紀錄的分類列表，按 id 排序。每項為 `{id,title,course_id,averages}`；種類的 course_id 為 null，文章的 course_id 是所屬課程。
- 練習種類對應 courses。每次有效完成練習的 CPM 等權平均，不採每日平均再平均。無資料的平均為 null、次數為 0；真實零速度仍為 0。
- 僅納入 COMPLETED、finished_at 非空、elapsed_ms>0、cpm 非空、scoring_mode 為 zh/en 的紀錄；不重新計算歷史速度。未分類舊紀錄及中途停止不納入，但仍可查詢練習明細。
- 從 session 取得會員身分，只查詢自己的紀錄；未登入回 401，無效參數回 400。沒有分頁限制。

每日 API 同樣只統計完成紀錄，支援單日；前端中打以字／分、英打以 WPM 繪圖，CPM 回應保持原單位。

## 文章摘要與會員首頁

GET /articles（可帶 courseId）仍為公開 API，不回傳正文。新增：
- character_count：全文 Unicode code point 數，包含空白、換行及標點，代理字元對計一字。
- difficulty：beginner / intermediate / advanced，顯示為初級／中級／進階；V4 migration 新增欄位與檢查約束，現有課程 1／2／3 分別初始化為上述難度，其他課程預設初級。難度為文章資料，可與所屬課程不同。
- personal_average_cpm、personal_average_wpm、personal_attempts：登入會員對該文章全部有效完成練習的算術平均與次數，只使用 session 身分。統計条件同個人統計，並依文章目前 language 選對應 scoring_mode。英打 WPM=CPM/5，中打 WPM=null；未登入或尚無紀錄時平均為 null、次數為 0，真實零速度仍為 0。

回應帶 Cache-Control: no-store，避免會員平均被快取共用。GET /articles/{id} 新增 difficulty、character_count，但不含個人平均；會員文章正文仍須登入。

訪客首頁將免費與會員文章分區，會員文章先導向登入並記住選取項目。會員首頁依中打／英打、課程類別導覽，文章列表顯示上述摘要資訊。登入及完成保存後重取摘要，登出立即清除前端個人平均。

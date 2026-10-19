# 字光 TypeLight 打字練習網站

前後端分離的打字練習網站。JavaScript 前端、Java 17 / Spring Boot 3.5.16 MVC REST 後端、PostgreSQL 資料庫，可使用 Docker Compose 建置部署。

## 功能

| 功能 | 操作與行為 |
| --- | --- |
| 會員註冊 | Email 作為帳號（忽略大小寫），密碼、生日、電話、名稱、暱稱必填 |
| 登入與登出 | BCrypt 雜湊密碼、HttpOnly Session cookie、CSRF 保護，30 分鐘閒置逾時 |
| 會員資料 | 登入後點右上角暱稱，可修改生日、電話、名稱與暱稱；Email 不可修改 |
| 課程與文章 | 3 套課程、6 篇原創測試文章；可按課程選擇；公開與會員文章分開授權 |
| 打字練習 | 中英文、中文輸入法、逐字標示、即時 CPM / WPM / 正確率 / 時間 |
| 成績保存 | 會員開始練習即建立紀錄；完成或停止後保存輸入全文、文章快照、起訖時間與成績 |
| 歷史紀錄 | 首頁每日平均速度與折線圖，支援週／月／年、日期與中英打切換；按課程、文章篩選；明細每頁 20 筆 |
| Docker | 前端 Nginx、後端 JRE、PostgreSQL 三個服務，健康檢查與資料持久化 |

訪客可練習公開文章，成績只存在當前頁面。會員紀錄由資料庫持久化且僅本人可讀寫。
突然關閉頁面或網路中斷而未送出時，紀錄保留為 IN_PROGRESS；最後未送出的文字無法恢復。此版保存每次練習的完整結果，不提供逐鍵事件回放。

## 專案結構

```text
frontend/   原生 JavaScript、HTML、CSS、開發代理、建置與測試、Nginx
backend/    Spring MVC Controller、Service、Repository、DTO、SQL migration、測試
docs/       API 契約、型別與架構說明
compose.yaml
.env.example
```

前後端無共用來源碼，僅透過 /api REST 契約溝通，能各自建置、測試及部署。

## Docker 快速開始

先安裝並啟動 Docker Engine / Docker Desktop（Linux containers）與 Docker Compose v2。以下在專案根目錄執行。

1. 複製設定：
   - PowerShell：`Copy-Item .env.example .env`
   - macOS / Linux：`cp .env.example .env`
2. 編輯 .env，將 DB_PASSWORD 改為至少 24 字元的隨機密碼，勿使用範例值。若值包含 $，請依 Compose .env 規則使用單引號包住。
3. 檢查並啟動：
   ```bash
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```
4. 開啟 http://localhost:8088 。首次建置需下載映像與 Maven 依賴，等待三個服務顯示 healthy。
5. 不提供預設會員帳號，請在網站自行註冊。

| 環境變數 | 用途 | 預設 |
| --- | --- | --- |
| DB_USER | PostgreSQL 帳號 | typeweb |
| DB_PASSWORD | 必填資料庫密碼 | 無正式預設 |
| APP_PORT | 對外網站埠號 | 8088 |
| COOKIE_SECURE | HTTPS 正式環境應設 true；本機 HTTP 保持 false | false |
| DB_URL | 後端 JDBC 位置；Compose 已設定 db 服務 | 本機 localhost:5432/typeweb |
| API_UPSTREAM | Nginx 後端位址；Compose 已設定 | http://backend:8080 |
| API_PROXY | 前端本機開發代理 | http://localhost:8080 |
| PORT | 前端本機開發埠 | 5173 |

Compose 僅公開網站埠，資料庫與後端不對外公開。postgres_data volume 保留會員、文章與紀錄。修改已初始化資料庫的 DB_PASSWORD 不會自動更改既有 PostgreSQL 使用者密碼。

### 常用操作

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose restart backend
docker compose down
docker compose up -d --build
```

down 保留資料 volume；不要加 -v，除非確定要清除所有資料。更新程式前先備份資料；Flyway 只套用新增版本 migration，不要修改已執行的 migration。

### 備份與還原

將備份先寫入容器再 docker cp，避免 Windows PowerShell 重新編碼或損壞二進位內容：

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d typeweb -Fc -f /tmp/typeweb.dump'
docker compose cp db:/tmp/typeweb.dump ./typeweb.dump
```

將備份複製到另一套使用**空白資料庫**的 db 容器；在啟動 backend 前還原：

```bash
docker compose cp ./typeweb.dump db:/tmp/typeweb.dump
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d typeweb --no-owner /tmp/typeweb.dump'
```

備份含會員個資，請放在受保護的位置，勿提交到 Git。還原時使用相同或更新的 PostgreSQL 主版本，並保留原始備份。

### 正式主機

在網站前方配置 HTTPS reverse proxy / load balancer 與憑證，設定 COOKIE_SECURE=true，限制 HTTP 存取。這份 Compose 提供單機部署；網域與 TLS 憑證由部署環境管理。Nginx 對登入／註冊 API 提供每 IP 每分鐘 10 次、burst 5 的限制。多個使用者共用 NAT 時須依流量調整。

## 網站操作

1. 點「登入 / 註冊」，填寫會員資料。密碼至少 10 字元、最多 72 UTF-8 bytes；生日必須是過去日期。
2. 註冊完成後登入，右上方顯示暱稱。
3. 到「練習課程」選擇課程與文章，再點「開始練習」。
4. 計時從按下開始算起，停頓也計時；英文區分大小寫，標點與空格皆需一致。中文輸入法組字完成後才比對。
5. 全文相同後顯示「請按 Enter 結束」，再按一次 Enter 才結束計時並保存；最後這次 Enter 不計入內容或字數。中文輸入法確認選字的 Enter 不會結束練習，原文段落換行仍須照常輸入。可按「停止並保存」保存未完成練習。支援倒退修正，禁止 UI 貼上及拖放。
6. 點「再練習一次」會新增一筆紀錄；練習中先停止才可換頁、換文章或登出。
7. 到「練習紀錄」查看每日平均速度圖，選擇週／月／年、日期或上一期／下一期，切換中打／英打；點圖上的資料點查看平均速度與次數，也可展開每日資料表。課程／文章篩選同時套用圖表與明細。平均包含完成與中途停止，依結束時間及瀏覽器時區歸日；無紀錄日期留空，舊版未標記類型的紀錄不納入圖表。
8. 保存失敗時頁面顯示錯誤並保留輸入，恢復連線後可再次停止或完成送出。

### 成績定義

新練習按文章是否含漢字區分中打／英打（混合文章算中打）。中打呈現每分鐘正確中文字、全文正確率、Backspace 次數、選字錯誤次數、最常打錯的詞與連續輸入速度下降情況，並保存會員分析。中打字數包含漢字與全形標點，排除空格與英文，不顯示 WPM；選字錯誤以輸入法確認送出且不符原文計次；速度比較首尾完整 15 秒區間，至少需 30 秒。未設定總分權重，不另算綜合分數。詳見 [API](docs/API.md#中打與英打)。

以下原有規則保留於英打及舊紀錄：

- 字元以 Unicode code point 計數；空白、標點也計入。
- 正確字元：目前輸入與原文相同位置的匹配數。
- CPM = 正確字元 × 60,000 / 耗時毫秒。
- WPM = CPM / 5（英打五字元為一個 word）。
- 正確率 = 正確字元 / 目前輸入字元 × 100；空輸入為 0%。
- 修正錯字後，最終正確率會提升；本版不是累計按鍵錯誤率。
- 會員最終耗時由伺服器起訖時間計算，包含網路延遲；即時顯示為瀏覽器計時，最終以保存結果為準。
- 停止標記 ABANDONED、完成標記 COMPLETED、尚未結束為 IN_PROGRESS。
- 成績供個人練習參考；不包含競賽級防作弊機制。

## 本機開發（不透過整套 Docker）

需要 JDK 17+、Maven 3.6.3+、Node.js 20+、PostgreSQL 17。先建立 typeweb 資料庫與帳號，或自行配置測試資料庫位址。

後端 PowerShell：

```powershell
cd backend
$env:DB_URL='jdbc:postgresql://localhost:5432/typeweb'
$env:DB_USER='typeweb'
$env:DB_PASSWORD='你的資料庫密碼'
mvn spring-boot:run
```

另一個終端啟動前端：

```bash
cd frontend
npm run dev
```

開啟 http://localhost:5173 。前端不需要 npm install，沒有外部 production 或 development npm 套件。
前端代理 /api 至 API_PROXY，因此開發環境也維持同源 cookie 與 CSRF。不要直接以 file:// 開啟 HTML。

### 獨立建置與測試

```bash
cd frontend
npm run lint
npm run test
npm run build
```

lint 使用 Node 語法檢查；前端為 JavaScript，沒有額外 TypeScript type-check 指令。dist/ 可部署到靜態主機，並配置 /api 代理。

```bash
cd backend
mvn test
mvn package
```

測試使用 H2 PostgreSQL 相容模式，不需要外部 DB。產物 target/typeweb-1.0.0.jar 使用上述 DB 環境變數啟動：

```bash
java -jar target/typeweb-1.0.0.jar
```

## 驗收清單

- 訪客可以練習公開文章；會員文章 API 回 403，紀錄 API 回 401。
- 新會員註冊、重複 Email、錯誤密碼、會員資料更新符合預期。
- 登入後完成一篇英文與中文文章，各新增一筆紀錄；停止也保存紀錄。
- 課程／文章篩選正確；另一會員看不到前一會員資料。
- 重啟 db / backend 後會員與紀錄仍存在；後端重啟須重新登入。
- 重新整理或關閉未結束練習，留下 IN_PROGRESS 紀錄。

## 疑難排解與限制

- Docker pipe / daemon 找不到：啟動 Docker Desktop 並切換 Linux containers，再執行 docker info。
- 網站 502：檢查 docker compose ps 與 backend logs；資料庫需先 healthy。
- 無法登入／403：重新操作以更新 CSRF；本機 HTTP 不可設 COOKIE_SECURE=true。
- 429：登入相關操作過密，等待約一分鐘後重試。
- 8088 被占用：更改 .env 的 APP_PORT。
- Maven 無法下載：檢查網路代理與 Maven Central 連線。
- 此版沒有 Email 驗證、忘記密碼、後台文章編輯、帳號刪除或逐鍵回放。文章以 Flyway SQL 新增；會員權限代表已註冊登入，無付費訂閱。
- Session 暫存在後端記憶體，閒置 30 分鐘或重啟會失效。會員 API 偵測到失效後，頁面會同步清除登入狀態並開啟登入表單；重新登入會自動開啟剛才選的會員文章。進行中的輸入保留，重新登入後可繼續。多副本擴充時需另行實作共用 Session 儲存。
- H2 整合測試不能完全取代真實 PostgreSQL / Docker 驗收；中文輸入法與手機鍵盤需以實際瀏覽器操作確認。

API 規格见 [docs/API.md](docs/API.md)，型別见 [frontend/src/api-types.d.ts](frontend/src/api-types.d.ts)，架構與依賴說明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

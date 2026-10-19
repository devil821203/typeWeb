    # Backend

Java 17、Spring Boot 3.5.16 MVC REST API，使用 Spring JDBC、PostgreSQL、Flyway。MVC 的 View 由獨立 frontend 實作，後端回傳 JSON。

設定 DB_URL、DB_USER、DB_PASSWORD 後執行 `mvn spring-boot:run`。使用 `mvn test` 執行 H2 整合測試、`mvn package` 打包 JAR。Docker：`docker build -t typeweb-backend .`；執行時提供 DB 環境變數與網路。

Controller：HTTP / session / validation；TypingService：練習規則與交易；Store：資料存取；Models：請求 DTO；db/migration：結構與測試課程。會員身份統一由伺服器 session 決定，不接受客戶端 memberId。

詳細操作與部署見 [根 README](../README.md)，API 見 [API.md](../docs/API.md)。

## 生成教材匯入

V5 新增內部文章封存欄位；V6 封存原文章，匯入 `article/typing-course-txt.zip` 的 200 份 UTF-8 正文與 6 個分類。原文章 ID、課程、會員及練習紀錄不刪除，新教材 ID 為 1001–1200，分類 ID 為 10–15，所有新教材開放訪客。120 課的標題和難度依 `course-index.csv`；20 篇全文與 60 個分段均為進階。正文保留空白與換行，不加入標題或提示。

PostgreSQL 與 SQL Server 各有對應 Flyway migration，重啟後僅套用一次。V7 將新教材的 CRLF 還原為 ZIP 原本的 LF 換行，確保正文逐字相同。匯入前應備份既有課程與文章。生成程式為 `python backend/scripts/generate-catalogue.py`，只使用 Python 標準函式庫；部署不需 Python 或原 ZIP。已套用的 migration 不應重新生成修改；教材後續更動需新增版本。

## 本機 SQL Server 測試配置

本機帳密檔案：`config/application-local-sqlserver.properties`（相對於 backend）。此檔已由 Git 忽略，不會打包進 JAR。目標是 `127.0.0.1:1433` 的 `typeWeb`；請先建立空資料庫並填入可登入的帳密。

啟用 `local-sqlserver` profile 後，會載入 `src/main/resources/application-local-sqlserver.properties`，使用獨立的 `db/sqlserver` Flyway migrations 建立資料表、3 個課程及 6 篇文章。重啟會檢查 migration 版本，不會重複插入課程或清除資料。原本的 PostgreSQL migration 路徑及預設配置維持不變。

新增的執行期依賴由現有 Spring Boot BOM 管理版本：`mssql-jdbc` 負責 SQL Server 連線，`flyway-sqlserver` 負責 SQL Server 結構遷移。參考 [Microsoft JDBC 文件](https://learn.microsoft.com/en-us/sql/connect/jdbc/overview-of-the-jdbc-driver) 與 [Flyway SQL Server 文件](https://documentation.red-gate.com/fd/sql-server-database-277579330.html)。

在 `backend` 目錄啟動：

```powershell
mvn spring-boot:run "-Dspring-boot.run.profiles=local-sqlserver"
```

或建置後啟動 JAR（仍須在 `backend` 目錄，才能讀取 `config/`）：

```powershell
mvn package
java -jar target/typeweb-1.0.0.jar --spring.profiles.active=local-sqlserver
```

後端僅綁定 `127.0.0.1:8080`；此配置的 `trustServerCertificate=true` 僅供本機測試。健康檢查為 http://127.0.0.1:8080/api/health 。

另開 PowerShell，在 `frontend` 目錄執行：

```powershell
$env:API_PROXY='http://127.0.0.1:8080'
npm run dev
```

開啟 http://127.0.0.1:5173 。要建立測試會員並驗證實際 SQL Server API 流程，在 `frontend` 另執行 `npm run test:local`。預設測試帳號為 `local.tester@example.com`、密碼為 `TypeWeb-Test2026!`。可用 `TEST_EMAIL` 與 `TEST_PASSWORD` 環境變數覆寫。此腳本只連線本機 5173，透過 API 建立會員及兩筆練習紀錄，不會清除既有資料；重跑會保留既有帳號並新增兩筆紀錄。

本次背景啟動的輸出存於根目錄 `.tools/backend-local.log`、`.tools/frontend-local.log`，錯誤輸出為對應的 `*-error.log`；程序編號記錄於 `.tools/local-processes.json`。後續自行在終端機啟動時，可按 Ctrl+C 停止服務。

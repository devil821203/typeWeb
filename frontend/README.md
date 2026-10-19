# Frontend

原生 JavaScript ES modules、HTML、CSS，沒有正式環境 npm 套件依賴。Node.js 20+；排版工具使用開發依賴。

- `npm run dev`：本機 5173，/api 代理至 API_PROXY（預設 http://localhost:8080）。
- `npm run lint`：Node 語法檢查。
- `npm run test`：成績與時間格式測試。
- `npm run build`：靜態檔產生到 dist/。
- `docker build -t typeweb-frontend .`：獨立建立 Nginx 映像；執行時以 API_UPSTREAM 指向後端。

排版前執行 `npm ci`，再執行 `npm run format`；使用 `npm run format:check` 檢查格式。一般開發、測試與建置不需 npm install。部署保持 /api 同源代理，API 契約見 [API.md](../docs/API.md)，型別以 api-types.d.ts 記錄，執行程式仍全部 JavaScript。完整操作見 [根 README](../README.md)。

## 本機 SQL Server 完整流程測試

先依 [後端本機設定](../backend/README.md#本機-sql-server-測試配置) 啟動後端與前端，再執行 `npm run test:local`。此命令會建立測試會員與兩筆練習紀錄，驗證登入、文章權限、中文資料、日期格式、完成與放棄練習、歷史分頁及登出。一般 `npm run test` 不需啟動服務，也不會寫入本機 SQL Server。

## 我的統計

登入後由「我的統計」查看中英打全部紀錄總平均、年／月／週／日速度，以及練習種類（課程）和文章平均。期間與篩選適用於分類及趨勢；全部紀錄總平均固定涵蓋帳號全部完成練習。僅納入有打字類型的已完成紀錄，英打顯示 WPM 與 CPM，中打顯示字／分。

## 本機測試帳號一鍵登入

在啟動 `npm run dev` 的終端設定 `TEST_EMAIL` 與 `TEST_PASSWORD`，登入頁會出現「測試帳號一鍵登入（僅本機）」。按下後填入環境設定的帳密並送出正常登入表單，使用既有的 CSRF、Session 與錯誤處理；不會自動註冊帳號，測試帳號需先存在。

兩項環境變數缺任一項時不提供按鈕。關閉功能時清除這兩項環境變數並重新啟動前端即可。帳密不存入原始碼或瀏覽器儲存空間，本機頁面回應不快取。

正式上線使用 `npm run build` 產生的 `dist/` 或既有 Docker 映像；建置直接複製原始 HTML 與 `src/`，不包含開發伺服器注入的按鈕、測試帳密或 `scripts/dev-login.mjs`，不需人工刪除。`npm run dev` 僅供本機開發。

## 登入前後首頁

訪客保留介紹及課程、中英打篩選，免費文章可直接練習，會員文章會導向登入並於成功後接續所選文章。會員使用左側中打／英打及課程類別導航，中央文章列表顯示名稱、全文字數、難度與自己的平均速度；手機導航位於列表上方。字數包含空白與標點，難度由文章資料提供。個人平均沿用有效完成紀錄規則，登入、回到練習首頁及保存後會更新，沒有紀錄時顯示「尚無紀錄」。

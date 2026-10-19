# 程式碼排版

前端與共用 JSON、YAML、後端 POM 使用固定版本 Prettier 及 XML 外掛，僅為開發依賴：

```powershell
cd frontend
npm ci
npm run format
npm run format:check
```

Java 使用固定版本 Spotless 與 google-java-format：

```powershell
cd backend
mvn spotless:apply
mvn spotless:check
```

Python 使用固定版本 Black。從專案根目錄執行，可將工具裝入專案內的虛擬環境：

```powershell
python -m venv .tools/format-venv
.tools/format-venv/Scripts/python -m pip install -r backend/requirements-format.txt
.tools/format-venv/Scripts/python -m black backend/scripts
.tools/format-venv/Scripts/python -m black --check backend/scripts
```

排版範圍涵蓋前端原始碼、型別、腳本與測試、Java 原始碼與測試、Python 腳本、compose.yaml 與 backend/pom.xml。不處理文章資料、既有 SQL migration、機密設定、建置產物與第三方套件。Dockerfile、Nginx 與 properties 設定維持現有格式。

驗證使用前端 `npm run lint`、`npm run test`、`npm run build`，後端 `mvn test`、`mvn package`。本專案為 JavaScript，沒有 type-check 指令。

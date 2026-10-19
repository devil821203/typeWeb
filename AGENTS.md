# Project Agent Instructions

## Project Overview

This repository is a frontend-backend separated web application.

- `frontend/`: browser frontend application
- `backend/`: REST API backend application
- `docs/`: architecture, API, and decision documents
- `prompts/`: reusable agent prompts grouped by task

The frontend and backend must remain independently buildable, testable, and deployable.

## 需求處理與確認流程

- 使用者提出新功能、問題修正或改善需求時，先提出改善方法，不立即修改。
- 可先進行必要的唯讀檢查，釐清現況；接著說明建議方案、預期行為、影響範圍與驗證方式。若有重要取捨，提供選項及建議。
- 提出方案後，等待使用者明確確認再實作；提出需求本身不視為同意修改。
- 確認前不得修改程式、設定或資料，不得執行會改變環境狀態的操作。
- 使用者已確認的範圍可持續完成，不需重複確認；若需擴大範圍，先說明並取得確認。
- 使用者明確要求直接執行特定操作時，可在該授權範圍內執行；本次要求將合作規則寫入 `AGENTS.md` 即屬此情況。

## Before Editing

1. Read the closest applicable `AGENTS.md`.
2. Read the relevant `README.md`.
3. Inspect existing code and conventions.
4. Check Git status.
5. Identify the smallest required change set.

Do not modify unrelated files or discard existing user changes.

## Architecture Rules

- Keep frontend and backend source code separated.
- Frontend-backend communication must use documented APIs.
- Do not share source code directly between frontend and backend.
- Do not hard-code environment-specific hosts, credentials, or secrets.
- API contract changes must update implementation, documentation, types, and tests.

## Dependency Rules

- Reuse existing dependencies when possible.
- Explain every new production dependency.
- Do not upgrade unrelated dependencies.
- Do not replace frameworks or package managers without explicit approval.

## Validation

Frontend commands should come from `frontend/package.json`.
Typical commands:

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

Backend commands:

```bash
mvn test
mvn package
```

Never claim a command passed unless it was actually executed successfully.

## Git Safety

Do not commit, push, pull, merge, rebase, reset, switch branches, delete branches, or force-update history unless explicitly requested.

## Destructive Operations

Do not execute destructive database statements, bulk file deletion, environment destruction, production deployment, or credential rotation unless explicitly requested.

## Completion Report

Report:

1. Implementation summary
2. Created files
3. Modified files
4. Commands executed
5. Validation results
6. Assumptions and remaining risks

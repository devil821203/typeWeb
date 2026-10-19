import assert from 'node:assert/strict';
import { metrics, chineseTracker } from '../src/metrics.js';
import { localDate } from '../src/history-chart.js';

// Run only against the local test server. Creates a member and two attempts.
const base = 'http://127.0.0.1:5173';
const email = process.env.TEST_EMAIL || 'local.tester@example.com';
const password = process.env.TEST_PASSWORD || 'TypeWeb-Test2026!';
const cookies = new Map();
let csrf;
async function request(path, method = 'GET', body, expected = 200) {
  const headers = {
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers[csrf.headerName] = csrf.token;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const split = pair.indexOf('=');
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  assert.ok(
    [expected].flat().includes(response.status),
    `${method} ${path}: HTTP ${response.status}`,
  );
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

assert.equal(
  (await fetch(base, { signal: AbortSignal.timeout(10000) })).status,
  200,
);
assert.equal((await request('/api/health')).status, 'UP');
assert.equal((await request('/api/courses')).length, 3);
assert.equal((await request('/api/articles')).length, 6);
await request('/api/articles/4', 'GET', undefined, 403);
csrf = await request('/api/csrf');
await request(
  '/api/auth/register',
  'POST',
  {
    email,
    password,
    birthday: '1995-06-15',
    phone: '0912345678',
    name: '本機測試會員',
    nickname: '測試小幫手',
  },
  [201, 409],
);
const profile = await request('/api/auth/login', 'POST', { email, password });
assert.equal(profile.email, email);
assert.equal(profile.nickname, '測試小幫手');
assert.equal((await request('/api/me')).email, email);
assert.equal((await request('/api/articles/4')).members_only, true);
const article = await request('/api/articles/1');
const attempt = await request('/api/attempts', 'POST', { articleId: 1 }, 201);
assert.equal(typeof attempt.started_at, 'string');
assert.ok(Number.isFinite(Date.parse(attempt.started_at)));
const finished = await request(`/api/attempts/${attempt.id}`, 'PUT', {
  typedText: article.content,
  completed: true,
});
assert.equal(finished.status, 'COMPLETED');
assert.equal(finished.accuracy, 100);
assert.equal(finished.scoring_mode, 'en');
assert.match(article.content, /[.,!?;:]/);
assert.equal(
  finished.cpm,
  metrics(article.content, article.content, finished.elapsed_ms).cpm,
);
assert.equal(finished.wpm, finished.cpm / 5);
assert.equal(typeof finished.finished_at, 'string');
assert.equal(
  (
    await request(`/api/attempts/${attempt.id}`, 'PUT', {
      typedText: 'changed',
      completed: false,
    })
  ).status,
  'COMPLETED',
);
const chinese = await request('/api/attempts', 'POST', { articleId: 3 }, 201);
assert.ok(chinese.content_snapshot.startsWith('午後'));
assert.equal(chinese.scoring_mode, 'zh');
const punctuationIndex = chinese.content_snapshot.indexOf('，');
assert.ok(punctuationIndex >= 0);
const chineseInput = chinese.content_snapshot.slice(0, punctuationIndex + 1);
// Synthetic committed edits exercise telemetry transport; this is not a physical IME test.
const tracker = chineseTracker(chinese.content_snapshot);
tracker.commit('午錯', 1, true);
tracker.backspace();
tracker.commit(chineseInput, 2, true);
const analysis = tracker.summary(2);
const abandoned = await request(`/api/attempts/${chinese.id}`, 'PUT', {
  typedText: chineseInput,
  completed: false,
  chineseMetrics: analysis,
});
assert.equal(abandoned.wpm, null);
assert.equal(
  abandoned.cpm,
  metrics(chinese.content_snapshot, chineseInput, abandoned.elapsed_ms, 'zh')
    .cpm,
);
assert.deepEqual(JSON.parse(abandoned.chinese_metrics), analysis);
assert.equal(analysis.selectionErrors, 1);
assert.equal(analysis.backspaces, 1);
const chineseHistory = await request('/api/attempts?articleId=3');
assert.equal(
  chineseHistory.find((row) => row.id === chinese.id).chinese_metrics,
  abandoned.chinese_metrics,
);
assert.equal(abandoned.status, 'ABANDONED');
assert.equal(abandoned.typed_text, chineseInput);
const history = await request('/api/attempts?courseId=1&articleId=1');
assert.ok(
  history.some((row) => row.id === attempt.id && row.status === 'COMPLETED'),
);
assert.ok(Array.isArray(await request('/api/attempts?page=1')));
for (const mode of ['zh', 'en']) {
  const date = localDate(
    new Date(mode === 'zh' ? abandoned.finished_at : finished.finished_at),
  );
  for (const period of ['day', 'week', 'month', 'year']) {
    const params = new URLSearchParams({
      period,
      date,
      mode,
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const trend = await request(`/api/attempts/daily?${params}`);
    assert.ok(trend.attempts >= 0);
    if (mode === 'en') assert.ok(trend.attempts > 0);
    assert.ok(
      trend.attempts
        ? Number.isFinite(trend.average_cpm)
        : trend.average_cpm === null,
    );
    assert.ok(trend.days.some((day) => day.date === date));
    assert.ok(period !== 'day' || trend.days.length === 1);
    assert.ok(period !== 'week' || trend.days.length === 7);
    assert.ok(
      period !== 'month' ||
        (trend.days.length >= 28 && trend.days.length <= 31),
    );
    assert.ok(period !== 'year' || [365, 366].includes(trend.days.length));
  }
}
const statistics = await request(
  `/api/statistics?date=${localDate(new Date())}&period=all`,
);
assert.ok(statistics.overall.find((row) => row.mode === 'en').attempts > 0);
assert.ok(statistics.articles.some((row) => row.id === 1));
await request('/api/auth/logout', 'POST');
await request('/api/statistics?date=2026-10-07', 'GET', undefined, 401);
await request('/api/attempts/daily?date=2026-09-16', 'GET', undefined, 401);
await request('/api/me', 'GET', undefined, 401);
console.log(
  `Local SQL Server smoke test passed. Member: ${email}; attempts: ${attempt.id}, ${chinese.id}`,
);

import { localDate, shiftPeriod, renderTrend } from './history-chart.js';
import {
  metrics,
  duration,
  language,
  chineseTracker,
  chineseSummaryText,
} from './metrics.js';

const $ = (selector) => document.querySelector(selector);
let user = null,
  csrf,
  courses = [],
  articles = [],
  selected,
  attempt,
  started = 0,
  running = false,
  saving = false,
  composing = false,
  page = 0;
let trendRequest = 0,
  pendingArticleId = null,
  articleRequest = 0;
let memberMode = 'zh',
  memberCourse = null;
let tracker = null,
  committedText = '',
  imeEnterHeld = false;
const notice = (message) => {
  $('#notice').textContent = message;
};
async function api(path, method = 'GET', data) {
  if (method !== 'GET' && !csrf) csrf = await api('/csrf');
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers[csrf.headerName] = csrf.token;
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  let value;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    value = null;
  }
  if (!response.ok) {
    let authExpired = response.status === 401 && path !== '/auth/login';
    if (response.status === 403) {
      csrf = null;
      // A members-only article uses 403; distinguish an expired session from other denials.
      if (
        path !== '/me' &&
        path !== '/csrf' &&
        (user || /^\/articles\/\d+$/.test(path))
      ) {
        try {
          await api('/me');
        } catch (error) {
          authExpired = error.authExpired === true;
        }
      }
    }
    if (authExpired) {
      const hadUser = !!user;
      user = null;
      csrf = null;
      clearTrend();
      $('#history-list').replaceChildren();
      $('#profile').reset();
      $('#profile-email').textContent = '';
      syncAccount();
      // Initial anonymous /me lookup should not interrupt browsing public lessons.
      if (hadUser || path !== '/me') showView('account');
      const error = new Error('登入狀態已失效，請重新登入後繼續。');
      error.authExpired = true;
      throw error;
    }
    throw new Error(
      value?.message ||
        (response.status === 403
          ? '操作未授權或安全憑證已失效，請重新嘗試。'
          : `請求失敗（${response.status}），請確認後端服務。`),
    );
  }
  return value;
}
function safe(handler) {
  return async (event) => {
    try {
      await handler(event);
    } catch (error) {
      notice(error.message);
    }
  };
}
function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}
function syncAccount() {
  $('#account-nav').textContent = user
    ? `${user.nickname} · 會員資料`
    : '登入 / 註冊';
  $('#logout').hidden = !user;
  $('#auth-forms').hidden = !!user;
  $('#profile').hidden = !user;
  if (user) {
    $('#profile-email').textContent = user.email;
    for (const field of ['birthday', 'phone', 'name', 'nickname'])
      $('#profile').elements[field].value = user[field];
  }
  $('#save-hint').textContent = user
    ? '會員練習會保存至帳號。'
    : '訪客成績僅顯示於本次頁面，登入後可保存。';
  renderArticles();
}
function showView(id) {
  for (const view of document.querySelectorAll('.view'))
    view.hidden = view.id !== id;
}
async function openArticle(id) {
  try {
    const article = await api(`/articles/${id}`);
    selected = article;
    attempt = null;
    pendingArticleId = null;
    if (user) {
      memberMode = article.language;
      memberCourse = article.course_id;
      renderArticles();
    }
    tracker = chineseTracker(selected.content);
    composing = false;
    committedText = '';
    imeEnterHeld = false;
    $('#workspace').hidden = false;
    $('#article-title').textContent = selected.title;
    $('#article-source').textContent = selected.content;
    $('#typing').value = '';
    $('#typing').disabled = true;
    $('#start').disabled = false;
    $('#practice-status').textContent = '準備開始';
    paint();
    showMetrics(0);
    showView('practice');
    $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (error.authExpired) pendingArticleId = id;
    throw error;
  }
}
async function refreshArticles() {
  const owner = user,
    request = ++articleRequest;
  const updated = await api('/articles');
  if (request !== articleRequest || user !== owner) return;
  articles = updated;
  renderArticles();
}
function articleButton(article, member) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = member ? 'article-row' : 'card';
  const title = document.createElement('h3');
  title.textContent = member
    ? article.title
    : `${article.language === 'zh' ? '中打' : '英打'} · ${article.title}`;
  const details = document.createElement('div');
  details.className = member ? 'article-details' : '';
  if (member) {
    for (const text of [
      `字數：${article.character_count ?? '—'}`,
      `難度：${{ beginner: '初級', intermediate: '中級', advanced: '進階' }[article.difficulty] || '未設定'}`,
      `我的平均：${speedText(article.language, article.personal_average_cpm)}${article.personal_attempts ? ` · ${article.personal_attempts} 次完成` : ''}`,
    ]) {
      const value = document.createElement('span');
      value.textContent = text;
      details.append(value);
    }
  } else {
    const subtitle = document.createElement('p');
    subtitle.textContent =
      courses.find((c) => c.id === article.course_id)?.title || '';
    details.append(subtitle);
  }
  const action = document.createElement('span');
  action.className = 'article-action';
  action.textContent =
    article.members_only && !user ? '登入後練習 →' : '開始練習 →';
  card.append(title, details, action);
  card.addEventListener(
    'click',
    safe(async () => {
      if (running || saving) {
        notice('請先停止並保存目前練習。');
        return;
      }
      if (article.members_only && !user) {
        pendingArticleId = article.id;
        notice('請先登入以練習這篇會員文章。');
        showView('account');
        return;
      }
      await openArticle(article.id);
    }),
  );
  return card;
}
function renderArticles() {
  $('#guest-intro').hidden = !!user;
  $('#article-navigation').hidden = !user;
  $('#member-library').hidden = !!user;
  $('#practice-layout').className = user
    ? 'practice-layout member-layout'
    : 'practice-layout';
  $('#articles').className = user ? 'article-list' : 'cards';
  $('#articles').replaceChildren();
  $('#member-articles').replaceChildren();
  $('#member-navigation').replaceChildren();
  if (!user) {
    // Drop personal averages immediately on logout or session expiry.
    articles = articles.map((a) => ({
      ...a,
      personal_average_cpm: null,
      personal_average_wpm: null,
      personal_attempts: 0,
    }));
    $('#article-list-title').textContent = '免費文章選擇';
    $('#article-list-description').textContent =
      '不需登入，選擇文章即可開始練習。';
    const filtered = articles.filter(
      (a) =>
        (!$('#course').value || String(a.course_id) === $('#course').value) &&
        (!$('#language').value || a.language === $('#language').value),
    );
    for (const article of filtered)
      $(article.members_only ? '#member-articles' : '#articles').append(
        articleButton(article, false),
      );
    for (const selector of ['#articles', '#member-articles'])
      if (!$(selector).children.length)
        $(selector).textContent = '目前沒有符合篩選條件的文章。';
    return;
  }
  const categories = (mode) =>
    courses.filter((c) =>
      articles.some((a) => a.course_id === c.id && a.language === mode),
    );
  if (!categories(memberMode).length)
    memberMode = memberMode === 'zh' ? 'en' : 'zh';
  if (!categories(memberMode).some((c) => c.id === memberCourse))
    memberCourse = categories(memberMode)[0]?.id ?? null;
  for (const [mode, label] of [
    ['zh', '中打'],
    ['en', '英打'],
  ]) {
    const group = document.createElement('div');
    group.className = 'navigation-group';
    const heading = document.createElement('h3');
    heading.textContent = label;
    group.append(heading);
    const matches = categories(mode);
    for (const course of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = course.title;
      button.className =
        memberMode === mode && memberCourse === course.id
          ? 'category-button active'
          : 'category-button';
      button.ariaPressed = String(
        memberMode === mode && memberCourse === course.id,
      );
      button.addEventListener('click', () => {
        if (running || saving) {
          notice('請先停止並保存目前練習，再切換類別。');
          return;
        }
        memberMode = mode;
        memberCourse = course.id;
        $('#workspace').hidden = true;
        notice('');
        renderArticles();
      });
      group.append(button);
    }
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = '尚無文章類別';
      group.append(empty);
    }
    $('#member-navigation').append(group);
  }
  const course = courses.find((c) => c.id === memberCourse);
  $('#article-list-title').textContent =
    `${memberMode === 'zh' ? '中打' : '英打'}${course ? ` · ${course.title}` : ''}`;
  $('#article-list-description').textContent =
    '選擇文章開始練習。平均速度依你已完成的練習計算。';
  for (const article of articles.filter(
    (a) => a.language === memberMode && a.course_id === memberCourse,
  ))
    $('#articles').append(articleButton(article, true));
  if (!$('#articles').children.length)
    $('#articles').textContent = '此類別目前沒有文章。';
}
function paint() {
  const input = Array.from($('#typing').value);
  const original = Array.from(selected.content);
  // Keep the remaining article aligned even when an error has a different width.
  const prefix = document.createElement('span');
  prefix.className = 'typed-spacer';
  prefix.textContent = input.join('');
  $('#passage').replaceChildren(
    prefix,
    document.createTextNode(original.slice(input.length).join('') + '\n'),
  );
  $('#typed-overlay').replaceChildren(
    ...input.map((char, i) => {
      const span = document.createElement('span');
      span.textContent = char;
      span.className = composing
        ? 'composing'
        : char === original[i]
          ? 'correct'
          : 'incorrect';
      return span;
    }),
    document.createTextNode('\n'),
  );
}
function showMetrics(elapsed, result) {
  const mode = language(selected?.content || '');
  const score =
    result ||
    metrics(
      selected?.content || '',
      composing ? committedText : $('#typing').value,
      elapsed,
      mode,
    );
  $('#cpm-label').textContent =
    mode === 'zh'
      ? '中打 · 正確字數 / 分（含全形標點）'
      : '英打 · CPM 正確字元 / 分';
  $('#wpm-stat').hidden = mode === 'zh';
  $('#chinese-stats').hidden = mode !== 'zh';
  $('#chinese-stats').textContent = chineseSummaryText(
    result
      ? result.chinese_metrics
        ? JSON.parse(result.chinese_metrics)
        : null
      : tracker?.summary(elapsed),
  );
  $('#cpm').textContent = score.cpm.toFixed(1);
  $('#wpm').textContent = score.wpm?.toFixed(1) ?? '—';
  $('#accuracy').textContent = `${score.accuracy.toFixed(1)}%`;
  $('#elapsed').textContent = duration(elapsed);
}
async function finish(completed) {
  if (!running || saving) return;
  saving = true;
  $('#typing').disabled = true;
  $('#stop').disabled = true;
  try {
    const elapsed = performance.now() - started;
    const result = attempt
      ? await api(`/attempts/${attempt.id}`, 'PUT', {
          typedText: $('#typing').value,
          completed,
          chineseMetrics:
            language(selected.content) === 'zh'
              ? tracker.summary(elapsed)
              : null,
        })
      : null;
    running = false;
    showMetrics(result?.elapsed_ms || elapsed, result);
    $('#practice-status').textContent = completed ? '練習完成' : '已停止';
    $('#start').disabled = false;
    $('#start').textContent = '再練習一次';
    notice(
      attempt
        ? '練習紀錄已保存，可至「練習紀錄」查看。'
        : '本次練習結束。登入會員後可保存未來的練習。',
    );
    if (attempt)
      await refreshArticles().catch((error) =>
        notice(`練習已保存，但文章平均速度更新失敗：${error.message}`),
      );
  } finally {
    saving = false;
    if (running) {
      $('#stop').disabled = false;
      $('#typing').disabled = false;
      $('#typing').focus();
    }
  }
}
$('#start').addEventListener(
  'click',
  safe(async () => {
    if (running || !selected) return;
    $('#start').disabled = true;
    try {
      attempt = user
        ? await api('/attempts', 'POST', { articleId: selected.id })
        : null;
      tracker = chineseTracker(selected.content);
      composing = false;
      committedText = '';
      imeEnterHeld = false;
      started = performance.now();
      running = true;
      $('#typing').value = '';
      $('#typing').disabled = false;
      $('#stop').disabled = false;
      $('#practice-status').textContent = '練習中';
      paint();
      $('#typing').focus();
      notice('');
    } catch (error) {
      $('#start').disabled = false;
      throw error;
    }
  }),
);
$('#stop').addEventListener(
  'click',
  safe(() => finish($('#typing').value === selected.content)),
);
function readyToFinish() {
  return (
    running && !saving && !composing && $('#typing').value === selected.content
  );
}
$('#typing').addEventListener('compositionstart', () => {
  composing = true;
  $('#stop').disabled = true;
  if (running) $('#practice-status').textContent = '選字中';
});
$('#typing').addEventListener(
  'keydown',
  safe(async (event) => {
    if (!running || saving) return;
    if (event.key === 'Backspace') tracker.backspace();
    if (event.key !== 'Enter') return;
    // Some IMEs report keyCode 229 even after compositionend has fired.
    if (composing || event.isComposing || event.keyCode === 229) {
      imeEnterHeld = true;
      return;
    }
    if (readyToFinish()) {
      event.preventDefault();
      if (!imeEnterHeld && !event.repeat) await finish(true);
    }
  }),
);
$('#typing').addEventListener('keyup', (event) => {
  if (event.key === 'Enter') imeEnterHeld = false;
});
// Virtual keyboards may send a line-break input without a keydown event.
$('#typing').addEventListener(
  'beforeinput',
  safe(async (event) => {
    if (
      !['insertLineBreak', 'insertParagraph'].includes(event.inputType) ||
      event.isComposing ||
      !readyToFinish()
    )
      return;
    event.preventDefault();
    if (!imeEnterHeld) await finish(true);
  }),
);
async function typed(ime = false) {
  if (!running || saving) return;
  paint();
  if (composing) return;
  const elapsed = performance.now() - started;
  committedText = $('#typing').value;
  tracker.commit(committedText, elapsed, ime);
  showMetrics(elapsed);
  $('#practice-status').textContent = readyToFinish()
    ? '全文輸入完成，請按 Enter 結束'
    : '練習中';
}
$('#typing').addEventListener(
  'compositionend',
  safe(async () => {
    composing = false;
    if (running && !saving) $('#stop').disabled = false;
    await typed(true);
  }),
);
$('#typing').addEventListener(
  'input',
  safe(() => typed()),
);
for (const name of ['paste', 'drop'])
  $('#typing').addEventListener(name, (event) => {
    event.preventDefault();
    notice('請使用鍵盤輸入，練習區不接受貼上或拖放。');
  });
setInterval(() => {
  if (running && !saving) showMetrics(performance.now() - started);
}, 250);
window.addEventListener('beforeunload', (event) => {
  if (running) {
    event.preventDefault();
    event.returnValue = '';
  }
});
for (const button of document.querySelectorAll('[data-view]'))
  button.addEventListener(
    'click',
    safe(async () => {
      if (running || saving) {
        notice('請先停止並保存目前練習，再切換頁面。');
        return;
      }
      for (const view of document.querySelectorAll('.view'))
        view.hidden = view.id !== button.dataset.view;
      notice('');
      if (button.dataset.view === 'practice' && user) await refreshArticles();
      if (button.dataset.view === 'statistics') await loadTrend();
      if (button.dataset.view === 'history') {
        page = 0;
        await history();
      }
    }),
  );
$('#course').addEventListener('change', renderArticles);
$('#language').addEventListener('change', renderArticles);
for (const [selector, path, method] of [
  ['#login', '/auth/login', 'POST'],
  ['#register', '/auth/register', 'POST'],
  ['#profile', '/me', 'PUT'],
]) {
  $(selector).addEventListener(
    'submit',
    safe(async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        const result = await api(
          path,
          method,
          Object.fromEntries(new FormData(event.target)),
        );
        if (selector === '#register') {
          event.target.reset();
          notice('註冊成功，請使用 Email 與密碼登入。');
        } else {
          user = result;
          syncAccount();
          if (selector === '#login') {
            csrf = null;
            await refreshArticles();
            if (pendingArticleId != null && !running && !saving)
              await openArticle(pendingArticleId);
            else showView('practice');
          }
          notice(
            selector === '#login'
              ? '登入成功，可以開始練習了。'
              : '會員資料已更新。',
          );
        }
      } finally {
        button.disabled = false;
      }
    }),
  );
}
$('#logout').addEventListener(
  'click',
  safe(async () => {
    if (running || saving) {
      notice('請先停止並保存目前練習，再登出。');
      return;
    }
    await api('/auth/logout', 'POST');
    csrf = null;
    user = null;
    selected = null;
    pendingArticleId = null;
    $('#workspace').hidden = true;
    clearTrend();
    $('#history-list').replaceChildren();
    $('#login').reset();
    $('#profile').reset();
    $('#profile-email').textContent = '';
    syncAccount();
    notice('已登出。');
  }),
);
function historyArticles() {
  $('#history-article').replaceChildren(
    option('', '所有文章'),
    ...articles
      .filter(
        (a) =>
          !$('#history-course').value ||
          String(a.course_id) === $('#history-course').value,
      )
      .map((a) => option(a.id, a.title)),
  );
}
function speedText(mode, cpm) {
  if (cpm == null) return '尚無紀錄';
  return mode === 'zh'
    ? `${cpm.toFixed(1)} 字／分`
    : `${(cpm / 5).toFixed(1)} WPM（${cpm.toFixed(1)} CPM）`;
}
function clearStatistics() {
  for (const id of ['overall', 'period', 'courses', 'articles'])
    $(`#statistics-${id}`).replaceChildren();
}
function renderAverages(container, averages) {
  container.replaceChildren(
    ...averages.map((value) => {
      const card = document.createElement('div');
      card.className = 'statistics-card';
      const title = document.createElement('h3');
      title.textContent = value.mode === 'zh' ? '中打' : '英打';
      const speed = document.createElement('strong');
      speed.textContent = speedText(value.mode, value.average_cpm);
      const count = document.createElement('p');
      count.textContent = `${value.attempts} 次完成練習`;
      card.append(title, speed, count);
      return card;
    }),
  );
}
function renderGroups(container, groups) {
  container.replaceChildren();
  if (!groups.length) {
    const row = document.createElement('tr'),
      cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = '尚無符合條件的完成紀錄。';
    row.append(cell);
    container.append(row);
    return;
  }
  for (const group of groups) {
    const row = document.createElement('tr');
    for (const text of [
      group.title,
      ...group.averages.map(
        (value) =>
          `${speedText(value.mode, value.average_cpm)} ／ ${value.attempts} 次`,
      ),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    container.append(row);
  }
}
function statisticsArticles() {
  $('#statistics-article').replaceChildren(
    option('', '所有文章'),
    ...articles
      .filter(
        (a) =>
          !$('#statistics-course').value ||
          String(a.course_id) === $('#statistics-course').value,
      )
      .map((a) => option(a.id, a.title)),
  );
}
$('#statistics-course').addEventListener(
  'change',
  safe(async () => {
    statisticsArticles();
    await loadTrend();
  }),
);
$('#statistics-article').addEventListener('change', safe(loadTrend));
$('#statistics-refresh').addEventListener('click', safe(loadTrend));
function clearTrend() {
  clearStatistics();
  trendRequest++;
  $('#trend-chart').replaceChildren();
  $('#trend-days').replaceChildren();
  $('#trend-summary').textContent = '';
  $('#trend-status').textContent = '登入後即可查看每日速度。';
}
async function loadTrend() {
  const request = ++trendRequest;
  clearStatistics();
  $('#trend-chart').replaceChildren();
  $('#trend-days').replaceChildren();
  $('#trend-summary').textContent = '';
  if (!user) {
    $('#trend-status').textContent = '登入後即可查看每日速度。';
    return;
  }
  const date = $('#trend-date').value;
  if (!date || !$('#trend-date').checkValidity()) {
    $('#trend-status').textContent = '請選擇有效日期。';
    return;
  }
  $('#trend-status').textContent = '載入個人統計…';
  const params = new URLSearchParams({
    period: $('#trend-period').value,
    date,
    mode: $('#trend-mode').value,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if ($('#statistics-course').value)
    params.set('courseId', $('#statistics-course').value);
  if ($('#statistics-article').value)
    params.set('articleId', $('#statistics-article').value);
  try {
    const summary = await api(`/statistics?${params}`);
    if (request !== trendRequest || !user) return;
    renderAverages($('#statistics-overall'), summary.overall);
    renderAverages($('#statistics-period'), summary.averages);
    renderGroups($('#statistics-courses'), summary.courses);
    renderGroups($('#statistics-articles'), summary.articles);
    const all = $('#trend-period').value === 'all';
    for (const selector of [
      '#trend-previous',
      '#trend-next',
      '#trend-today',
      '#trend-date',
    ])
      $(selector).disabled = all;
    if (all) {
      $('#trend-status').textContent =
        '全部紀錄（符合種類與文章篩選）。選擇年、月、週或日查看趨勢。';
      return;
    }
    const trend = await api(`/attempts/daily?${params}`);
    if (request !== trendRequest || !user) return;
    $('#trend-status').textContent =
      `${trend.from} 至 ${trend.to}（${trend.zone}）${trend.attempts ? '' : '：此期間沒有練習紀錄。'}`;
    $('#trend-summary').textContent = trend.attempts
      ? `期間平均：${speedText(trend.mode, trend.average_cpm)} ｜ ${trend.attempts} 次練習 ｜ ${trend.days.filter((day) => day.attempts).length} 天有練習`
      : '';
    renderTrend($('#trend-chart'), $('#trend-days'), trend);
  } catch (error) {
    if (request === trendRequest)
      $('#trend-status').textContent =
        `載入失敗：${error.message}，請按「更新統計」重試。`;
  }
}
for (const selector of ['#trend-period', '#trend-date', '#trend-mode'])
  $(selector).addEventListener('change', safe(loadTrend));
for (const [selector, direction] of [
  ['#trend-previous', -1],
  ['#trend-next', 1],
])
  $(selector).addEventListener(
    'click',
    safe(async () => {
      if (!$('#trend-date').value || !$('#trend-date').checkValidity()) return;
      const next = shiftPeriod(
        $('#trend-date').value,
        $('#trend-period').value,
        direction,
      );
      if (next < '1900-01-01' || next > '9998-12-31') return;
      $('#trend-date').value = next;
      await loadTrend();
    }),
  );
$('#trend-today').addEventListener(
  'click',
  safe(async () => {
    $('#trend-date').value = localDate();
    await loadTrend();
  }),
);
async function history() {
  $('#history-list').replaceChildren();
  $('#previous').disabled = true;
  $('#next').disabled = true;
  $('#page-label').textContent = `第 ${page + 1} 頁`;
  if (!user) {
    notice('登入後即可查看個人練習紀錄。');
    return;
  }
  const params = new URLSearchParams({ page });
  if ($('#history-course').value)
    params.set('courseId', $('#history-course').value);
  if ($('#history-article').value)
    params.set('articleId', $('#history-article').value);
  const rows = await api(`/attempts?${params}`);
  if (!rows.length) $('#history-list').textContent = '目前沒有符合條件的紀錄。';
  for (const row of rows) {
    const detail = document.createElement('details');
    detail.className = 'record';
    const summary = document.createElement('summary');
    const state = {
      COMPLETED: '完成',
      ABANDONED: '中途停止',
      IN_PROGRESS: '進行中 / 未結束',
    }[row.status];
    summary.textContent = `${row.course_title} / ${row.article_title} · ${state} · ${new Date(row.started_at).toLocaleString()} · ${row.cpm?.toFixed(1) ?? '—'} CPM`;
    const info = document.createElement('p');
    info.textContent = `時間：${row.elapsed_ms == null ? '—' : duration(row.elapsed_ms)} ｜ WPM：${row.wpm?.toFixed(1) ?? '—'} ｜ 正確率：${row.accuracy?.toFixed(1) ?? '—'}% ｜ 結束：${row.finished_at ? new Date(row.finished_at).toLocaleString() : '尚未結束'}`;
    const original = document.createElement('p');
    original.textContent = `文章：${row.content_snapshot}`;
    const input = document.createElement('p');
    input.textContent = `輸入：${row.typed_text ?? '尚未送出'}`;
    detail.append(summary, info, original, input);
    $('#history-list').append(detail);
    if (row.scoring_mode === 'zh') {
      summary.textContent = summary.textContent.replace(
        'CPM',
        '字 / 分（含全形標點）',
      );
      info.textContent = `中打 ｜ 時間：${row.elapsed_ms == null ? '—' : duration(row.elapsed_ms)} ｜ 正確率：${row.accuracy?.toFixed(1) ?? '—'}% ｜ ${chineseSummaryText(row.chinese_metrics ? JSON.parse(row.chinese_metrics) : null)}`;
    }
  }
  $('#previous').disabled = page === 0;
  $('#next').disabled = rows.length < 20;
}
$('#history-course').addEventListener(
  'change',
  safe(async () => {
    page = 0;
    historyArticles();
    await history();
  }),
);
$('#history-article').addEventListener(
  'change',
  safe(async () => {
    page = 0;
    await history();
  }),
);
$('#refresh').addEventListener('click', safe(history));
$('#previous').addEventListener(
  'click',
  safe(async () => {
    page = Math.max(0, page - 1);
    await history();
  }),
);
$('#next').addEventListener(
  'click',
  safe(async () => {
    page++;
    await history();
  }),
);
async function init() {
  $('#trend-date').value = localDate();
  try {
    user = await api('/me');
  } catch {
    user = null;
  }
  [courses, articles] = await Promise.all([api('/courses'), api('/articles')]);
  $('#course').append(...courses.map((c) => option(c.id, c.title)));
  $('#history-course').replaceChildren(
    option('', '所有課程'),
    ...courses.map((c) => option(c.id, c.title)),
  );
  $('#statistics-course').replaceChildren(
    option('', '所有種類'),
    ...courses.map((c) => option(c.id, c.title)),
  );
  statisticsArticles();
  historyArticles();
  syncAccount();
}
init().catch((error) => notice(error.message));

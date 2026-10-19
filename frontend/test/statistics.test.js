import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as scoring from '../src/metrics.js';
import * as chart from '../src/history-chart.js';

async function setup() {
  class Element {
    value = '';
    textContent = '';
    hidden = false;
    disabled = false;
    children = [];
    handlers = {};
    elements = Object.fromEntries(
      ['birthday', 'phone', 'name', 'nickname'].map((key) => [
        key,
        { value: '' },
      ]),
    );
    addEventListener(name, handler) {
      this.handlers[name] = handler;
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = nodes;
    }
    setAttribute() {}
    checkValidity() {
      return true;
    }
    reset() {}
  }
  const nodes = new Map();
  const q = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  q('#trend-period').value = 'all';
  q('#trend-mode').value = 'zh';
  const nav = new Element();
  nav.dataset = { view: 'statistics' };
  const views = ['practice', 'statistics', 'history', 'account'].map((id) => {
    const node = q('#' + id);
    node.id = id;
    return node;
  });
  const average = (mode, cpm, attempts) => ({
    mode,
    average_cpm: cpm,
    average_wpm: mode === 'en' && cpm != null ? cpm / 5 : null,
    attempts,
  });
  let summary = {
    overall: [average('zh', 60, 3), average('en', 250, 2)],
    averages: [average('zh', 0, 1), average('en', null, 0)],
    courses: [
      {
        id: 1,
        title: '種類',
        averages: [average('zh', 0, 1), average('en', null, 0)],
      },
    ],
    articles: [
      {
        id: 1,
        title: '文章',
        averages: [average('zh', 0, 1), average('en', null, 0)],
      },
    ],
  };
  let defer = null;
  const calls = [];
  const context = vm.createContext({
    ...scoring,
    ...chart,
    URLSearchParams,
    Intl,
    document: {
      querySelector: q,
      querySelectorAll: (selector) =>
        selector === '.view' ? views : selector === '[data-view]' ? [nav] : [],
      createElement: () => new Element(),
      createElementNS: () => new Element(),
      createTextNode: (text) => ({ textContent: text }),
    },
    window: { addEventListener() {} },
    performance: { now: () => 0 },
    setInterval() {},
    fetch: async (path) => {
      calls.push(path);
      let data;
      if (path === '/api/me')
        data = { nickname: 'Tester', email: 'test@example.com' };
      else if (path === '/api/courses')
        data = [
          { id: 1, title: '種類' },
          { id: 2, title: '另一種類' },
        ];
      else if (path === '/api/articles')
        data = [
          { id: 1, course_id: 1, title: '文章' },
          { id: 2, course_id: 2, title: '另一文章' },
        ];
      else if (path.startsWith('/api/statistics?'))
        data = defer ? await defer : summary;
      else if (path.startsWith('/api/attempts/daily?'))
        data = {
          from: '2026-10-07',
          to: '2026-10-07',
          zone: 'Asia/Taipei',
          mode: 'zh',
          attempts: 0,
          average_cpm: null,
          days: [],
        };
      else if (path === '/api/csrf')
        data = { headerName: 'X-CSRF', token: 'fixture' };
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    },
  });
  vm.runInContext(
    (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(
      /^import\s[\s\S]*?;\r?\n/gm,
      '',
    ),
    context,
  );
  await new Promise((resolve) => setImmediate(resolve));
  return {
    q,
    calls,
    summary,
    open: () => nav.handlers.click(),
    change: () => q('#statistics-course').handlers.change(),
    empty: () => {
      summary = {
        ...summary,
        courses: [],
        articles: [],
        averages: [average('zh', null, 0), average('en', null, 0)],
      };
    },
    defer: (promise) => {
      defer = promise;
    },
  };
}

test('statistics shows both languages, preserves zero, and filters independently of record pagination', async () => {
  const app = await setup();
  const { q } = app;
  await app.open();
  assert.equal(q('#statistics').hidden, false);
  assert.equal(
    q('#statistics-overall').children[0].children[1].textContent,
    '60.0 字／分',
  );
  assert.equal(
    q('#statistics-overall').children[1].children[1].textContent,
    '50.0 WPM（250.0 CPM）',
  );
  assert.equal(
    q('#statistics-period').children[0].children[1].textContent,
    '0.0 字／分',
  );
  assert.equal(
    q('#statistics-period').children[1].children[1].textContent,
    '尚無紀錄',
  );
  assert.equal(q('#trend-date').disabled, true);
  assert.equal(
    app.calls.some((path) => path.startsWith('/api/attempts?')),
    false,
  );
  q('#statistics-course').value = '2';
  await app.change();
  assert.equal(q('#statistics-article').children.length, 2);
  assert.ok(app.calls.at(-1).includes('courseId=2'));
  q('#trend-period').value = 'day';
  await q('#trend-period').handlers.change();
  assert.equal(q('#trend-date').disabled, false);
  assert.ok(app.calls.at(-1).includes('/api/attempts/daily?period=day'));
  app.empty();
  q('#trend-period').value = 'all';
  await app.open();
  assert.equal(
    q('#statistics-articles').children[0].children[0].textContent,
    '尚無符合條件的完成紀錄。',
  );
});

test('logout clears statistics and ignores a pending response from the previous member', async () => {
  const app = await setup();
  await app.open();
  let finish;
  app.defer(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const loading = app.open();
  await new Promise((resolve) => setImmediate(resolve));
  await app.q('#logout').handlers.click();
  finish(app.summary);
  await loading;
  assert.equal(app.q('#statistics-overall').children.length, 0);
  assert.equal(app.q('#statistics-courses').children.length, 0);
  assert.match(app.q('#trend-status').textContent, /登入/);
});

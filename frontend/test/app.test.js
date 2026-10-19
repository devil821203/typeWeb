import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as scoring from '../src/metrics.js';
import * as chart from '../src/history-chart.js';

test('practice UI handles IME preview, guest completion, restart and English scoring', async () => {
  class Element {
    value = '';
    textContent = '';
    hidden = false;
    disabled = false;
    children = [];
    handlers = {};
    addEventListener(name, handler) {
      this.handlers[name] = handler;
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = nodes;
    }
    focus() {}
    scrollIntoView() {}
    reset() {}
  }
  const nodes = new Map();
  const q = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  let now = 0,
    tick;
  const articles = [
    { id: 1, language: 'zh', title: '中文', content: '你好', course_id: 1 },
    { id: 2, language: 'en', title: 'English', content: 'Hi', course_id: 1 },
  ];
  const context = vm.createContext({
    ...scoring,
    ...chart,
    document: {
      querySelector: q,
      querySelectorAll: () => [],
      createElement: () => new Element(),
      createTextNode: (text) => ({ textContent: text }),
    },
    window: { addEventListener() {} },
    performance: { now: () => now },
    setInterval: (callback) => {
      tick = callback;
    },
    fetch: async (path) => ({
      ok: path !== '/api/me',
      status: 401,
      text: async () =>
        JSON.stringify(
          path === '/api/articles'
            ? articles
            : path === '/api/courses'
              ? [{ id: 1, title: '課程' }]
              : articles.find((a) => path === `/api/articles/${a.id}`),
        ),
    }),
  });
  const source = await readFile(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  vm.runInContext(source.replace(/^import\s[\s\S]*?;\r?\n/gm, ''), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(q('#articles').children.length, 2);
  q('#language').value = 'zh';
  await q('#language').handlers.change();
  assert.equal(q('#articles').children.length, 1);
  await q('#articles').children[0].handlers.click();
  await q('#start').handlers.click();
  now = 1000;
  q('#typing').handlers.compositionstart();
  q('#typing').value = '妳';
  await q('#typing').handlers.input();
  tick();
  assert.equal(q('#cpm').textContent, '0.0');
  assert.equal(q('#stop').disabled, true);
  await q('#typing').handlers.compositionend();
  await q('#typing').handlers.input();
  assert.match(q('#chinese-stats').textContent, /選字錯誤：1 次/);
  q('#typing').handlers.keydown({ key: 'Backspace' });
  q('#typing').value = '';
  await q('#typing').handlers.input();
  q('#typing').handlers.compositionstart();
  q('#typing').value = '你好';
  now = 2000;
  await q('#typing').handlers.compositionend();
  assert.equal(
    q('#practice-status').textContent,
    '全文輸入完成，請按 Enter 結束',
  );
  await q('#typing').handlers.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(q('#typing').value, '你好');
  assert.equal(q('#practice-status').textContent, '練習完成');
  assert.equal(q('#wpm-stat').hidden, true);
  assert.match(q('#chinese-stats').textContent, /Backspace：1 次/);
  await q('#start').handlers.click();
  tick();
  assert.match(q('#chinese-stats').textContent, /選字錯誤：0 次/);
  await q('#stop').handlers.click();
  q('#language').value = 'en';
  await q('#language').handlers.change();
  await q('#articles').children[0].handlers.click();
  await q('#start').handlers.click();
  now = 62000;
  q('#typing').value = 'Hi';
  await q('#typing').handlers.input();
  assert.equal(
    q('#practice-status').textContent,
    '全文輸入完成，請按 Enter 結束',
  );
  await q('#typing').handlers.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(q('#cpm').textContent, '2.0');
  assert.equal(q('#wpm').textContent, '0.4');
  assert.equal(q('#wpm-stat').hidden, false);
  assert.equal(q('#chinese-stats').hidden, true);
});

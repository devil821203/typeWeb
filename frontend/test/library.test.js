import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as scoring from '../src/metrics.js';
import * as chart from '../src/history-chart.js';

async function setup(loggedIn = false) {
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
      this.textContent = '';
    }
    querySelector() {
      return new Element();
    }
    focus() {}
    scrollIntoView() {}
    reset() {}
  }
  const nodes = new Map(),
    calls = [];
  const q = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const views = ['practice', 'statistics', 'history', 'account'].map((id) => {
    const node = q('#' + id);
    node.id = id;
    return node;
  });
  const courses = [
    { id: 1, title: '英文基礎' },
    { id: 2, title: '中文日常' },
    { id: 3, title: '進階練習' },
  ];
  const articles = [
    {
      id: 1,
      language: 'en',
      course_id: 1,
      title: 'English free',
      content: 'Hi!',
      members_only: false,
      difficulty: 'beginner',
      character_count: 3,
    },
    {
      id: 2,
      language: 'en',
      course_id: 3,
      title: 'English member',
      content: 'Welcome!',
      members_only: true,
      difficulty: 'advanced',
      character_count: 8,
    },
    {
      id: 3,
      language: 'zh',
      course_id: 2,
      title: '中文免費',
      content: '你好。',
      members_only: false,
      difficulty: 'intermediate',
      character_count: 3,
    },
    {
      id: 4,
      language: 'zh',
      course_id: 2,
      title: '中文會員',
      content: '再見。',
      members_only: true,
      difficulty: 'intermediate',
      character_count: 3,
    },
    {
      id: 5,
      language: 'zh',
      course_id: 3,
      title: '中文進階',
      content: '進階。',
      members_only: true,
      difficulty: 'advanced',
      character_count: 3,
    },
  ];
  const member = { email: 'member@example.com', nickname: 'Member' };
  let session = loggedIn,
    defer = null;
  const context = vm.createContext({
    ...scoring,
    ...chart,
    document: {
      querySelector: q,
      querySelectorAll: (selector) => (selector === '.view' ? views : []),
      createElement: () => new Element(),
      createTextNode: (text) => ({ textContent: text }),
    },
    window: { addEventListener() {} },
    performance: { now: () => 0 },
    setInterval() {},
    FormData: class {
      *[Symbol.iterator]() {
        yield ['email', member.email];
        yield ['password', 'fixture'];
      }
    },
    fetch: async (path) => {
      calls.push(path);
      let data,
        status = 200;
      if (path === '/api/me') {
        status = session ? 200 : 401;
        data = member;
      } else if (path === '/api/courses') data = courses;
      else if (path === '/api/articles') {
        data = articles.map((article) => ({
          ...article,
          personal_average_cpm:
            session && [1, 2, 3].includes(article.id)
              ? article.id === 1
                ? 0
                : article.id === 2
                  ? 250
                  : 60
              : null,
          personal_attempts: session && article.id <= 3 ? 1 : 0,
        }));
        if (defer) {
          await defer;
          defer = null;
        }
      } else if (path === '/api/csrf')
        data = { headerName: 'X-CSRF', token: 'fixture' };
      else if (path === '/api/auth/login') {
        session = true;
        data = member;
      } else if (path === '/api/auth/logout') session = false;
      else if (path.startsWith('/api/articles/')) {
        data = articles.find((a) => path === `/api/articles/${a.id}`);
        if (!session && data.members_only) status = 403;
      }
      return {
        ok: status === 200,
        status,
        text: async () => JSON.stringify(data),
      };
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
    context,
    login: () =>
      q('#login').handlers.submit({ preventDefault() {}, target: q('#login') }),
    defer: (promise) => {
      defer = promise;
    },
  };
}

test('guest library separates free and member articles, and login continues the chosen member article', async () => {
  const { q, calls, login } = await setup();
  assert.equal(q('#articles').children.length, 2);
  assert.equal(q('#member-articles').children.length, 3);
  assert.equal(q('#guest-intro').hidden, false);
  assert.equal(q('#article-navigation').hidden, true);
  await q('#articles').children[0].handlers.click();
  assert.equal(q('#article-title').textContent, 'English free');
  q('#language').value = 'en';
  await q('#language').handlers.change();
  assert.equal(q('#articles').children.length, 1);
  assert.equal(q('#member-articles').children.length, 1);
  await q('#member-articles').children[0].handlers.click();
  assert.equal(q('#account').hidden, false);
  assert.equal(calls.includes('/api/articles/2'), false);
  await login();
  assert.equal(q('#article-title').textContent, 'English member');
  assert.equal(q('#article-list-title').textContent, '英打 · 進階練習');
  assert.equal(q('#guest-intro').hidden, true);
  assert.equal(q('#member-library').hidden, true);
  assert.match(
    q('#articles').children[0].children[1].children[2].textContent,
    /50.0 WPM/,
  );
});

test('member navigation filters both language and category and preserves empty and zero averages', async () => {
  const { q, context } = await setup(true);
  assert.equal(q('#article-list-title').textContent, '中打 · 中文日常');
  assert.equal(q('#articles').children.length, 2);
  const first = q('#articles').children[0];
  assert.equal(first.children[1].children[0].textContent, '字數：3');
  assert.equal(first.children[1].children[1].textContent, '難度：中級');
  assert.match(first.children[1].children[2].textContent, /60.0 字／分/);
  assert.match(
    q('#articles').children[1].children[1].children[2].textContent,
    /尚無紀錄/,
  );
  const groups = q('#member-navigation').children;
  assert.equal(groups[0].children[0].textContent, '中打');
  assert.equal(groups[1].children[0].textContent, '英打');
  await groups[0].children[2].handlers.click();
  assert.equal(q('#articles').children.length, 1);
  assert.equal(q('#articles').children[0].children[0].textContent, '中文進階');
  await q('#member-navigation').children[1].children[1].handlers.click();
  assert.equal(
    q('#articles').children[0].children[0].textContent,
    'English free',
  );
  assert.match(
    q('#articles').children[0].children[1].children[2].textContent,
    /0.0 WPM/,
  );
  vm.runInContext('running = true', context);
  await q('#member-navigation').children[0].children[1].handlers.click();
  assert.equal(
    q('#articles').children[0].children[0].textContent,
    'English free',
  );
  assert.match(q('#notice').textContent, /先停止/);
});

test('logout clears personal averages and an older article response cannot restore member content', async () => {
  const app = await setup(true);
  let release;
  app.defer(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const pending = vm.runInContext('refreshArticles()', app.context);
  await new Promise((resolve) => setImmediate(resolve));
  await app.q('#logout').handlers.click();
  release();
  await pending;
  assert.equal(app.q('#guest-intro').hidden, false);
  assert.equal(app.q('#article-navigation').hidden, true);
  assert.equal(app.q('#articles').children.length, 2);
  assert.equal(app.q('#member-articles').children.length, 3);
  assert.equal(
    vm.runInContext(
      'articles.every(a => a.personal_average_cpm === null)',
      app.context,
    ),
    true,
  );
});

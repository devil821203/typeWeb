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
    querySelector() {
      return new Element();
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
  const views = ['practice', 'history', 'account'].map((id) => {
    const node = q('#' + id);
    node.id = id;
    return node;
  });
  const member = {
    email: 'test@example.com',
    nickname: 'Test',
    birthday: '1995-01-01',
    phone: '0912345678',
    name: 'Test',
  };
  const article = {
    id: 4,
    language: 'zh',
    title: '會員限定',
    content: '你好。',
    course_id: 2,
    members_only: true,
  };
  let session = true,
    denial = false,
    failLogin = false;
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
      let status = 200,
        data;
      if (path === '/api/me') {
        status = session ? 200 : 401;
        data = member;
      } else if (path === '/api/csrf')
        data = { headerName: 'X-CSRF', token: 'fixture' };
      else if (path === '/api/auth/login') {
        session = !failLogin;
        status = failLogin ? 401 : 200;
        data = failLogin ? { message: 'Email 或密碼錯誤' } : member;
      } else if (path === '/api/articles') data = [article];
      else if (path === '/api/courses') data = [{ id: 2, title: '中文' }];
      else if (path === '/api/articles/4') {
        status = session && !denial ? 200 : 403;
        data = status === 200 ? article : { message: '請先登入會員' };
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
    expire: () => {
      session = false;
    },
    deny: () => {
      denial = true;
    },
    failLogin: () => {
      failLogin = true;
    },
    login: () =>
      q('#login').handlers.submit({ preventDefault() {}, target: q('#login') }),
  };
}

test('expired session clears stale member UI and re-login opens the requested member article', async () => {
  const app = await setup();
  const { q } = app;
  assert.match(q('#account-nav').textContent, /Test/);
  app.expire();
  await q('#articles').children[0].handlers.click();
  assert.equal(q('#account-nav').textContent, '登入 / 註冊');
  assert.equal(q('#account').hidden, false);
  assert.equal(q('#logout').hidden, true);
  assert.match(q('#notice').textContent, /重新登入/);
  assert.equal(q('#trend-chart').children.length, 0);
  await app.login();
  assert.equal(q('#article-title').textContent, '會員限定');
  assert.equal(q('#practice').hidden, false);
  assert.equal(q('#workspace').hidden, false);
  assert.equal(q('#start').disabled, false);
});
test('valid members can open restricted articles and unrelated 403 does not log them out', async () => {
  const app = await setup();
  const { q } = app;
  await q('#articles').children[0].handlers.click();
  assert.equal(q('#article-title').textContent, '會員限定');
  app.deny();
  await q('#articles').children[0].handlers.click();
  assert.match(q('#account-nav').textContent, /Test/);
  assert.equal(q('#logout').hidden, false);
});
test('wrong password retains login error without falsely claiming a successful login', async () => {
  const app = await setup();
  app.expire();
  await app.q('#articles').children[0].handlers.click();
  app.failLogin();
  await app.login();
  assert.equal(app.q('#notice').textContent, 'Email 或密碼錯誤');
  assert.equal(app.q('#account').hidden, false);
  assert.equal(app.q('#logout').hidden, true);
});

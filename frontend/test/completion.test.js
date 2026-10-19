import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as scoring from '../src/metrics.js';
import * as chart from '../src/history-chart.js';

async function practice(content) {
  class Element {
    value = '';
    children = [];
    handlers = {};
    textContent = '';
    disabled = false;
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
    focus() {}
    scrollIntoView() {}
    reset() {}
  }
  const nodes = new Map(),
    submissions = [];
  const q = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const article = {
    id: 1,
    title: 'Test',
    content,
    language: scoring.language(content),
    course_id: 1,
  };
  let now = 0,
    tick,
    fail = false;
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
    fetch: async (path, options) => {
      let data,
        status = 200;
      if (path === '/api/me') data = { nickname: 'Member' };
      else if (path === '/api/articles') data = [article];
      else if (path === '/api/articles/1') data = article;
      else if (path === '/api/courses') data = [{ id: 1, title: 'Test' }];
      else if (path === '/api/csrf')
        data = { headerName: 'X-CSRF', token: 'fixture' };
      else if (path === '/api/attempts') data = { id: 1 };
      else if (path === '/api/attempts/1') {
        submissions.push(JSON.parse(options.body));
        status = fail ? 500 : 200;
        data = fail
          ? { message: '保存失敗' }
          : {
              ...scoring.metrics(content, submissions.at(-1).typedText, now),
              elapsed_ms: now,
            };
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
  await q('#articles').children[0].handlers.click();
  await q('#start').handlers.click();
  const input = q('#typing');
  async function fire(type, properties = {}) {
    const event = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
      ...properties,
    };
    await input.handlers[type](event);
    return event;
  }
  return {
    q,
    input,
    submissions,
    fire,
    time: (value) => {
      now = value;
      tick();
    },
    fail: (value) => {
      fail = value;
    },
    type: async (text) => {
      input.value = text;
      await fire('input');
    },
  };
}

test('paragraph newlines remain input; only a fresh Enter after exact text submits without a newline', async () => {
  const p = await practice('Hi.\nBye!');
  await p.type('Hi.');
  assert.equal((await p.fire('keydown', { key: 'Enter' })).prevented, false);
  await p.type('Hi.\nBye?');
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.submissions.length, 0);
  await p.type('Hi.\nBye!');
  assert.equal(p.submissions.length, 0);
  assert.match(p.q('#practice-status').textContent, /請按 Enter/);
  p.time(5000);
  assert.equal(p.q('#elapsed').textContent, '0:05');
  await p.fire('keydown', { key: 'Enter', repeat: true });
  assert.equal(p.submissions.length, 0);
  assert.equal((await p.fire('keydown', { key: 'Enter' })).prevented, true);
  assert.deepEqual(p.submissions, [
    { typedText: 'Hi.\nBye!', completed: true, chineseMetrics: null },
  ]);
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.submissions.length, 1);
});
test('Enter confirming IME text cannot finish until it is released and pressed again', async () => {
  const p = await practice('你好');
  p.time(1000);
  await p.fire('compositionstart');
  p.input.value = '你好';
  await p.fire('keydown', { key: 'Enter', isComposing: true });
  await p.fire('compositionend');
  assert.equal(p.submissions.length, 0);
  assert.equal(
    (await p.fire('beforeinput', { inputType: 'insertLineBreak' })).prevented,
    true,
  );
  assert.equal(p.submissions.length, 0);
  await p.fire('keyup', { key: 'Enter' });
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.submissions.length, 1);
  assert.equal(p.submissions[0].typedText, '你好');
});
test('IME keyCode 229 after compositionend does not finish the attempt', async () => {
  const p = await practice('好');
  await p.fire('compositionstart');
  p.input.value = '好';
  await p.fire('compositionend');
  await p.fire('keydown', { key: 'Enter', keyCode: 229 });
  assert.equal(p.submissions.length, 0);
  await p.fire('keyup', { key: 'Enter' });
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.submissions.length, 1);
});
test('virtual keyboard return submits, and edits clear the ready prompt', async () => {
  const p = await practice('Hi');
  await p.type('Hi');
  await p.type('H');
  assert.equal(p.q('#practice-status').textContent, '練習中');
  assert.equal(
    (await p.fire('beforeinput', { inputType: 'insertLineBreak' })).prevented,
    false,
  );
  await p.type('Hi');
  assert.equal(
    (await p.fire('beforeinput', { inputType: 'insertParagraph' })).prevented,
    true,
  );
  assert.equal(p.submissions[0].typedText, 'Hi');
});
test('failed saving preserves text and allows a second Enter to retry', async () => {
  const p = await practice('Hi');
  p.fail(true);
  await p.type('Hi');
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.input.value, 'Hi');
  assert.equal(p.input.disabled, false);
  assert.equal(p.q('#notice').textContent, '保存失敗');
  p.fail(false);
  await p.fire('keydown', { key: 'Enter' });
  assert.equal(p.submissions.length, 2);
  assert.equal(p.q('#practice-status').textContent, '練習完成');
});

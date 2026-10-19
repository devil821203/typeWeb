import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftPeriod, chartPoints, renderTrend } from '../src/history-chart.js';

test('calendar navigation handles month ends, leap years and year boundaries', () => {
  assert.equal(shiftPeriod('2024-02-28', 'day', 1), '2024-02-29');
  assert.equal(shiftPeriod('2026-01-01', 'day', -1), '2025-12-31');
  assert.equal(shiftPeriod('2024-01-31', 'month', 1), '2024-02-01');
  assert.equal(shiftPeriod('2024-02-29', 'year', 1), '2025-02-01');
  assert.equal(shiftPeriod('2026-01-01', 'week', -1), '2025-12-25');
});
test('chart preserves empty dates and real zero speed', () => {
  const points = chartPoints([
    { average_cpm: 30 },
    { average_cpm: null },
    { average_cpm: 0 },
  ]);
  assert.equal(points[0].y, 50);
  assert.equal(points[1].y, null);
  assert.equal(points[2].y, 240);
  assert.ok(
    chartPoints([{ average_cpm: 0 }]).every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  );
});
test('rendering leaves gaps and exposes daily values through focus and a table', () => {
  class Element {
    children = [];
    attrs = {};
    handlers = {};
    textContent = '';
    constructor(tag) {
      this.tag = tag;
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = nodes;
    }
    setAttribute(key, value) {
      this.attrs[key] = value;
    }
    addEventListener(key, handler) {
      this.handlers[key] = handler;
    }
  }
  const original = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
  };
  try {
    const container = new Element('div'),
      table = new Element('tbody');
    renderTrend(container, table, {
      from: '2026-09-14',
      to: '2026-09-16',
      mode: 'zh',
      days: [
        { date: '2026-09-14', average_cpm: 30, attempts: 2 },
        { date: '2026-09-15', average_cpm: null, attempts: 0 },
        { date: '2026-09-16', average_cpm: 0, attempts: 1 },
      ],
    });
    const svg = container.children[0];
    assert.equal(
      svg.children.find((node) => node.tag === 'path').attrs.d.includes('L'),
      false,
    );
    const dots = svg.children.filter((node) => node.tag === 'circle');
    assert.equal(dots.length, 2);
    dots[0].handlers.focus();
    assert.match(container.children[1].textContent, /2026-09-14.*30.0.*2 次/);
    assert.equal(table.children[1].children[1].textContent, '無練習');
    assert.equal(table.children[2].children[1].textContent, '0.0');
    renderTrend(container, table, {
      from: '2026-09-14',
      to: '2026-09-14',
      mode: 'en',
      days: [{ date: '2026-09-14', average_cpm: 250, attempts: 1 }],
    });
    assert.equal(table.children[0].children[1].textContent, '50.0');
    assert.match(container.children[0].attrs['aria-label'], /WPM/);
  } finally {
    globalThis.document = original;
  }
});

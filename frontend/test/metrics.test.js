import test from 'node:test';
import assert from 'node:assert/strict';
import {
  metrics,
  duration,
  language,
  chineseTracker,
  chineseScorable,
} from '../src/metrics.js';
test('scores mistakes and extra characters', () => {
  assert.deepEqual(metrics('abc', 'axcd', 60000), {
    cpm: 2,
    wpm: 0.4,
    accuracy: 50,
  });
});
test('counts Unicode code points and empty input', () => {
  assert.equal(metrics('你🌞', '你🌞', 60000).cpm, 2);
  assert.equal(metrics('a', '', 0).accuracy, 0);
});
test('formats long durations', () => {
  assert.equal(duration(125000), '2:05');
});

test('Chinese CPM includes fullwidth punctuation and excludes English and emoji', () => {
  assert.equal(language('你好，Hi'), 'zh');
  assert.equal(language('Hi!'), 'en');
  assert.equal(metrics('你𠀀，A🌞', '你𠀀，A🌞', 60000, 'zh').cpm, 3);
  assert.equal(metrics('你，', '你。', 60000, 'zh').accuracy, 50);
  assert.equal(metrics('你，', '', 0, 'zh').cpm, 0);
});
test('committed IME errors survive correction and duplicate input does not count twice', () => {
  const tracker = chineseTracker('你好世界');
  tracker.commit('妳好', 1000, true);
  tracker.commit('妳好', 1001);
  tracker.backspace();
  tracker.commit('', 2000);
  tracker.commit('你好', 3000, true);
  tracker.commit('妳好', 4000, true);
  const result = tracker.summary(5000);
  assert.equal(result.backspaces, 1);
  assert.equal(result.selectionErrors, 2);
  assert.equal(result.frequentWords[0].count, 2);
  assert.equal(result.declinePercent, null);
});
test('speed compares complete windows, includes idle time, and resets per attempt', () => {
  const tracker = chineseTracker('你好世界');
  tracker.commit('你好', 1000, true);
  tracker.commit('你好世', 16000, true);
  assert.equal(tracker.summary(29999).declinePercent, null);
  assert.deepEqual(
    [
      tracker.summary(30000).firstCpm,
      tracker.summary(30000).lastCpm,
      tracker.summary(30000).declinePercent,
    ],
    [8, 4, 50],
  );
  assert.equal(tracker.summary(45000).declinePercent, 100);
  assert.equal(chineseTracker('你好').summary(30000).declinePercent, null);
});
test('cancelled composition and deleting text are not selection errors', () => {
  const tracker = chineseTracker('你好');
  tracker.commit('你', 1000, true);
  tracker.commit('你', 2000, true);
  tracker.commit('', 3000, true);
  assert.equal(tracker.summary(3000).selectionErrors, 0);
});

test('Chinese punctuation counts in both CPM and interval speed, with exact width matching', () => {
  const punctuation = '，。！？；：、（）「」『』【】〔〕［］｛｝〈〉《》—…“”';
  for (const char of punctuation)
    assert.equal(chineseScorable(char), true, char);
  for (const char of ',.!? A１　🌞')
    assert.equal(chineseScorable(char), false, char);
  assert.equal(metrics('你，', '你,', 60000, 'zh').cpm, 1);
  assert.equal(metrics('你，', '你,', 60000, 'zh').accuracy, 50);
  const tracker = chineseTracker('你，。');
  tracker.commit('你，', 1000, true);
  tracker.commit('你，。', 16000, true);
  assert.equal(tracker.summary(30000).firstCpm, 8);
  assert.equal(tracker.summary(30000).lastCpm, 4);
  assert.equal(tracker.summary(30000).declinePercent, 50);
});
test('English punctuation retains CPM, WPM and exact matching', () => {
  assert.deepEqual(metrics('Hi, world!', 'Hi, world!', 60000), {
    cpm: 10,
    wpm: 2,
    accuracy: 100,
  });
  assert.deepEqual(metrics('Hi!', 'Hi?', 60000), {
    cpm: 2,
    wpm: 0.4,
    accuracy: 200 / 3,
  });
});

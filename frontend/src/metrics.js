// Chinese punctuation includes CJK/fullwidth punctuation and common typographic marks.
export function chineseScorable(char) {
  const code = char.codePointAt(0);
  return (
    /\p{Script=Han}/u.test(char) ||
    (/\p{P}/u.test(char) &&
      ((code >= 0x3000 && code <= 0x303f) ||
        (code >= 0xff01 && code <= 0xff60) ||
        '—–…‧‘’“”'.includes(char)))
  );
}
export function language(expected) {
  return /\p{Script=Han}/u.test(expected) ? 'zh' : 'en';
}
export function metrics(expected, typed, milliseconds, mode = 'en') {
  const target = Array.from(expected),
    input = Array.from(typed);
  const correct = input.reduce(
    (sum, char, i) => sum + Number(char === target[i]),
    0,
  );
  const chineseCorrect = input.reduce(
    (sum, char, i) => sum + Number(char === target[i] && chineseScorable(char)),
    0,
  );
  const cpm =
    ((mode === 'zh' ? chineseCorrect : correct) * 60000) /
    Math.max(1, milliseconds);
  return {
    cpm,
    wpm: cpm / 5,
    accuracy: input.length ? (correct * 100) / input.length : 0,
  };
}

// Observe committed edits only; composition previews never count as mistakes.
export function chineseTracker(expected) {
  const target = Array.from(expected),
    errors = new Map(),
    buckets = new Map();
  const words = [];
  for (const part of new Intl.Segmenter('zh', { granularity: 'word' }).segment(
    expected,
  )) {
    const start = Array.from(expected.slice(0, part.index)).length;
    for (let i = start; i < start + Array.from(part.segment).length; i++)
      words[i] = part.segment;
  }
  let previous = [],
    backspaces = 0,
    selectionErrors = 0;
  return {
    backspace() {
      backspaces++;
    },
    commit(text, elapsed, ime = false) {
      const next = Array.from(text);
      let start = 0,
        oldEnd = previous.length,
        end = next.length;
      while (start < oldEnd && start < end && previous[start] === next[start])
        start++;
      while (
        oldEnd > start &&
        end > start &&
        previous[oldEnd - 1] === next[end - 1]
      ) {
        oldEnd--;
        end--;
      }
      const wrongWords = new Set();
      let wrong = false,
        correct = 0;
      for (let i = start; i < end; i++) {
        if (next[i] !== target[i]) {
          wrong = true;
          if (words[i] && /\p{Script=Han}/u.test(words[i]))
            wrongWords.add(words[i]);
        } else if (chineseScorable(next[i])) correct++;
      }
      if (ime && wrong) selectionErrors++;
      for (const word of wrongWords)
        errors.set(word, (errors.get(word) || 0) + 1);
      const bucket = Math.floor(elapsed / 15000);
      buckets.set(bucket, (buckets.get(bucket) || 0) + correct);
      previous = next;
    },
    summary(elapsed) {
      const complete = Math.floor(elapsed / 15000);
      const firstCpm = (buckets.get(0) || 0) * 4;
      const lastCpm = (buckets.get(complete - 1) || 0) * 4;
      return {
        backspaces,
        selectionErrors,
        frequentWords: [...errors]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
          .slice(0, 5)
          .map(([word, count]) => ({ word, count })),
        firstCpm: complete >= 2 ? firstCpm : null,
        lastCpm: complete >= 2 ? lastCpm : null,
        declinePercent:
          complete >= 2 && firstCpm > 0
            ? ((firstCpm - lastCpm) * 100) / firstCpm
            : null,
      };
    },
  };
}
export function chineseSummaryText(summary) {
  if (!summary) return '未記錄中文分析';
  const trend =
    summary.declinePercent == null
      ? '資料不足（需至少 30 秒且首段有輸入）'
      : summary.declinePercent > 0
        ? `下降 ${summary.declinePercent.toFixed(1)}%`
        : '未下降';
  return `Backspace：${summary.backspaces} 次 ｜ 選字錯誤：${summary.selectionErrors} 次 ｜ 最常打錯的詞：${summary.frequentWords.map((x) => `${x.word}（${x.count} 次）`).join('、') || '無'} ｜ 連續輸入速度：${trend}`;
}
export function duration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

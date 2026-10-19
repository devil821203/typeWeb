export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftPeriod(date, period, direction) {
  const value = new Date(`${date}T12:00:00`);
  if (period === 'day') value.setDate(value.getDate() + direction);
  else if (period === 'week') value.setDate(value.getDate() + direction * 7);
  else {
    value.setDate(1);
    if (period === 'month') value.setMonth(value.getMonth() + direction);
    else value.setFullYear(value.getFullYear() + direction);
  }
  return localDate(value);
}
export function chartPoints(days) {
  const max = Math.max(1, ...days.map((day) => day.average_cpm ?? 0));
  return days.map((day, i) => ({
    ...day,
    x: 64 + (i * 796) / Math.max(1, days.length - 1),
    y: day.average_cpm == null ? null : 240 - (day.average_cpm / max) * 190,
  }));
}
export function renderTrend(container, table, trend) {
  container.replaceChildren();
  table.replaceChildren();
  const unit = trend.mode === 'zh' ? '字／分（含全形標點）' : 'WPM';
  const divisor = trend.mode === 'en' ? 5 : 1;
  trend = {
    ...trend,
    days: trend.days.map((day) => ({
      ...day,
      average_cpm: day.average_cpm == null ? null : day.average_cpm / divisor,
    })),
  };
  const points = chartPoints(trend.days);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 900 290');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${trend.from} 至 ${trend.to} 每日平均打字速度，單位 ${unit}。完整數值見下方每日資料。`,
  );
  function draw(tag, attrs, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  }
  const max = Math.max(1, ...trend.days.map((day) => day.average_cpm ?? 0));
  for (let i = 0; i <= 4; i++) {
    const y = 240 - (i * 190) / 4;
    draw('line', { x1: 64, x2: 860, y1: y, y2: y, stroke: '#dfe5dc' });
    draw(
      'text',
      { x: 56, y: y + 4, 'text-anchor': 'end', 'font-size': 12 },
      ((max * i) / 4).toFixed(1),
    );
  }
  let path = '',
    connected = false;
  for (const point of points) {
    if (point.y == null) {
      connected = false;
      continue;
    }
    path += `${connected ? 'L' : 'M'}${point.x},${point.y} `;
    connected = true;
  }
  draw('path', { d: path, fill: 'none', stroke: '#315d43', 'stroke-width': 2 });
  const selected = document.createElement('p');
  selected.textContent = '點選圖上的日期，查看當日平均與練習次數。';
  for (const [index, point] of points.entries()) {
    if (point.y != null) {
      const label = `${point.date}：${point.average_cpm.toFixed(1)} ${unit}，${point.attempts} 次練習`;
      const circle = draw('circle', {
        cx: point.x,
        cy: point.y,
        r: points.length > 31 ? 3 : 5,
        fill: '#315d43',
        tabindex: 0,
        role: 'button',
        'aria-label': label,
      });
      const title = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'title',
      );
      title.textContent = label;
      circle.append(title);
      for (const event of ['click', 'focus', 'mouseenter'])
        circle.addEventListener(event, () => {
          selected.textContent = label;
        });
      circle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selected.textContent = label;
        }
      });
    }
    if (
      index === 0 ||
      index === points.length - 1 ||
      index % Math.ceil(points.length / 6) === 0
    ) {
      draw(
        'text',
        { x: point.x, y: 270, 'text-anchor': 'middle', 'font-size': 12 },
        point.date.slice(5),
      );
    }
    const row = document.createElement('tr');
    for (const text of [
      point.date,
      point.average_cpm == null ? '無練習' : point.average_cpm.toFixed(1),
      String(point.attempts),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    table.append(row);
  }
  container.append(svg, selected);
}

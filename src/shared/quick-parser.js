(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YanXuQuickParser = api;
})(typeof window !== 'undefined' ? window : globalThis, function createParser() {
  const DAY_MS = 86400000;

  function startOfDay(value) {
    const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(value, count) {
    const date = startOfDay(value);
    date.setDate(date.getDate() + count);
    return date;
  }

  function mondayOf(value) {
    const date = startOfDay(value);
    const weekday = date.getDay() || 7;
    return addDays(date, 1 - weekday);
  }

  function inferMonthDay(yearText, month, day, now) {
    let year = yearText ? Number(yearText) : now.getFullYear();
    let result = new Date(year, month - 1, day);
    if (result.getMonth() !== month - 1 || result.getDate() !== day) return null;
    if (!yearText && result < startOfDay(now)) result = new Date(year + 1, month - 1, day);
    return result;
  }

  function extractDate(input, now) {
    let match = input.match(/大后天|后天|明天|明日|今天|今日/);
    if (match) {
      const offsets = { '大后天': 3, '后天': 2, '明天': 1, '明日': 1, '今天': 0, '今日': 0 };
      return { date: addDays(now, offsets[match[0]]), text: match[0], index: match.index };
    }

    match = input.match(/(?:(下下|下|本|这)?(?:周|星期|礼拜))([一二三四五六日天])/);
    if (match) {
      const weekMap = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 };
      const prefix = match[1];
      let date;
      if (prefix) {
        const weekOffset = prefix === '下下' ? 2 : prefix === '下' ? 1 : 0;
        date = addDays(mondayOf(now), weekOffset * 7 + weekMap[match[2]]);
      } else {
        const target = weekMap[match[2]] + 1;
        const current = now.getDay() || 7;
        date = addDays(now, (target - current + 7) % 7);
      }
      return { date, text: match[0], index: match.index };
    }

    match = input.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
    if (match) {
      const date = inferMonthDay(match[1], Number(match[2]), Number(match[3]), now);
      if (date) return { date, text: match[0], index: match.index };
    }

    match = input.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?!\d)/);
    if (match) {
      const raw = `${match[1]}/${match[2]}`;
      const date = inferMonthDay(null, Number(match[1]), Number(match[2]), now);
      if (date) return { date, text: raw, index: match.index + match[0].indexOf(raw) };
    }
    return null;
  }

  function extractTime(input) {
    let match = input.match(/(?:(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚))?\s*([01]?\d|2[0-3])\s*(?:点|时)(?:\s*(半|([0-5]?\d)\s*分?))?/);
    if (match) {
      let hour = Number(match[2]);
      const period = match[1];
      const minute = match[3] === '半' ? 30 : Number(match[4] || 0);
      if (['凌晨', '早上', '上午'].includes(period) && hour === 12) hour = 0;
      if (period === '中午' && hour < 11) hour += 12;
      if (['下午', '傍晚', '晚上', '今晚'].includes(period) && hour < 12) hour += 12;
      return { hour, minute, text: match[0], index: match.index };
    }

    match = input.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
    if (match) {
      const raw = `${match[1]}:${match[2]}`;
      return { hour: Number(match[1]), minute: Number(match[2]), text: raw, index: match.index + match[0].indexOf(raw) };
    }
    return null;
  }

  function cleanTitle(input, matches) {
    const chars = [...input];
    matches.filter(Boolean).sort((a, b) => b.index - a.index).forEach((item) => {
      chars.splice(item.index, [...item.text].length, ' ');
    });
    return chars.join('').replace(/\s+/g, ' ').replace(/^[\s,，。；;：:、-]+|[\s,，。；;：:、-]+$/g, '');
  }

  function parse(input, now = new Date()) {
    const original = String(input || '').trim();
    const dateMatch = extractDate(original, now);
    const timeMatch = extractTime(original);
    if (!dateMatch && !timeMatch) {
      return { title: original, scheduleKind: 'inbox', start: null, recognizedDate: false, recognizedTime: false };
    }
    const day = startOfDay(dateMatch ? dateMatch.date : now);
    if (timeMatch) day.setHours(timeMatch.hour, timeMatch.minute, 0, 0);
    return {
      title: cleanTitle(original, [dateMatch, timeMatch]) || original,
      scheduleKind: timeMatch ? 'fixed' : 'day',
      start: day.toISOString(),
      recognizedDate: Boolean(dateMatch),
      recognizedTime: Boolean(timeMatch)
    };
  }

  return { parse, startOfDay, addDays, mondayOf, DAY_MS };
});

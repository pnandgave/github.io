/* Turn spoken date/time words into real dates. Done in code, never by the model (same rules as the laptop Hub).
   "Friday" = next Friday after today (said on a Friday: next week's). "this Friday" = this week's. "next Friday" = next week's.
   "12/10" = 12 October (DD/MM). Returns a local Date at 00:00, or null. */
(function (root) {
  const WD = {monday:0,mon:0,tuesday:1,tue:1,tues:1,wednesday:2,wed:2,thursday:3,thu:3,thur:3,thurs:3,friday:4,fri:4,saturday:5,sat:5,sunday:6,sun:6};
  const MO = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const byLen = o => Object.keys(o).sort((a, b) => b.length - a.length).join('|');
  const WDR = byLen(WD), MOR = byLen(MO);
  const day = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getMonth() === m - 1 && x.getDate() === d ? x : null; };
  const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const wday = d => (d.getDay() + 6) % 7;                                   // Monday = 0
  function future(today, m, d, y) {
    let x = day(y || today.getFullYear(), m, d);
    if (!x) return null;
    if (!y && x < today) x = day(today.getFullYear() + 1, m, d);
    return x;
  }
  function resolveDate(words, now) {
    if (!words) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const w = (' ' + words.toLowerCase().replace(/[,.]/g, ' ') + ' ').replace(/\s+/g, ' ');
    let m;
    if (/\bday after tomorrow\b/.test(w)) return add(today, 2);
    if (/\b(tomorrow|tmrw|tmr)\b/.test(w)) return add(today, 1);
    if (/\b(today|tonight|this evening|this morning|this afternoon)\b/.test(w)) return today;
    if ((m = w.match(/\bin (\d+|a|one|two|three) (day|days|week|weeks)\b/))) {
      const n = {a:1, one:1, two:2, three:3}[m[1]] || parseInt(m[1], 10);
      return add(today, n * (m[2].startsWith('week') ? 7 : 1));
    }
    if ((m = w.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return day(+m[1], +m[2], +m[3]);
    if ((m = w.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
      return future(today, +m[2], +m[1], y);
    }
    if ((m = w.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MOR})\\b(?: (\\d{4}))?`)))) return future(today, MO[m[2]], +m[1], m[3] ? +m[3] : null);
    if ((m = w.match(new RegExp(`\\b(${MOR}) (\\d{1,2})(?:st|nd|rd|th)?\\b(?: (\\d{4}))?`)))) return future(today, MO[m[1]], +m[2], m[3] ? +m[3] : null);
    const monday = add(today, -wday(today));
    if (/\bnext week\b/.test(w)) return add(monday, 7);
    if (/\b(end of (the )?week|eow)\b/.test(w)) return wday(today) <= 4 ? add(monday, 4) : add(monday, 11);
    if (/\b(this )?weekend\b/.test(w)) return wday(today) <= 5 ? add(monday, 5) : add(monday, 12);
    if ((m = w.match(new RegExp(`\\b(this|next|coming)? ?(${WDR})\\b`)))) {
      const target = WD[m[2]], mod = m[1];
      if (mod === 'this') return add(monday, target);
      if (mod === 'next') return add(monday, 7 + target);
      return add(today, ((target - wday(today)) % 7 + 7) % 7 || 7);
    }
    return null;
  }
  /* "5 pm", "5:30pm", "17:00", "at 9", "noon" -> {h, m} or null. A bare hour 1-6 is read as afternoon (pm). */
  function resolveTime(words) {
    if (!words) return null;
    const w = ' ' + words.toLowerCase().replace(/\./g, '') + ' ';
    if (/\bnoon\b|\bmidday\b/.test(w)) return {h: 12, m: 0};
    let m = w.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) { let h = +m[1] % 12; if (m[3] === 'pm') h += 12; return h < 24 && +(m[2] || 0) < 60 ? {h, m: +(m[2] || 0)} : null; }
    m = w.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return {h: +m[1], m: +m[2]};
    m = w.match(/\bat (\d{1,2})\b/);
    if (m && +m[1] <= 23) { let h = +m[1]; if (h >= 1 && h <= 6) h += 12; return {h, m: 0}; }
    return null;
  }
  const api = {resolveDate, resolveTime};
  if (typeof module !== 'undefined') module.exports = api; else root.JDates = api;
})(this);

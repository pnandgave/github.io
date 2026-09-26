/* Build the 'today' view from Google Calendar events and Google Tasks (same logic as the laptop Hub's planner.py). */
(function (root) {
  const PRIO = {P1: 0, P2: 1, P3: 2};
  const pad = n => String(n).padStart(2, '0');
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (a, b) => Math.round((dayOnly(a) - dayOnly(b)) / 86400000);
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKL = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = t => t[0] + t[1] / 60;                                       // [h, m] -> hours
  const fmt = t => `${pad(t[0])}:${pad(t[1])}`;

  function taskFromGoogle(listTitle, listId, t) {
    const notes = t.notes || '';
    const p = notes.match(/\bP([123])\b/), m = notes.match(/(\d+)\s*min/);
    const due = t.due ? new Date(+t.due.slice(0, 4), +t.due.slice(5, 7) - 1, +t.due.slice(8, 10)) : null;
    return {list_title: listTitle, list_id: listId, id: t.id, title: (t.title || '').trim() || '(untitled)', due,
            priority: p ? 'P' + p[1] : 'P2', minutes: m ? +m[1] : null, done: t.status === 'completed'};
  }

  function dueWords(due, today) {
    if (!due) return 'no date';
    const d = days(due, today);
    if (d < 0) return d < -1 ? 'overdue' : 'due yesterday';
    if (d === 0) return 'due today';
    if (d === 1) return 'due tomorrow';
    if (d < 7) return 'due ' + WEEK[due.getDay()];
    return `due ${due.getDate()} ${MON[due.getMonth()]}`;
  }

  function sortKey(a, b, today) {
    const ua = a.due && a.due <= today ? 0 : 1, ub = b.due && b.due <= today ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const pa = PRIO[a.priority] ?? 1, pb = PRIO[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.due ? +a.due : Infinity, db = b.due ? +b.due : Infinity;
    if (da !== db) return da - db;
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  }

  function buildToday(now, events, openTasks, doneToday, rules, status) {
    const today = dayOnly(now);
    const w0 = hh(rules.day_window[0]), w1 = hh(rules.day_window[1]), span = Math.max(1, w1 - w0);
    const nowH = now.getHours() + now.getMinutes() / 60;
    const pos = h => Math.max(0, Math.min(1, (h - w0) / span));

    const timed = [], allday = [];
    for (const ev of events) {
      if (ev.status === 'cancelled' || (ev.description || '').includes('#jarvis-brief')) continue;   // brief notifications are not appointments
      const title = (ev.summary || '(no title)').trim();
      if (!ev.start || !ev.start.dateTime) { allday.push(title); continue; }
      timed.push({s: new Date(ev.start.dateTime), e: new Date(ev.end.dateTime), title});
    }
    timed.sort((a, b) => a.s - b.s);
    const blocks = [];
    for (const {s, e, title} of timed) {
      const sh = days(s, today) === 0 ? s.getHours() + s.getMinutes() / 60 : w0;
      const eh = days(e, today) === 0 ? e.getHours() + e.getMinutes() / 60 : w1;
      if (eh <= w0 || sh >= w1) continue;
      blocks.push({label: title, left: pos(sh), width: Math.max(0.004, pos(eh) - pos(sh)), kind: e <= now ? 'done' : 'task'});
    }
    const band = (t, label, kind) => ({label, left: pos(hh(t[0])), width: pos(hh(t[1])) - pos(hh(t[0])), kind});
    const bands = [band(rules.college, 'College', 'college'), band(rules.family_time, 'Family time', 'prot')];
    const ticks = [];
    for (let h = Math.floor(w0); h <= Math.floor(w1); h += 3) ticks.push({label: `${pad(h)}:00`, left: pos(h)});

    const openSorted = [...openTasks].sort((a, b) => sortKey(a, b, today));
    let top = openSorted.slice(0, 3);
    if (top.length < 3) top = top.concat(doneToday.slice(0, 3 - top.length));
    const top3 = top.map((t, i) => {
      const meta = [t.list_title, t.done ? 'done today' : dueWords(t.due, today)];
      if (t.minutes && !t.done) meta.push(`${t.minutes} min`);
      return {n: pad(i + 1), title: t.title, tag: t.done ? 'DONE' : t.priority, meta: meta.join(' · '), done: t.done, list_id: t.list_id, task_id: t.id};
    });
    const dueNow = openTasks.filter(t => t.due && t.due <= today);
    const tasksArc = {done: doneToday.length, total: doneToday.length + dueNow.length};

    const streams = rules.workstreams.map(ws => {
      const mine = openSorted.filter(t => t.list_title === ws);
      const next = mine.length ? mine[0].title + (mine[0].due ? ' · ' + dueWords(mine[0].due, today) : '') : 'No open tasks';
      return {name: ws.toUpperCase(), next, count: mine.length};
    });

    const upcoming = timed.filter(x => x.s > now), ongoing = timed.filter(x => x.s <= now && now < x.e);
    let next;
    if (ongoing.length) {
      const {e, title} = ongoing[0];
      next = {kind: 'event', label: `NOW · UNTIL ${hm(e)}`, title, meta: `Calendar · ${Math.floor((e - now) / 60000)} min left`};
    } else if (upcoming.length) {
      const {s, e, title} = upcoming[0], mins = Math.floor((s - now) / 60000);
      const when = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)} h ${pad(mins % 60)} min`;
      next = {kind: 'event', label: `NEXT · ${hm(s)}`, title, meta: `Calendar · ${Math.floor((e - s) / 60000)} min · ${when}`};
    } else if (openSorted.length) {
      const t = openSorted[0];
      next = {kind: 'task', label: 'TOP TASK', title: t.title, meta: [t.list_title, dueWords(t.due, today), t.minutes ? `${t.minutes} min` : ''].filter(Boolean).join(' · '), list_id: t.list_id, task_id: t.id};
    } else next = {kind: 'none', label: 'ALL CLEAR', title: 'Nothing scheduled', meta: 'Say or type a task to add one'};

    const h = now.getHours(), greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = rules.name || 'Pankaj';
    const brief = [`${greeting}, ${name}.`];
    brief.push(upcoming.length ? `${upcoming.length} more calendar item${upcoming.length !== 1 ? 's' : ''} today; next is ${upcoming[0].title} at ${hm(upcoming[0].s)}.` : 'No more calendar items today.');
    if (openSorted.length) brief.push(`Top priority: ${openSorted[0].title}, ${dueWords(openSorted[0].due, today)}.`);
    if (allday.length) brief.push('All day: ' + allday.slice(0, 3).join(', ') + '.');
    if (nowH < hh(rules.family_time[0])) brief.push(`Family time from ${fmt(rules.family_time[0])} is protected.`);

    return {
      clock: hm(now), date: `${WEEKL[now.getDay()]} · ${pad(now.getDate())} ${MON[now.getMonth()].toUpperCase()} ${now.getFullYear()}`,
      greeting: `${greeting}, ${name}.`, window: `${fmt(rules.day_window[0])}–${fmt(rules.day_window[1])}`,
      strip_head: `COLLEGE ${fmt(rules.college[0])}–${fmt(rules.college[1])} · FAMILY ${fmt(rules.family_time[0])}–${fmt(rules.family_time[1])}`,
      day_frac: Math.round(pos(nowH) * 1000) / 1000, now_left: pos(nowH), bands, blocks, ticks, allday, next, top3,
      tasks_arc: tasksArc, streams, workforce: status, brief: brief.join(' '),
    };
  }

  const api = {taskFromGoogle, buildToday, dueWords};
  if (typeof module !== 'undefined') module.exports = api; else root.JPlanner = api;
})(this);

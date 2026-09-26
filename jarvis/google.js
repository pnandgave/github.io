/* Google Calendar + Tasks straight from the phone (no server). Sign-in uses Google's own sign-in window;
   the access token lasts about an hour and is kept only on this phone. */
(function (root) {
  const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.readonly';
  const SCOPE_VERSION = 2;                           // bump when SCOPES change, so the phone asks once for the new permission
  const KEY = 'jarvis.token';
  let client = null, token = null, pending = null;

  class NeedAuth extends Error { constructor() { super('Google sign-in needed'); this.needAuth = true; } }

  function stored() { try { const t = JSON.parse(localStorage.getItem(KEY) || 'null'); return t && t.exp > Date.now() + 60000 ? t : null; } catch (e) { return null; } }
  function valid() { if (!token || token.exp <= Date.now() + 60000) token = stored(); return !!token; }

  function init(clientId) {
    if (!(root.google && google.accounts && google.accounts.oauth2)) throw new Error('Google sign-in is still loading');
    client = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPES,
      callback: r => {
        if (r.error) { pending && pending.reject(new Error(r.error_description || r.error)); pending = null; return; }
        token = {v: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000};
        try { localStorage.setItem(KEY, JSON.stringify(token)); } catch (e) {}
        pending && pending.resolve(); pending = null;
      },
      error_callback: e => { pending && pending.reject(new Error(e.message || e.type || 'Sign-in closed')); pending = null; },
    });
  }

  /* must be called from a tap (browsers only open the Google window after a tap) */
  function signIn(first) {
    if (!client) return Promise.reject(new Error('Add your Google client ID in SETTINGS first'));
    return new Promise((resolve, reject) => { pending = {resolve, reject}; client.requestAccessToken({prompt: first ? 'consent' : ''}); });
  }
  function signOut() { if (token && root.google) google.accounts.oauth2.revoke(token.v, () => {}); token = null; localStorage.removeItem(KEY); }

  async function api(url, opt = {}) {
    if (!valid()) throw new NeedAuth();
    const r = await fetch(url, {...opt, headers: {Authorization: 'Bearer ' + token.v, 'Content-Type': 'application/json', ...(opt.headers || {})}});
    if (r.status === 401) { token = null; localStorage.removeItem(KEY); throw new NeedAuth(); }
    if (r.status === 204) return null;
    if (opt.text) { if (!r.ok) throw new Error(r.statusText); return r.text(); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && /insufficient|scope/i.test(JSON.stringify(j))) { token = null; localStorage.removeItem(KEY); throw new NeedAuth(); }
    if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
    return j;
  }
  async function pages(url, key = 'items') {
    let out = [], tok = '';
    do {
      const j = await api(url + (url.includes('?') ? '&' : '?') + (tok ? 'pageToken=' + encodeURIComponent(tok) : ''));
      out = out.concat(j[key] || []); tok = j.nextPageToken || '';
    } while (tok);
    return out;
  }
  const CAL = 'https://www.googleapis.com/calendar/v3', TASKS = 'https://tasks.googleapis.com/tasks/v1', DRIVE = 'https://www.googleapis.com/drive/v3';
  const enc = encodeURIComponent;

  const g = {
    NeedAuth, init, signIn, signOut, valid, SCOPE_VERSION,
    /* Drive (read-only): the Knowledge folder */
    async folderId(name, parentName) {
      const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const j = await api(`${DRIVE}/files?q=${enc(q)}&fields=files(id,name,parents)&pageSize=20`);
      const fs = j.files || [];
      if (fs.length <= 1 || !parentName) return fs[0] ? fs[0].id : null;
      for (const f of fs) {
        for (const p of f.parents || []) {
          const par = await api(`${DRIVE}/files/${enc(p)}?fields=name`).catch(() => ({}));
          if ((par.name || '').toLowerCase() === parentName.toLowerCase()) return f.id;
        }
      }
      return fs[0].id;
    },
    async folderFiles(id) {
      const q = `'${id}' in parents and trashed=false`;
      const j = await api(`${DRIVE}/files?q=${enc(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100`);
      return j.files || [];
    },
    fileText: f => f.mimeType === 'application/vnd.google-apps.document'
      ? api(`${DRIVE}/files/${enc(f.id)}/export?mimeType=text/plain`, {text: true})
      : api(`${DRIVE}/files/${enc(f.id)}?alt=media`, {text: true}),
    async calendarId(name) {
      const cals = await pages(`${CAL}/users/me/calendarList?maxResults=250`);
      const c = cals.find(c => (c.summary || '').trim().toLowerCase() === name.trim().toLowerCase());
      return c ? c.id : null;
    },
    events: (calId, start, end) => pages(`${CAL}/calendars/${enc(calId)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${enc(start.toISOString())}&timeMax=${enc(end.toISOString())}`),
    async lists() { const ls = await pages(`${TASKS}/users/@me/lists?maxResults=100`); return Object.fromEntries(ls.map(l => [l.title, l.id])); },
    createList: title => api(`${TASKS}/users/@me/lists`, {method: 'POST', body: JSON.stringify({title})}),
    openTasks: listId => pages(`${TASKS}/lists/${enc(listId)}/tasks?showCompleted=false&maxResults=100`),
    async doneSince(listId, since) {
      const t = await pages(`${TASKS}/lists/${enc(listId)}/tasks?showCompleted=true&showHidden=true&maxResults=100&completedMin=${enc(since.toISOString())}`);
      return t.filter(x => x.status === 'completed');
    },
    addTask: (listId, title, notes, due) => api(`${TASKS}/lists/${enc(listId)}/tasks`, {method: 'POST', body: JSON.stringify({title, notes, ...(due ? {due: due + 'T00:00:00.000Z'} : {})})}),
    setDone: (listId, taskId, done) => api(`${TASKS}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {method: 'PATCH', body: JSON.stringify(done ? {status: 'completed'} : {status: 'needsAction', completed: null})}),
    addEvent: (calId, summary, startIso, endIso, tz, description) => api(`${CAL}/calendars/${enc(calId)}/events`, {method: 'POST',
      body: JSON.stringify({summary, description, start: {dateTime: startIso, timeZone: tz}, end: {dateTime: endIso, timeZone: tz}})}),
  };
  root.JGoogle = g;
})(this);

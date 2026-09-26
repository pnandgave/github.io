/* JARVIS knowledge: reads the files in Drive > JARVIS > Knowledge (about-me, phd, projects, and the skill files)
   and picks the right ones for each request. Cached on the phone, refreshed every 10 minutes. */
(function (root) {
  const KEY = 'jarvis.knowledge', FRESH = 10 * 60 * 1000;
  const norm = n => n.toLowerCase().replace(/\.(md|txt|markdown)$/, '').trim();
  let mem = null;
  const load = () => { if (!mem) { try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; } } return mem || {at: 0, files: {}}; };
  const save = k => { mem = k; try { localStorage.setItem(KEY, JSON.stringify(k)); } catch (e) {} };

  async function refresh(force) {
    const k = load();
    if (!force && Date.now() - k.at < FRESH) return k;
    const id = await JGoogle.folderId('Knowledge', 'JARVIS');
    if (!id) { save({at: Date.now(), files: {}, missing: true}); return mem; }
    const list = await JGoogle.folderFiles(id), files = {};
    for (const f of list) {
      const name = norm(f.name), old = k.files[name];
      if (!/(document|text|markdown|octet)/.test(f.mimeType) && !/\.(md|txt)$/i.test(f.name)) continue;
      files[name] = old && old.mod === f.modifiedTime ? old : {mod: f.modifiedTime, text: await JGoogle.fileText(f)};
    }
    save({at: Date.now(), files}); return mem;
  }

  const PHD = /\b(phd|ph\.d|thesis|viva|supervisor|mathapati|experiment|specimen|tensile|flexural|impact|izod|charpy|wear|erosion|tribolog|graphene|petg|nylon|pa12|core.?shell|grading|graded|taguchi|anova|l27|astm|paper|journal|review|publication|filament|print(ing)? param)/i;
  const PROJ = /\b(project|jarvis|estimat|imperial|business|freelanc|client|book|plan|priority|priorities|goal)/i;

  /* which files to send with a request. kind: question | paper | book | post | email | humanise | other */
  function pick(kind, text) {
    const names = ['about-me'];
    if (kind === 'question' || kind === 'other') { if (PROJ.test(text) || !PHD.test(text)) names.push('projects'); if (PHD.test(text)) names.push('phd'); }
    if (kind !== 'question') names.push('my-voice', 'natural-writing');
    if (kind === 'paper') names.push('research-paper', 'phd');
    if (kind === 'book') names.push('book-writing', 'projects');
    if ((kind === 'post' || kind === 'email' || kind === 'humanise' || kind === 'other') && PHD.test(text)) names.push('phd');
    return [...new Set(names)];
  }
  function context(kind, text) {
    const k = load(), got = pick(kind, text).filter(n => k.files[n]);
    return {names: got, text: got.map(n => `=== FILE: ${n} ===\n${k.files[n].text.trim()}`).join('\n\n')};
  }
  const status = () => { const k = load(); return {count: Object.keys(k.files).length, at: k.at, missing: !!k.missing}; };
  root.JKnowledge = {refresh, context, status};
})(this);

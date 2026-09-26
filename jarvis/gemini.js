/* The phone's thinking engine: Gemini through your own free API key (kept only on this phone).
   The model only understands the words; dates, times and lists are decided in code. */
(function (root) {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';

  /* pick the newest general 'flash' model this key can use */
  async function pickModel(key) {
    const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Gemini key not accepted');
    const skip = /(tts|live|transcrib|image|embed|audio|vision|thinking|exp|learnlm|aqa|robotics|computer)/i;
    const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini-[\d.]+-flash(-lite)?(-preview[\w-]*)?$/.test(n) && !skip.test(n));
    const ver = n => parseFloat(n.split('-')[1]) || 0;
    ok.sort((a, b) => (ver(b) - ver(a)) || (/lite/.test(a) - /lite/.test(b)) || (/preview/.test(a) - /preview/.test(b)));
    if (!ok.length) throw new Error('No Gemini Flash model is available for this key');
    return ok[0];
  }

  async function generate(key, model, system, text, schema, maxTokens) {
    const body = {
      systemInstruction: {parts: [{text: system}]},
      contents: [{role: 'user', parts: [{text}]}],
      generationConfig: {temperature: schema ? 0.1 : 0.4, ...(schema ? {responseMimeType: 'application/json', responseSchema: schema} : {maxOutputTokens: maxTokens || 400})},
    };
    const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    return parts.map(p => p.text || '').join('').trim();
  }

  async function parseCommand(key, model, text, rules) {
    const lists = [...rules.workstreams, rules.inbox];
    const schema = {type: 'OBJECT', properties: {
      intent: {type: 'STRING', enum: ['add_task', 'brief', 'question', 'write']},
      kind: {type: 'STRING', enum: ['paper', 'book', 'post', 'email', 'humanise', 'other']},
      title: {type: 'STRING'}, workstream: {type: 'STRING', enum: lists},
      when: {type: 'STRING'}, time: {type: 'STRING'},
      duration_min: {type: 'INTEGER'}, priority: {type: 'STRING', enum: ['P1', 'P2', 'P3']},
    }, required: ['intent', 'kind', 'title', 'workstream', 'when', 'time', 'duration_min', 'priority']};
    const system = `You are JARVIS, ${rules.name}'s assistant. He is an assistant professor (robotics, mechatronics) doing a PhD on FDM 3D printing, who also writes a book and does freelance projects.
Classify his message:
- add_task: something he needs to do or be reminded of.
- brief: he asks about his day, plan, schedule or what is next.
- write: he wants text written, drafted, rewritten, edited or made to sound like him (paper or report section, book text, LinkedIn post, email, or 'humanise this').
- question: anything else.
kind (for write): paper, book, post, email, humanise (rewrite/edit a draft in his voice) or other; for other intents use other.
For add_task choose the workstream from: ${lists.join(', ')} (use ${rules.inbox} if unsure). Write a short, clear task title starting with a verb.
Copy the date words exactly as he said them into 'when' (e.g. 'Friday', 'tomorrow', 'next Monday', '12 Oct'); '' if none.
Copy the clock-time words exactly into 'time' (e.g. '5 pm', '17:30', 'at 9'); '' if none. NEVER calculate dates or times yourself.
duration_min: his estimate, else a sensible guess between 15 and 90. priority: P1 only if urgent or important, P3 if optional, else P2.
For brief or question: title '', workstream ${rules.inbox}, when '', time '', duration_min 0, priority P2.`;
    const d = JSON.parse(await generate(key, model, system, text, schema));
    if (!lists.includes(d.workstream)) d.workstream = rules.inbox;
    return d;
  }

  const answer = (key, model, text, rules, knowledge) => generate(key, model,
    `You are JARVIS, ${rules.name}'s calm, concise personal assistant. Answer in at most 4 short sentences, spoken aloud. ` +
    'Use the knowledge files below when they are relevant; if the answer is not in them and needs exact facts (standards, numbers, citations, his results), say so rather than guessing. ' +
    'Never invent numbers, references or results.' + (knowledge ? '\n\n' + knowledge : ''), text, null, 500);

  const KIND = {paper: 'a research paper or report section (Register A)', book: 'book text (Register B, teaching voice)',
    post: 'a LinkedIn or professional post (Register B)', email: 'an email (Register B, short)',
    humanise: 'an edit of his draft so it reads naturally in his own voice (keep every fact and number exactly)', other: 'the requested text'};
  /* long-form writing with the knowledge + skill files */
  const write = (key, model, kind, request, rules, knowledge) => generate(key, model,
    `You are JARVIS, writing for ${rules.name}. Produce ${KIND[kind] || KIND.other}. ` +
    'Follow the skill files exactly (voice, register, structure, rules). Use only facts from the knowledge files or the request. ' +
    'Never invent numbers, references, standards or results: write [SOURCE NEEDED] or [DATA NEEDED] instead. British spelling. ' +
    'Output the text only, then a line with ---, then "Check:" followed by a short list of facts to verify and placeholders to fill.' +
    (knowledge ? '\n\n' + knowledge : ''), request, null, 4096);

  root.JGemini = {pickModel, parseCommand, answer, write};

})(this);

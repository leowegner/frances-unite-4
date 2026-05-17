// ====== Utilities ======
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
const sample = (arr, n) => shuffle(arr).slice(0, n);
const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const stripArticleFR = (s) => s.replace(/^(un|une|le|la|l'|les)\s+/i, "").replace(/^l'/i, "");
const stripArticleES = (s) => s.replace(/^(un|una|el|la|los|las)\s+/i, "");

const STORAGE_KEY = "frances_u4_v1";
const loadStore = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
};
const saveStore = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let store = loadStore();
if (!store.leitner) store.leitner = {}; // key = vocab fr, value = box 0..4
if (!store.stats) store.stats = { quizCorrect: 0, quizTotal: 0, fcSeen: 0 };
if (typeof store.tts !== "boolean") store.tts = true;

// ====== Tabs ======
$$("#tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    $$("#tabs button").forEach(b => b.classList.remove("active"));
    $$(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(`[data-panel="${btn.dataset.tab}"]`).classList.add("active");
  });
});

// ====== Stats display ======
function updateStats() {
  const s = store.stats;
  const known = Object.values(store.leitner).filter(v => v >= 4).length;
  const elem = $("#stats");
  if (elem) elem.textContent = `Quiz: ${s.quizCorrect}/${s.quizTotal} aciertos · Flashcards vistas: ${s.fcSeen} · Palabras dominadas: ${known}`;
}
updateStats();

$("#resetProgress").addEventListener("click", () => {
  if (confirm("¿Reiniciar todo el progreso?")) {
    store = { leitner: {}, stats: { quizCorrect: 0, quizTotal: 0, fcSeen: 0 }, tts: true };
    saveStore(store);
    updateStats();
    alert("Progreso reiniciado.");
  }
});

// ====== TTS ======
let frVoice = null;
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  frVoice = voices.find(v => /fr(-|_)?/i.test(v.lang)) || voices.find(v => /french/i.test(v.name));
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
function speakFR(text) {
  if (!store.tts || !("speechSynthesis" in window)) return;
  const cleaned = text.replace(/\s*\/\s*.*$/, ""); // si hay alternativa, leer la primera
  const utter = new SpeechSynthesisUtterance(cleaned);
  utter.lang = "fr-FR";
  if (frVoice) utter.voice = frVoice;
  utter.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}
const ttsBtn = $("#ttsToggle");
function refreshTtsBtn() {
  ttsBtn.textContent = store.tts ? "🔊 Audio: ON" : "🔇 Audio: OFF";
}
refreshTtsBtn();
ttsBtn.addEventListener("click", () => {
  store.tts = !store.tts;
  saveStore(store);
  refreshTtsBtn();
});

// ====== Vocab table ======
function filterVocab(cat, query) {
  let list = VOCAB;
  if (cat && cat !== "all") list = list.filter(v => v.cat === cat);
  if (query) {
    const q = normalize(query);
    list = list.filter(v => normalize(v.fr).includes(q) || normalize(v.es).includes(q));
  }
  return list;
}

function renderVocab() {
  const cat = $("#vocabCat").value;
  const query = $("#vocabSearch").value;
  const list = filterVocab(cat, query);
  const container = $("#vocabTable");
  container.innerHTML = list.map(v => `
    <div class="vocab-item">
      <div>
        <div class="fr">${v.fr}</div>
        <div class="es">${v.es}</div>
      </div>
      <div class="row">
        <span class="tag">${v.cat}</span>
        <button class="speak" data-fr="${v.fr.replace(/"/g, "&quot;")}" title="Escuchar">🔊</button>
      </div>
    </div>`).join("");
  $$(".vocab-item .speak", container).forEach(btn => {
    btn.addEventListener("click", () => speakFR(btn.dataset.fr));
  });
}
$("#vocabSearch").addEventListener("input", renderVocab);
$("#vocabCat").addEventListener("change", renderVocab);
renderVocab();

// ====== Flashcards (Leitner) ======
let fcState = { queue: [], current: null, flipped: false };

function buildFcDeck(cat, mode) {
  let pool = cat === "all" ? VOCAB : VOCAB.filter(v => v.cat === cat);
  if (mode === "random") return shuffle(pool);
  // Leitner: prioriza cajas bajas
  return shuffle(pool).sort((a, b) => {
    const ba = store.leitner[a.fr] || 0;
    const bb = store.leitner[b.fr] || 0;
    return ba - bb;
  });
}

function fcDirText(v, dir) {
  if (dir === "fr-es") return { front: v.fr, back: v.es, lang: "fr" };
  if (dir === "es-fr") return { front: v.es, back: v.fr, lang: "es" };
  // mix
  return Math.random() < 0.5
    ? { front: v.fr, back: v.es, lang: "fr" }
    : { front: v.es, back: v.fr, lang: "es" };
}

function fcShowNext() {
  if (fcState.queue.length === 0) {
    $("#flashcard .fc-front").innerHTML = "🎉 ¡Sesión terminada!";
    $("#flashcard .fc-back").classList.add("hidden");
    $("#fcFlip").disabled = true;
    $("#fcSpeak").disabled = true;
    $("#fcRate").classList.add("hidden");
    return;
  }
  fcState.current = fcState.queue.shift();
  fcState.flipped = false;
  const dir = $("#fcDir").value;
  const t = fcDirText(fcState.current, dir);
  fcState.currentText = t;
  $("#flashcard .fc-front").innerHTML = t.front;
  $("#flashcard .fc-back").textContent = t.back;
  $("#flashcard .fc-back").classList.add("hidden");
  $("#fcFlip").disabled = false;
  $("#fcSpeak").disabled = false;
  $("#fcRate").classList.add("hidden");
  $("#fcStats").textContent = `Restantes: ${fcState.queue.length} · Caja actual: ${store.leitner[fcState.current.fr] || 0}/4`;
  store.stats.fcSeen++;
  saveStore(store);
  if (t.lang === "fr") speakFR(t.front);
}

function fcFlip() {
  if (!fcState.current) return;
  fcState.flipped = !fcState.flipped;
  $("#flashcard .fc-back").classList.toggle("hidden", !fcState.flipped);
  $("#fcRate").classList.toggle("hidden", !fcState.flipped);
  if (fcState.flipped && fcState.currentText.lang === "es") {
    speakFR(fcState.currentText.back); // pronuncia el FR
  }
}

$("#fcStart").addEventListener("click", () => {
  const cat = $("#fcCat").value;
  const mode = $("#fcMode").value;
  fcState.queue = buildFcDeck(cat, mode);
  fcShowNext();
});
$("#fcFlip").addEventListener("click", fcFlip);
$("#flashcard").addEventListener("click", () => {
  if (fcState.current) fcFlip();
});
$("#fcSpeak").addEventListener("click", (e) => {
  e.stopPropagation();
  if (fcState.current) speakFR(fcState.current.fr);
});
$$("#fcRate button").forEach(b => {
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const v = fcState.current;
    const cur = store.leitner[v.fr] || 0;
    const delta = b.dataset.rate === "bad" ? -2 : b.dataset.rate === "ok" ? 1 : 2;
    const next = Math.max(0, Math.min(4, cur + delta));
    store.leitner[v.fr] = next;
    saveStore(store);
    updateStats();
    if (b.dataset.rate === "bad") {
      // reinsertar más tarde
      const insertAt = Math.min(3, fcState.queue.length);
      fcState.queue.splice(insertAt, 0, v);
    }
    fcShowNext();
  });
});

// ====== Quiz ======
let qzState = null;

function buildQuiz(cat, dir, count) {
  let pool = cat === "all" ? VOCAB : VOCAB.filter(v => v.cat === cat);
  pool = shuffle(pool).slice(0, count);
  return pool.map(v => {
    const actualDir = dir === "mix" ? (Math.random() < 0.5 ? "fr-es" : "es-fr") : dir;
    const question = actualDir === "fr-es" ? v.fr : v.es;
    const correct = actualDir === "fr-es" ? v.es : v.fr;
    const distractorPool = (cat === "all" ? VOCAB : VOCAB.filter(x => x.cat === cat))
      .filter(x => x.fr !== v.fr);
    const distractors = sample(distractorPool, 3).map(x => actualDir === "fr-es" ? x.es : x.fr);
    const options = shuffle([correct, ...distractors]);
    return { question, correct, options, dir: actualDir, fr: v.fr };
  });
}

function renderQuiz() {
  if (!qzState) return;
  const { items, idx } = qzState;
  if (idx >= items.length) {
    const pct = Math.round((qzState.correct / items.length) * 100);
    $("#qzBox").innerHTML = `
      <div class="qz-question">
        <h3>Resultado: ${qzState.correct} / ${items.length} (${pct}%)</h3>
        <p class="muted">Quiz registrado en estadísticas.</p>
      </div>`;
    store.stats.quizTotal += items.length;
    store.stats.quizCorrect += qzState.correct;
    saveStore(store);
    updateStats();
    qzState = null;
    return;
  }
  const q = items[idx];
  $("#qzBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="qz-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length} · ${q.dir === "fr-es" ? "FR → ES" : "ES → FR"}</div>
      <h3>${q.question} ${q.dir === "fr-es" ? '<button class="speak" title="Escuchar">🔊</button>' : ""}</h3>
      <div class="qz-options">
        ${q.options.map((o, i) => `<button data-i="${i}">${o}</button>`).join("")}
      </div>
      <div class="feedback hidden"></div>
    </div>`;
  const speakBtn = $(".qz-question .speak");
  if (speakBtn) speakBtn.addEventListener("click", () => speakFR(q.fr));
  if (q.dir === "fr-es") speakFR(q.fr);
  $$(".qz-options button").forEach(b => {
    b.addEventListener("click", () => {
      const choice = q.options[parseInt(b.dataset.i)];
      const ok = choice === q.correct;
      $$(".qz-options button").forEach(x => {
        x.classList.add("disabled");
        if (q.options[parseInt(x.dataset.i)] === q.correct) x.classList.add("correct");
      });
      if (!ok) b.classList.add("wrong");
      const fb = $(".feedback");
      fb.classList.remove("hidden");
      fb.classList.add(ok ? "ok" : "ko");
      fb.textContent = ok ? "¡Correcto!" : `Correcto: ${q.correct}`;
      if (ok) qzState.correct++;
      setTimeout(() => {
        qzState.idx++;
        renderQuiz();
      }, ok ? 800 : 1500);
    });
  });
}

$("#qzStart").addEventListener("click", () => {
  const cat = $("#qzCat").value;
  const dir = $("#qzDir").value;
  const count = parseInt($("#qzCount").value);
  qzState = { items: buildQuiz(cat, dir, count), idx: 0, correct: 0 };
  renderQuiz();
});

// ====== Escribir ======
let wrState = null;

function checkWrite(answer, correct, strict) {
  if (strict) return answer.trim() === correct.trim();
  const a = normalize(answer);
  const c = normalize(correct);
  if (a === c) return true;
  // Tolerar sin artículo
  const aBare = normalize(stripArticleFR(stripArticleES(answer)));
  const cBare = normalize(stripArticleFR(stripArticleES(correct)));
  if (aBare === cBare) return true;
  // Tolerar alternativas separadas por /
  const alts = correct.split("/").map(s => normalize(s.trim()));
  if (alts.includes(a)) return true;
  return false;
}

function renderWrite() {
  if (!wrState) return;
  const { items, idx } = wrState;
  if (idx >= items.length) {
    $("#wrBox").innerHTML = `<div class="wr-question"><h3>Resultado: ${wrState.correct} / ${items.length}</h3></div>`;
    wrState = null;
    return;
  }
  const q = items[idx];
  $("#wrBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="wr-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length}</div>
      <h3>${q.question} ${q.dir === "fr-es" ? '<button class="speak">🔊</button>' : ""}</h3>
      <input type="text" class="wr-input" autocomplete="off" autocapitalize="off" />
      <div class="row">
        <button class="wr-check">Comprobar</button>
        <button class="wr-skip btn-secondary">Saltar</button>
      </div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".wr-input");
  input.focus();
  const speakBtn = $(".wr-question .speak");
  if (speakBtn) speakBtn.addEventListener("click", () => speakFR(q.fr));
  if (q.dir === "fr-es") speakFR(q.fr);
  const submit = () => {
    const ok = checkWrite(input.value, q.correct, wrState.strict);
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.textContent = ok ? "¡Correcto!" : `Respuesta: ${q.correct}`;
    if (ok) wrState.correct++;
    setTimeout(() => { wrState.idx++; renderWrite(); }, ok ? 700 : 1800);
  };
  $(".wr-check").addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  $(".wr-skip").addEventListener("click", () => { wrState.idx++; renderWrite(); });
}

$("#wrStart").addEventListener("click", () => {
  const cat = $("#wrCat").value;
  const dir = $("#wrDir").value;
  const strict = $("#wrStrict").checked;
  let pool = cat === "all" ? VOCAB : VOCAB.filter(v => v.cat === cat);
  pool = shuffle(pool).slice(0, Math.min(20, pool.length));
  const items = pool.map(v => ({
    fr: v.fr,
    question: dir === "fr-es" ? v.fr : v.es,
    correct: dir === "fr-es" ? v.es : v.fr,
    dir,
  }));
  wrState = { items, idx: 0, correct: 0, strict };
  renderWrite();
});

// ====== Conjugar ======
let cjState = null;

function buildConjQuestions(n) {
  const all = [...SUBJ_REGULAR, ...SUBJ_IRREGULAR.filter(v => v.inf !== "falloir")];
  const items = [];
  for (let i = 0; i < n; i++) {
    const verb = all[Math.floor(Math.random() * all.length)];
    let pIdx;
    do { pIdx = Math.floor(Math.random() * 6); } while (verb.forms[pIdx] === "—");
    items.push({
      inf: verb.inf,
      pronoun: SUBJ_PRONOUNS[pIdx],
      answer: verb.forms[pIdx],
    });
  }
  return items;
}

function renderConj() {
  if (!cjState) return;
  const { items, idx } = cjState;
  if (idx >= items.length) {
    $("#cjBox").innerHTML = `<div class="cj-question"><h3>Resultado: ${cjState.correct} / ${items.length}</h3></div>`;
    cjState = null;
    return;
  }
  const q = items[idx];
  $("#cjBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="cj-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length}</div>
      <h3>Il faut que <strong>${q.pronoun}</strong> ___ (${q.inf}).</h3>
      <input type="text" class="cj-input" autocomplete="off" autocapitalize="off" placeholder="forma del subjonctif" />
      <div class="row">
        <button class="cj-check">Comprobar</button>
      </div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".cj-input");
  input.focus();
  const submit = () => {
    const ok = normalize(input.value) === normalize(q.answer);
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.textContent = ok ? "¡Correcto!" : `Respuesta: ${q.answer}`;
    if (ok) cjState.correct++;
    setTimeout(() => { cjState.idx++; renderConj(); }, ok ? 700 : 1800);
  };
  $(".cj-check").addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}

$("#cjStart").addEventListener("click", () => {
  const n = parseInt($("#cjCount").value);
  cjState = { items: buildConjQuestions(n), idx: 0, correct: 0 };
  renderConj();
});

// ====== Subjuntivo: render de disparadores ======
function renderTriggers() {
  const grid = $("#triggersGrid");
  if (!grid) return;
  const labels = {
    obligation: "1. Obligación / necesidad",
    volonte: "2. Voluntad / deseo",
    emotion: "3. Emoción / sentimiento",
    doute: "4. Duda / posibilidad",
    conjonctions: "5. Conjunciones",
  };
  grid.innerHTML = Object.entries(SUBJ_TRIGGERS).map(([key, list]) => `
    <div class="trigger-group">
      <h3>${labels[key]}</h3>
      <table class="grammar-table">
        <tbody>
          ${list.map(t => `<tr><td><strong>${t.fr}</strong></td><td class="muted">${t.es}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");

  const indic = $("#indicTriggersList");
  indic.innerHTML = `<table class="grammar-table">
    <thead><tr><th>Expresión</th><th>Significado</th></tr></thead>
    <tbody>
      ${INDIC_TRIGGERS.map(t => `<tr><td><strong>${t.fr}</strong></td><td class="muted">${t.es}</td></tr>`).join("")}
    </tbody></table>`;
}
renderTriggers();

// ====== Subj/Indic discriminación ======
let mcState = null;
function renderMc() {
  if (!mcState) return;
  const { items, idx } = mcState;
  if (idx >= items.length) {
    $("#mcBox").innerHTML = `<div class="cj-question"><h3>Resultado: ${mcState.correct} / ${items.length}</h3>
      <p class="muted">Aciertos en el modo: ${mcState.modeOk}/${items.length} · Aciertos en la forma: ${mcState.formOk}/${items.length}</p></div>`;
    mcState = null;
    return;
  }
  const q = items[idx];
  $("#mcBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="cj-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length} · disparador: <strong>${q.trigger}</strong></div>
      <h3>${q.sentence}</h3>
      <div class="row">
        <label class="checkbox"><input type="radio" name="mode" value="subj" /> Subjuntivo</label>
        <label class="checkbox"><input type="radio" name="mode" value="indic" /> Indicativo</label>
      </div>
      <input type="text" class="cj-input" autocomplete="off" placeholder="Escribe la forma verbal completa" />
      <div class="row">
        <button class="mc-check">Comprobar</button>
      </div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".cj-input");
  input.focus();
  const submit = () => {
    const modeSel = document.querySelector('input[name="mode"]:checked');
    const modeAns = modeSel ? modeSel.value : null;
    const formAns = input.value.trim();
    const okMode = modeAns === q.mode;
    const correctAlts = q.answer.split("/").map(s => normalize(s));
    const okForm = correctAlts.includes(normalize(formAns));
    const ok = okMode && okForm;
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.innerHTML = ok
      ? `¡Correcto! Modo: <strong>${q.mode === "subj" ? "subjuntivo" : "indicativo"}</strong>, forma: <strong>${q.answer}</strong>.`
      : `Modo correcto: <strong>${q.mode === "subj" ? "subjuntivo" : "indicativo"}</strong> · Forma correcta: <strong>${q.answer}</strong>`;
    if (ok) mcState.correct++;
    if (okMode) mcState.modeOk++;
    if (okForm) mcState.formOk++;
    setTimeout(() => { mcState.idx++; renderMc(); }, ok ? 1100 : 2400);
  };
  $(".mc-check").addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}

const mcStartBtn = $("#mcStart");
if (mcStartBtn) {
  mcStartBtn.addEventListener("click", () => {
    const v = $("#mcCount").value;
    const n = v === "all" ? MODE_CHOICE.length : parseInt(v);
    mcState = { items: shuffle(MODE_CHOICE).slice(0, n), idx: 0, correct: 0, modeOk: 0, formOk: 0 };
    renderMc();
  });
}

// ====== Subjuntivo conjugar (instancia paralela) ======
let cj2State = null;
function renderCj2() {
  if (!cj2State) return;
  const { items, idx } = cj2State;
  if (idx >= items.length) {
    $("#cj2Box").innerHTML = `<div class="cj-question"><h3>Resultado: ${cj2State.correct} / ${items.length}</h3></div>`;
    cj2State = null;
    return;
  }
  const q = items[idx];
  $("#cj2Box").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="cj-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length}</div>
      <h3>Il faut que <strong>${q.pronoun}</strong> ___ (${q.inf}).</h3>
      <input type="text" class="cj-input" autocomplete="off" />
      <div class="row"><button class="cj-check">Comprobar</button></div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".cj-input");
  input.focus();
  const submit = () => {
    const ok = normalize(input.value) === normalize(q.answer);
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.textContent = ok ? "¡Correcto!" : `Respuesta: ${q.answer}`;
    if (ok) cj2State.correct++;
    setTimeout(() => { cj2State.idx++; renderCj2(); }, ok ? 700 : 1800);
  };
  $(".cj-check").addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}
const cj2StartBtn = $("#cj2Start");
if (cj2StartBtn) {
  cj2StartBtn.addEventListener("click", () => {
    const n = parseInt($("#cj2Count").value);
    cj2State = { items: buildConjQuestions(n), idx: 0, correct: 0 };
    renderCj2();
  });
}

// ====== Transformación inf → subj ======
let trState = null;
function renderTr() {
  if (!trState) return;
  const { items, idx } = trState;
  if (idx >= items.length) {
    $("#trBox").innerHTML = `<div class="cj-question"><h3>Resultado: ${trState.correct} / ${items.length}</h3></div>`;
    trState = null;
    return;
  }
  const q = items[idx];
  $("#trBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="cj-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length}</div>
      <h3>${q.from}</h3>
      <p>Nuevo sujeto: <strong>${q.to}</strong></p>
      <input type="text" class="cj-input" autocomplete="off" placeholder="Reescribe con que + subjuntivo" style="width:100%" />
      <div class="row"><button class="tr-check">Comprobar</button><button class="tr-skip btn-secondary">Ver respuesta</button></div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".cj-input");
  input.focus();
  const submit = () => {
    const ok = checkAgainst(input.value, q.accepts);
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.innerHTML = ok ? "¡Correcto!" : `Respuesta: <strong>${q.accepts[0]}</strong>`;
    if (ok) trState.correct++;
    setTimeout(() => { trState.idx++; renderTr(); }, ok ? 800 : 2600);
  };
  $(".tr-check").addEventListener("click", submit);
  $(".tr-skip").addEventListener("click", () => {
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add("ko");
    fb.innerHTML = `Respuesta: <strong>${q.accepts[0]}</strong>`;
    setTimeout(() => { trState.idx++; renderTr(); }, 2400);
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}
const trStartBtn = $("#trStart");
if (trStartBtn) {
  trStartBtn.addEventListener("click", () => {
    trState = { items: shuffle(TRANSFORM_SUBJ).slice(0, 8), idx: 0, correct: 0 };
    renderTr();
  });
}

// ====== Traducción gramática ======
let tlState = null;
function renderTl() {
  if (!tlState) return;
  const { items, idx } = tlState;
  if (idx >= items.length) {
    $("#tlBox").innerHTML = `<div class="cj-question"><h3>Resultado: ${tlState.correct} / ${items.length}</h3></div>`;
    tlState = null;
    return;
  }
  const q = items[idx];
  $("#tlBox").innerHTML = `
    <div class="progress-bar"><div style="width:${(idx / items.length) * 100}%"></div></div>
    <div class="cj-question">
      <div class="muted">Pregunta ${idx + 1} de ${items.length}</div>
      <h3>${q.es}</h3>
      <input type="text" class="cj-input" autocomplete="off" placeholder="Tradúcelo al francés" style="width:100%" />
      <div class="row"><button class="tl-check">Comprobar</button><button class="tl-skip btn-secondary">Ver respuesta</button></div>
      <div class="feedback hidden"></div>
    </div>`;
  const input = $(".cj-input");
  input.focus();
  const submit = () => {
    const ok = checkAgainst(input.value, q.accepts);
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add(ok ? "ok" : "ko");
    fb.innerHTML = ok ? "¡Correcto!" : `Respuesta: <strong>${q.accepts[0]}</strong>`;
    if (ok) tlState.correct++;
    setTimeout(() => { tlState.idx++; renderTl(); }, ok ? 800 : 2600);
  };
  $(".tl-check").addEventListener("click", submit);
  $(".tl-skip").addEventListener("click", () => {
    const fb = $(".feedback");
    fb.classList.remove("hidden");
    fb.classList.add("ko");
    fb.innerHTML = `Respuesta: <strong>${q.accepts[0]}</strong>`;
    setTimeout(() => { tlState.idx++; renderTl(); }, 2400);
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}
const tlStartBtn = $("#tlStart");
if (tlStartBtn) {
  tlStartBtn.addEventListener("click", () => {
    tlState = { items: shuffle(TRANSLATE_GRAMMAR).slice(0, 16), idx: 0, correct: 0 };
    renderTl();
  });
}

// ====== Examen ======
function generateExam() {
  const name = $("#exName").value.trim();
  const nVocab = Math.max(0, parseInt($("#exVocab").value) || 0);
  const nConj = Math.max(0, parseInt($("#exConj").value) || 0);
  const nModeChoice = Math.max(0, parseInt($("#exModeChoice").value) || 0);
  const nTransform = Math.max(0, parseInt($("#exTransform").value) || 0);
  const nTranslate = Math.max(0, parseInt($("#exTranslate").value) || 0);
  const nNeQue = Math.max(0, parseInt($("#exNeQue").value) || 0);
  const includeKey = $("#exKey").checked;
  const date = new Date().toLocaleDateString("es-ES");

  // Selección de ítems — solo ES → FR (sin traducción del francés al español)
  const vEsFr = shuffle(VOCAB).slice(0, nVocab);
  const vocabItems = vEsFr;
  const conjItems = buildConjQuestions(nConj);
  const mcItems = sample(MODE_CHOICE, nModeChoice);
  const trItems = sample(TRANSFORM_SUBJ, nTransform);
  const tlItems = sample(TRANSLATE_GRAMMAR, nTranslate);
  const neQueItems = sample(GRAMMAR_EXERCISES.neQue, nNeQue);

  // Puntos por ítem para ponderar (subj cuenta más)
  const PTS_VOCAB = 0.25;       // cada palabra
  const PTS_CONJ = 0.5;         // cada conjugación
  const PTS_MC = 0.75;          // modo + forma
  const PTS_TR = 1.0;           // transformación
  const PTS_TL = 1.0;           // traducción completa
  const PTS_NQ = 0.5;           // ne…que

  const ptsVocab = (vocabItems.length * PTS_VOCAB).toFixed(1);
  const ptsConj = (conjItems.length * PTS_CONJ).toFixed(1);
  const ptsMc = (mcItems.length * PTS_MC).toFixed(1);
  const ptsTr = (trItems.length * PTS_TR).toFixed(1);
  const ptsTl = (tlItems.length * PTS_TL).toFixed(1);
  const ptsNq = (neQueItems.length * PTS_NQ).toFixed(1);
  const total = (
    vocabItems.length * PTS_VOCAB +
    conjItems.length * PTS_CONJ +
    mcItems.length * PTS_MC +
    trItems.length * PTS_TR +
    tlItems.length * PTS_TL +
    neQueItems.length * PTS_NQ
  ).toFixed(1);
  const subjTotal = (
    conjItems.length * PTS_CONJ +
    mcItems.length * PTS_MC +
    trItems.length * PTS_TR +
    tlItems.length * PTS_TL
  ).toFixed(1);
  const subjPct = total > 0 ? Math.round((subjTotal / total) * 100) : 0;

  let sectionIdx = 0;
  const sec = (title, body) => {
    sectionIdx++;
    return `<section class="exam-section"><h2>${roman(sectionIdx)}. ${title}</h2>${body}</section>`;
  };

  let html = `
    <div class="exam-header">
      <div>
        <strong>Examen — Unité 4 : La protection animale</strong><br/>
        Nombre: <span class="write-line">${name || ""}</span><br/>
        Fecha: ${date}
      </div>
      <div style="text-align:right">
        Nota: ____ / ${total}<br/>
        Tiempo: 60 min<br/>
        <span style="font-size:0.85em">Subjuntivo: ${subjPct}% del examen</span>
      </div>
    </div>
  `;

  // ===== Subjuntivo primero, secciones más grandes =====
  if (conjItems.length) {
    html += sec(`Subjonctif présent — conjugaison (${ptsConj} pts)`, `
      <p>Complète avec la forme correcte du <strong>subjonctif présent</strong> :</p>
      <ol class="tight">
        ${conjItems.map(q => `<li>Il faut que <strong>${q.pronoun}</strong> <span class="write-line"></span> (${q.inf}).</li>`).join("")}
      </ol>`);
  }

  if (mcItems.length) {
    html += sec(`Subjonctif ou indicatif ? (${ptsMc} pts)`, `
      <p>Lis la phrase, identifie le déclencheur et écris la forme correcte du verbe entre parenthèses. Indique <strong>S</strong> (subjonctif) ou <strong>I</strong> (indicatif) à gauche.</p>
      <ol class="tight">
        ${mcItems.map(e => {
          const filled = e.sentence.replace(/___\s*\(([^)]+)\)/, '<span class="write-line"></span> ($1)');
          return `<li><span class="mode-box">[ &nbsp; ]</span> ${filled}</li>`;
        }).join("")}
      </ol>`);
  }

  if (trItems.length) {
    html += sec(`Transformer (inf → que + subj) (${ptsTr} pts)`, `
      <p>Réécris la phrase avec le nouveau sujet, en utilisant <em>que</em> + subjonctif.</p>
      <ol class="tight">
        ${trItems.map(e => `<li><em>${e.from}</em> → (<strong>${e.to}</strong>) <span class="write-line" style="min-width:60%"></span></li>`).join("")}
      </ol>`);
  }

  if (tlItems.length) {
    html += sec(`Traduction au français (${ptsTl} pts)`, `
      <p>Traduce al francés. Atención al subjuntivo, a la obligación/interdicción y a <em>ne…que</em>.</p>
      <ol class="tight">
        ${tlItems.map(e => `<li>${e.es}<br/><span class="write-line" style="min-width:90%"></span></li>`).join("")}
      </ol>`);
  }

  if (neQueItems.length) {
    html += sec(`La restriction <em>ne… que</em> (${ptsNq} pts)`, `
      <p>Transforme les phrases avec <strong>ne… que</strong> :</p>
      <ol class="tight">
        ${neQueItems.map(e => `<li>${e.fr}<br/><span class="write-line" style="min-width:90%"></span></li>`).join("")}
      </ol>`);
  }

  if (vocabItems.length) {
    html += sec(`Vocabulaire (${ptsVocab} pts)`, `
      <p>Traduce del español al francés (con artículo) :</p>
      <ol class="tight">
        ${vEsFr.map(v => `<li>${v.es} — <span class="write-line"></span></li>`).join("")}
      </ol>`);
  }

  if (includeKey) {
    let k = 0;
    const ksec = (title, body) => { k++; return `<section><h3>${roman(k)}. ${title}</h3>${body}</section>`; };
    let keyHtml = `<div class="page-break"></div><div class="key">
      <h2>Hoja de respuestas — barema</h2>
      <p class="muted">Total: ${total} pts · Subjuntivo: ${subjTotal} pts (${subjPct}%)</p>`;
    if (conjItems.length) keyHtml += ksec("Subj. conjugaison",
      `<ol class="tight">${conjItems.map(q => `<li>${q.pronoun} (${q.inf}) → <strong>${q.answer}</strong></li>`).join("")}</ol>`);
    if (mcItems.length) keyHtml += ksec("Subj. ou indic.",
      `<ol class="tight">${mcItems.map(e => `<li>${e.mode === "subj" ? "S" : "I"} — ${e.sentence.replace(/___/, "<strong>" + e.answer + "</strong>")} <em class="muted">(${e.trigger})</em></li>`).join("")}</ol>`);
    if (trItems.length) keyHtml += ksec("Transformer",
      `<ol class="tight">${trItems.map(e => `<li>${e.from} → (${e.to}) <strong>${e.accepts[0]}</strong></li>`).join("")}</ol>`);
    if (tlItems.length) keyHtml += ksec("Traduction",
      `<ol class="tight">${tlItems.map(e => `<li>${e.es} → <strong>${e.accepts[0]}</strong></li>`).join("")}</ol>`);
    if (neQueItems.length) keyHtml += ksec("ne… que",
      `<ol class="tight">${neQueItems.map(e => `<li>${e.fr} → <strong>${e.accepts[0]}</strong></li>`).join("")}</ol>`);
    if (vocabItems.length) keyHtml += ksec("Vocabulaire",
      `<ol class="tight">${vEsFr.map(v => `<li>${v.es} → <strong>${v.fr}</strong></li>`).join("")}</ol>`);
    keyHtml += `</div>`;
    html += keyHtml;
  }

  $("#examPreview").innerHTML = html;
}

function roman(n) {
  return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
}

// ====== Corrector inteligente para el examen digital ======
// Normaliza para comparar: minúsculas, sin tildes, apóstrofes unificados,
// espacios colapsados, puntuación final opcional.
function normForCheck(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[''`´]/g, "'")
    .replace(/[!?.,;:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Compara respuesta con una lista de aceptables. Devuelve true si coincide con alguna.
function checkAgainst(answer, accepts) {
  if (!answer) return false;
  const a = normForCheck(answer);
  if (!a) return false;
  return (accepts || []).some(acc => {
    // Admite que `acc` sea string con "/" para variantes simples (ej. "un éleveur / une éleveuse")
    return acc.split("/").map(s => normForCheck(s)).includes(a) || normForCheck(acc) === a;
  });
}

// ====== Examen digital (interactivo, autocorregido) ======
let dxState = null;

function startDigitalExam() {
  const nVocab = Math.max(0, parseInt($("#dxVocab").value) || 0);
  const nConj = Math.max(0, parseInt($("#dxConj").value) || 0);
  const nMc = Math.max(0, parseInt($("#dxModeChoice").value) || 0);
  const nTr = Math.max(0, parseInt($("#dxTransform").value) || 0);
  const nTl = Math.max(0, parseInt($("#dxTranslate").value) || 0);
  const nNq = Math.max(0, parseInt($("#dxNeQue").value) || 0);

  const PTS = { vocab: 0.25, conj: 0.5, mc: 0.75, tr: 1.0, tl: 1.0, nq: 0.5 };

  const vocab = sample(VOCAB, nVocab).map(v => ({
    type: "vocab", pts: PTS.vocab,
    prompt: v.es,
    accepts: v.fr.split("/").map(s => s.trim()),
  }));
  const conj = buildConjQuestions(nConj).map(q => ({
    type: "conj", pts: PTS.conj,
    prompt: `Il faut que <strong>${q.pronoun}</strong> ___ (${q.inf}).`,
    accepts: [q.answer],
    label: `${q.pronoun} (${q.inf})`,
  }));
  const mc = sample(MODE_CHOICE, nMc).map(q => ({
    type: "mc", pts: PTS.mc,
    prompt: q.sentence,
    mode: q.mode,
    accepts: q.answer.split("/").map(s => s.trim()),
    trigger: q.trigger,
  }));
  const tr = sample(TRANSFORM_SUBJ, nTr).map(q => ({
    type: "tr", pts: PTS.tr,
    prompt: q.from,
    subject: q.to,
    accepts: q.accepts,
  }));
  const tl = sample(TRANSLATE_GRAMMAR, nTl).map(q => ({
    type: "tl", pts: PTS.tl,
    prompt: q.es,
    accepts: q.accepts,
  }));
  const nq = sample(GRAMMAR_EXERCISES.neQue, nNq).map(q => ({
    type: "nq", pts: PTS.nq,
    prompt: q.fr,
    accepts: q.accepts,
  }));

  dxState = {
    sections: [
      { id: "conj", title: "Subjonctif présent — conjugaison", desc: "Complète avec la forme correcte du subjonctif :", items: conj },
      { id: "mc",   title: "Subjonctif ou indicatif ?", desc: "Marca el modo y escribe la forma correcta del verbo:", items: mc },
      { id: "tr",   title: "Transformer (inf → que + subj)", desc: "Reescribe con el nuevo sujeto:", items: tr },
      { id: "tl",   title: "Traduction au français", desc: "Traduce al francés:", items: tl },
      { id: "nq",   title: "La restriction ne… que", desc: "Reescribe con ne… que:", items: nq },
      { id: "vocab",title: "Vocabulaire", desc: "Traduce del español al francés (con artículo):", items: vocab },
    ].filter(s => s.items.length > 0),
    total: 0,
  };

  // Genera IDs y calcula total
  let id = 0;
  dxState.sections.forEach(s => s.items.forEach(it => { it.id = "q" + (id++); dxState.total += it.pts; }));

  renderDigitalExam();
}

function renderDigitalExam() {
  $("#dxConfig").classList.add("hidden");
  $("#dxResults").innerHTML = "";

  const html = dxState.sections.map((s, si) => `
    <div class="card dx-section">
      <h3>${roman(si + 1)}. ${s.title} <span class="muted">(${s.items.length} × ${s.items[0]?.pts} pts = ${(s.items.length * s.items[0]?.pts).toFixed(2)} pts)</span></h3>
      <p class="muted">${s.desc}</p>
      <ol class="dx-list">
        ${s.items.map(it => renderDxItem(it)).join("")}
      </ol>
    </div>
  `).join("");

  $("#dxExam").innerHTML = `
    <div class="card dx-header">
      <strong>Examen digital — Unité 4</strong>
      <span class="muted">Total: ${dxState.total.toFixed(2)} pts</span>
    </div>
    ${html}
    <div class="card center">
      <button id="dxSubmit">Corregir examen</button>
      <button id="dxCancel" class="btn-secondary">Cancelar</button>
    </div>
  `;

  $("#dxSubmit").addEventListener("click", correctDigitalExam);
  $("#dxCancel").addEventListener("click", () => {
    if (confirm("¿Cancelar el examen? Perderás tus respuestas.")) {
      dxState = null;
      $("#dxExam").innerHTML = "";
      $("#dxResults").innerHTML = "";
      $("#dxConfig").classList.remove("hidden");
    }
  });
}

function renderDxItem(it) {
  if (it.type === "mc") {
    const filled = it.prompt.replace(/___\s*\(([^)]+)\)/, `<input class="dx-in" data-id="${it.id}" type="text" autocomplete="off" placeholder="forma" /> ($1)`);
    return `<li>
      <div class="dx-mode">
        <label><input type="radio" name="${it.id}_mode" value="subj" /> Subj.</label>
        <label><input type="radio" name="${it.id}_mode" value="indic" /> Indic.</label>
      </div>
      ${filled}
    </li>`;
  }
  if (it.type === "conj") {
    const filled = it.prompt.replace(/___/, `<input class="dx-in" data-id="${it.id}" type="text" autocomplete="off" placeholder="forma" />`);
    return `<li>${filled}</li>`;
  }
  if (it.type === "tr") {
    return `<li>
      <div><em>${it.prompt}</em> → nuevo sujeto: <strong>${it.subject}</strong></div>
      <input class="dx-in wide" data-id="${it.id}" type="text" autocomplete="off" placeholder="Reescribe la frase" />
    </li>`;
  }
  // tl, nq, vocab
  return `<li>
    <div>${it.prompt}</div>
    <input class="dx-in wide" data-id="${it.id}" type="text" autocomplete="off" placeholder="Tu respuesta" />
  </li>`;
}

function correctDigitalExam() {
  let earned = 0;
  let results = [];

  dxState.sections.forEach(sec => {
    const secResults = { id: sec.id, title: sec.title, items: [] };
    sec.items.forEach(it => {
      const input = document.querySelector(`.dx-in[data-id="${it.id}"]`);
      const answer = input ? input.value : "";
      let ok = checkAgainst(answer, it.accepts);
      let modeOk = true;
      let pts = 0;
      if (it.type === "mc") {
        const modeSel = document.querySelector(`input[name="${it.id}_mode"]:checked`);
        modeOk = modeSel && modeSel.value === it.mode;
        // Repartimos puntos: mitad por modo, mitad por forma
        if (modeOk) pts += it.pts / 2;
        if (ok) pts += it.pts / 2;
      } else {
        if (ok) pts = it.pts;
      }
      earned += pts;

      // Marca visualmente el input
      if (input) {
        input.classList.remove("dx-ok", "dx-ko", "dx-partial");
        if (it.type === "mc") {
          if (ok && modeOk) input.classList.add("dx-ok");
          else if (ok || modeOk) input.classList.add("dx-partial");
          else input.classList.add("dx-ko");
        } else {
          input.classList.add(ok ? "dx-ok" : "dx-ko");
        }
        input.disabled = true;
      }

      secResults.items.push({
        prompt: it.prompt,
        userAnswer: answer.trim(),
        accepts: it.accepts,
        ok,
        modeOk: it.type === "mc" ? modeOk : null,
        mode: it.mode,
        pts: pts,
        max: it.pts,
        trigger: it.trigger,
      });
    });
    results.push(secResults);
  });

  const pct = dxState.total > 0 ? (earned / dxState.total) * 100 : 0;
  const nota10 = (pct / 10).toFixed(2);

  $("#dxSubmit").disabled = true;

  $("#dxResults").innerHTML = `
    <div class="card dx-summary">
      <h2>Resultado</h2>
      <div class="dx-score">
        <div class="dx-score-big">${earned.toFixed(2)} / ${dxState.total.toFixed(2)} pts</div>
        <div class="dx-score-pct">${pct.toFixed(1)}% · Nota: ${nota10} / 10</div>
      </div>
      <div class="dx-breakdown">
        ${results.map(s => {
          const sEarned = s.items.reduce((a, b) => a + b.pts, 0);
          const sMax = s.items.reduce((a, b) => a + b.max, 0);
          return `<div><strong>${s.title}</strong>: ${sEarned.toFixed(2)} / ${sMax.toFixed(2)} pts</div>`;
        }).join("")}
      </div>
      <div class="row">
        <button id="dxReview" class="btn-secondary">Ver corrección detallada</button>
        <button id="dxAgain">Nuevo examen</button>
      </div>
    </div>
  `;

  $("#dxReview").addEventListener("click", () => {
    showDxReview(results);
  });
  $("#dxAgain").addEventListener("click", () => {
    dxState = null;
    $("#dxExam").innerHTML = "";
    $("#dxResults").innerHTML = "";
    $("#dxConfig").classList.remove("hidden");
  });

  // Scroll al resultado
  $("#dxResults").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDxReview(results) {
  const html = results.map(s => `
    <div class="card">
      <h3>${s.title}</h3>
      <ol class="dx-list">
        ${s.items.map(it => {
          const mark = it.ok && (it.modeOk === null || it.modeOk) ? "✓" : "✗";
          const cls = it.ok && (it.modeOk === null || it.modeOk) ? "dx-ok-box" : "dx-ko-box";
          const modeInfo = it.mode ? ` <em class="muted">[modo correcto: ${it.mode === "subj" ? "subjuntivo" : "indicativo"}, tu modo: ${it.modeOk ? "✓" : "✗"}]</em>` : "";
          return `<li class="${cls}">
            <div><span class="dx-mark">${mark}</span> <em>${it.prompt}</em>${modeInfo}</div>
            <div>Tu respuesta: <strong>${it.userAnswer || "<em>(vacía)</em>"}</strong></div>
            <div class="muted">Aceptadas: ${it.accepts.map(a => `<code>${a}</code>`).join(" · ")}</div>
            <div class="muted">Puntos: ${it.pts.toFixed(2)} / ${it.max.toFixed(2)}</div>
          </li>`;
        }).join("")}
      </ol>
    </div>
  `).join("");
  $("#dxResults").insertAdjacentHTML("beforeend", html);
}

$("#dxStart").addEventListener("click", startDigitalExam);

$("#exGen").addEventListener("click", generateExam);
$("#exPrint").addEventListener("click", () => {
  if (!$("#examPreview").innerHTML.trim()) generateExam();
  setTimeout(() => window.print(), 100);
});

generateExam();
